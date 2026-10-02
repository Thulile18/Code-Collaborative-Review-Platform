import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/projects — create a project
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const ownerId = req.user!.userId;

    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const result = await pool.query(
      `INSERT INTO projects (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, owner_id, created_at`,
      [name, description || null, ownerId]
    );

    const project = result.rows[0];

    // Automatically add the owner as a member of their own project
    await pool.query(
      `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`,
      [project.id, ownerId]
    );

    res.status(201).json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /api/projects — list projects the logged-in user belongs to
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.owner_id, p.created_at
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /api/projects/:id/members — add a member (owner only)
router.post("/:id/members", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Check the project exists and the requester owns it
    const projectResult = await pool.query("SELECT owner_id FROM projects WHERE id = $1", [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (projectResult.rows[0].owner_id !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can add members" });
    }

    // Check the user being added actually exists
    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await pool.query(
      `INSERT INTO project_members (project_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, userId]
    );

    res.status(201).json({ message: "Member added" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /api/projects/:id/members/:userId — remove a member (owner only)
router.delete("/:id/members/:userId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;

    const projectResult = await pool.query("SELECT owner_id FROM projects WHERE id = $1", [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (projectResult.rows[0].owner_id !== req.user!.userId) {
      return res.status(403).json({ error: "Only the project owner can remove members" });
    }

    await pool.query(
      "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, userId]
    );

    res.json({ message: "Member removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /api/projects/:id/submissions — list all submissions for a project
router.get("/:id/submissions", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const memberCheck = await pool.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, req.user!.userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: "You don't have access to this project" });
    }

    const result = await pool.query(
      `SELECT id, project_id, author_id, title, filename, status, created_at
       FROM submissions
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /api/projects/:id/stats — project-level statistics
router.get("/:id/stats", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const memberCheck = await pool.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
      [id, req.user!.userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: "You don't have access to this project" });
    }

    // Average time between a submission being created and its first review
    const avgReviewTime = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (r.created_at - s.created_at)) / 3600) AS avg_hours
       FROM submissions s
       JOIN reviews r ON r.submission_id = s.id
       WHERE s.project_id = $1`,
      [id]
    );

    // Approved vs rejected percentage
    const statusBreakdown = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM submissions
       WHERE project_id = $1
       GROUP BY status`,
      [id]
    );

    // Reviewer activity: how many reviews each reviewer has done
    const reviewerActivity = await pool.query(
      `SELECT u.id, u.name, COUNT(r.id) AS review_count
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       JOIN submissions s ON s.id = r.submission_id
       WHERE s.project_id = $1
       GROUP BY u.id, u.name
       ORDER BY review_count DESC`,
      [id]
    );

    // Submission with the most comments
    const mostCommented = await pool.query(
      `SELECT s.id, s.title, COUNT(c.id) AS comment_count
       FROM submissions s
       LEFT JOIN comments c ON c.submission_id = s.id
       WHERE s.project_id = $1
       GROUP BY s.id, s.title
       ORDER BY comment_count DESC
       LIMIT 1`,
      [id]
    );

    res.json({
      average_review_time_hours: avgReviewTime.rows[0].avg_hours,
      status_breakdown: statusBreakdown.rows,
      reviewer_activity: reviewerActivity.rows,
      most_commented_submission: mostCommented.rows[0] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;