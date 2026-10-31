import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BrandHeader } from "@/components/brand-header";
import { TeamQuestions } from "@/components/team-questions";

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
  // Page du manager ; l'admin consulte ces questions depuis son accueil.
  beforeLoad: ({ context }) => {
    if (context.role !== "manager") throw redirect({ to: "/" });
  },
  component: TeamQuestionsPage,
});

function TeamQuestionsPage() {
  const { email } = Route.useRouteContext();
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
        {email && <TeamQuestions role="manager" email={email} />}
      </main>
    </div>
  );
}
