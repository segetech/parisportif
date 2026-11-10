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
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Nettoyage des timers au démontage
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Focus initial sur le bouton de copie ou confirmation
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!credentials) return null;

  const formattedText = `Identifiants de connexion Pari Sportif :
Utilisateur : ${credentials.nom || credentials.email}
Rôle : ${credentials.role || "Non spécifié"}
Email : ${credentials.email}
Mot de passe : ${credentials.password || "Non modifié"}

⚠️ Ce mot de passe est temporaire. Veuillez le modifier dès votre première connexion.`;

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedText);
        setCopied(true);
        toast.success("Identifiants copiés dans le presse-papiers");
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
      } else {
        throw new Error("Presse-papiers non disponible dans ce contexte");
      }
    } catch {
      // Fallback si l'API presse-papiers est bloquée par les permissions du navigateur
      setCopyFallback(true);
      setTimeout(() => {
        if (fallbackRef.current) {
          fallbackRef.current.focus();
          fallbackRef.current.select();
        }
      }, 100);
      toast.info("Sélectionnez le texte ci-dessous pour le copier manuellement.");
    }
  }

  function handleClose() {
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
        className="max-w-md w-full bg-slate-900 border border-slate-800 text-white shadow-2xl p-6 sm:rounded-xl"
      >
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-white">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-400 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-300">
              Adresse e-mail
            </Label>
            <Input
              readOnly
              value={credentials.email}
              className="bg-slate-950 border-slate-800 text-slate-100 font-mono text-sm select-all h-10"
            />
          </div>

          {/* Mot de passe */}
          {credentials.password && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-300">
                  Mot de passe généré
                </Label>
                <span className="text-[11px] text-amber-400 font-medium">
                  Usage temporaire
                </span>
              </div>
              <div className="relative">
                <Input
                  readOnly
                  type={showPassword ? "text" : "password"}
                  value={credentials.password}
                  className="bg-slate-950 border-slate-800 text-slate-100 font-mono text-sm select-all pr-10 h-10 tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white rounded transition-colors"
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
              <Label className="text-xs font-medium text-slate-300">
                Rôle attribué
              </Label>
              <Input
                readOnly
                value={credentials.role}
                className="bg-slate-950 border-slate-800 text-slate-100 text-sm h-10 uppercase tracking-wide"
              />
            </div>
          )}

          {/* Avertissement non-persistance en clair */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/70 flex items-start gap-2.5 text-xs text-slate-400">
            <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Par sécurité, ces identifiants ne sont stockés nulle part en clair. Si cette fenêtre est fermée sans qu'ils soient transmis, vous devrez réinitialiser le mot de passe.
            </span>
          </div>

          {/* Fallback de copie manuelle */}
          {copyFallback && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Sélectionnez et copiez manuellement (Ctrl+C / Cmd+C) :</span>
              </div>
              <textarea
                ref={fallbackRef}
                readOnly
                rows={4}
                value={formattedText}
                className="w-full bg-slate-950 border border-amber-500/40 text-slate-200 text-xs p-2 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-2 pt-2">
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="outline"
            onClick={handleClose}
            className="w-full sm:w-auto flex-1 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-sm font-medium"
          >
            J'ai bien noté les identifiants
          </Button>

          <Button
            type="button"
            onClick={handleCopy}
            className={`w-full sm:w-auto flex-1 min-h-[44px] text-sm font-semibold transition-all ${
              copied
                ? "bg-[#004D20] text-[#FFD000]"
                : "bg-[#006B2D] hover:bg-[#004D20] text-white"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 text-[#FFD000]" />
                Copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copier les identifiants
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
