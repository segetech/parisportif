import dayjs, { DATE_FORMAT, TIME_FORMAT } from "@/lib/dayjs";

// Roles
export type Role = "ADMIN" | "AGENT";

// Core types
export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  operator: string;
  platform: string;
  payment_operator: string;
  type: "Dépôt" | "Retrait";
  amount_fcfa: number;
  phone?: string;
  reference: string; // unique
  proof: boolean; // Oui/Non
  notes?: string;
  created_at: string; // ISO
  created_by: string; // user id
}

export interface Bet {
  id: string;
  date: string;
  time: string;
  operator: string;
  support: string;
  bet_type: string;
  amount_fcfa: number;
  reference: string; // unique
  status: "gagné" | "perdu" | "en attente";
  amount_won_fcfa?: number;
  ticket_url?: string;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface Venue {
  id: string;
  quartier_no?: string;
  quartier: string;
  operator: string;
  support: string; // ex: "Salle de jeux"
  bet_type: string;
  address: string;
  contact_phone?: string;
  gps_lat?: number;
  gps_lng?: number;
  notes?: string;
  created_at: string; // ISO
  created_by: string; // user id
}

export type LookupKey =
  | "operators"
  | "supports"
  | "payment_operators"
  | "bet_types"
  | "statuses"
  | "platforms";
export type Lookups = Record<LookupKey, string[]>;

// In-memory stores
const store = {
  users: [] as User[],
  transactions: [] as Transaction[],
  bets: [] as Bet[],
  venues: [] as Venue[],
  lookups: {
    operators: ["1xBet", "Bet223", "PremierBet", "MaliBet"],
    supports: ["Mobile", "Web", "Salle de jeux"],
    payment_operators: ["Orange Money", "Moov", "Carte", "Wave"],
    bet_types: ["Simple", "Combiné", "Système"],
    statuses: ["gagné", "perdu", "en attente"],
    platforms: ["Web", "Mobile"],
  } as Lookups,
  settings: {
    agentCanManageVenues: false,
    agentsCanAddLookups: false,
    matchingWindowMinutes: 30,
    amountTolerancePercent: 5,
    defaultDashboardPeriod: "today" as const,
    agentEditWindowMinutes: 60,
  },
};

// Seed two users (ids stable in memory session)
function seedUsers() {
  if (store.users.length) return;
  store.users.push(
    { id: "u_admin", email: "admin@pari.local", role: "ADMIN" },
    { id: "u_agent", email: "agent@pari.local", role: "AGENT" },
  );
}
seedUsers();

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function withinPeriod(d: string, start: string, end: string) {
  const x = dayjs(d);
  return !x.isBefore(dayjs(start)) && !x.isAfter(dayjs(end));
}

async function delay(ms = 80) {
  await new Promise((r) => setTimeout(r, ms));
}

export const auth = {
  async login(email: string, password: string): Promise<User> {
    await delay();
    // Simple mock: password 'admin' => ADMIN, 'agent' => AGENT, else reject
    const role: Role | null =
      password === "admin" ? "ADMIN" : password === "agent" ? "AGENT" : null;
    if (!role) throw new Error("Identifiants invalides");
    let user = store.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user) {
      user = { id: uid("u"), email, role };
      store.users.push(user);
    } else {
      user.role = role; // allow switching role for demo
    }
    return user;
  },
  async me(userId: string): Promise<User | null> {
    await delay();
    return store.users.find((u) => u.id === userId) ?? null;
  },
};

export interface ListFilters {
  start?: string; // YYYY-MM-DD
  end?: string; // YYYY-MM-DD
  operator?: string;
  reference?: string;
  createdByOnly?: string; // user id to restrict
}

function applyFilters<
  T extends { date: string } & Partial<{
    operator: string;
    reference: string;
    created_by: string;
  }>,
>(rows: T[], f: ListFilters) {
  return rows.filter((r) => {
    if (f.start && f.end) {
      if (!withinPeriod(r.date, f.start, f.end)) return false;
    }
    if (f.operator && (r as any).operator && (r as any).operator !== f.operator)
      return false;
    if (f.reference && (r as any).reference) {
      if (
        !(r as any).reference.toLowerCase().includes(f.reference.toLowerCase())
      )
        return false;
    }
    if (f.createdByOnly && (r as any).created_by) {
      if ((r as any).created_by !== f.createdByOnly) return false;
    }
    return true;
  });
}

export const transactions = {
  async list(filters: ListFilters = {}): Promise<Transaction[]> {
    await delay();
    return applyFilters(
      [...store.transactions].sort((a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time),
      ),
      filters,
    );
  },
  async get(id: string): Promise<Transaction | null> {
    await delay();
    return store.transactions.find((t) => t.id === id) ?? null;
  },
  async create(
    input: Omit<Transaction, "id" | "created_at"> & { created_by: string },
  ): Promise<Transaction> {
    await delay();
    const ref = input.reference.trim();
    if (
      store.transactions.some(
        (t) => t.reference.toLowerCase() === ref.toLowerCase(),
      )
    ) {
      throw new Error("Cette référence existe déjà.");
    }
    const now = dayjs().toISOString();
    const tx: Transaction = {
      ...input,
      reference: ref,
      id: uid("tx"),
      created_at: now,
    };
    store.transactions.push(tx);
    return tx;
  },
  async update(
    id: string,
    input: Partial<Omit<Transaction, "id" | "created_at" | "created_by">>,
  ): Promise<Transaction> {
    await delay();
    const idx = store.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    if (input.reference) {
      const ref = input.reference.trim();
      if (
        store.transactions.some(
          (t) => t.id !== id && t.reference.toLowerCase() === ref.toLowerCase(),
        )
      ) {
        throw new Error("Cette référence existe déjà.");
      }
      (input as any).reference = ref;
    }
    const updated = { ...store.transactions[idx], ...input };
    store.transactions[idx] = updated;
    return updated;
  },
  async delete(id: string): Promise<void> {
    await delay();
    store.transactions = store.transactions.filter((t) => t.id !== id);
  },
};

