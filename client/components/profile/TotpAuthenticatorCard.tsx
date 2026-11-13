import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  Loader2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";

interface TotpFactorSummary {
  id: string;
  friendly_name?: string;
  status: string;
}

interface PendingTotpEnrollment {
  factorId: string;
  qrCodeSrc: string;
  secret: string;
}

function formatQrCodeSrc(rawQrCode: string): string {
  const trimmed = rawQrCode.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
}

interface TotpAuthenticatorCardProps {
  user: User;
  onMfaStatusChange: (active: boolean) => void;
}

export function TotpAuthenticatorCard({
  user,
  onMfaStatusChange,
}: TotpAuthenticatorCardProps) {
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [verifiedFactors, setVerifiedFactors] = useState<TotpFactorSummary[]>([]);
  const [pendingEnrollment, setPendingEnrollment] =
    useState<PendingTotpEnrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [needsAal2ToUnenroll, setNeedsAal2ToUnenroll] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadFactors = async () => {
    if (!supabase.auth?.mfa?.listFactors) {
      setLoadingFactors(false);
      return;
    }

    try {
      setLoadingFactors(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.warn("Erreur lecture facteurs MFA:", error.message);
        return;
      }

      const totpFactors = (data?.totp || []).filter(
        (f) => f.status === "verified",
      );
      setVerifiedFactors(totpFactors);

      const isActive = totpFactors.length > 0;
      if (Boolean(user.mfa_active) !== isActive) {
        onMfaStatusChange(isActive);
      }

      if (supabase.auth.mfa.getAuthenticatorAssuranceLevel) {
        const { data: aalData } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setNeedsAal2ToUnenroll(aalData?.currentLevel !== "aal2");
      }
    } finally {
      setLoadingFactors(false);
    }
  };

  useEffect(() => {
    void loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleStartEnrollment = async () => {
    if (!supabase.auth?.mfa?.enroll) {
      toast.error("La gestion TOTP n'est pas disponible sur ce client.");
      return;
    }

    try {
      setBusy(true);

      // Clean up any leftover unverified TOTP factors so enrollment never collides
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = (existing?.all || []).filter(
        (f) => f.factor_type === "totp" && f.status !== "verified",
      );
      for (const stale of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Google / Microsoft Authenticator",
        issuer: "OPEN",
      });

      if (error || !data?.totp) {
        throw new Error(
          error?.message || "Impossible de générer le QR code Authenticator.",
        );
      }

      setPendingEnrollment({
        factorId: data.id,
        qrCodeSrc: formatQrCodeSrc(data.totp.qr_code),
        secret: data.totp.secret,
      });
      setVerifyCode("");
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'initialisation Authenticator.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEnrollment) return;

    const cleanCode = verifyCode.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      toast.error("Veuillez saisir les 6 chiffres affichés dans votre application.");
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingEnrollment.factorId,
        code: cleanCode,
      });

      if (error) {
        throw new Error(
          error.message || "Code invalide ou expiré. Vérifiez l'heure de votre téléphone.",
        );
      }

      await supabase
        .from("users")
        .update({
          mfa_active: true,
          mis_a_jour_le: new Date().toISOString(),
        })
        .eq("id", user.id);

      setPendingEnrollment(null);
      setVerifyCode("");
      onMfaStatusChange(true);
      await loadFactors();
      toast.success(
        "Double authentification activée avec Google / Microsoft Authenticator.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Échec de vérification du code Authenticator.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (pendingEnrollment && supabase.auth?.mfa?.unenroll) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: pendingEnrollment.factorId });
      } catch {
        // Ignore cleanup failure
      }
    }
    setPendingEnrollment(null);
    setVerifyCode("");
  };

  const handleDisableFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetFactor = verifiedFactors[0];
    if (!targetFactor) return;

    try {
      setBusy(true);

      if (needsAal2ToUnenroll) {
        const cleanCode = disableCode.replace(/\D/g, "");
        if (cleanCode.length !== 6) {
          toast.error(
            "Saisissez le code à 6 chiffres de votre application pour confirmer la désactivation.",
          );
          return;
        }
        const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
          factorId: targetFactor.id,
          code: cleanCode,
        });
        if (verifyErr) {
          throw new Error(verifyErr.message || "Code Authenticator incorrect.");
        }
      }

      const { error: unenrollErr } = await supabase.auth.mfa.unenroll({
        factorId: targetFactor.id,
      });

      if (unenrollErr) {
        throw new Error(
          unenrollErr.message || "Impossible de désactiver la double authentification.",
        );
      }

      await supabase
        .from("users")
        .update({
          mfa_active: false,
          mis_a_jour_le: new Date().toISOString(),
        })
        .eq("id", user.id);

      setShowDisableConfirm(false);
      setDisableCode("");
      onMfaStatusChange(false);
      await loadFactors();
      toast.info("Double authentification désactivée sur votre compte.");
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de la désactivation.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopySecret = async () => {
    if (!pendingEnrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(pendingEnrollment.secret);
      toast.success("Clé secrète copiée dans le presse-papiers.");
    } catch {
      toast.info("Sélectionnez et copiez la clé manuellement.");
    }
  };

  const isEnabled = verifiedFactors.length > 0;

  return (
    <div className="rounded-2xl border border-[#D8E6DB] bg-white p-6 space-y-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D8E6DB]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-[#006B2D]/10 border border-[#006B2D]/20 text-[#006B2D] flex items-center justify-center shrink-0">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#17251C]">
              Double authentification (Google / Microsoft Authenticator)
            </h2>
            <p className="text-xs text-[#556B5C]">
              Protégez votre connexion avec un code temporaire à 6 chiffres (TOTP)
            </p>
          </div>
        </div>

        {loadingFactors ? (
          <Badge className="w-fit bg-[#F5F8F5] text-[#556B5C] border border-[#D8E6DB] text-xs px-2.5 py-1">
            Vérification…
          </Badge>
        ) : isEnabled ? (
          <Badge className="w-fit bg-[#006B2D] text-white border-0 text-xs px-2.5 py-1 gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Activée (A2F)</span>
          </Badge>
        ) : (
          <Badge className="w-fit bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-1 gap-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Non activée</span>
          </Badge>
        )}
      </div>

      {!loadingFactors && !isEnabled && !pendingEnrollment && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5]">
          <div className="space-y-1 text-xs">
            <p className="font-bold text-[#17251C]">
              Application d’authentification recommandée
            </p>
            <p className="text-[#556B5C] leading-relaxed">
              Compatible avec <strong>Google Authenticator</strong>,{" "}
              <strong>Microsoft Authenticator</strong> et toute application TOTP standard.
              Un code à 6 chiffres vous sera demandé à chaque connexion.
            </p>
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={handleStartEnrollment}
            className="min-h-11 shrink-0 bg-[#006B2D] hover:bg-[#004D20] text-white font-bold text-xs px-4 rounded-xl gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            <span>Activer Google / Microsoft Authenticator</span>
          </Button>
        </div>
      )}

      {pendingEnrollment && (
        <form
          onSubmit={handleConfirmEnrollment}
          className="space-y-4 p-4 rounded-xl border border-[#006B2D]/30 bg-[#F5F8F5]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white border border-[#D8E6DB] gap-2">
              <img
                src={pendingEnrollment.qrCodeSrc}
                alt="QR Code Authenticator"
                className="w-44 h-44 object-contain"
              />
              <span className="text-[11px] font-semibold text-[#556B5C] text-center">
                Scannez ce QR Code dans Google ou Microsoft Authenticator
              </span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#17251C]">
                  Étape 1 — Scannez ou saisissez la clé manuelle
                </p>
                <p className="text-[11px] text-[#556B5C]">
                  Si vous ne pouvez pas scanner le QR Code, saisissez cette clé secrète dans votre application :
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-[#D8E6DB] font-mono text-xs text-[#17251C] break-all">
                    {pendingEnrollment.secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopySecret}
                    className="min-h-11 border-[#D8E6DB] bg-white text-[#17251C] gap-1 shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copier</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mfa-enroll-code"
                  className="block text-xs font-bold text-[#17251C]"
                >
                  Étape 2 — Code de vérification à 6 chiffres *
                </label>
                <Input
                  id="mfa-enroll-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  disabled={busy}
                  className="h-11 bg-white border-[#D8E6DB] text-[#17251C] font-mono text-base tracking-widest text-center rounded-xl"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#D8E6DB]">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleCancelEnrollment}
              className="min-h-11 text-xs font-bold border-[#D8E6DB] bg-white text-[#17251C]"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={busy || verifyCode.length !== 6}
              className="min-h-11 text-xs font-bold bg-[#006B2D] hover:bg-[#004D20] text-white px-5 gap-2"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>Activer et vérifier</span>
            </Button>
          </div>
        </form>
      )}

      {!loadingFactors && isEnabled && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-[#D8E6DB] bg-[#F5F8F5]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#006B2D] shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-[#17251C]">
                  {verifiedFactors[0].friendly_name || "Application Authenticator"}
                </p>
                <p className="text-[#556B5C]">
                  Votre compte exige un code à 6 chiffres généré par votre application Authenticator à chaque connexion.
                </p>
              </div>
            </div>

            {!showDisableConfirm && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setShowDisableConfirm(true)}
                className="min-h-11 shrink-0 text-xs font-bold text-[#E52329] border-[#E52329]/30 bg-white hover:bg-red-50 hover:text-[#E52329] gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>Désactiver l’application Authenticator</span>
              </Button>
            )}
          </div>

          {showDisableConfirm && (
            <form
              onSubmit={handleDisableFactor}
              className="p-4 rounded-xl border border-red-200 bg-red-50 space-y-3"
            >
              <p className="text-xs font-bold text-[#E52329]">
                Confirmer la désactivation de la double authentification
              </p>
              {needsAal2ToUnenroll ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="mfa-disable-code"
                    className="block text-xs text-[#17251C]"
                  >
                    Saisissez le code à 6 chiffres affiché dans votre application Authenticator pour confirmer :
                  </label>
                  <Input
                    id="mfa-disable-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) =>
                      setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    disabled={busy}
                    className="max-w-xs h-11 bg-white border-[#D8E6DB] text-[#17251C] font-mono text-base tracking-widest text-center rounded-xl"
                  />
                </div>
              ) : (
                <p className="text-xs text-[#556B5C]">
                  Votre session actuelle est déjà vérifiée en double facteur. Cliquez sur « Confirmer la désactivation » pour retirer cette protection.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setShowDisableConfirm(false);
                    setDisableCode("");
                  }}
                  className="min-h-11 text-xs font-bold border-[#D8E6DB] bg-white text-[#17251C]"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={busy || (needsAal2ToUnenroll && disableCode.length !== 6)}
                  className="min-h-11 text-xs font-bold bg-[#E52329] hover:bg-red-700 text-white"
                >
                  {busy ? "Désactivation…" : "Confirmer la désactivation"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
