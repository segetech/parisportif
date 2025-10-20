import dayjs, { DATE_FORMAT, TIME_FORMAT } from "@/lib/dayjs";
import { auditService } from "../lib/audit";
import { ALL_PERMISSIONS, type Permission } from "../lib/rbac";

// Roles
export type Role = "ADMIN" | "CONTROLEUR" | "AGENT";

// Core types
export type UserStatus =
  | "actif"
  | "suspendu"
  | "invitation_envoyee"
  | "desactive";

export interface User {
  id: string;
  nom: string;
  prenom?: string;
  email: string; // unique, lowercase
  role: Role; // un seul rôle
  statut: UserStatus; // défaut: invitation_envoyee ou actif
  derniere_connexion?: string; // ISO
  cree_le: string; // ISO
  mis_a_jour_le: string; // ISO
  mfa_active?: boolean;
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
  // Contrôle
  review_status: "en_cours" | "valide" | "rejete";
  reviewed_by?: string; // user id/email du contrôleur
  reviewed_at?: string; // ISO
  reject_reason?: string; // requis si 'rejete'
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
  // Contrôle
  review_status: "en_cours" | "valide" | "rejete";
  reviewed_by?: string;
  reviewed_at?: string;
  reject_reason?: string;
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
    operators: ["1xBet", "Betway", "PMU Mali"],
    supports: ["Mobile", "Web", "Salle de jeux"],
    payment_operators: ["Orange Money", "Moov", "Carte"],
    bet_types: ["Simple", "Combiné", "Système"],
    statuses: ["gagné", "perdu", "en attente"],
    platforms: ["Web", "Mobile", "Agence"],
  } as Lookups,
  settings: {
    agentCanManageVenues: false,
    matchingWindowMinutes: 30,
    amountTolerancePercent: 5,
    defaultDashboardPeriod: "today" as const,
    agentEditWindowMinutes: 60,
    agentsCanAddLookups: false,
  },
  rolesPerms: {
    ADMIN: [...ALL_PERMISSIONS],
    CONTROLEUR: [
      "validate_records",
      "view_audit",
      "export_data",
      "delete_records",
    ] as Permission[],
    AGENT: [
      "manage_transactions",
      "manage_bets",
      "manage_venues",
    ] as Permission[],
  } as Record<Role, Permission[]>,
};

// Roles permissions service (in-memory)
export const roles = {
  async listPermissions(): Promise<Record<Role, Permission[]>> {
    await delay();
    return JSON.parse(JSON.stringify(store.rolesPerms));
  },
  async setPermissions(role: Role, perms: Permission[]): Promise<void> {
    await delay();
    const valid = perms.filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
    store.rolesPerms[role] = Array.from(new Set(valid));
    auditService.log("edite", "Systeme", `role-${role}`, {
      entity: "Role",
      role,
      permissions: store.rolesPerms[role],
    });
  },
};

