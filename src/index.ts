import express from "express";
import { pool } from "./db";
import authRoutes from "./routes/auth";
import { authenticate, AuthRequest } from "./middleware/auth";
import UserRoutes from "./routes/users";
import projectRoutes from "./routes/projects";
import submissionRoutes from "./routes/submissions";
import commentRoutes from "./routes/comments";
import commentActionRoutes from "./routes/commentActions";
import notificationRoutes from "./routes/notifications";
import { createServer } from "http";
import { Server } from "socket.io";
import {errorHandler} from "./middleware/errorHandler";

const app = express();

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("A client disconnected:", socket.id);
  });
});

const PORT = 3000;

app.use(express.json()); // lets Express read JSON request bodies

app.get("/", (req, res) => {
  res.json({ message: "Code Review Platform API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", UserRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/submissions", commentRoutes);
app.use("/api/comments", commentActionRoutes);
app.use("/api/users", notificationRoutes);
app.use(errorHandler);

app.get("/api/me", authenticate, (req: AuthRequest, res) => {
    res.json({ message: "You are authenticated", user: req.user});
});

httpServer.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await pool.query("SELECT NOW()");
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error);
  }
});