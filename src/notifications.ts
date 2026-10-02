import { pool } from "./db";

export async function notifyUser(userId: number, message: string) {
  try {
    await pool.query(
      "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
      [userId, message]
    );
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}