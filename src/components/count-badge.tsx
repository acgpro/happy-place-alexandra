import type { ReactNode } from "react";

/**
 * Compteur d'en-tête de bloc (« 3 EN ATTENTE », « 0 TRAITÉES ») : même style pour tous les rôles,
 * affiché même à 0, contour sans fond ni ombre, angles droits. Le texte visible est lu tel quel
 * et annoncé quand il change (role="status").
 */
export function BlockCounter({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      className="shrink-0 border border-outline px-xs py-1 font-label-sm text-label-sm uppercase text-primary"
    >
      {children}
    </span>
  );
}

/** Nombre d'éléments en attente sur un bouton ; masqué à 0, annoncé par le nom accessible du bouton. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className="bg-tertiary-fixed text-on-tertiary-fixed px-xs font-label-sm text-label-sm">
      {count}
    </span>
  );
}
