export type CsvRow = Record<
  string,
  string | number | boolean | null | undefined
>;

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildCsv(rows: CsvRow[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols =
    columns ??
    Array.from(
      rows.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
  const header = cols.join(",");
  const body = rows
    .map((r) => cols.map((c) => escapeCell(r[c as keyof typeof r])).join(","))
    .join("\n");
  return header + "\n" + body;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
