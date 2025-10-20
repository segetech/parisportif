import dayjs, { DATE_FORMAT, TIME_FORMAT } from "@/lib/dayjs";
import { supabase } from "@/lib/supabase";
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
  email: string;
  role: Role;
  statut: UserStatus;
  derniere_connexion?: string;
  cree_le: string;
  mis_a_jour_le: string;
  mfa_active?: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  time: string;
  operator: string;
  platform: string;
  payment_operator: string;
  type: "Dépôt" | "Retrait";
  amount_fcfa: number;
  phone?: string;
  reference: string;
  proof: boolean;
  notes?: string;
  created_at: string;
  created_by: string;
  review_status: "en_cours" | "valide" | "rejete";
  reviewed_by?: string;
  reviewed_at?: string;
  reject_reason?: string;
}

export interface Bet {
  id: string;
  date: string;
  time: string;
  operator: string;
  support: string;
  bet_type: string;
  amount_fcfa: number;
  reference: string;
  status: "gagné" | "perdu" | "en attente";
  amount_won_fcfa?: number;
  ticket_url?: string;
  notes?: string;
  created_at: string;
  created_by: string;
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
  support: string;
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

async function delay(ms = 80) {
  await new Promise((r) => setTimeout(r, ms));
}

function withinPeriod(d: string, start: string, end: string) {
  const x = dayjs(d);
  return !x.isBefore(dayjs(start)) && !x.isAfter(dayjs(end));
}

// Authentication
export const auth = {
  async login(email: string, password: string): Promise<User> {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
        password,
      }),
      cache: "no-store",
    });

    // Parse response - only read body once
    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error("Failed to parse response:", error);
      throw new Error("Invalid response from server");
    }

    // Check status after parsing
    if (!response.ok) {
      throw new Error(data?.error || "Erreur de connexion");
    }

    return data.user as User;
  },

  async me(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) return null;
    return (data as User) || null;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getCurrentSession() {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch {
      return null;
    }
  },
};

// Roles and permissions
const defaultRolePerms: Record<Role, Permission[]> = {
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
};

export const roles = {
  async listPermissions(): Promise<Record<Role, Permission[]>> {
    await delay();
    return JSON.parse(JSON.stringify(defaultRolePerms));
  },
  async setPermissions(role: Role, perms: Permission[]): Promise<void> {
    await delay();
    const valid = perms.filter((p) =>
      (ALL_PERMISSIONS as readonly string[]).includes(p),
    );
    defaultRolePerms[role] = Array.from(new Set(valid));
  },
};

// Interface for filters
export interface ListFilters {
  start?: string;
  end?: string;
  operator?: string;
  reference?: string;
  createdByOnly?: string;
}

