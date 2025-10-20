import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Transaction, Bet, Venue, ListFilters } from "@/data/api";

// Cache configuration constants
const CACHE_CONFIG = {
  TRANSACTIONS: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    key: "transactions",
  },
  BETS: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    key: "bets",
  },
  VENUES: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    key: "venues",
  },
  USERS: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    key: "users",
  },
};

// Utility: Save to localStorage
function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`cache:${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

// Utility: Get from localStorage
function getFromCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`cache:${key}`);
    if (!item) return null;
    const { data } = JSON.parse(item);
    return data as T;
  } catch {
    return null;
  }
}

// Transactions
export function useTransactions(filters?: ListFilters) {
  return useQuery({
    queryKey: [CACHE_CONFIG.TRANSACTIONS.key, filters],
    queryFn: async () => {
      try {
        const data = await api.transactions.list(filters);
        saveToCache(CACHE_CONFIG.TRANSACTIONS.key, data);
        return data;
      } catch (error) {
        // Fallback to cached data on error
        const cached = getFromCache<Transaction[]>(CACHE_CONFIG.TRANSACTIONS.key);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: CACHE_CONFIG.TRANSACTIONS.staleTime,
    gcTime: CACHE_CONFIG.TRANSACTIONS.gcTime,
    retry: 2,
  });
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [CACHE_CONFIG.TRANSACTIONS.key, id],
    queryFn: () => api.transactions.get(id),
    staleTime: CACHE_CONFIG.TRANSACTIONS.staleTime,
    gcTime: CACHE_CONFIG.TRANSACTIONS.gcTime,
    enabled: !!id,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof api.transactions.create>[0]) =>
      api.transactions.create(input),
    onSuccess: (newTransaction) => {
      // Invalidate transactions list
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.TRANSACTIONS.key] });
      // Add to cache for immediate access
      saveToCache(CACHE_CONFIG.TRANSACTIONS.key, newTransaction);
    },
    onError: (error) => {
      console.error("Error creating transaction:", error);
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.transactions.update>[1] }) =>
      api.transactions.update(id, input),
    onSuccess: (updatedTransaction, { id }) => {
      // Update query cache
      queryClient.setQueryData([CACHE_CONFIG.TRANSACTIONS.key, id], updatedTransaction);
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.TRANSACTIONS.key] });
      saveToCache(CACHE_CONFIG.TRANSACTIONS.key, updatedTransaction);
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.transactions.delete(id),
    onSuccess: (_result, id) => {
      // Invalidate both single item and list
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.TRANSACTIONS.key, id] });
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.TRANSACTIONS.key] });
    },
  });
}

// Bets
export function useBets(filters?: ListFilters) {
  return useQuery({
    queryKey: [CACHE_CONFIG.BETS.key, filters],
    queryFn: async () => {
      try {
        const data = await api.bets.list(filters);
        saveToCache(CACHE_CONFIG.BETS.key, data);
        return data;
      } catch (error) {
        const cached = getFromCache<Bet[]>(CACHE_CONFIG.BETS.key);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: CACHE_CONFIG.BETS.staleTime,
    gcTime: CACHE_CONFIG.BETS.gcTime,
    retry: 2,
  });
}

export function useBet(id: string) {
  return useQuery({
    queryKey: [CACHE_CONFIG.BETS.key, id],
    queryFn: () => api.bets.get(id),
    staleTime: CACHE_CONFIG.BETS.staleTime,
    gcTime: CACHE_CONFIG.BETS.gcTime,
    enabled: !!id,
  });
}

export function useCreateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof api.bets.create>[0]) => api.bets.create(input),
    onSuccess: (newBet) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key] });
      saveToCache(CACHE_CONFIG.BETS.key, newBet);
    },
  });
}

export function useUpdateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.bets.update>[1] }) =>
      api.bets.update(id, input),
    onSuccess: (updatedBet, { id }) => {
      queryClient.setQueryData([CACHE_CONFIG.BETS.key, id], updatedBet);
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key] });
      saveToCache(CACHE_CONFIG.BETS.key, updatedBet);
    },
  });
}

export function useDeleteBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.bets.delete(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key, id] });
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key] });
    },
  });
}

// Venues
export function useVenues() {
  return useQuery({
    queryKey: [CACHE_CONFIG.VENUES.key],
    queryFn: async () => {
      try {
        const data = await api.venues.list();
        saveToCache(CACHE_CONFIG.VENUES.key, data);
        return data;
      } catch (error) {
        const cached = getFromCache<Venue[]>(CACHE_CONFIG.VENUES.key);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: CACHE_CONFIG.VENUES.staleTime,
    gcTime: CACHE_CONFIG.VENUES.gcTime,
    retry: 2,
  });
}

export function useCreateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof api.venues.create>[0]) => api.venues.create(input),
    onSuccess: (newVenue) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.VENUES.key] });
      saveToCache(CACHE_CONFIG.VENUES.key, newVenue);
    },
  });
}

export function useUpdateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.venues.update>[1] }) =>
      api.venues.update(id, input),
    onSuccess: (updatedVenue, { id }) => {
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.VENUES.key] });
      saveToCache(CACHE_CONFIG.VENUES.key, updatedVenue);
    },
  });
}

export function useDeleteVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.venues.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.VENUES.key] });
    },
  });
}

// Users
export function useUsers(params?: Parameters<typeof api.users.list>[0]) {
  return useQuery({
    queryKey: [CACHE_CONFIG.USERS.key, params],
    queryFn: () => api.users.list(params),
    staleTime: CACHE_CONFIG.USERS.staleTime,
    gcTime: CACHE_CONFIG.USERS.gcTime,
    retry: 1,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: [CACHE_CONFIG.USERS.key, id],
    queryFn: () => api.users.get(id),
    staleTime: CACHE_CONFIG.USERS.staleTime,
    gcTime: CACHE_CONFIG.USERS.gcTime,
    enabled: !!id,
  });
}

// Cache management utility
export function useClearCache() {
  const queryClient = useQueryClient();

  return {
    clearAll: () => queryClient.clear(),
    clearTransactions: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.TRANSACTIONS.key] }),
    clearBets: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.BETS.key] }),
    clearVenues: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.VENUES.key] }),
    clearUsers: () =>
      queryClient.invalidateQueries({ queryKey: [CACHE_CONFIG.USERS.key] }),
  };
}
