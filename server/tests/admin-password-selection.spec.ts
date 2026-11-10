import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAdminPasswordRequest } from "../../shared/admin-password";
import { handleCreateUserWithPassword, handleResetUserPassword } from "../routes/admin-users";

const mocks = vi.hoisted(() => ({ getAdmin: vi.fn(), audit: vi.fn(), email: vi.fn() }));
vi.mock("../lib/supabase-admin", () => ({ getSupabaseAdmin: mocks.getAdmin }));
vi.mock("../lib/audit-server", () => ({ recordAuditLog: mocks.audit }));
vi.mock("../lib/email", () => ({ sendEmail: mocks.email }));

const target = { id: "test-target", nom: "Compte test", email: "test@example.invalid", role: "AGENT" };
let admin: { auth: { admin: { createUser: ReturnType<typeof vi.fn>; updateUserById: ReturnType<typeof vi.fn>; deleteUser: ReturnType<typeof vi.fn> } }; from: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  admin = {
    auth: { admin: {
      createUser: vi.fn().mockResolvedValue({ data: { user: target }, error: null }),
      updateUserById: vi.fn().mockResolvedValue({ error: null }),
      deleteUser: vi.fn().mockResolvedValue({ error: null }),
    } },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({
        single: async () => ({ data: target, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }) }),
      insert: (payload: unknown) => ({ select: () => ({ single: async () => ({ data: payload, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    })),
  };
  mocks.getAdmin.mockReturnValue(admin);
});

async function execute(kind: "create" | "reset", body: Record<string, unknown>) {
  const req = {
    user: { id: "test-admin", email: "admin@example.invalid", role: "ADMIN" },
    params: { userId: target.id },
    body: { nom: target.nom, email: target.email, role: target.role, ...body },
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await (kind === "create" ? handleCreateUserWithPassword : handleResetUserPassword)(req as never, res as never, vi.fn());
  return res;
}

describe.each(["create", "reset"] as const)("Admin password %s: real request contract and route", (kind) => {
  it("applies and returns exactly the manual secret sent by the frontend, including whitespace", async () => {
    const password = "  Secret-de-test9!  ";
    const res = await execute(kind, buildAdminPasswordRequest("manual", password));
    const authOperation = kind === "create" ? admin.auth.admin.createUser : admin.auth.admin.updateUserById;
    const args = authOperation.mock.calls[0];
    expect(kind === "create" ? args[0].password : args[1].password).toBe(password);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ temporaryPassword: password, passwordSource: "manual" }));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(password);
    expect(mocks.email).not.toHaveBeenCalled();
  });

  it.each(["", "court", 12345, null])("rejects an invalid supplied value without changing Auth", async (password) => {
    const res = await execute(kind, { passwordMode: "manual", password });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("generates only when explicitly selected and returns the exact applied password", async () => {
    const request = buildAdminPasswordRequest("generate", "manual-draft-not-to-send");
    expect(request).not.toHaveProperty("password");
    const res = await execute(kind, request);
    const result = res.json.mock.calls[0][0];
    expect(result.passwordSource).toBe("generated");
    expect(result.temporaryPassword.length).toBe(14);
    const authOperation = kind === "create" ? admin.auth.admin.createUser : admin.auth.admin.updateUserById;
    const args = authOperation.mock.calls[0];
    expect(kind === "create" ? args[0].password : args[1].password).toBe(result.temporaryPassword);
  });

  it("does not silently replace an invalid legacy password", async () => {
    const res = await execute(kind, { password: "court" });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("rejects conflicting manual and automatic instructions", async () => {
    const res = await execute(kind, { passwordMode: "generate", password: "Secret-test9!" });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

it("accepts the legacy newPassword field during rollout without replacing it", async () => {
  const res = await execute("reset", { newPassword: "Ancien-client9!" });
  expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(target.id, expect.objectContaining({ password: "Ancien-client9!" }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ passwordSource: "manual" }));
});

it("validates manual input in the shared frontend request builder", () => {
  expect(() => buildAdminPasswordRequest("manual", "court")).toThrow("8 caractères");
});
