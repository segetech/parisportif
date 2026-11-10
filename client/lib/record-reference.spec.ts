import { describe, expect, it } from "vitest";
import { readRecordReference, writeRecordReference } from "./record-reference";

describe("record reference round trips", () => {
  it("loads the real column used by Excel imports", () => {
    expect(
      readRecordReference({
        reference: "MP250326.0415.A49647",
        notes: "Observation",
      }),
    ).toEqual({ reference: "MP250326.0415.A49647", notes: "Observation" });
  });
  it.each(["Réf: cyb cb", "Réf: cyb cb | Observation"])(
    "restores legacy notes: %s",
    (notes) => {
      const result = readRecordReference({ notes });
      expect(result.reference).toBe("cyb cb");
      expect(result.notes).toBe(notes.includes("|") ? "Observation" : "");
      expect(
        readRecordReference(
          writeRecordReference(result.reference, result.notes),
        ),
      ).toEqual(result);
    },
  );
  it("preserves conflicting notes instead of destroying information", () => {
    expect(
      readRecordReference({
        reference: "NEW",
        notes: "Réf: OLD | Observation",
      }),
    ).toEqual({ reference: "NEW", notes: "Réf: OLD | Observation" });
  });
  it("does not invent a reference from ordinary prose", () => {
    expect(readRecordReference({ notes: "Observation : Réf: autre" })).toEqual({
      reference: "",
      notes: "Observation : Réf: autre",
    });
  });
  it("writes edits into the column without duplicating notes", () => {
    expect(writeRecordReference(" NEW ", "Notes\nconservées")).toEqual({
      reference: "NEW",
      notes: "Notes\nconservées",
    });
    expect(writeRecordReference("", "")).toEqual({
      reference: null,
      notes: null,
    });
  });
  it("handles records with no reference or notes", () => {
    expect(readRecordReference({})).toEqual({ reference: "", notes: "" });
  });
});
