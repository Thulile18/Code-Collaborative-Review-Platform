import { Router, Response } from "express";
import { pool } from "../db";
import { authenticate, AuthRequest } from "../middleware/auth";
import { notifyUser } from "../notifications";

const router = Router();

// Helper: check if a user belongs to the project that owns a submission
async function getSubmissionProject(submissionId: number) {
    const result = await pool.query(
        "SELECT project_id FROM submissions WHERE id = $1",
        [submissionId]
    );
    return result.rows[0]?.project_id || null;
}

async function isProjectMember(projectId: number, userId: number) {
    const result = await pool.query(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        [projectId, userId]
    );
    return result.rows.length > 0;
}

// POST /api/submissions/:id/comments — add a comment (reviewers only)
router.post("/:id/comments", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { body, line_number } = req.body;

        if (!body) {
            return res.status(400).json({ error: "Comment body is required" });
        }

        if (req.user!.role !== "reviewer") {
            return res.status(403).json({ error: "Only reviewers can comment" });
        }

        const projectId = await getSubmissionProject(Number(id));
        if (!projectId) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const member = await isProjectMember(projectId, req.user!.userId);
        if (!member) {
            return res.status(403).json({ error: "You don't have access to this submission" });
        }

        const result = await pool.query(
            `INSERT INTO comments (submission_id, author_id, body, line_number)
       VALUES ($1, $2, $3, $4)
       RETURNING id, submission_id, author_id, body, line_number, created_at`,
            [id, req.user!.userId, body, line_number || null]
        );

        // Notify the submission's author that a new comment was added
        const submissionAuthor = await pool.query(
            "SELECT author_id FROM submissions WHERE id = $1",
            [id]
        );
        if (submissionAuthor.rows[0]) {
            await notifyUser(
                submissionAuthor.rows[0].author_id,
                `New comment on your submission (#${id})`
            );
        }

        // Broadcast the new comment to anyone listening live
        req.app.get("io").emit("new_comment", result.rows[0]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Something went wrong" });
    }
});

// GET /api/submissions/:id/comments — list comments for a submission
router.get("/:id/comments", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const projectId = await getSubmissionProject(Number(id));
        if (!projectId) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const member = await isProjectMember(projectId, req.user!.userId);
        if (!member) {
            return res.status(403).json({ error: "You don't have access to this submission" });
        }

        const result = await pool.query(
            `SELECT c.id, c.submission_id, c.author_id, c.body, c.line_number, c.created_at, u.name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.submission_id = $1
       ORDER BY c.created_at ASC`,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Something went wrong" });
    }
});

export default router;