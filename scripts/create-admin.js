import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yjoowyjdtdpccrzolums.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlqb293eWpkdGRwY2Nyem9sdW1zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDk1MTU3MCwiZXhwIjoyMDc2NTI3NTcwfQ.cwDwu_3CoPomOwOeZUhGDWL5EVBrn-4OSNih0Gi1-H8";

const ADMIN_EMAIL = "pari@buymore.ml";
const ADMIN_PASSWORD = "Admin2024@Pari";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createAdmin() {
  console.log("Creating admin user...");
  console.log(`Email: ${ADMIN_EMAIL}`);

  try {
    // Create auth user
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true, // Auto-confirm email
      });

    if (authError) {
      console.error("Error creating auth user:", authError.message);
      process.exit(1);
    }

    console.log("✓ Auth user created:", authUser.user.id);

    // Create user record in users table
    const now = new Date().toISOString();
    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .insert({
        id: authUser.user.id,
        nom: "Admin",
        prenom: "",
        email: ADMIN_EMAIL,
        role: "ADMIN",
        statut: "actif",
        cree_le: now,
        mis_a_jour_le: now,
        mfa_active: false,
      })
      .select()
      .single();

    if (userError) {
      console.error("Error creating user record:", userError.message);
      // Optionally delete the auth user if the record creation fails
      await supabase.auth.admin.deleteUser(authUser.user.id);
      process.exit(1);
    }

    console.log("✓ User record created");
    console.log("\n✅ Admin user created successfully!");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Role: ADMIN`);
    console.log(`Status: actif`);
  } catch (error) {
    console.error("Unexpected error:", error);
    process.exit(1);
  }
}

createAdmin();
