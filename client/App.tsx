import "./polyfills/resize-observer";
import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProfilePage from "./pages/Profile";
import Transactions from "./pages/Transactions";
import { AuthProvider } from "./context/AuthContext";
import MatchingPage from "./pages/Matching";
import {
  ExportsPage,
  SettingsPage,
} from "./pages/Placeholders";
import LookupsPage from "./pages/LookupsNew";
import TestsPage from "./pages/Tests";
import { LegacyTestsRoute } from "./components/common/LegacyTestsRoute";
import VenuesPage from "./pages/Venues";
import { SettingsProvider } from "@/lib/settings";
import AuditLogPage from "./pages/Audit";
import UsersManagementPage from "./pages/UsersManagement";
import ValidationPage from "./pages/ValidationNew";
import CacheSettingsPage from "./pages/CacheSettings";
import IllegalActivitiesPage from "./pages/IllegalActivities";
import ExcelImportPage from "./pages/ExcelImport";
import ReportPage from "./pages/Report";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { initializeApp } from "@/lib/init";

// Initialize app (clean up service workers and caches)
initializeApp().catch(console.error);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <SettingsProvider>
              <SyncStatus />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/profil" element={<ProfilePage />} />
                <Route path="/" element={<Index />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/depot-retrait" element={<Transactions />} />
                <Route path="/tests" element={<TestsPage />} />
                <Route path="/bets" element={<LegacyTestsRoute />} />
                <Route path="/venues" element={<VenuesPage />} />
                <Route path="/lookups" element={<LookupsPage />} />
                <Route path="/matching" element={<MatchingPage />} />
                <Route path="/exports" element={<ExportsPage />} />
                <Route path="/users-management" element={<UsersManagementPage />} />
                <Route path="/validation" element={<ValidationPage />} />
                <Route path="/parametres" element={<SettingsPage />} />
                <Route path="/cache" element={<CacheSettingsPage />} />
                <Route path="/journal" element={<AuditLogPage />} />
                <Route path="/illegal" element={<IllegalActivitiesPage />} />
                <Route path="/import-excel" element={<ExcelImportPage />} />
                <Route path="/rapport" element={<ReportPage />} />
                <Route path="/rapports" element={<ReportPage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </SettingsProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(<App />);
