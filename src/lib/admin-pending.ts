import { useQuery } from "@tanstack/react-query";
import { fetchBlockers, fetchNews } from "@/lib/dashboard";
import { useAdminActionableIdeas } from "@/components/pending-submissions";
import { draftCounts } from "@/lib/news-views";

/**
 * Éléments en attente côté admin (badges « GÉRER LES ACTUALITÉS » et son menu, « GÉRER LES DONNÉES » et onglets de /manage).
 * Réutilise les requêtes de l'accueil (mêmes clés, mêmes filtres) : aucune requête supplémentaire.
 * Indicateurs et utilisateurs autorisés n'ont pas d'état « en attente ».
 */
export function useAdminPendingCounts(email: string, enabled: boolean) {
  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, enabled, retry: false });
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, enabled, retry: false });
  // Idées que l'admin peut traiter (canActOn) : pas de badge pour une action impossible.
  const ideas = useAdminActionableIdeas(email, enabled).length;

  // Mêmes filtres que le menu « Gérer les actualités » : mes brouillons + brouillons à valider
  const drafts = draftCounts(news.data, email.toLowerCase());
  // OUVERT uniquement : ni EN COURS ni SURVEILLANCE
  const blockersCount = blockers.data?.filter((b) => b.status === "OUVERT").length ?? 0;

  // total : badge « GÉRER LES DONNÉES » (idées + points bloquants) ; les brouillons ont leur badge sur « GÉRER LES ACTUALITÉS »
  return { news: drafts.total, ideas, blockers: blockersCount, total: ideas + blockersCount };
}
