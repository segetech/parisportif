import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma";

describe("Prisma ORM Integration", () => {
  it("should initialize the Prisma Client singleton", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
    expect(typeof prisma.$disconnect).toBe("function");
  });

  it("should have all application models defined on the Prisma Client", () => {
    // Core models
    expect(prisma.user).toBeDefined();
    expect(typeof prisma.user.findMany).toBe("function");
    expect(typeof prisma.user.findUnique).toBe("function");

    expect(prisma.transaction).toBeDefined();
    expect(typeof prisma.transaction.findMany).toBe("function");

    expect(prisma.bet).toBeDefined();
    expect(typeof prisma.bet.findMany).toBe("function");

    expect(prisma.venue).toBeDefined();
    expect(typeof prisma.venue.findMany).toBe("function");

    // Illegal activities
    expect(prisma.illegalBet).toBeDefined();
    expect(typeof prisma.illegalBet.findMany).toBe("function");

    expect(prisma.illegalTransaction).toBeDefined();
    expect(typeof prisma.illegalTransaction.findMany).toBe("function");

    // Audit and security
    expect(prisma.auditLog).toBeDefined();
    expect(typeof prisma.auditLog.create).toBe("function");

    expect(prisma.passwordReset).toBeDefined();
    expect(typeof prisma.passwordReset.update).toBe("function");
  });
});
