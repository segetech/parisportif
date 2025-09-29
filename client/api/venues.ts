import api, { Venue } from "@/data/api";

export type VenueFilters = {
  quartier?: string;
  operator?: string;
  bet_type?: string;
  q?: string; // free text search on quartier, address, notes, phone
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export async function listVenues(filters: VenueFilters = {}): Promise<Venue[]> {
  const rows = await api.venues.list();
  const q = filters.q ? normalize(filters.q) : "";
  return rows.filter((v) => {
    if (filters.quartier && normalize(v.quartier) !== normalize(filters.quartier)) {
      return false;
    }
    if (filters.operator && v.operator !== filters.operator) return false;
    if (filters.bet_type && v.bet_type !== filters.bet_type) return false;
    if (q) {
      const hay = [v.quartier, v.address, v.notes ?? "", v.contact_phone ?? ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function getVenue(id: string): Promise<Venue | null> {
  const rows = await api.venues.list();
  return rows.find((v) => v.id === id) ?? null;
}

export type CreateVenueInput = Omit<Venue, "id" | "created_at">;
export type UpdateVenueInput = Partial<Omit<Venue, "id" | "created_at" | "created_by">>;

export async function createVenue(data: CreateVenueInput): Promise<Venue> {
  return api.venues.create(data);
}

export async function updateVenue(id: string, data: UpdateVenueInput): Promise<Venue> {
  return api.venues.update(id, data);
}

export async function deleteVenue(id: string): Promise<void> {
  return api.venues.delete(id);
}
