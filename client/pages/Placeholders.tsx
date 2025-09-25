import AppLayout from "@/components/layout/AppLayout";
import Placeholder from "@/components/common/Placeholder";
import { RequireAuth, RequireRole } from "@/context/AuthContext";

export function BetsPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Paris" />
      </AppLayout>
    </RequireAuth>
  );
}
export function VenuesPage() {
  return (
    <RequireAuth>
      <AppLayout>
        <Placeholder title="Salles" />
      </AppLayout>
    </RequireAuth>
  );
}
export function LookupsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Référentiels" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function MatchingPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Matching" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function ExportsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Exports" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
export function SettingsPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN"]}>
        <AppLayout>
          <Placeholder title="Paramètres" />
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
