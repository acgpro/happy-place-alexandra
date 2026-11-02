import { useQuery } from "@tanstack/react-query";
import { fetchBlockers, fetchNews } from "@/lib/dashboard";
import { usePendingSubmissions } from "@/components/pending-submissions";

/**
 * Éléments en attente côté admin (badges « GÉRER LES ACTUALITÉS », « GÉRER LES DONNÉES » et onglets de /manage).
 * Réutilise les requêtes de l'accueil (mêmes clés, mêmes filtres) : aucune requête supplémentaire.
 * Indicateurs et utilisateurs autorisés n'ont pas d'état « en attente ».
 */
export function useAdminPendingCounts(email: string, enabled: boolean) {
  const news = useQuery({ queryKey: ["news"], queryFn: fetchNews, enabled, retry: false });
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, enabled, retry: false });
  const ideas = usePendingSubmissions(email, enabled).pending.length;

  // Même filtre que visibleDrafts (accueil)
  const newsCount = news.data?.filter((n) => n.status === "brouillon").length ?? 0;
  // OUVERT uniquement : ni EN COURS ni SURVEILLANCE
  const blockersCount = blockers.data?.filter((b) => b.status === "OUVERT").length ?? 0;

  // total : badge « GÉRER LES DONNÉES » (idées + points bloquants) ; les brouillons ont leur badge sur « GÉRER LES ACTUALITÉS »
  return { news: newsCount, ideas, blockers: blockersCount, total: ideas + blockersCount };
}
