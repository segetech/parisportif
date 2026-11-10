import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;
const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const missingMigrations = [
  "06_unified_business_model.sql",
  "07_atomic_admin_and_password_policy.sql",
  "08_secure_dashboard_and_password_policy.sql",
];

async function main() {
  console.log("=== APPLICATION DES MIGRATIONS MANQUANTES SUR SUPABASE ===");
  
  // 1. Validation des fichiers de migration
  for (const file of missingMigrations) {
    const p = path.join(migrationsDir, file);
    if (!fs.existsSync(p)) {
      throw new Error(`Fichier de migration introuvable : ${file}`);
    }
  }

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Aucune chaîne de connexion DIRECT_URL ou DATABASE_URL configurée.");
  }

  console.log("Connexion à la base PostgreSQL Supabase...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connecté avec succès !");

  try {
    await client.query("BEGIN");
    
    // Verrou transactionnel exclusif pour empêcher tout chevauchement de migration concurrent
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pari_sportif_migration_lock'))");

    for (const file of missingMigrations) {
      console.log(`\n--- Application de ${file} ---`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      
      const startTime = Date.now();
      await client.query(sql);
      const duration = Date.now() - startTime;
      console.log(`✓ ${file} appliqué avec succès en ${duration}ms.`);
    }

    // Rechargement immédiat du cache de schéma PostgREST
    console.log("\n--- Rechargement du cache de schéma PostgREST ---");
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("✓ Signal 'reload schema' envoyé à PostgREST.");

    await client.query("COMMIT");
    console.log("\n=======================================================");
    console.log("Toutes les migrations manquantes ont été appliquées avec succès !");
    console.log("=======================================================");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
      console.log("Transaction annulée (ROLLBACK effectué).");
    } catch (rbErr) {
      console.error("Erreur rollback:", rbErr.message);
    }
    console.error("\nERREUR lors de l'application des migrations :", err.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
