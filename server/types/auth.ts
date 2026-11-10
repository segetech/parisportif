export type UserRole = "ADMIN" | "CONTROLEUR" | "AGENT";
export type UserStatut = "actif" | "inactif" | "suspendu" | "invitation_envoyee" | "desactive";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  statut: UserStatut;
  nom?: string;
  prenom?: string;
  must_change_password?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
