import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AdminPasswordMode } from "@shared/admin-password";

export function AdminPasswordChoice({ mode, password, onModeChange, onPasswordChange, disabled = false }: {
  mode: AdminPasswordMode;
  password: string;
  onModeChange: (mode: AdminPasswordMode) => void;
  onPasswordChange: (password: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-semibold text-foreground">Choisir le mot de passe initial</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {([['manual', 'Saisir un mot de passe'], ['generate', 'Générer automatiquement']] as const).map(([value, label]) => (
          <label key={value} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === value ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-foreground'}`}>
            <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => onModeChange(value)} className="h-4 w-4 accent-primary" />
            {label}
          </label>
        ))}
      </div>
      {mode === "manual" ? (
        <div className="space-y-2">
          <label htmlFor={`${id}-password`} className="block text-sm font-medium">Mot de passe choisi</label>
          <div className="relative">
            <Input id={`${id}-password`} type={visible ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" spellCheck={false} minLength={8} value={password} onChange={(event) => onPasswordChange(event.target.value)} aria-describedby={`${id}-help`} className="h-11 bg-background pr-12 text-base" />
            <button type="button" disabled={disabled} aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={visible} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p id={`${id}-help`} className="text-xs text-muted-foreground">Au moins 8 caractères. Votre saisie sera appliquée exactement, sans remplacement automatique.</p>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">Un mot de passe de 14 caractères sera généré et affiché après confirmation. Votre saisie manuelle éventuelle ne sera pas utilisée.</p>
      )}
      <p className="text-xs text-muted-foreground">L’utilisateur devra le renouveler lors de sa prochaine connexion.</p>
    </fieldset>
  );
}
