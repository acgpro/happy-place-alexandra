import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/brand-header";
import { Button } from "@/components/ui/button";

// Connexion par e-mail et mot de passe (comptes de démonstration par rôle).
// Seule entrée de l'application : il n'existe plus d'entrée anonyme.
// Le rôle est lu ensuite par l'e-mail du compte (allowed_users, allowed_user_roles).

export const Route = createFileRoute("/connexion")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Connexion — Happy Place" }],
  }),
  component: ConnexionPage,
});

function ConnexionPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Renseignez votre adresse e-mail et votre mot de passe.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (err) {
      setBusy(false);
      setError("Adresse e-mail ou mot de passe incorrect.");
      return;
    }
    // Rechargement complet : le dashboard relit le rôle à l'ouverture.
    window.location.replace("/");
  }

  const inputCls =
    "mt-xs h-11 w-full border border-outline-variant bg-background px-sm font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
  const labelCls = "block font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="min-h-dvh w-full bg-background flex flex-col">
      <BrandHeader />
      <main className="flex flex-1 items-center justify-center px-md py-lg">
        <section className="w-[min(100%,28rem)] border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
          <div className="space-y-xs">
            <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Compte de démonstration</p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Connexion</h1>
          </div>

          {error && (
            <p className="mt-md border border-error bg-error-container p-sm font-body-sm text-on-error-container" role="alert">
              {error}
            </p>
          )}

          <form onSubmit={submit} className="mt-md space-y-md" noValidate>
            <label className={labelCls}>
              Adresse e-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                maxLength={200}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={200}
                className={inputCls}
              />
            </label>
            <Button type="submit" disabled={busy} className="h-12 w-full rounded-none font-label-md text-xs uppercase text-on-primary">
              {busy ? "PATIENTEZ…" : "SE CONNECTER"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
