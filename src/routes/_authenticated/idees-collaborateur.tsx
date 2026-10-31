import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BrandHeader } from "@/components/brand-header";
import { PendingSubmissions } from "@/components/pending-submissions";

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
  // Page du manager ; l'admin traite ces idées depuis son accueil.
  beforeLoad: ({ context }) => {
    if (context.role !== "manager") throw redirect({ to: "/" });
  },
  component: TeamIdeas,
});

function TeamIdeas() {
  const { email } = Route.useRouteContext();
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
        {email && <PendingSubmissions role="manager" email={email} />}
      </main>
    </div>
  );
}
