import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/users/:id — view a profile
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// PATCH /api/users/:id — update your own profile
router.patch("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Users can only edit their own profile
    if (req.user?.userId !== Number(id)) {
      return res.status(403).json({ error: "You can only edit your own profile" });
    }

    const { name, email, avatar_url } = req.body;

    if (!name && !email && !avatar_url) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }

    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           avatar_url = COALESCE($3, avatar_url)
       WHERE id = $4
       RETURNING id, name, email, role, avatar_url`,
      [name, email, avatar_url, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;