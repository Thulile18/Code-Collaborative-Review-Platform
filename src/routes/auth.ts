import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { asyncHandler } from "../middleware/errorHandler";
import { requireFields } from "../middleware/validate";

const router = Router();

// POST /api/auth/register
router.post(
  "/register",
  requireFields(["name", "email", "password", "role"]),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!["reviewer", "submitter"].includes(role)) {
      return res.status(400).json({ error: "Role must be reviewer or submitter" });
    }

    // Check if email is already used
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash the password before storing it
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, passwordHash, role]
    );

    res.status(201).json(result.rows[0]);
  })
);

// POST /api/auth/login
router.post(
  "/login",
  requireFields(["email", "password"]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  })
);

export default router;