type ReferenceRecord = { reference?: string | null; notes?: string | null };

/** Prefer the database column, with fallback for records saved by the old form. */
export function readRecordReference(record: ReferenceRecord) {
  const notes = record.notes || "";
  const legacy = notes.match(/^Réf\s*:\s*([^|\r\n]+)(?:\s*\|\s*|$)/i);
  const reference = record.reference?.trim() || legacy?.[1]?.trim() || "";
  // Only remove an unambiguous legacy copy; preserve unrelated notes verbatim.
  const cleanedNotes =
    legacy && legacy[1].trim() === reference
      ? notes.slice(legacy[0].length)
      : notes;
  return { reference, notes: cleanedNotes };
}

export function writeRecordReference(reference: string, notes: string) {
  return { reference: reference.trim() || null, notes: notes || null };
}
