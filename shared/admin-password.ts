export type AdminPasswordMode = "manual" | "generate";
export type AdminPasswordSource = "manual" | "generated";

export function validateAdminPassword(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "Saisissez un mot de passe ou choisissez la génération automatique.";
  if (value.length < 8) return "Le mot de passe doit comporter au moins 8 caractères. Votre saisie n'a pas été remplacée.";
  return null;
}

/** Shared contract: an explicit manual choice never falls back to generation. */
export function buildAdminPasswordRequest(passwordMode: AdminPasswordMode, password: string) {
  if (passwordMode === "manual") {
    const error = validateAdminPassword(password);
    if (error) throw new Error(error);
    return { passwordMode, password };
  }
  return { passwordMode };
}
