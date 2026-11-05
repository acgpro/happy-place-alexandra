import { useQuery } from "@tanstack/react-query";
import { fetchAllSubmissions, fetchBlockers, fetchNews, type Submission } from "@/lib/dashboard";
import { draftCounts } from "@/lib/news-views";

/** Toutes les idées (admin) : même requête et même clé que la page « Gestion des données > Idées ». */
export function useAllSubmissions(enabled = true) {
  return useQuery({ queryKey: ["submissions", "all"], queryFn: fetchAllSubmissions, enabled, retry: false });
}

/** Liste « Idées en attente » de l'admin : statut « en attente », toutes idées comprises. Source unique de la liste et des badges. */
export function pendingIdeas(list: Submission[] | undefined): Submission[] {
  return (list ?? []).filter((s) => s.status === "en attente");
}

/**
 * Éléments en attente côté admin (badges « GÉRER LES ACTUALITÉS » et son menu, « GÉRER LES DONNÉES » et onglets de /manage).
 * Réutilise les requêtes de l'accueil (mêmes clés, mêmes filtres) : aucune requête supplémentaire.
 * Indicateurs et utilisateurs autorisés n'ont pas d'état « en attente ».
 */
export function useAdminPendingCounts(email: string, enabled: boolean) {
  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, enabled, retry: false });
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, enabled, retry: false });
  // Décision A : même nombre que la liste « Idées en attente » (onglet IDÉES et « GÉRER LES DONNÉES »).
  const ideas = pendingIdeas(useAllSubmissions(enabled).data).length;

  // Mêmes filtres que le menu « Gérer les actualités » : mes brouillons + brouillons à valider
  const drafts = draftCounts(news.data, email.toLowerCase());
  // OUVERT uniquement : ni EN COURS ni SURVEILLANCE
  const blockersCount = blockers.data?.filter((b) => b.status === "OUVERT").length ?? 0;

  // total : badge « GÉRER LES DONNÉES » (idées + points bloquants) ; les brouillons ont leur badge sur « GÉRER LES ACTUALITÉS »
  return { news: drafts.total, ideas, blockers: blockersCount, total: ideas + blockersCount };
}
