import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  OpenReportExport,
  type OpenReportSelection,
} from "@/components/reports/OpenReportExport";
import { WeeklyReportSection } from "@/components/reports/WeeklyReportSection";
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel";
import { RequireAuth, RequireRole } from "@/context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, CalendarRange, FileSpreadsheet, Sparkles } from "lucide-react";

export default function ReportPage() {
  const [selection, setSelection] = useState<OpenReportSelection | null>(null);

  return (
    <RequireAuth>
      <RequireRole allow={["ADMIN", "CONTROLEUR", "AGENT"]}>
        <AppLayout>
          <div className="space-y-6">
            <div className="border-b border-[#D8E6DB] pb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#006B2D] text-white shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#17251C] sm:text-2xl">
                    Rapports d’activité officiels OPEN
                  </h1>
                  <p className="text-xs text-[#556B5C] sm:text-sm">
                    Un seul panneau de filtres pour exporter (Excel, PDF, CSV) et prévisualiser les matrices et graphiques en temps réel.
                  </p>
                </div>
              </div>

              {selection && (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5] px-3 py-2 text-xs text-[#17251C]">
                  <CalendarRange className="h-4 w-4 text-[#006B2D] shrink-0" />
                  <span className="font-semibold">{selection.label}</span>
                  <span className="text-[#556B5C]">•</span>
                  <span className="font-medium text-[#006B2D]">
                    {selection.selectedOperators.length > 0
                      ? `${selection.selectedOperators.length} opérateur(s)`
                      : "Tous les opérateurs"}
                  </span>
                </div>
              )}
            </div>

            <OpenReportExport onSelectionChange={setSelection} />

            <Tabs defaultValue="matrices" className="space-y-4">
              <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl bg-[#EEF4EF] p-1 border border-[#D8E6DB]">
                <TabsTrigger
                  value="matrices"
                  className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D] data-[state=active]:shadow-xs gap-1.5"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Matrices &amp; Graphes</span>
                </TabsTrigger>
                <TabsTrigger
                  value="assistant"
                  className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#006B2D] data-[state=active]:shadow-xs gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Assistant IA</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="matrices" className="mt-0">
                <WeeklyReportSection
                  externalStartDate={selection?.start}
                  externalEndDate={selection?.end}
                  externalOperators={selection?.selectedOperators}
                  hidePeriodControls
                />
              </TabsContent>

              <TabsContent value="assistant" className="mt-0">
                <AiAssistantPanel />
              </TabsContent>
            </Tabs>
          </div>
        </AppLayout>
      </RequireRole>
    </RequireAuth>
  );
}
