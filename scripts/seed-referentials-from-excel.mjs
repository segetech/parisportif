import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();

const QUARTIER_MAP = {
  "niamana": "Niamana",
  "yirimadio": "Yirimadio",
  "magnabougou": "Magnabougou",
  "faladie": "Faladié",
  "hamdalaye aci2000": "Hamdallaye ACI 2000",
  "missira1": "Missira 1",
  "banakabougou": "Banankabougou",
  "banankabougou": "Banankabougou",
  "missabougou": "Missabougou",
  "ganrantibougou": "Garantiguibougou",
  "badalabougou": "Badalabougou",
  "daoudabougou": "Daoudabougou",
  "kalaban coura": "Kalaban Coura",
  "niamakoro": "Niamakoro",
  "sabalibougou": "Sabalibougou",
  "baco djicoroni golf": "Baco Djicoroni Golf",
  "bacodjicoroni": "Baco Djicoroni",
  "sogoniko": "Sogoniko",
  "torokorobougou": "Torokorobougou",
  "hippodrome": "Hippodrome",
  "medina coura": "Médina Coura",
  "bolibana": "Bolibana",
  "n'tomikorobougou": "N'Tomikorobougou",
  "dravela": "Dravela",
  "hamdallaye": "Hamdallaye",
  "lafia": "Lafiabougou",
  "lafiabougou": "Lafiabougou",
  "djicoroni para": "Djicoroni Para",
  "sebenikoro": "Sébénikoro",
};

const GAME_MAP = {
  "keno boule": "Keno boule",
  "keno": "Keno",
  "keno color": "Keno color",
  "spin 2 win roulette": "Spin 2 Win (Roulette)",
  "spin 2 win": "Spin 2 Win (Roulette)",
  "spiwin": "Spin 2 Win (Roulette)",
  "roulette": "Roulette",
  "roulette live": "Roulette live",
  "course de chevaux": "Course hippique",
  "course de cheveaux": "Course hippique",
  "course de chien": "Course de lévriers",
  "boule 1a80": "Boule 1 à 80",
  "boule de 1 à 90": "Boule 1 à 90",
  "loto pmu": "Loto PMU",
};

function normalizeQuartier(q) {
  if (!q) return "";
  const key = q.trim().toLowerCase();
  return QUARTIER_MAP[key] || q.trim().charAt(0).toUpperCase() + q.trim().slice(1);
}

function normalizeGame(g) {
  if (!g) return "";
  const key = g.trim().toLowerCase();
  return GAME_MAP[key] || g.trim();
}