export const bets = {
  async list(filters: ListFilters = {}): Promise<Bet[]> {
    await delay();
    return applyFilters([...store.bets], filters);
  },
  async create(
    input: Omit<Bet, "id" | "created_at"> & { created_by: string },
  ): Promise<Bet> {
    await delay();
    const ref = input.reference.trim();
    if (
      store.bets.some((t) => t.reference.toLowerCase() === ref.toLowerCase())
    ) {
      throw new Error("Cette référence existe déjà.");
    }
    const now = dayjs().toISOString();
    const row: Bet = {
      ...input,
      reference: ref,
      id: uid("bet"),
      created_at: now,
    };
    store.bets.push(row);
    return row;
  },
};

export const venues = {
  async list(): Promise<Venue[]> {
    await delay();
    return [...store.venues];
  },
  async create(input: Omit<Venue, "id" | "created_at">): Promise<Venue> {
    await delay();
    const v: Venue = {
      ...input,
      id: uid("ven"),
      created_at: dayjs().toISOString(),
    };
    store.venues.push(v);
    return v;
  },
  async update(id: string, input: Partial<Venue>): Promise<Venue> {
    await delay();
    const i = store.venues.findIndex((v) => v.id === id);
    if (i === -1) throw new Error("Introuvable");
    const v = { ...store.venues[i], ...input };
    store.venues[i] = v;
    return v;
  },
  async delete(id: string): Promise<void> {
    await delay();
    store.venues = store.venues.filter((v) => v.id !== id);
  },
};

export const lookups = {
  async all(): Promise<Lookups> {
    await delay();
    return JSON.parse(JSON.stringify(store.lookups));
  },
  async add(key: LookupKey, value: string): Promise<void> {
    await delay();
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (store.lookups[key].some((v) => v.trim().toLowerCase() === normalized))
      return;
    store.lookups[key].push(value.trim());
  },
  async remove(key: LookupKey, value: string): Promise<void> {
    await delay();
    store.lookups[key] = store.lookups[key].filter((v) => v !== value);
  },
};

export interface MatchSuggestion {
  id: string;
  transactionId: string;
  betId: string;
  score: number;
  reasons: string[];
}

export const matching = {
  async suggestions(
    filters: {
      start?: string;
      end?: string;
      operator?: string;
      minScore?: number;
      createdByOnly?: string;
    } = {},
  ): Promise<MatchSuggestion[]> {
    await delay();
    // naive matching based on spec points
    const txs = await transactions.list(filters);
    const bs = await bets.list(filters);
    const res: MatchSuggestion[] = [];
    for (const t of txs) {
      for (const b of bs) {
        let score = 0;
        const reasons: string[] = [];
        if (t.operator === b.operator) {
          score += 40;
          reasons.push("opérateur identique");
        }
        const tTime = dayjs(`${t.date} ${t.time}`);
        const bTime = dayjs(`${b.date} ${b.time}`);
        if (Math.abs(tTime.diff(bTime, "minute")) <= 30) {
          score += 30;
          reasons.push("heure ±30 min");
        }
        const tol = 0.05 * b.amount_fcfa;
        if (Math.abs(t.amount_fcfa - b.amount_fcfa) <= tol) {
          score += 20;
          reasons.push("montant ±5 %");
        }
        if (t.created_by === b.created_by) {
          score += 10;
          reasons.push("même auteur");
        }
        if ((filters.minScore ?? 0) <= score) {
          res.push({
            id: uid("m"),
            transactionId: t.id,
            betId: b.id,
            score,
            reasons,
          });
        }
      }
    }
    return res.sort((a, b) => b.score - a.score);
  },
};

// Seed a few demo rows to make UI non-empty
(function seedDemo() {
  if (store.transactions.length) return;
  const now = dayjs();
  const admin = store.users.find((u) => u.role === "ADMIN")!;
  const agent = store.users.find((u) => u.role === "AGENT")!;
  const ops = store.lookups.operators;
  const pays = store.lookups.payment_operators;
  for (let i = 0; i < 6; i++) {
    const date = now.subtract(i, "day").format(DATE_FORMAT);
    const time = now.subtract(i, "hour").format(TIME_FORMAT);
    const created_by = i % 2 === 0 ? admin.id : agent.id;
    store.transactions.push({
      id: uid("tx"),
      date,
      time,
      operator: ops[i % ops.length],
      platform: "Web",
      payment_operator: pays[i % pays.length],
      type: i % 2 === 0 ? "Dépôt" : "Retrait",
      amount_fcfa: 10000 + i * 500,
      phone: "70000000",
      reference: `REF-${1000 + i}`,
      proof: i % 2 === 0,
      notes: "",
      created_at: now.toISOString(),
      created_by,
    });
    store.bets.push({
      id: uid("bet"),
      date,
      time,
      operator: ops[i % ops.length],
      support: "Mobile",
      bet_type: "Simple",
      amount_fcfa: 5000 + i * 300,
      reference: `BET-${1000 + i}`,
      status: i % 3 === 0 ? "gagné" : i % 3 === 1 ? "perdu" : "en attente",
      amount_won_fcfa: i % 3 === 0 ? 2000 + i * 200 : undefined,
      ticket_url: "",
      notes: "",
      created_at: now.toISOString(),
      created_by,
    });
  }
})();

export const api = {
  auth,
  transactions,
  bets,
  venues,
  lookups,
  matching,
  store,
};
export default api;
