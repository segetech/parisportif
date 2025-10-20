export const ALL_PERMISSIONS = [
  // Données
  "manage_transactions",
  "manage_bets",
  "manage_venues",
  // Contrôle qualité
  "validate_records",
  "delete_records",
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
  manage_bets: "Gérer les paris",
  manage_venues: "Gérer les salles",
  validate_records: "Valider/Rejeter les enregistrements",
  delete_records: "Supprimer des enregistrements",
  export_data: "Exporter des données",
  view_audit: "Voir le journal d’audit",
  manage_users: "Gérer les utilisateurs",
  manage_roles: "Gérer les rôles",
  configure_system: "Configurer le système",
};
