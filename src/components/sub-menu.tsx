import type { ReactNode } from "react";

/** Classes d'une entrée de menu à sous-menus (« Gérer les actualités », « Idées collaborateur », « Questions collaborateur »). */
export function menuTabClass(on: boolean, sub?: boolean): string {
  return `flex items-center gap-xs px-md py-xs border font-label-md text-label-md ${
    on
      ? "bg-primary text-on-primary border-primary"
      : "text-on-surface-variant border-outline-variant hover:bg-surface-container"
  } ${sub ? "text-label-sm" : ""}`;
}

/** Nom accessible d'une entrée portant un CountBadge (le badge est masqué aux lecteurs d'écran). */
export function menuTabLabel(name: string, count: number): string | undefined {
  return count > 0 ? `${name}, ${count} en attente` : undefined;
}

/** Barre de menu de premier niveau (même présentation que « Gérer les actualités »). */
export function MenuBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-xs border-b border-outline-variant pb-sm">
      {children}
    </nav>
  );
}

export function SubMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={`Sous-menu ${label}`} className="flex flex-wrap gap-xs pl-md border-l-2 border-primary">
      {children}
    </nav>
  );
}
