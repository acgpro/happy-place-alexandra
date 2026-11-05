import type { ReactNode } from "react";

/**
 * Compteur d'en-tête de bloc (« 3 EN ATTENTE », « 0 TRAITÉES ») : même style pour tous les rôles,
 * affiché même à 0. Style de l'étiquette de statut (contour fin, sans fond coloré, angles droits,
 * sans ombre). Le texte visible est lu tel quel et annoncé quand il change (aria-live).
 * Le CountBadge rose reste réservé aux boutons et aux menus.
 */
export function BlockCounter({ children }: { children: ReactNode }) {
  return (
    <span
      aria-live="polite"
      className="shrink-0 border border-outline px-xs py-1 font-label-sm text-label-sm uppercase text-primary"
    >
      {children}
    </span>
  );
}

/**
 * Nombre d'éléments en attente sur un bouton ; masqué à 0 (sauf `showZero`, sous-menus « à traiter »),
 * annoncé par le nom accessible du bouton.
 */
export function CountBadge({ count, showZero = false }: { count: number; showZero?: boolean }) {
  if (count <= 0 && !showZero) return null;
  return (
    <span aria-hidden="true" className="bg-tertiary-fixed text-on-tertiary-fixed px-xs font-label-sm text-label-sm">
      {count}
    </span>
  );
}
