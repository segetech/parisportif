import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue");
      }

      setMessage({
        type: "success",
        text: "Un lien de réinitialisation a été envoyé à votre adresse email.",
      });
      setEmail("");
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Erreur lors de l'envoi du lien",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm"
      >
        <a
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la connexion
        </a>

        <h1 className="text-xl font-bold mb-2 text-center">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Entrez votre adresse email pour recevoir un lien de réinitialisation.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              disabled={loading}
            />
          </div>

          {message && (
            <div
              className={`text-sm p-3 rounded ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button className="w-full" disabled={loading}>
            {loading ? "Envoi en cours…" : "Envoyer le lien"}
          </Button>
        </div>
      </form>
    </div>
  );
}
