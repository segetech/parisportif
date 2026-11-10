import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createImportBatch, importDatabaseError, verifyImportSchema } from "./import-database";

function mockClient(results: Array<{ error: unknown }>) {
  const limit = vi.fn();
  const insert = vi.fn();
  results.forEach((result) => {
    limit.mockResolvedValueOnce(result);
    insert.mockResolvedValueOnce(result);
  });
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn((_table: string) => ({ select, insert }));
  return { client: { from } as unknown as SupabaseClient, from, select, insert, limit };
}

describe("Import database release compatibility", () => {
  it("rejects a missing batch table before any write or further probe", async () => {
    const mock = mockClient([{ error: { code: "PGRST205", message: "Missing table" } }]);
    await expect(verifyImportSchema(mock.client, "transactions")).rejects.toThrow("migrations 06 à 08");
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.limit).toHaveBeenCalledWith(0);
  });

  it("rejects missing import columns even when the batch table exists", async () => {
    const mock = mockClient([{ error: null }, { error: { code: "42703", message: "Missing column" } }]);
    await expect(verifyImportSchema(mock.client, "bets")).rejects.toThrow("bets (42703)");
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("checks venue games as well as the release columns without creating records", async () => {
    const mock = mockClient([{ error: null }, { error: null }, { error: null }]);
    await verifyImportSchema(mock.client, "venues");
    expect(mock.from.mock.calls.map(([table]) => table)).toEqual(["import_batches", "venues", "venue_games"]);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("rejects a resolved insert containing an SQL error instead of reporting batch success", async () => {
    const mock = mockClient([{ error: { code: "42501", message: "permission denied" } }]);
    await expect(createImportBatch(mock.client, { id: "test-batch" })).rejects.toThrow("permission denied");
    expect(mock.insert).toHaveBeenCalledWith([{ id: "test-batch" }]);
  });

  it("preserves authorization failures instead of calling them missing migrations", () => {
    expect(importDatabaseError({ code: "42501", message: "Accès refusé" }, "Import").message).toBe("Import : Accès refusé (42501)");
  });
});