// Seed two users (ids stable in memory session)
function seedUsers() {
  if (store.users.length) return;
  const now = dayjs().toISOString();
  store.users.push(
    {
      id: "u_admin",
      nom: "Admin",
      prenom: "",
      email: "admin@pari.local",
      role: "ADMIN",
      statut: "actif",
      cree_le: now,
      mis_a_jour_le: now,
      mfa_active: false,
    },
    {
      id: "u_cont",
      nom: "Controleur",
      prenom: "",
      email: "controleur@pari.local",
      role: "CONTROLEUR",
      statut: "actif",
      cree_le: now,
      mis_a_jour_le: now,
      mfa_active: false,
    },
    {
      id: "u_agent",
      nom: "Agent",
      prenom: "",
      email: "agent@pari.local",
      role: "AGENT",
      statut: "actif",
      cree_le: now,
      mis_a_jour_le: now,
      mfa_active: false,
    },
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
    const role: Role | null =
      password === "admin"
        ? "ADMIN"
        : password === "controleur"
        ? "CONTROLEUR"
        : password === "agent"
        ? "AGENT"
        : null;
    if (!role) throw new Error("Identifiants invalides");
    const now = dayjs().toISOString();
    let user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      const nom = email.split("@")[0];
      user = {
        id: uid("u"),
        nom,
        prenom: "",
        email: email.toLowerCase(),
        role,
        statut: "actif",
        cree_le: now,
        mis_a_jour_le: now,
        derniere_connexion: now,
        mfa_active: false,
      };
      store.users.push(user);
    } else {
      user.role = role; // démo: permet de basculer de rôle
      user.derniere_connexion = now;
      user.mis_a_jour_le = now;
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
      review_status: "en_cours",
    };
    store.transactions.push(tx);
    auditService.log("cree", "Transaction", tx.id, {
      by: input.created_by,
      values: tx,
    });
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
    const prev = store.transactions[idx];
    // Règle: si AGENT édite un enregistrement rejeté, repasse à en_cours
    const updatedBase = { ...prev, ...input } as Transaction;
    if (prev.review_status === "rejete" && input) {
      updatedBase.review_status = "en_cours";
      updatedBase.reject_reason = undefined;
      updatedBase.reviewed_at = undefined;
      updatedBase.reviewed_by = undefined;
    }
    const updated = updatedBase;
    store.transactions[idx] = updated;
    auditService.log("edite", "Transaction", id, { from: prev, to: updated });
    return updated;
  },
  async delete(id: string): Promise<void> {
    await delay();
    const prev = store.transactions.find((t) => t.id === id);
    store.transactions = store.transactions.filter((t) => t.id !== id);
    auditService.log("supprime", "Transaction", id, { from: prev });
  },
  async validate(id: string, reviewer: User): Promise<Transaction> {
    await delay();
    const idx = store.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    const now = dayjs().toISOString();
    const updated = {
      ...store.transactions[idx],
      review_status: "valide" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: undefined,
    };
    store.transactions[idx] = updated;
    auditService.log("valide", "Transaction", id, { by: reviewer });
    return updated;
  },
  async reject(id: string, reviewer: User, reason: string): Promise<Transaction> {
    await delay();
    if (!reason?.trim()) throw new Error("Motif requis");
    const idx = store.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    const now = dayjs().toISOString();
    const updated = {
      ...store.transactions[idx],
      review_status: "rejete" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: reason.trim(),
    };
    store.transactions[idx] = updated;
    auditService.log("rejete", "Transaction", id, { by: reviewer, reason });
    return updated;
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
      review_status: "en_cours",
    };
    store.bets.push(row);
    auditService.log("cree", "Pari", row.id, { by: input.created_by, values: row });
    return row;
  },
  async update(
    id: string,
    input: Partial<Omit<Bet, "id" | "created_at" | "created_by">>,
  ): Promise<Bet> {
    await delay();
    const idx = store.bets.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    const prev = store.bets[idx];
    const updatedBase = { ...prev, ...input } as Bet;
    if (prev.review_status === "rejete" && input) {
      updatedBase.review_status = "en_cours";
      updatedBase.reject_reason = undefined;
      updatedBase.reviewed_at = undefined;
      updatedBase.reviewed_by = undefined;
    }
    const updated = updatedBase;
    store.bets[idx] = updated;
    auditService.log("edite", "Pari", id, { from: prev, to: updated });
    return updated;
  },
  async delete(id: string): Promise<void> {
    await delay();
    const prev = store.bets.find((t) => t.id === id);
    store.bets = store.bets.filter((t) => t.id !== id);
    auditService.log("supprime", "Pari", id, { from: prev });
  },
  async validate(id: string, reviewer: User): Promise<Bet> {
    await delay();
    const idx = store.bets.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    const now = dayjs().toISOString();
    const updated = {
      ...store.bets[idx],
      review_status: "valide" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: undefined,
    };
    store.bets[idx] = updated;
    auditService.log("valide", "Pari", id, { by: reviewer });
    return updated;
  },
  async reject(id: string, reviewer: User, reason: string): Promise<Bet> {
    await delay();
    if (!reason?.trim()) throw new Error("Motif requis");
    const idx = store.bets.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Introuvable");
    const now = dayjs().toISOString();
    const updated = {
      ...store.bets[idx],
      review_status: "rejete" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: reason.trim(),
    };
    store.bets[idx] = updated;
    auditService.log("rejete", "Pari", id, { by: reviewer, reason });
    return updated;
  },
};

