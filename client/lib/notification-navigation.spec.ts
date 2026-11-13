import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveNotificationTarget } from "./notification-navigation";
import {
  buildOpenNotificationEmailHtml,
  sendViaResend,
} from "../../server/lib/email";

describe("resolveNotificationTarget", () => {
  it("routes ADMIN and CONTROLEUR to deep-linked /validation tabs, statuses, and IDs", () => {
    expect(
      resolveNotificationTarget(
        {
          type: "new_operation",
          operation_type: "bets",
          operation_id: "bet-123",
        },
        "ADMIN",
      ),
    ).toEqual({
      path: "/validation?tab=bets&status=en_attente&id=bet-123",
      label: "Validation • Tests",
      category: "action_required",
    });

    expect(
      resolveNotificationTarget(
        {
          type: "validated",
          operation_type: "transactions",
          operation_id: "tx-456",
        },
        "CONTROLEUR",
      ),
    ).toEqual({
      path: "/validation?tab=transactions&status=valide&id=tx-456",
      label: "Validation • Transactions validées",
      category: "decision",
    });

    expect(
      resolveNotificationTarget(
        {
          type: "rejected",
          operation_type: "bets",
          operation_id: "bet-789",
        },
        "ADMIN",
      ),
    ).toEqual({
      path: "/validation?tab=bets&status=refuse&id=bet-789",
      label: "Validation • Tests refusés",
      category: "decision",
    });
  });

  it("routes AGENT to /tests or /transactions with ?ref= query when available", () => {
    expect(
      resolveNotificationTarget(
        {
          type: "validated",
          operation_type: "bets",
          operation_id: "bet-1",
          reference: "REF-BET-01",
        },
        "AGENT",
      ),
    ).toEqual({
      path: "/tests?ref=REF-BET-01",
      label: "Tests de paris",
      category: "decision",
    });

    expect(
      resolveNotificationTarget(
        {
          type: "rejected",
          operation_type: "transactions",
          operation_id: "tx-1",
          reference: "TX 99",
        },
        "AGENT",
      ),
    ).toEqual({
      path: "/transactions?ref=TX%2099",
      label: "Dépôts & Retraits",
      category: "decision",
    });
  });

  it("routes venues, illegal reports, matching, profil, users, and audit accurately", () => {
    expect(
      resolveNotificationTarget(
        { type: "new_operation", operation_type: "venues", operation_id: "v-1" },
        "ADMIN",
      ).path,
    ).toBe("/validation?tab=venues&status=en_attente&id=v-1");

    expect(
      resolveNotificationTarget(
        { type: "validated", operation_type: "venues", operation_id: "v-1" },
        "AGENT",
      ).path,
    ).toBe("/venues");

    expect(
      resolveNotificationTarget(
        { type: "illegal_alert", operation_type: "illegal_bets", operation_id: "ib-1" },
        "ADMIN",
      ).path,
    ).toBe("/illegal?tab=bets&id=ib-1");

    expect(
      resolveNotificationTarget(
        { type: "new_operation", operation_type: "illegal_tx", operation_id: "it-2" },
        "CONTROLEUR",
      ).path,
    ).toBe("/illegal?tab=transactions&id=it-2");

    expect(
      resolveNotificationTarget(
        { type: "modified", operation_type: "matching", operation_id: null },
        "ADMIN",
      ).path,
    ).toBe("/matching");

    expect(
      resolveNotificationTarget(
        { type: "validated", operation_type: "profil", operation_id: null },
        "AGENT",
      ).path,
    ).toBe("/profil");

    expect(
      resolveNotificationTarget(
        { type: "modified", operation_type: "users", operation_id: null },
        "ADMIN",
      ).path,
    ).toBe("/users-management");

    expect(
      resolveNotificationTarget(
        { type: "modified", operation_type: "audit", operation_id: null },
        "ADMIN",
      ).path,
    ).toBe("/journal");
  });
});

describe("Resend email helper & OPEN HTML template", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("generates solid-color OPEN HTML email without CSS gradients and escapes HTML", () => {
    const html = buildOpenNotificationEmailHtml({
      badge: "Validée",
      badgeColor: "green",
      title: "Test validé <1xBet>",
      greeting: "Bonjour Agent,",
      intro: "Opération contrôlée avec succès.",
      details: [
        { label: "Opérateur", value: "1xBet" },
        { label: "Montant", value: "25 000 FCFA" },
      ],
      ctaLabel: "Ouvrir l'opération",
      ctaUrl: "http://localhost:3000/tests?ref=REF01",
    });

    expect(html).toContain("#004D20");
    expect(html).toContain("#006B2D");
    expect(html).toContain("Test validé &lt;1xBet&gt;");
    expect(html).toContain("25 000 FCFA");
    expect(html).toContain("http://localhost:3000/tests?ref=REF01");
    expect(html.toLowerCase()).not.toContain("linear-gradient");
    expect(html.toLowerCase()).not.toContain("bg-gradient");
  });

  it("sends emails via Resend API and handles sandbox restrictions gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "re_msg_123" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const okResult = await sendViaResend(
      {
        to: "controleur@open.cm",
        subject: "[OPEN] Nouvelle opération",
        html: "<p>Test</p>",
      },
      "re_test_key",
    );

    expect(okResult).toEqual({
      messageId: "re_msg_123",
      provider: "resend",
      to: "controleur@open.cm",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
        }),
      }),
    );

    const restrictedFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        message: "You can only send testing emails to your own email address.",
      }),
    });
    globalThis.fetch = restrictedFetch as unknown as typeof fetch;

    const restrictedResult = await sendViaResend(
      {
        to: "other@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      },
      "re_test_key",
    );

    expect(restrictedResult.restricted).toBe(true);
    expect(restrictedResult.messageId).toBeNull();
  });
});
