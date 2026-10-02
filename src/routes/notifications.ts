import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/users/:id/notifications — view your own activity feed
router.get("/:id/notifications", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (req.user!.userId !== Number(id)) {
      return res.status(403).json({ error: "You can only view your own notifications" });
    }

    const result = await pool.query(
      `SELECT id, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;