// Transactions
export const transactions = {
  async list(filters: ListFilters = {}): Promise<Transaction[]> {
    let query = supabase.from("transactions").select("*");

    if (filters.start && filters.end) {
      query = query.gte("date", filters.start).lte("date", filters.end);
    }

    if (filters.operator) {
      query = query.eq("operator", filters.operator);
    }

    if (filters.reference) {
      query = query.ilike("reference", `%${filters.reference}%`);
    }

    if (filters.createdByOnly) {
      query = query.eq("created_by", filters.createdByOnly);
    }

    const { data, error } = await query
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Transaction[]) || [];
  },

  async get(id: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return (data as Transaction) || null;
  },

  async create(
    input: Omit<Transaction, "id" | "created_at"> & { created_by: string },
  ): Promise<Transaction> {
    const ref = input.reference.trim();

    // Check if reference already exists
    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .ilike("reference", ref);

    if (existing && existing.length > 0) {
      throw new Error("Cette référence existe déjà.");
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({ ...input, reference: ref })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async update(
    id: string,
    input: Partial<Omit<Transaction, "id" | "created_at" | "created_by">>,
  ): Promise<Transaction> {
    const prev = await transactions.get(id);
    if (!prev) throw new Error("Introuvable");

    if (input.reference) {
      const ref = input.reference.trim();
      const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .neq("id", id)
        .ilike("reference", ref);

      if (existing && existing.length > 0) {
        throw new Error("Cette référence existe déjà.");
      }
      (input as any).reference = ref;
    }

    const updated = { ...prev, ...input } as Transaction;
    if (prev.review_status === "rejete" && input) {
      updated.review_status = "en_cours";
      updated.reject_reason = undefined;
      updated.reviewed_at = undefined;
      updated.reviewed_by = undefined;
    }

    const { data, error } = await supabase
      .from("transactions")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async validate(id: string, reviewer: User): Promise<Transaction> {
    const now = dayjs().toISOString();
    const updated = {
      review_status: "valide" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: null,
    };

    const { data, error } = await supabase
      .from("transactions")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async reject(
    id: string,
    reviewer: User,
    reason: string,
  ): Promise<Transaction> {
    if (!reason?.trim()) throw new Error("Motif requis");

    const now = dayjs().toISOString();
    const updated = {
      review_status: "rejete" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: reason.trim(),
    };

    const { data, error } = await supabase
      .from("transactions")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },
};

// Bets
export const bets = {
  async list(filters: ListFilters = {}): Promise<Bet[]> {
    let query = supabase.from("bets").select("*");

    if (filters.start && filters.end) {
      query = query.gte("date", filters.start).lte("date", filters.end);
    }

    if (filters.operator) {
      query = query.eq("operator", filters.operator);
    }

    if (filters.reference) {
      query = query.ilike("reference", `%${filters.reference}%`);
    }

    if (filters.createdByOnly) {
      query = query.eq("created_by", filters.createdByOnly);
    }

    const { data, error } = await query.order("date", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as Bet[]) || [];
  },

  async create(
    input: Omit<Bet, "id" | "created_at"> & { created_by: string },
  ): Promise<Bet> {
    const ref = input.reference.trim();

    // Check if reference already exists
    const { data: existing } = await supabase
      .from("bets")
      .select("id")
      .ilike("reference", ref);

    if (existing && existing.length > 0) {
      throw new Error("Cette référence existe déjà.");
    }

    const { data, error } = await supabase
      .from("bets")
      .insert({ ...input, reference: ref })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Bet;
  },

  async update(
    id: string,
    input: Partial<Omit<Bet, "id" | "created_at" | "created_by">>,
  ): Promise<Bet> {
    const prev = await bets.get(id);
    if (!prev) throw new Error("Introuvable");

    const updated = { ...prev, ...input } as Bet;
    if (prev.review_status === "rejete" && input) {
      updated.review_status = "en_cours";
      updated.reject_reason = undefined;
      updated.reviewed_at = undefined;
      updated.reviewed_by = undefined;
    }

    const { data, error } = await supabase
      .from("bets")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Bet;
  },

  async get(id: string): Promise<Bet | null> {
    const { data, error } = await supabase
      .from("bets")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return (data as Bet) || null;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("bets").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async validate(id: string, reviewer: User): Promise<Bet> {
    const now = dayjs().toISOString();
    const updated = {
      review_status: "valide" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: null,
    };

    const { data, error } = await supabase
      .from("bets")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Bet;
  },

  async reject(id: string, reviewer: User, reason: string): Promise<Bet> {
    if (!reason?.trim()) throw new Error("Motif requis");

    const now = dayjs().toISOString();
    const updated = {
      review_status: "rejete" as const,
      reviewed_by: reviewer.id,
      reviewed_at: now,
      reject_reason: reason.trim(),
    };

    const { data, error } = await supabase
      .from("bets")
      .update(updated)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Bet;
  },
};

// Venues
export const venues = {
  async list(): Promise<Venue[]> {
    const { data, error } = await supabase.from("venues").select("*");
    if (error) throw new Error(error.message);
    return (data as Venue[]) || [];
  },

  async create(input: Omit<Venue, "id">): Promise<Venue> {
    const { data, error } = await supabase
      .from("venues")
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Venue;
  },

  async update(id: string, input: Partial<Venue>): Promise<Venue> {
    const { data, error } = await supabase
      .from("venues")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Venue;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("venues").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

// Lookups (stored as app config, not in DB for now)
const defaultLookups: Lookups = {
  operators: ["1xBet", "Betway", "PMU Mali"],
  supports: ["Mobile", "Web", "Salle de jeux"],
  payment_operators: ["Orange Money", "Moov", "Carte"],
  bet_types: ["Simple", "Combiné", "Système"],
  statuses: ["gagné", "perdu", "en attente"],
  platforms: ["Web", "Mobile", "Agence"],
};

export const lookups = {
  async all(): Promise<Lookups> {
    await delay();
    return JSON.parse(JSON.stringify(defaultLookups));
  },

  async add(key: LookupKey, value: string): Promise<void> {
    await delay();
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (defaultLookups[key].some((v) => v.trim().toLowerCase() === normalized))
      return;
    defaultLookups[key].push(value.trim());
  },

  async remove(key: LookupKey, value: string): Promise<void> {
    await delay();
    defaultLookups[key] = defaultLookups[key].filter((v) => v !== value);
  },
};

// Matching engine
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
            id: `m_${Math.random().toString(36).slice(2, 10)}`,
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

// Users management
export const users = {
  async list(
    params: {
      q?: string;
      role?: Role | "TOUS";
      statut?: UserStatus | "TOUS";
      page?: number;
      size?: number;
    } = {},
  ): Promise<{ rows: User[]; total: number }> {
    const {
      q = "",
      role = "TOUS",
      statut = "TOUS",
      page = 1,
      size = 10,
    } = params;

    let query = supabase.from("users").select("*", { count: "exact" });

    if (q.trim()) {
      const qn = q.trim().toLowerCase();
      query = query.or(
        `nom.ilike.%${qn}%,prenom.ilike.%${qn}%,email.ilike.%${qn}%`,
      );
    }

    if (role !== "TOUS") {
      query = query.eq("role", role);
    }

    if (statut !== "TOUS") {
      query = query.eq("statut", statut);
    }

    const { data, error, count } = await query
      .order("cree_le", { ascending: false })
      .range((page - 1) * size, page * size - 1);

    if (error) throw new Error(error.message);

    return {
      rows: (data as User[]) || [],
      total: count || 0,
    };
  },

  async get(id: string): Promise<User> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error("Introuvable");
    return data as User;
  },

  async create(
    u: Omit<User, "id" | "cree_le" | "mis_a_jour_le" | "derniere_connexion">,
  ): Promise<User> {
    const email = u.email.toLowerCase();

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    if (existing && existing.length > 0) {
      throw new Error("Cet email est déjà utilisé.");
    }

    const now = dayjs().toISOString();

    // Create Supabase auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: `temp_${Math.random().toString(36).slice(2, 10)}`,
        user_metadata: { nom: u.nom, role: u.role },
      });

    if (authError) throw new Error(authError.message);

    const { data, error } = await supabase
      .from("users")
      .insert({
        id: authData.user.id,
        nom: u.nom,
        prenom: u.prenom,
        email,
        role: u.role,
        statut: u.statut,
        mfa_active: u.mfa_active,
        cree_le: now,
        mis_a_jour_le: now,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as User;
  },

  async update(id: string, patch: Partial<User>): Promise<User> {
    if (patch.email) {
      const email = patch.email.toLowerCase();
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .neq("id", id)
        .eq("email", email);

      if (existing && existing.length > 0) {
        throw new Error("Cet email est déjà utilisé.");
      }
      patch.email = email as any;
    }

    const { data, error } = await supabase
      .from("users")
      .update({ ...patch, mis_a_jour_le: dayjs().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as User;
  },

  async changeRole(id: string, role: Role): Promise<User> {
    const user = await users.get(id);

    if (user.role === "ADMIN" && role !== "ADMIN") {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("role", "ADMIN")
        .eq("statut", "actif")
        .neq("id", id);

      if (error || !data || data.length === 0) {
        throw new Error(
          "Au moins un Administrateur actif doit rester dans le système.",
        );
      }
    }

    return users.update(id, { role });
  },

  async suspend(id: string, motif: string): Promise<void> {
    await users.update(id, { statut: "suspendu" });
  },

  async activate(id: string): Promise<void> {
    await users.update(id, { statut: "actif" });
  },

  async resetPassword(id: string): Promise<{ resetUrl: string }> {
    const resetUrl = `${window.location.origin}/reset?token=${Math.random().toString(36).slice(2, 10)}`;
    return { resetUrl };
  },

  async delete(id: string, motif: string): Promise<void> {
    const user = await users.get(id);

    if (user.role === "ADMIN") {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("role", "ADMIN")
        .eq("statut", "actif")
        .neq("id", id);

      if (error || !data || data.length === 0) {
        throw new Error("Impossible de supprimer le dernier Administrateur.");
      }
    }

    await users.update(id, { statut: "desactive" });
  },

  async bulkChangeRole(ids: string[], role: Role): Promise<void> {
    if (role !== "ADMIN") {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("role", "ADMIN")
        .eq("statut", "actif");

      const remainingAdmins = (data || []).filter(
        (u) => !ids.includes(u.id),
      ).length;
      if (remainingAdmins === 0) {
        throw new Error(
          "Au moins un Administrateur actif doit rester dans le système.",
        );
      }
    }

    const now = dayjs().toISOString();
    const { error } = await supabase
      .from("users")
      .update({ role, mis_a_jour_le: now })
      .in("id", ids);

    if (error) throw new Error(error.message);
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
};

export default api;