export const venues = {
  async list(): Promise<Venue[]> {
    await delay();
    return [...store.venues];
  },
  async create(input: Omit<Venue, "id">): Promise<Venue> {
    await delay();
    const v: Venue = { ...input, id: uid("ven") };
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
      review_status: i % 3 === 0 ? "valide" : i % 3 === 1 ? "rejete" : "en_cours",
      reviewed_by: i % 3 === 0 ? admin.id : i % 3 === 1 ? admin.id : undefined,
      reviewed_at: i % 3 !== 2 ? now.toISOString() : undefined,
      reject_reason: i % 3 === 1 ? "Montant incohérent" : undefined,
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
      review_status: i % 3 === 0 ? "valide" : i % 3 === 1 ? "rejete" : "en_cours",
      reviewed_by: i % 3 === 0 ? admin.id : i % 3 === 1 ? admin.id : undefined,
      reviewed_at: i % 3 !== 2 ? now.toISOString() : undefined,
      reject_reason: i % 3 === 1 ? "Ticket illisible" : undefined,
    });
  }
})();

// Users management service (in-memory)
export const users = {
  async list(params: {
    q?: string;
    role?: Role | "TOUS";
    statut?: UserStatus | "TOUS";
    page?: number;
    size?: number;
  } = {}): Promise<{ rows: User[]; total: number }> {
    await delay();
    const { q = "", role = "TOUS", statut = "TOUS", page = 1, size = 10 } = params;
    let rows = [...store.users];
    const qn = q.trim().toLowerCase();
    if (qn) rows = rows.filter((u) => (u.nom + " " + (u.prenom || "") + " " + u.email).toLowerCase().includes(qn));
    if (role !== "TOUS") rows = rows.filter((u) => u.role === role);
    if (statut !== "TOUS") rows = rows.filter((u) => u.statut === statut);
    const total = rows.length;
    const start = (page - 1) * size;
    const paged = rows.slice(start, start + size);
    return { rows: paged, total };
  },
  async get(id: string): Promise<User> {
    await delay();
    const u = store.users.find((x) => x.id === id);
    if (!u) throw new Error("Introuvable");
    return u;
  },
  async create(u: Omit<User, "id" | "cree_le" | "mis_a_jour_le" | "derniere_connexion">): Promise<User> {
    await delay();
    const email = u.email.toLowerCase();
    if (store.users.some((x) => x.email.toLowerCase() === email)) {
      throw new Error("Cet email est déjà utilisé.");
    }
    const now = dayjs().toISOString();
    const row: User = {
      ...u,
      email,
      id: uid("u"),
      cree_le: now,
      mis_a_jour_le: now,
    };
    store.users.push(row);
    auditService.log("cree", "Systeme", row.id, { entity: "Utilisateur", values: row });
    return row;
  },
  async update(id: string, patch: Partial<User>): Promise<User> {
    await delay();
    const i = store.users.findIndex((u) => u.id === id);
    if (i === -1) throw new Error("Introuvable");
    if (patch.email) {
      const email = patch.email.toLowerCase();
      if (store.users.some((x) => x.id !== id && x.email.toLowerCase() === email)) {
        throw new Error("Cet email est déjà utilisé.");
      }
      patch.email = email as any;
    }
    const prev = store.users[i];
    const next: User = { ...prev, ...patch, mis_a_jour_le: dayjs().toISOString() };
    store.users[i] = next;
    auditService.log("edite", "Systeme", id, { entity: "Utilisateur", from: prev, to: next });
    return next;
  },
  async changeRole(id: string, role: Role): Promise<User> {
    await delay();
    const i = store.users.findIndex((u) => u.id === id);
    if (i === -1) throw new Error("Introuvable");
    // Garde-fou: dernier ADMIN
    if (store.users[i].role === "ADMIN" && role !== "ADMIN") {
      const otherAdmins = store.users.filter((u, idx) => idx !== i && u.role === "ADMIN" && u.statut === "actif").length;
      if (otherAdmins === 0) throw new Error("Au moins un Administrateur actif doit rester dans le système.");
    }
    const prev = store.users[i];
    const next = { ...prev, role, mis_a_jour_le: dayjs().toISOString() };
    store.users[i] = next;
    auditService.log("edite", "Systeme", id, { entity: "Utilisateur", change: "role", from: prev.role, to: role });
    return next as User;
  },
  async suspend(id: string, motif: string): Promise<void> {
    await delay();
    const i = store.users.findIndex((u) => u.id === id);
    if (i === -1) throw new Error("Introuvable");
    const prev = store.users[i];
    store.users[i] = { ...prev, statut: "suspendu", mis_a_jour_le: dayjs().toISOString() };
    auditService.log("edite", "Systeme", id, { entity: "Utilisateur", action: "suspend", motif });
  },
  async activate(id: string): Promise<void> {
    await delay();
    const i = store.users.findIndex((u) => u.id === id);
    if (i === -1) throw new Error("Introuvable");
    const prev = store.users[i];
    store.users[i] = { ...prev, statut: "actif", mis_a_jour_le: dayjs().toISOString() };
    auditService.log("edite", "Systeme", id, { entity: "Utilisateur", action: "activate" });
  },
  async resetPassword(id: string): Promise<{ resetUrl: string }> {
    await delay();
    const u = store.users.find((x) => x.id === id);
    if (!u) throw new Error("Introuvable");
    const resetUrl = `${window.location.origin}/reset?token=${uid("rst")}`;
    auditService.log("edite", "Systeme", id, { entity: "Utilisateur", action: "resetPassword" });
    return { resetUrl };
  },
  async delete(id: string, motif: string): Promise<void> {
    await delay();
    const i = store.users.findIndex((u) => u.id === id);
    if (i === -1) throw new Error("Introuvable");
    // dernier ADMIN
    if (store.users[i].role === "ADMIN") {
      const otherAdmins = store.users.filter((u, idx) => idx !== i && u.role === "ADMIN" && u.statut === "actif").length;
      if (otherAdmins === 0) throw new Error("Impossible de supprimer le dernier Administrateur.");
    }
    const prev = store.users[i];
    // soft delete -> désactivé
    store.users[i] = { ...prev, statut: "desactive", mis_a_jour_le: dayjs().toISOString() };
    auditService.log("supprime", "Systeme", id, { entity: "Utilisateur", motif, soft: true });
  },
  async bulkChangeRole(ids: string[], role: Role): Promise<void> {
    await delay();
    // Vérifier qu'au moins un ADMIN reste
    if (role !== "ADMIN") {
      const remainingAdmins = store.users.filter((u) => u.role === "ADMIN" && u.statut === "actif" && !ids.includes(u.id)).length;
      if (remainingAdmins === 0) throw new Error("Au moins un Administrateur actif doit rester dans le système.");
    }
    for (const id of ids) {
      const i = store.users.findIndex((u) => u.id === id);
      if (i !== -1) store.users[i] = { ...store.users[i], role, mis_a_jour_le: dayjs().toISOString() };
    }
    auditService.log("edite", "Systeme", "bulk-role", { ids, role });
  },
};

export const api = {
  auth,
  transactions,
  bets,
  venues,
  lookups,
  matching,
  roles,
  users,
  store,
};
export default api;
