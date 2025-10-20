import "./polyfills/resize-observer";
import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ProfilePage from "./pages/Profile";
import Transactions from "./pages/Transactions";
import { AuthProvider } from "./context/AuthContext";
import {
  LookupsPage,
  MatchingPage,
  ExportsPage,
  SettingsPage,
} from "./pages/Placeholders";
import BetsPage from "./pages/Bets";
import VenuesPage from "./pages/Venues";
import { SettingsProvider } from "@/lib/settings";
import AuditLogPage from "./pages/Audit";
import UsersPage from "./pages/Users";
import CacheSettingsPage from "./pages/CacheSettings";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { initializeApp } from "@/lib/init";

// Initialize app (clean up service workers and caches)
initializeApp().catch(console.error);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <SettingsProvider>
          <BrowserRouter>
            <SyncStatus />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/profil" element={<ProfilePage />} />
              <Route path="/" element={<Index />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/bets" element={<BetsPage />} />
              <Route path="/venues" element={<VenuesPage />} />
              <Route path="/lookups" element={<LookupsPage />} />
              <Route path="/matching" element={<MatchingPage />} />
              <Route path="/exports" element={<ExportsPage />} />
              <Route path="/utilisateurs" element={<UsersPage />} />
              <Route path="/parametres" element={<SettingsPage />} />
              <Route path="/cache" element={<CacheSettingsPage />} />
              <Route path="/journal" element={<AuditLogPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<App />);
