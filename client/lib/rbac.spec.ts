import { describe, expect, it } from "vitest";
import { canAgentEditRecord } from "./rbac";

describe("canAgentEditRecord", () => {
  it("blocks agent after 60 min without unlock", () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    const res = canAgentEditRecord("AGENT", "en_attente", twoHoursAgo, 60, null);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("60 min");
  });

  it("allows agent when edit_unlocked_until is in the future", () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    const futureUnlock = new Date(Date.now() + 30 * 60_000).toISOString();
    const res = canAgentEditRecord("AGENT", "en_attente", twoHoursAgo, 60, futureUnlock);
    expect(res.allowed).toBe(true);
    expect(res.unlockedUntil).toBe(futureUnlock);
  });

  it("blocks agent again once edit_unlocked_until expires", () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    const expiredUnlock = new Date(Date.now() - 5 * 60_000).toISOString();
    const res = canAgentEditRecord("AGENT", "en_attente", twoHoursAgo, 60, expiredUnlock);
    expect(res.allowed).toBe(false);
  });

  it("allows agent to edit refused records regardless of age, and blocks validated records", () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60_000).toISOString();
    expect(canAgentEditRecord("AGENT", "refuse", twoHoursAgo, 60).allowed).toBe(true);
    expect(canAgentEditRecord("AGENT", "valide", twoHoursAgo, 60).allowed).toBe(false);
  });
});
