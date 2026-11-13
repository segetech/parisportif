import { describe, it, expect } from "vitest";
import { cn, formatPhoneNumber, formatAmountInput, parseAmountInput } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });
});

describe("formatPhoneNumber", () => {
  it("groups 8-digit phone numbers in pairs and caps at 8 digits", () => {
    expect(formatPhoneNumber("70009007")).toBe("70 00 90 07");
    expect(formatPhoneNumber("70000000")).toBe("70 00 00 00");
    expect(formatPhoneNumber("7000900712")).toBe("70 00 90 07");
  });

  it("handles partial typing and strips non-digits", () => {
    expect(formatPhoneNumber("700")).toBe("70 0");
    expect(formatPhoneNumber("70-00-90-07")).toBe("70 00 90 07");
    expect(formatPhoneNumber("")).toBe("");
  });

  it("preserves +223 prefix and groups local digits in pairs", () => {
    expect(formatPhoneNumber("+22370009007")).toBe("+223 70 00 90 07");
  });
});

describe("formatAmountInput & parseAmountInput", () => {
  it("formats thousands with spaces and parses back to number", () => {
    expect(formatAmountInput(15000)).toBe("15 000");
    expect(formatAmountInput(1500000)).toBe("1 500 000");
    expect(formatAmountInput(0)).toBe("");
    expect(parseAmountInput("15 000")).toBe(15000);
    expect(parseAmountInput("1 500 000")).toBe(1500000);
    expect(parseAmountInput("")).toBe(0);
  });
});
