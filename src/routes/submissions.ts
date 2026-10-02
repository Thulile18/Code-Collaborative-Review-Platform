import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// Helper: check if a user belongs to a project
async function isProjectMember(projectId: number, userId: number) {
  const result = await pool.query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  return result.rows.length > 0;
}

// POST /api/submissions — create a submission
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { project_id, title, filename, code_content } = req.body;
    const authorId = req.user!.userId;

    if (!project_id || !title || !code_content) {
      return res.status(400).json({ error: "project_id, title, and code_content are required" });
    }

    const member = await isProjectMember(project_id, authorId);
    if (!member) {
      return res.status(403).json({ error: "You must be a member of this project to submit code" });
    }

    const result = await pool.query(
      `INSERT INTO submissions (project_id, author_id, title, filename, code_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, project_id, author_id, title, filename, status, created_at`,
      [project_id, authorId, title, filename || null, code_content]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /api/submissions/:id — view a single submission
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT s.*, u.name AS author_name
       FROM submissions s
       JOIN users u ON u.id = s.author_id
       WHERE s.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const submission = result.rows[0];

    const member = await isProjectMember(submission.project_id, req.user!.userId);
    if (!member) {
      return res.status(403).json({ error: "You don't have access to this submission" });
    }

    res.json(submission);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// PATCH /api/submissions/:id/status — update status
router.patch("/:id/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pending", "in_review", "approved", "changes_requested"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
    }

    if (req.user!.role !== "reviewer") {
      return res.status(403).json({ error: "Only reviewers can update submission status" });
    }

    const submissionResult = await pool.query("SELECT project_id FROM submissions WHERE id = $1", [id]);
    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const member = await isProjectMember(submissionResult.rows[0].project_id, req.user!.userId);
    if (!member) {
      return res.status(403).json({ error: "You don't have access to this submission" });
    }

    const result = await pool.query(
      `UPDATE submissions SET status = $1 WHERE id = $2
       RETURNING id, project_id, author_id, title, status, created_at`,
      [status, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE /api/submissions/:id — delete a submission
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT author_id FROM submissions WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (result.rows[0].author_id !== req.user!.userId) {
      return res.status(403).json({ error: "You can only delete your own submissions" });
    }

    await pool.query("DELETE FROM submissions WHERE id = $1", [id]);
    res.json({ message: "Submission deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /api/submissions/:id/approve — reviewer approves a submission
router.post("/:id/approve", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (req.user!.role !== "reviewer") {
      return res.status(403).json({ error: "Only reviewers can approve submissions" });
    }

    const submissionResult = await pool.query("SELECT project_id FROM submissions WHERE id = $1", [id]);
    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const member = await isProjectMember(submissionResult.rows[0].project_id, req.user!.userId);
    if (!member) {
      return res.status(403).json({ error: "You don't have access to this submission" });
    }

    // Record the review
    const reviewResult = await pool.query(
      `INSERT INTO reviews (submission_id, reviewer_id, decision)
       VALUES ($1, $2, 'approved')
       RETURNING id, submission_id, reviewer_id, decision, created_at`,
      [id, req.user!.userId]
    );

    // Update the submission's status
    await pool.query("UPDATE submissions SET status = 'approved' WHERE id = $1", [id]);

    res.status(201).json(reviewResult.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// POST /api/submissions/:id/request-changes — reviewer requests changes
router.post("/:id/request-changes", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (req.user!.role !== "reviewer") {
      return res.status(403).json({ error: "Only reviewers can request changes" });
    }

    const submissionResult = await pool.query("SELECT project_id FROM submissions WHERE id = $1", [id]);
    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const member = await isProjectMember(submissionResult.rows[0].project_id, req.user!.userId);
    if (!member) {
      return res.status(403).json({ error: "You don't have access to this submission" });
    }

    const reviewResult = await pool.query(
      `INSERT INTO reviews (submission_id, reviewer_id, decision)
       VALUES ($1, $2, 'changes_requested')
       RETURNING id, submission_id, reviewer_id, decision, created_at`,
      [id, req.user!.userId]
    );

    await pool.query("UPDATE submissions SET status = 'changes_requested' WHERE id = $1", [id]);

    res.status(201).json(reviewResult.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET /api/submissions/:id/reviews — view review history for a submission
router.get("/:id/reviews", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const submissionResult = await pool.query("SELECT project_id FROM submissions WHERE id = $1", [id]);
    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const member = await isProjectMember(submissionResult.rows[0].project_id, req.user!.userId);
    if (!member) {
      return res.status(403).json({ error: "You don't have access to this submission" });
    }

    const result = await pool.query(
      `SELECT r.id, r.submission_id, r.reviewer_id, r.decision, r.created_at, u.name AS reviewer_name
       FROM reviews r
       JOIN users u ON u.id = r.reviewer_id
       WHERE r.submission_id = $1
       ORDER BY r.created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;