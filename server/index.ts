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
} from "./routes/profile";
import {
  handleCreateUserWithPassword,
  handleResetUserPassword,
} from "./routes/admin-users";
import {
  handleListAuditLogs,
  handleCreateAuditLog,
} from "./routes/audit";
import { requireAuth, requireRole } from "./middleware/auth";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint (Coolify / Docker health checks)
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Auth routes (public)
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/forgot-password", handleForgotPassword);
  app.post("/api/auth/reset-password", handleResetPassword);

  // Auth routes (protected)
  app.post("/api/auth/update-profile", requireAuth, handleUpdateProfile);
  app.post("/api/auth/change-password", requireAuth, handleChangePassword);

  // Admin user management routes (strictly restricted to active ADMINs)
  app.post(
    "/api/admin/users/create",
    requireAuth,
    requireRole(["ADMIN"]),
    handleCreateUserWithPassword
  );
  app.post(
    "/api/admin/users/:userId/reset-password",
    requireAuth,
    requireRole(["ADMIN"]),
    handleResetUserPassword
  );

  // Dashboard routes (protected, role-isolated)
  app.get("/api/dashboard/data", requireAuth, handleDashboardData);

  // Audit log routes (centralized, persistent in DB)
  app.get(
    "/api/audit",
    requireAuth,
    requireRole(["ADMIN", "CONTROLEUR"]),
    handleListAuditLogs
  );
  app.post("/api/audit", requireAuth, handleCreateAuditLog);

  return app;
}
