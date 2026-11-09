import fs from "fs";
import path from "path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;
const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const migrationFiles = [
  "01_schema_and_tables.sql",
  "02_security_functions.sql",
  "03_rls_policies.sql",
  "04_triggers_workflow.sql",
  "05_harmonize_and_harden.sql",
];

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!connectionString || connectionString.includes("[VOTRE_MOT_DE_PASSE") || connectionString.includes("YOUR-PASSWORD")) {
    console.error("Erreur : la chaîne de connexion dans .env contient encore un placeholder.");
    process.exit(1);
  }

  console.log("Connexion directe à la base de données PostgreSQL...");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connecté avec succès à la base PostgreSQL Supabase !");

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`Fichier ${file} introuvable, ignoré.`);
        continue;
      }
      console.log(`\n--- Exécution de ${file} ---`);
      const sql = fs.readFileSync(filePath, "utf8");
      await client.query(sql);
      console.log(`✓ ${file} appliqué avec succès.`);
    }

    console.log("\n==========================================");
    console.log("Toutes les migrations ont été appliquées avec succès !");
    console.log("==========================================");
  } catch (error) {
    console.error("Erreur lors de l'application des migrations :", error.message || error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
