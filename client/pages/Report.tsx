import AppLayout from "@/components/layout/AppLayout";
import { OpenReportExport } from "@/components/reports/OpenReportExport";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import { FileSpreadsheet } from "lucide-react";

export default function ReportPage() {
  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR", "AGENT"]}>
        <AppLayout>
          <div className="space-y-6">
            <div className="border-b border-[#D8E6DB] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006B2D] text-white">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#17251C] sm:text-2xl">
                    Rapport d’activité mensuel
                  </h1>
                  <p className="text-xs text-[#556B5C] sm:text-sm">
                    Génération du classeur officiel OPEN avec synthèse, graphiques intégrés, tests, flux financiers et onglets par opérateur.
                  </p>
                </div>
              </div>
            </div>

            <OpenReportExport />
          </div>
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
