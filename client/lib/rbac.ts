export const ALL_PERMISSIONS = [
  // Données
  "manage_transactions",
  "manage_bets",
  "manage_venues",
  // Contrôle qualité
  "validate_records",
  "delete_records",
  "restore_records",
  // Visibilité / exports
  "export_data",
  "view_audit",
  // Administration
  "manage_users",
  "manage_roles",
  "configure_system",
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_transactions: "Gérer les transactions",
  manage_bets: "Gérer les tests",
  manage_venues: "Gérer les salles",
  validate_records: "Valider/Rejeter les enregistrements",
  delete_records: "Mettre à la corbeille / Supprimer des enregistrements",
  restore_records: "Restaurer depuis la corbeille / archives",
  export_data: "Exporter des données",
  view_audit: "Voir le journal d’audit",
  manage_users: "Gérer les utilisateurs",
  manage_roles: "Gérer les rôles",
  configure_system: "Configurer le système",
};

/**
 * Vérifie si un utilisateur (notamment AGENT) a le droit de modifier un enregistrement existant
 * en fonction de son statut de validation et de la fenêtre d'édition configurée.
 */
export function canAgentEditRecord(
  role: string | undefined,
  validationStatus: string | undefined,
  createdAt?: string | null,
  editWindowMinutes?: number,
  editUnlockedUntil?: string | null,
): { allowed: boolean; reason?: string; unlockedUntil?: string } {
  const normalizedRole = (role || "").toUpperCase();
  if (normalizedRole !== "AGENT") {
    return { allowed: true };
  }

  if (validationStatus === "valide") {
    return {
      allowed: false,
      reason:
        "Ce dossier est déjà validé et ne peut plus être modifié par un agent.",
    };
  }

  // Un brouillon non soumis ou un dossier refusé peut être modifié librement par l'agent
  if (validationStatus === "brouillon" || validationStatus === "refuse") {
    return { allowed: true };
  }

  // Prolongation temporaire accordée par un contrôleur ou administrateur
  if (editUnlockedUntil) {
    const unlockMs = new Date(editUnlockedUntil).getTime();
    if (Number.isFinite(unlockMs) && unlockMs > Date.now()) {
      return { allowed: true, unlockedUntil: editUnlockedUntil };
    }
  }

  if (editWindowMinutes && editWindowMinutes > 0 && createdAt) {
    const createdMs = new Date(createdAt).getTime();
    if (Number.isFinite(createdMs)) {
      const elapsedMinutes = (Date.now() - createdMs) / 60_000;
      if (elapsedMinutes > editWindowMinutes) {
        return {
          allowed: false,
          reason: `Le délai de modification (${editWindowMinutes} min) est dépassé.`,
        };
      }
    }
  }

  return { allowed: true };
}
