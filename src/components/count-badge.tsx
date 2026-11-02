/** Nombre d'éléments en attente sur un bouton ; masqué à 0, annoncé par le nom accessible du bouton. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className="bg-tertiary-fixed text-on-tertiary-fixed px-xs font-label-sm text-label-sm">
      {count}
    </span>
  );
}
