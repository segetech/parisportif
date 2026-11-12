import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "outputs/open-report/OPEN_rapport_demonstration_2026-11-08_2026-11-15.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
console.log((await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 3000 })).ndjson);
console.log((await workbook.inspect({ kind: "region", sheetId: "Synthèse", range: "A6:L9", maxChars: 2500 })).ndjson);
for (const [sheetName, filename, range] of [["Synthèse", "synthese", "A1:L65"], ["Alpha", "operateur-alpha", "A1:M62"]]) {
  const image = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`outputs/open-report/${filename}.png`, new Uint8Array(await image.arrayBuffer()));
}
console.log("Aperçus du véritable classeur générés.");
