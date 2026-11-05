import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Emplacement d'action de « Gestion des données » : à droite de la ligne des onglets principaux.
 * L'onglet actif y place son bouton (ex. « + NOUVEAU POINT BLOQUANT ») tout en gardant son état et son formulaire.
 */
export const ManageActionSlot = createContext<HTMLElement | null>(null);

/** Affiche `children` dans l'emplacement d'action ; rien tant que l'emplacement n'est pas monté. */
export function ManageAction({ children }: { children: ReactNode }) {
  const slot = useContext(ManageActionSlot);
  return slot ? createPortal(children, slot) : null;
}
