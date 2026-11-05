import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BlockCounter, CountBadge } from "@/components/count-badge";
import { MenuBar, menuTabClass } from "@/components/sub-menu";

/**
 * Menu de vues et bloc de liste de « Mes idées » et « Mes questions », communs aux trois rôles.
 * Le filtrage est fait côté client sur la requête existante : aucun droit ni requête modifiés.
 */
export type MyViewTab<V extends string> = {
  vue: V;
  /** Libellé visible (majuscules). */
  label: string;
  /** Nom accessible de base, ex. « Idées validées ». */
  name: string;
  /** Réponses nouvelles (pastille « Nouveau ») ; absent = aucun badge. */
  unread?: number;
};

export function MyViewsMenu<V extends string>({
  to,
  label,
  current,
  tabs,
}: {
  to: "/idees" | "/questions";
  label: string;
  current: V;
  tabs: MyViewTab<V>[];
}) {
  return (
    <MenuBar label={label}>
      {tabs.map((t) => {
        const on = t.vue === current;
        const unread = t.unread ?? 0;
        return (
          <Link
            key={t.vue}
            to={to}
            search={{ vue: t.vue } as never}
            aria-current={on ? "page" : undefined}
            aria-label={
              unread > 0
                ? `${t.name}, ${unread} ${unread > 1 ? "réponses non lues" : "réponse non lue"}`
                : t.name
            }
            className={menuTabClass(on)}
          >
            {t.label}
            <CountBadge count={unread} />
          </Link>
        );
      })}
    </MenuBar>
  );
}

/** Bloc d'une vue : titre, compteur au style BlockCounter (affiché même à 0), état vide explicite. */
export function MyViewBlock({
  title,
  counter,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  counter: string;
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 bg-surface-container-lowest border border-outline-variant p-md flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
        <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
        <BlockCounter>{counter}</BlockCounter>
      </div>
      {isEmpty ? <p className="text-body-sm text-on-surface-variant italic">{empty}</p> : children}
    </section>
  );
}
