import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BrandHeader } from "@/components/brand-header";
import { CountBadge } from "@/components/count-badge";
import {
  PendingSubmissions,
  TreatedSubmissions,
  usePendingSubmissions,
} from "@/components/pending-submissions";
import { MenuBar, menuTabClass, menuTabLabel } from "@/components/sub-menu";

/** Vues du menu : attente = idées auxquelles le manager doit répondre ; traitees = validées ou refusées. */
const IDEA_VIEWS = ["attente", "traitees"] as const;
type IdeaView = (typeof IDEA_VIEWS)[number];

export const Route = createFileRoute("/_authenticated/idees-collaborateur")({
  head: () => ({
    meta: [
      { title: "Idées collaborateur — Happy Place" },
      {
        name: "description",
        content: "Les idées des collaborateurs de tes directions, à valider ou à refuser.",
      },
    ],
  }),
  // vue optionnelle : les liens existants vers /idees-collaborateur (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: IdeaView } =>
    IDEA_VIEWS.includes(search.vue as IdeaView) ? { vue: search.vue as IdeaView } : {},
  // Page du manager ; l'admin traite ces idées depuis son accueil.
  beforeLoad: ({ context }) => {
    if (context.role !== "manager") throw redirect({ to: "/" });
  },
  component: TeamIdeas,
});

function TeamIdeas() {
  const { email } = Route.useRouteContext();
  const vue: IdeaView = Route.useSearch().vue ?? "attente";
  // Même requête et même filtre que le badge « IDÉES COLLABORATEUR » de l'accueil.
  const pending = usePendingSubmissions(email ?? "", !!email).pending.length;
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-1">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Idées de tes directions
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Idées collaborateur</h1>
          </div>
          <Link
            to="/"
            className="px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            ← RETOUR À LA VUE D'ENSEMBLE
          </Link>
        </div>
        <MenuBar label="Idées collaborateur">
          <IdeaMenuLink to="attente" current={vue} label="IDÉES EN ATTENTE" name="Idées en attente" count={pending} />
          <IdeaMenuLink to="traitees" current={vue} label="IDÉES TRAITÉES" />
        </MenuBar>
        {email && vue === "attente" && <PendingSubmissions role="manager" email={email} />}
        {email && vue === "traitees" && <TreatedSubmissions email={email} />}
      </main>
    </div>
  );
}

function IdeaMenuLink({
  to,
  current,
  label,
  name,
  count = 0,
}: {
  to: IdeaView;
  current: IdeaView;
  label: string;
  name?: string;
  count?: number;
}) {
  const on = current === to;
  return (
    <Link
      to="/idees-collaborateur"
      search={{ vue: to }}
      aria-current={on ? "page" : undefined}
      aria-label={name ? menuTabLabel(name, count, true) : undefined}
      className={menuTabClass(on)}
    >
      {label}
      <CountBadge count={count} showZero={!!name} />
    </Link>
  );
}
