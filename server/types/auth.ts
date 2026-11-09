export type UserRole = "ADMIN" | "CONTROLEUR" | "AGENT";
export type UserStatut = "actif" | "inactif" | "suspendu" | "invitation_envoyee";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  statut: UserStatut;
  nom?: string;
  prenom?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
