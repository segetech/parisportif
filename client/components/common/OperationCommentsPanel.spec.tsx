// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OperationCommentsPanel } from "./OperationCommentsPanel";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function waitForCondition(fn: () => void, timeoutMs = 2000) {
  const start = Date.now();
  while (true) {
    try {
      fn();
      return;
    } catch (err) {
      if (Date.now() - start >= timeoutMs) throw err;
      await flush();
    }
  }
}

const mockUser = {
  id: "user-agent-1",
  email: "agent@test.local",
  nom: "Diallo",
  prenom: "Moussa",
  role: "AGENT",
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("@/lib/notification-navigation", () => ({
  dispatchAppNotification: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockHarness = vi.hoisted(() => ({
  commentsStore: [] as any[],
  historyStore: [] as any[],
  commentsFetchQueue: [] as Array<() => Promise<any>>,
  historyFetchQueue: [] as Array<() => Promise<any>>,
  rpcHandler: null as null | ((args: any) => Promise<{ data: any; error: any }>),
  rpcCalls: [] as any[],
  channels: [] as Array<{
    name: string;
    handlers: Array<{ table: string; cb: (payload: any) => void }>;
    subscribeCb?: (status: string) => void;
  }>,
  removedChannels: [] as string[],
}));

vi.mock("@/lib/supabase", () => {
  const buildSelectChain = (table: string) => {
    const state = { opType: "", opId: "" };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        if (col === "operation_type") state.opType = val;
        if (col === "operation_id") state.opId = val;
        return chain;
      }),
      order: vi.fn(() => chain),
      range: vi.fn((from: number, to: number) => {
        if (table === "operation_comments") {
          const queued = mockHarness.commentsFetchQueue.shift();
          if (queued) return queued();
          const filtered = mockHarness.commentsStore
            .filter(
              (r) =>
                r.operation_type === state.opType &&
                r.operation_id === state.opId,
            )
            .sort((a, b) => {
              const d = Date.parse(a.created_at) - Date.parse(b.created_at);
              return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
            });
          return Promise.resolve({
            data: filtered.slice(from, to + 1),
            error: null,
            count: filtered.length,
          });
        }
        const queuedH = mockHarness.historyFetchQueue.shift();
        if (queuedH) return queuedH();
        const filteredH = mockHarness.historyStore
          .filter(
            (r) =>
              r.operation_type === state.opType && r.operation_id === state.opId,
          )
          .sort((a, b) => {
            const d = Date.parse(b.created_at) - Date.parse(a.created_at);
            return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
          });
        return Promise.resolve({
          data: filteredH.slice(from, to + 1),
          error: null,
          count: filteredH.length,
        });
      }),
    };
    return chain;
  };

  return {
    supabase: {
      from: vi.fn((table: string) => buildSelectChain(table)),
      rpc: vi.fn((fnName: string, args: any) => {
        if (fnName === "submit_operation_comment") {
          mockHarness.rpcCalls.push(args);
          if (mockHarness.rpcHandler) return mockHarness.rpcHandler(args);
          const created = {
            id: `srv-${mockHarness.rpcCalls.length}`,
            operation_type: args.p_operation_type,
            operation_id: args.p_operation_id,
            user_id: mockUser.id,
            comment: args.p_comment,
            is_internal: Boolean(args.p_is_internal),
            client_request_id: args.p_client_request_id,
            created_at: new Date(
              Date.UTC(2026, 10, 13, 12, 0, mockHarness.rpcCalls.length),
            ).toISOString(),
            users: { nom: mockUser.nom, prenom: mockUser.prenom, role: mockUser.role },
          };
          mockHarness.commentsStore.push(created);
          return Promise.resolve({ data: created, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      channel: vi.fn((name: string) => {
        const ch = {
          name,
          handlers: [] as Array<{ table: string; cb: (payload: any) => void }>,
          subscribeCb: undefined as undefined | ((status: string) => void),
          on(_type: string, filter: any, cb: (payload: any) => void) {
            ch.handlers.push({ table: filter.table, cb });
            return ch;
          },
          subscribe(cb?: (status: string) => void) {
            ch.subscribeCb = cb;
            mockHarness.channels.push(ch);
            return ch;
          },
        };
        return ch;
      }),
      removeChannel: vi.fn((ch: any) => {
        mockHarness.removedChannels.push(ch.name);
        return Promise.resolve("ok");
      }),
    },
  };
});

function setTextareaValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function countOccurrences(container: HTMLElement, text: string): number {
  const matches = container.textContent?.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"));
  return matches ? matches.length : 0;
}

describe("OperationCommentsPanel (production component)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mockHarness.commentsStore = [];
    mockHarness.historyStore = [];
    mockHarness.commentsFetchQueue = [];
    mockHarness.historyFetchQueue = [];
    mockHarness.rpcHandler = null;
    mockHarness.rpcCalls = [];
    mockHarness.channels = [];
    mockHarness.removedChannels = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows immediate 'Envoi…' and replaces with confirmed row without duplicate when Realtime arrives before HTTP", async () => {
    const rpcDeferred = createDeferred<{ data: any; error: any }>();
    mockHarness.rpcHandler = () => rpcDeferred.promise;

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-1" />);
    });
    await flush();

    const textarea = container.querySelector('textarea[aria-label="Nouveau commentaire"]') as HTMLTextAreaElement;
    const sendBtn = container.querySelector('button[aria-label="Envoyer le commentaire"]') as HTMLButtonElement;

    await act(async () => {
      setTextareaValue(textarea, "Premier message");
    });
    await act(async () => {
      sendBtn.click();
    });

    expect(container.textContent).toContain("Premier message");
    expect(container.textContent).toContain("Envoi…");

    const sentReqId = mockHarness.rpcCalls[0].p_client_request_id;
    const confirmedRow = {
      id: "srv-uuid-1",
      operation_type: "bets",
      operation_id: "op-1",
      user_id: mockUser.id,
      comment: "Premier message",
      is_internal: false,
      client_request_id: sentReqId,
      created_at: "2026-11-13T12:00:05.000Z",
      users: { nom: "Diallo", prenom: "Moussa", role: "AGENT" },
    };

    // Realtime arrives BEFORE HTTP RPC resolves
    mockHarness.commentsStore.push(confirmedRow);
    const ch = mockHarness.channels[0];
    await act(async () => {
      ch.handlers
        .filter((h) => h.table === "operation_comments")
        .forEach((h) => h.cb({ eventType: "INSERT", new: confirmedRow }));
    });

    await waitForCondition(() => {
      expect(container.textContent).not.toContain("Envoi…");
    });
    expect(countOccurrences(container, "Premier message")).toBe(1);

    // HTTP RPC resolves after Realtime
    await act(async () => {
      rpcDeferred.resolve({ data: confirmedRow, error: null });
    });
    await flush();

    expect(countOccurrences(container, "Premier message")).toBe(1);
    expect(container.textContent).not.toContain("Envoi…");
  });

  it("prevents duplicate submissions on double-click and concurrent Enter", async () => {
    const rpcDeferred = createDeferred<{ data: any; error: any }>();
    mockHarness.rpcHandler = () => rpcDeferred.promise;

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-1" />);
    });
    await flush();

    const textarea = container.querySelector('textarea[aria-label="Nouveau commentaire"]') as HTMLTextAreaElement;
    const sendBtn = container.querySelector('button[aria-label="Envoyer le commentaire"]') as HTMLButtonElement;

    await act(async () => {
      setTextareaValue(textarea, "Double clic test");
    });
    await act(async () => {
      sendBtn.click();
      sendBtn.click();
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(mockHarness.rpcCalls).toHaveLength(1);

    await act(async () => {
      rpcDeferred.resolve({
        data: {
          id: "srv-dbl-1",
          operation_type: "bets",
          operation_id: "op-1",
          user_id: mockUser.id,
          comment: "Double clic test",
          is_internal: false,
          client_request_id: mockHarness.rpcCalls[0].p_client_request_id,
          created_at: "2026-11-13T12:01:00.000Z",
        },
        error: null,
      });
    });
    await flush();

    expect(countOccurrences(container, "Double clic test")).toBe(1);
  });

  it("handles network failure with 'Échec de l'envoi', preserves text, and retries with the exact same idempotency key", async () => {
    let attempt = 0;
    mockHarness.rpcHandler = async (args) => {
      attempt += 1;
      if (attempt === 1) {
        return { data: null, error: new Error("Network timeout") };
      }
      const row = {
        id: "srv-retry-1",
        operation_type: args.p_operation_type,
        operation_id: args.p_operation_id,
        user_id: mockUser.id,
        comment: args.p_comment,
        is_internal: false,
        client_request_id: args.p_client_request_id,
        created_at: "2026-11-13T12:02:00.000Z",
      };
      mockHarness.commentsStore.push(row);
      return { data: row, error: null };
    };

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-1" />);
    });
    await flush();

    const textarea = container.querySelector('textarea[aria-label="Nouveau commentaire"]') as HTMLTextAreaElement;
    const sendBtn = container.querySelector('button[aria-label="Envoyer le commentaire"]') as HTMLButtonElement;

    await act(async () => {
      setTextareaValue(textarea, "Message critique");
    });
    await act(async () => {
      sendBtn.click();
    });

    await waitForCondition(() => {
      expect(container.textContent).toContain("Échec de l'envoi");
    });
    expect(textarea.value).toBe("Message critique");

    const retryBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Réessayer"),
    ) as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      retryBtn.click();
    });

    await waitForCondition(() => {
      expect(container.textContent).not.toContain("Échec de l'envoi");
    });

    expect(mockHarness.rpcCalls).toHaveLength(2);
    expect(mockHarness.rpcCalls[0].p_client_request_id).toBe(
      mockHarness.rpcCalls[1].p_client_request_id,
    );
    expect(countOccurrences(container, "Message critique")).toBe(1);
  });

  it("allows two intentionally identical comments with distinct idempotency keys", async () => {
    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-1" />);
    });
    await flush();

    const textarea = container.querySelector('textarea[aria-label="Nouveau commentaire"]') as HTMLTextAreaElement;
    const sendBtn = container.querySelector('button[aria-label="Envoyer le commentaire"]') as HTMLButtonElement;

    await act(async () => {
      setTextareaValue(textarea, "Texte identique");
    });
    await act(async () => {
      sendBtn.click();
    });
    await waitForCondition(() => {
      expect(countOccurrences(container, "Texte identique")).toBe(1);
    });

    await act(async () => {
      setTextareaValue(textarea, "Texte identique");
    });
    await act(async () => {
      sendBtn.click();
    });
    await waitForCondition(() => {
      expect(countOccurrences(container, "Texte identique")).toBe(2);
    });

    expect(mockHarness.rpcCalls[0].p_client_request_id).not.toBe(
      mockHarness.rpcCalls[1].p_client_request_id,
    );
  });

  it("ignores stale out-of-order HTTP responses on rapid operation switch and preserves draft during Realtime refresh", async () => {
    const op1Deferred = createDeferred<any>();
    mockHarness.commentsFetchQueue.push(() => op1Deferred.promise);

    mockHarness.commentsStore.push({
      id: "op2-msg-1",
      operation_type: "bets",
      operation_id: "op-2",
      user_id: mockUser.id,
      comment: "Message de op-2",
      is_internal: false,
      created_at: "2026-11-13T12:05:00.000Z",
    });

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-1" />);
    });

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-2" />);
    });

    await waitForCondition(() => {
      expect(container.textContent).toContain("Message de op-2");
    });
    expect(mockHarness.removedChannels).toContain("operation-activity-bets-op-1");

    // Late stale op-1 response must be ignored
    await act(async () => {
      op1Deferred.resolve({
        data: [
          {
            id: "op1-stale",
            operation_type: "bets",
            operation_id: "op-1",
            user_id: mockUser.id,
            comment: "Ancien message op-1",
            is_internal: false,
            created_at: "2026-11-13T12:00:00.000Z",
          },
        ],
        error: null,
        count: 1,
      });
    });
    await flush();

    expect(container.textContent).not.toContain("Ancien message op-1");
    expect(container.textContent).toContain("Message de op-2");

    // Draft preserved on SUBSCRIBED catch-up
    const textarea = container.querySelector('textarea[aria-label="Nouveau commentaire"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(textarea, "Brouillon en cours");
    });

    const op2Channel = mockHarness.channels.find(
      (c) => c.name === "operation-activity-bets-op-2",
    );
    await act(async () => {
      op2Channel?.subscribeCb?.("SUBSCRIBED");
    });
    await flush();
    expect(textarea.value).toBe("Brouillon en cours");

    // Degraded Realtime indicator
    await act(async () => {
      op2Channel?.subscribeCb?.("CHANNEL_ERROR");
    });
    expect(container.textContent).toContain("Temps réel indisponible");
  });

  it("distinguishes load errors from empty state and supports pagination on long lists", async () => {
    mockHarness.commentsFetchQueue.push(() =>
      Promise.resolve({ data: null, error: new Error("DB unreachable"), count: null }),
    );

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-err" />);
    });

    await waitForCondition(() => {
      expect(container.textContent).toContain("DB unreachable");
    });
    expect(container.textContent).not.toContain("Aucun commentaire pour cette opération.");

    for (let i = 1; i <= 60; i++) {
      mockHarness.commentsStore.push({
        id: `long-${String(i).padStart(3, "0")}`,
        operation_type: "bets",
        operation_id: "op-long",
        user_id: mockUser.id,
        comment: `ItemLong#${i}`,
        is_internal: false,
        created_at: "2026-11-13T12:00:00.000Z",
      });
    }

    await act(async () => {
      root.render(<OperationCommentsPanel operationType="bets" operationId="op-long" />);
    });

    await waitForCondition(() => {
      expect(container.textContent).toContain("ItemLong#1");
    });
    expect(container.textContent).toContain("Charger plus (50/60)");

    const loadMoreBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Charger plus"),
    ) as HTMLButtonElement;
    await act(async () => {
      loadMoreBtn.click();
    });

    await waitForCondition(() => {
      expect(container.textContent).toContain("ItemLong#60");
    });
  });
});
