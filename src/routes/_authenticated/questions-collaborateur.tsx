import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BrandHeader } from "@/components/brand-header";
import { CountBadge } from "@/components/count-badge";
import { MenuBar, menuTabClass, menuTabLabel } from "@/components/sub-menu";
import { TeamQuestions, useTeamQuestions } from "@/components/team-questions";

/** Vues du menu : attente = questions sans réponse ; traitees = questions répondues (par ce manager, CA-F5-7). */
const QUESTION_VIEWS = ["attente", "traitees"] as const;
type QuestionView = (typeof QUESTION_VIEWS)[number];

export const Route = createFileRoute("/_authenticated/questions-collaborateur")({
  head: () => ({
    meta: [
      { title: "Questions collaborateur — Happy Place" },
      {
        name: "description",
        content: "Les questions posées à tes directions, à traiter par une réponse.",
      },
    ],
  }),
  // vue optionnelle : les liens existants vers /questions-collaborateur (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: QuestionView } =>
    QUESTION_VIEWS.includes(search.vue as QuestionView) ? { vue: search.vue as QuestionView } : {},
  // Page du manager ; l'admin consulte ces questions depuis son accueil.
  beforeLoad: ({ context }) => {
    if (context.role !== "manager") throw redirect({ to: "/" });
  },
  component: TeamQuestionsPage,
});

function TeamQuestionsPage() {
  const { email } = Route.useRouteContext();
  const vue: QuestionView = Route.useSearch().vue ?? "attente";
  // Même requête et même filtre que le badge « QUESTIONS COLLABORATEUR » de l'accueil.
  const pending = useTeamQuestions(email ?? "", !!email).pending.length;
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-1">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Questions à tes directions
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">
              Questions collaborateur
            </h1>
          </div>
          <Link
            to="/"
            className="px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            ← RETOUR À LA VUE D'ENSEMBLE
          </Link>
        </div>
        <MenuBar label="Questions collaborateur">
          <QuestionMenuLink
            to="attente"
            current={vue}
            label="QUESTIONS EN ATTENTE"
            name="Questions en attente"
            count={pending}
          />
          <QuestionMenuLink to="traitees" current={vue} label="QUESTIONS TRAITÉES" />
        </MenuBar>
        {email && <TeamQuestions role="manager" email={email} view={vue} />}
      </main>
    </div>
  );
}

function QuestionMenuLink({
  to,
  current,
  label,
  name,
  count = 0,
}: {
  to: QuestionView;
  current: QuestionView;
  label: string;
  name?: string;
  count?: number;
}) {
  const on = current === to;
  return (
    <Link
      to="/questions-collaborateur"
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
