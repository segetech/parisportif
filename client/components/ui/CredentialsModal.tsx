import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, Eye, EyeOff, ShieldCheck, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import type { AdminPasswordSource } from "@shared/admin-password";

export interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  credentials: {
    email: string;
    password?: string;
    role?: string;
    nom?: string;
    passwordSource?: AdminPasswordSource;
  } | null;
}

export function CredentialsModal({
  isOpen,
  onClose,
  title = "Identifiants de connexion",
  description = "Communiquez ces informations à l'utilisateur. Le mot de passe temporaire doit être renouvelé dès sa première connexion.",
  credentials,
}: CredentialsModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const copyGeneration = useRef(0);

  // Nettoyage des timers au démontage
  useEffect(() => {
    return () => {
      copyGeneration.current++;
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    copyGeneration.current++;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setShowPassword(false);
    setCopied(false);
    setCopyFallback(false);
    setIsCopying(false);
  }, [isOpen, credentials]);

  useEffect(() => {
    if (copyFallback) {
      fallbackRef.current?.focus();
      fallbackRef.current?.select();
    }
  }, [copyFallback]);

  if (!credentials) return null;

  const formattedText = `Identifiants de connexion Test :
Utilisateur : ${credentials.nom || credentials.email}
Rôle : ${credentials.role || "Non spécifié"}
Email : ${credentials.email}
Mot de passe : ${credentials.password || "Non modifié"}

Ce mot de passe initial doit être renouvelé lors de votre prochaine connexion.`;

  async function handleCopy() {
    if (isCopying) return;
    const generation = copyGeneration.current;
    setIsCopying(true);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedText);
        if (generation !== copyGeneration.current) return;
        setCopied(true);
        toast.success("Identifiants copiés dans le presse-papiers");
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
      } else {
        throw new Error("Presse-papiers non disponible dans ce contexte");
      }
    } catch {
      if (generation !== copyGeneration.current) return;
      // Fallback si l'API presse-papiers est bloquée par les permissions du navigateur
      setCopyFallback(true);
      toast.info("Sélectionnez le texte ci-dessous pour le copier manuellement.");
    } finally {
      if (generation === copyGeneration.current) setIsCopying(false);
    }
  }

  function handleClose() {
    copyGeneration.current++;
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    setShowPassword(false);
    setCopied(false);
    setCopyFallback(false);
    onClose();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        // RÈGLE ABSOLUE : Seul le bouton explicite "J'ai bien noté les identifiants" peut fermer la fenêtre
      }}
    >
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(event) => { event.preventDefault(); confirmButtonRef.current?.focus(); }}
        className="max-w-lg w-[calc(100%_-_2rem)] max-h-[calc(100dvh_-_2rem)] overflow-y-auto border-border bg-card p-5 text-card-foreground shadow-none sm:rounded-xl sm:p-6"
      >
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="credentials-email" className="text-sm font-medium text-foreground">
              Adresse e-mail
            </Label>
            <Input
              readOnly
              id="credentials-email"
              value={credentials.email}
              className="h-11 min-w-0 border-input bg-background font-mono text-base text-foreground sm:text-sm"
            />
          </div>

          {/* Mot de passe */}
          {credentials.password && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="credentials-password" className="text-sm font-medium text-foreground">
                  {credentials.passwordSource === "manual" ? "Mot de passe choisi" : credentials.passwordSource === "generated" ? "Mot de passe généré" : "Mot de passe enregistré"}
                </Label>
                <span className="rounded bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                  À renouveler
                </span>
              </div>
              <div className="relative">
                <Input
                  readOnly
                  id="credentials-password"
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  className="h-11 min-w-0 border-input bg-background pr-12 font-mono text-base text-foreground sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Rôle */}
          {credentials.role && (
            <div className="space-y-1.5">
              <Label htmlFor="credentials-role" className="text-sm font-medium text-foreground">
                Rôle attribué
              </Label>
              <Input
                readOnly
                id="credentials-role"
                value={credentials.role}
                className="h-11 border-input bg-background text-sm uppercase tracking-wide text-foreground"
              />
            </div>
          )}

          {/* Avertissement non-persistance en clair */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Ce mot de passe ne sera plus consultable dans l’application après confirmation. Transmettez-le de manière confidentielle ; en cas de perte, réinitialisez-le.
            </span>
          </div>

          {/* Fallback de copie manuelle */}
          {copyFallback && (
            <div className="space-y-1.5">
              <div role="status" className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Sélectionnez et copiez manuellement (Ctrl+C / Cmd+C) :</span>
              </div>
              <textarea
                ref={fallbackRef}
                readOnly
                rows={4}
                value={formattedText}
                aria-label="Identifiants à copier manuellement"
                className="w-full rounded-lg border border-input bg-background p-3 font-mono text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-border pt-4 sm:flex-row">
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="outline"
            onClick={handleClose}
            className="h-auto min-h-[44px] w-full flex-1 whitespace-normal border-border bg-card px-3 py-3 text-sm font-medium text-foreground hover:bg-secondary sm:w-auto"
          >
            J'ai bien noté les identifiants
          </Button>

          <Button
            type="button"
            onClick={handleCopy}
            disabled={isCopying}
            className="h-auto min-h-[44px] w-full flex-1 whitespace-normal px-3 py-3 text-sm font-semibold sm:w-auto"
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                {isCopying ? "Copie en cours…" : "Copier les identifiants"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
