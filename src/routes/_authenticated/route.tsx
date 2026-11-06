import { createFileRoute, isRedirect, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchOwnRole } from "@/lib/auth";

// Sans session, retour à la page de connexion par e-mail et mot de passe (/connexion).
// Un compte connecté sans rôle (par exemple une ancienne session anonyme) est déconnecté
// localement, puis renvoyé vers /connexion.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/connexion" });
      const email = data.user.email ?? "";
      const role = email ? await fetchOwnRole(email) : null;
      if (!role) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        throw redirect({ to: "/connexion" });
      }
      return { user: data.user, email, role };
    } catch (e) {
      if (isRedirect(e)) throw e;
      // Session périmée ou compte changé dans un autre onglet : retour propre à la connexion.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      throw redirect({ to: "/connexion" });
    }
  },
  component: () => <Outlet />,
});
