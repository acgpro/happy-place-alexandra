import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "collaborateur";

/** Returns the signed-in user's whitelist role, or null if not whitelisted. RLS only exposes the user's own row. */
export async function fetchOwnRole(email: string): Promise<AppRole | null> {
  const { data: allowedUser, error: userError } = await supabase
    .from("allowed_users")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (userError) throw userError;
  if (!allowedUser) return null;

  const { data: roleRow, error: roleError } = await supabase
    .from("allowed_user_roles")
    .select("role")
    .eq("allowed_user_id", allowedUser.id)
    .maybeSingle();
  if (roleError) throw roleError;
  return (roleRow?.role as AppRole | undefined) ?? null;
}

/** Direction qui gère et publie les actualités (règle A+ appliquée par la base). */
export const NEWS_TEAM = "Direction RH - Communication Interne";

/**
 * Vrai si l'utilisateur connecté appartient à NEWS_TEAM : par sa direction (allowed_users.team)
 * ou par ses directions managées (manager_teams). Sert seulement à afficher ou masquer :
 * la base reste l'autorité.
 */
export async function fetchIsNewsMember(email: string): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await supabase
    .from("allowed_users")
    .select("team, manager_teams(team)")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  return data.team === NEWS_TEAM || data.manager_teams.some((m) => m.team === NEWS_TEAM);
}

/** Déconnexion depuis le tableau de bord : retour à la page de connexion par e-mail et mot de passe. */
export async function signOutToConnexion() {
  await supabase.auth.signOut();
  window.location.replace("/connexion");
}
