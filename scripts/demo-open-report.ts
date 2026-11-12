import fs from "node:fs/promises";
import { buildOpenReport } from "../client/lib/open-report-workbook";
import { reportFixture } from "../client/lib/open-report-fixture";

const report = await buildOpenReport(reportFixture());
await fs.mkdir("outputs/open-report", { recursive: true });
await fs.writeFile("outputs/open-report/OPEN_rapport_demonstration_2026-11-08_2026-11-15.xlsx", report.bytes);
await fs.writeFile("outputs/open-report/verification.json", JSON.stringify({ engaged: report.summary.engaged, returned: report.summary.returned, deposits: report.summary.depositAmount, withdrawals: report.summary.withdrawalAmount, balance: report.summary.balance, operators: [...report.operators] }, null, 2));
console.log("Classeur de démonstration généré avec les fonctions de production, données fictives uniquement.");
