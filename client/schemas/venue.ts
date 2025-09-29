import { z } from "zod";

// Form schema for creating/editing a Venue (excludes id/created fields)
export const venueFormSchema = z.object({
  quartier_no: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" ? undefined : (v as any))),
  quartier: z.string().min(1, { message: "Le champ Quartier est requis." }),
  operator: z.string().min(1, { message: "Veuillez sélectionner un opérateur." }),
  support: z.literal("Salle de jeux", {
    errorMap: () => ({ message: "Support doit être \"Salle de jeux\"." }),
  }),
  bet_type: z.string().min(1, { message: "Veuillez sélectionner un type de pari." }),
  address: z.string().min(1, { message: "L’adresse est requise." }),
  contact_phone: z.string().optional(),
  gps_lat: z
    .coerce
    .number({ invalid_type_error: "La latitude doit être un nombre." })
    .optional(),
  gps_lng: z
    .coerce
    .number({ invalid_type_error: "La longitude doit être un nombre." })
    .optional(),
  notes: z.string().optional(),
});

export type VenueFormValues = z.infer<typeof venueFormSchema>;
