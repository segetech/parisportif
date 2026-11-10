import type { SupabaseClient } from "@supabase/supabase-js";

type DatabaseError = { code?: string; message?: string; details?: string | null };
type ImportTable = "transactions" | "bets" | "venues";

export function importDatabaseError(error: DatabaseError, resource: string): Error {
  const missingSchema = ["PGRST200", "PGRST202", "PGRST204", "PGRST205", "42703", "42P01", "42883"].includes(error.code || "");
  if (missingSchema) {
    return new Error(
      `Structure de base indisponible pour ${resource} (${error.code}). ` +
      "Les migrations 06 à 08 doivent être vérifiées sur ce projet Supabase, ainsi que le cache de schéma et les droits d'accès. " +
      "L'import ne peut pas continuer."
    );
  }
  return new Error(`${resource} : ${error.message || "Erreur de base de données"}${error.code ? ` (${error.code})` : ""}`);
}

/** Read-only probes: detect a missing release schema before writing any records. */
export async function verifyImportSchema(client: SupabaseClient, table: ImportTable): Promise<void> {
  const probes = [
    { table: "import_batches", columns: "id,file_name,sheet_name,entity_type,total_rows,imported_rows,rejected_rows,ignored_rows,status,anomalies,imported_by" },
    { table, columns: table === "venues" ? "id,import_batch_id,games" : "id,import_batch_id,proof_status,phone" },
    ...(table === "venues" ? [{ table: "venue_games", columns: "venue_id,game_name,active" }] : []),
  ];
  for (const probe of probes) {
    const { error } = await client.from(probe.table).select(probe.columns).limit(0);
    if (error) throw importDatabaseError(error, probe.table);
  }
}

export async function createImportBatch(client: SupabaseClient, payload: Record<string, unknown>): Promise<void> {
  const { error } = await client.from("import_batches").insert([payload]);
  // Supabase resolves SQL failures; catch alone does not detect these errors.
  if (error) throw importDatabaseError(error, "Création du lot d'import");
}
