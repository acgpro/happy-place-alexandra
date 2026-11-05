import { useQuery } from "@tanstack/react-query";
import { fetchAllSubmissions, fetchBlockers, fetchNews, type Blocker, type Submission } from "@/lib/dashboard";
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
 * Points bloquants à suivre par statut (OUVERT, EN COURS, SURVEILLANCE) ; RÉSOLU n'est pas compté.
 * Source unique des badges du sous-menu, de l'onglet POINTS BLOQUANTS et de « GÉRER LES DONNÉES ».
 */
export function blockerCounts(list: Blocker[] | undefined) {
  const n = (status: Blocker["status"]) => (list ?? []).filter((b) => b.status === status).length;
  const ouverts = n("OUVERT");
  const enCours = n("EN COURS");
  const surveillance = n("SURVEILLANCE");
  return { ouverts, enCours, surveillance, total: ouverts + enCours + surveillance };
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
  // OUVERT + EN COURS + SURVEILLANCE (RÉSOLU exclu)
  const blockersCount = blockerCounts(blockers.data).total;

  // total : badge « GÉRER LES DONNÉES » (idées + points bloquants) ; les brouillons ont leur badge sur « GÉRER LES ACTUALITÉS »
  return { news: drafts.total, ideas, blockers: blockersCount, total: ideas + blockersCount };
}
