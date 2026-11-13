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
  handleSetInitialPassword,
  handleFinalizePasswordChange,
  handleKeepCurrentPassword,
} from "./routes/profile";
import {
  handleCreateUserWithPassword,
  handleResetUserPassword,
  handleUpdateUserRole,
  handleUpdateUserStatus,
  handleUpdateUserEmail,
  handleUpdateUserProfile,
} from "./routes/admin-users";
import {
  handleListAuditLogs,
  handleCreateAuditLog,
} from "./routes/audit";
import {
  handleUploadWithMulter,
  handleUploadFile,
  handleGetFile,
  handleDeleteFile,
} from "./routes/storage";
import { handleAiAnalyze, handleAiChat } from "./routes/ai";
import {
  handleDispatchNotification,
  handleSendTestNotificationEmail,
} from "./routes/notifications";
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
  app.post("/api/auth/set-initial-password", requireAuth, handleSetInitialPassword);
  app.post("/api/auth/finalize-password-change", requireAuth, handleFinalizePasswordChange);
  app.post("/api/auth/keep-current-password", requireAuth, handleKeepCurrentPassword);

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
  app.patch(
    "/api/admin/users/:userId/role",
    requireAuth,
    requireRole(["ADMIN"]),
    handleUpdateUserRole
  );
  app.patch(
    "/api/admin/users/:userId/status",
    requireAuth,
    requireRole(["ADMIN"]),
    handleUpdateUserStatus
  );
  app.patch(
    "/api/admin/users/:userId/email",
    requireAuth,
    requireRole(["ADMIN"]),
    handleUpdateUserEmail
  );
  app.patch(
    "/api/admin/users/:userId/profile",
    requireAuth,
    requireRole(["ADMIN"]),
    handleUpdateUserProfile
  );
  app.patch(
    "/api/admin/users/:userId",
    requireAuth,
    requireRole(["ADMIN"]),
    handleUpdateUserProfile
  );

  // Dashboard routes (protected, role-isolated)
  app.get("/api/dashboard/data", requireAuth, handleDashboardData);

  // AI Analysis & Assistant routes (protected, role-isolated)
  app.post("/api/ai/analyze", requireAuth, handleAiAnalyze);
  app.post("/api/ai/chat", requireAuth, handleAiChat);

  // Audit log routes (centralized, persistent in DB)
  app.get(
    "/api/audit",
    requireAuth,
    requireRole(["ADMIN", "CONTROLEUR"]),
    handleListAuditLogs
  );
  app.post("/api/audit", requireAuth, handleCreateAuditLog);

  // Notification dispatch & Resend test email routes
  app.post("/api/notifications/dispatch", requireAuth, handleDispatchNotification);
  app.post("/api/notifications/test-email", requireAuth, handleSendTestNotificationEmail);

  // Cloudflare R2 Object Storage routes
  app.post("/api/upload", handleUploadWithMulter, handleUploadFile);
  app.get("/api/storage/file/{*key}", handleGetFile);
  app.delete("/api/storage/file/{*key}", requireAuth, handleDeleteFile);

  return app;
}