function normalizeLocation(loc) {
  if (!loc) return "";
  let s = loc.trim();
  s = s.replace(/tour\s*d['’]\s*afrique/gi, "La Tour d'Afrique");
  s = s.replace(/à\s*côte\s*du\s*mairie/gi, "À côté de la Mairie");
  s = s.replace(/ancienne\s*poste\s*de\s*11e(\s*arrondissement)?/gi, "Ancienne poste du 11e arrondissement");
  s = s.replace(/faladie\s*cimetière/gi, "Faladié Cimetière");
  s = s.replace(/place\s*can/gi, "Place CAN");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function main() {
  console.log("🌱 Début de la synchronisation dynamique des référentiels...");

  // 1. Les 4 Opérateurs Officiels
  const targetOperators = ["PremierBet", "Bet223", "1xBet", "MALIBET"];
  for (const name of targetOperators) {
    const existing = await prisma.operators.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      await prisma.operators.update({
        where: { id: existing.id },
        data: { name, active: true },
      });
      console.log(`  ✓ Opérateur synchronisé: ${name}`);
    } else {
      await prisma.operators.create({
        data: { name, active: true },
      });
      console.log(`  + Nouvel opérateur créé: ${name}`);
    }
  }

  // 2. Opérateurs de paiement
  const paymentOperators = ["Orange Money", "Moov Money", "Wave", "Espèces", "Carte bancaire", "Virement bancaire"];
  for (const name of paymentOperators) {
    const existing = await prisma.payment_operators.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (!existing) {
      await prisma.payment_operators.create({
        data: { name, active: true },
      });
      console.log(`  + Opérateur de paiement créé: ${name}`);
    }
  }

  // 3. Types de jeux normalisés
  const targetBetTypes = [
    "Keno boule",
    "Spin 2 Win (Roulette)",
    "Course hippique",
    "Course de lévriers",
    "Boule 1 à 80",
    "Boule 1 à 90",
    "Loto PMU",
    "Casino",
    "Paris sportifs (Live)",
    "Paris sportifs (Avant-match)",
    "Jeux virtuels",
    "Poker",
    "Simple",
    "Combiné",
    "Système",
  ];
  for (const name of targetBetTypes) {
    const existing = await prisma.bet_types.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (!existing) {
      await prisma.bet_types.create({
        data: { name, active: true },
      });
      console.log(`  + Type de pari créé: ${name}`);
    }
  }

  // 4. Lecture et extraction des Salles de jeux réelles depuis SALLE DE JEUX PAR QUARTIER.xlsx
  console.log("\n📦 Extraction et structuration des Salles de jeux physiques...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("fichier excel/SALLE DE JEUX PAR QUARTIER.xlsx");
  const ws = wb.worksheets[0];

  const venuesToUpsert = [];
  let currentVenue = null;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const num = row.getCell(1).text?.trim();
    const q = row.getCell(2).text?.trim();
    const op = row.getCell(3).text?.trim();
    const sup = row.getCell(4).text?.trim();
    const game = row.getCell(5).text?.trim();
    const loc = row.getCell(6).text?.trim();

    if (num) {
      if (currentVenue) venuesToUpsert.push(currentVenue);
      currentVenue = {
        quartier_no: num,
        quartier: normalizeQuartier(q),
        operator: op || "PremierBet",
        support: sup || "Salle de jeux",
        address: normalizeLocation(loc),
        games: game ? [normalizeGame(game)] : [],
      };
    } else if (currentVenue) {
      if (q && !currentVenue.quartier) currentVenue.quartier = normalizeQuartier(q);
      if (loc && !currentVenue.address) currentVenue.address = normalizeLocation(loc);
      if (op && !currentVenue.operator) currentVenue.operator = op;
      if (game) {
        const norm = normalizeGame(game);
        if (!currentVenue.games.includes(norm)) currentVenue.games.push(norm);
      }
    } else if (op || q || loc || game) {
      // Ligne autonome sans numéro de quartier
      venuesToUpsert.push({
        quartier_no: `A-${venuesToUpsert.length + 1}`,
        quartier: normalizeQuartier(q) || "Bamako Centre",
        operator: op || "1xBet",
        support: sup || "Salle de jeux",
        address: normalizeLocation(loc) || "Agence principale",
        games: game ? [normalizeGame(game)] : [],
      });
    }
  }
  if (currentVenue) venuesToUpsert.push(currentVenue);

  console.log(`🔍 Total salles physiques consolidées: ${venuesToUpsert.length}`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const v of venuesToUpsert) {
    const bet_type = v.games.length > 0 ? v.games.join(", ") : "Multi-jeux";
    const address = v.address || `Point de vente ${v.quartier}`;

    // Chercher si cette salle existe déjà pour cet opérateur et ce quartier
    const existing = await prisma.venue.findFirst({
      where: {
        operator: { equals: v.operator, mode: "insensitive" },
        quartier: { equals: v.quartier, mode: "insensitive" },
        quartier_no: v.quartier_no,
      },
    });

    if (existing) {
      await prisma.venue.update({
        where: { id: existing.id },
        data: {
          address,
          bet_type,
          support: v.support,
          validation_status: "valide",
        },
      });
      updatedCount++;
    } else {
      await prisma.venue.create({
        data: {
          quartier_no: v.quartier_no,
          quartier: v.quartier,
          operator: v.operator,
          support: v.support,
          bet_type,
          address,
          validation_status: "valide",
        },
      });
      insertedCount++;
    }
  }

  console.log(`\n✅ Référentiels Salles de jeux terminés:`);
  console.log(`   - Nouvelles salles insérées: ${insertedCount}`);
  console.log(`   - Salles mises à jour: ${updatedCount}`);
  console.log(`   - Total en base: ${await prisma.venue.count()}`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur de synchronisation:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
