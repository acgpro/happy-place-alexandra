import type { News } from "@/lib/dashboard";

/** Vues du menu « Gérer les actualités » (admin) : mes = toutes mes actualités ; le reste filtre par statut et par auteur. */
export const NEWS_VIEWS = ["mes", "brouillons-mes", "brouillons-valider", "publiees-mes", "publiees-manager"] as const;
export type NewsView = (typeof NEWS_VIEWS)[number];

/** Actualité de l'admin connecté ou ancienne ligne sans auteur identifié (relève de l'administration). */
export function isMine(n: News, myEmail: string): boolean {
  return !n.author_email || n.author_email.toLowerCase() === myEmail;
}

/** Filtre une liste d'actualités selon la vue. Une actualité sans author_email (anciennes lignes) compte comme « à moi ». */
export function filterNews(all: News[], vue: NewsView, myEmail: string): News[] {
  const mine = (n: News) => isMine(n, myEmail);
  switch (vue) {
    case "mes":
      return all.filter(mine);
    case "brouillons-mes":
      return all.filter((n) => n.status === "brouillon" && mine(n));
    case "brouillons-valider":
      return all.filter((n) => n.status === "brouillon" && !mine(n));
    case "publiees-mes":
      return all.filter((n) => n.status === "publiée" && mine(n));
    case "publiees-manager":
      return all.filter((n) => n.status === "publiée" && !mine(n));
  }
}

/**
 * Badges admin des brouillons : « Mes brouillons » (personnels non publiés), « Brouillons à valider »
 * (brouillons de managers), et leur somme sur « Brouillons » et sur le bouton d'accueil.
 */
export function draftCounts(all: News[] | undefined, myEmail: string) {
  const list = all ?? [];
  const mine = filterNews(list, "brouillons-mes", myEmail).length;
  const toValidate = filterNews(list, "brouillons-valider", myEmail).length;
  return { mine, toValidate, total: mine + toValidate };
}
