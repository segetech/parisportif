import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleLogin } from "./routes/auth";
import { handleDashboardData } from "./routes/dashboard";
import {
  handleForgotPassword,
  handleResetPassword,
} from "./routes/password-reset";
import {
  handleUpdateProfile,
  handleChangePassword,
  requireAuth,
} from "./routes/profile";
import {
  handleCreateUserWithPassword,
  handleResetUserPassword,
  handleGetTemporaryPassword,
} from "./routes/admin-users";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Auth routes
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/forgot-password", handleForgotPassword);
  app.post("/api/auth/reset-password", handleResetPassword);
  app.post("/api/auth/update-profile", requireAuth, handleUpdateProfile);
  app.post("/api/auth/change-password", requireAuth, handleChangePassword);

  // Admin user management routes
  app.post("/api/admin/users/create", handleCreateUserWithPassword);
  app.post("/api/admin/users/:userId/reset-password", handleResetUserPassword);
  app.get("/api/admin/users/:userId/temp-password", handleGetTemporaryPassword);

  // Dashboard routes
  app.get("/api/dashboard/data", handleDashboardData);

  return app;
}
