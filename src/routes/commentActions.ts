import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// PATCH /api/comments/:id — edit your own comment
router.patch("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({ error: "Comment body is required" });
    }

    const existing = await pool.query("SELECT author_id FROM comments WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (existing.rows[0].author_id !== req.user!.userId) {
      return res.status(403).json({ error: "You can only edit your own comments" });
    }

    const result = await pool.query(
      `UPDATE comments SET body = $1 WHERE id = $2
       RETURNING id, submission_id, author_id, body, line_number, created_at`,
      [body, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /api/comments/:id — delete your own comment
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await pool.query("SELECT author_id FROM comments WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (existing.rows[0].author_id !== req.user!.userId) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await pool.query("DELETE FROM comments WHERE id = $1", [id]);
    res.json({ message: "Comment deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;