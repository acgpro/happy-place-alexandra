import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AttachmentLink } from "@/components/attachment-link";
import { BrandHeader } from "@/components/brand-header";
import { SubmissionPreview } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { ResponseBlock } from "@/components/submission-response";
import { SubmissionReader } from "@/components/submission-reader";
import { fetchMySubmissions, fetchResponses, timeAgo, type Submission } from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/idees")({
  head: () => ({
    meta: [
      { title: "Mes idées — Happy Place" },
      { name: "description", content: "Les idées que tu as soumises, leur statut et les réponses des managers." },
    ],
  }),
  component: MyIdeas,
});

function MyIdeas() {
  const { email } = Route.useRouteContext();
  const [reading, setReading] = useState<Submission | null>(null);

  const mine = useQuery({
    queryKey: ["submissions", "mine", email],
    queryFn: () => fetchMySubmissions(email),
    retry: false,
  });
  const myIds = mine.data?.map((s) => s.id) ?? [];
  const myResponses = useQuery({
    queryKey: ["responses", myIds],
    queryFn: () => fetchResponses(myIds),
    enabled: myIds.length > 0,
    retry: false,
  });

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-1">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Idées soumises
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Mes idées</h1>
          </div>
          <Link
            to="/"
            className="px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            ← RETOUR À LA VUE D'ENSEMBLE
          </Link>
        </div>

        {mine.isLoading && <p className="text-on-surface-variant">Chargement…</p>}
        {mine.isError && (
          <p role="alert" className="text-error">
            Impossible de charger tes idées. Réessaie dans un instant.
          </p>
        )}
        {mine.data && mine.data.length === 0 && (
          <div className="border border-outline-variant bg-surface-container-lowest p-md text-center space-y-xs">
            <p className="font-headline-md text-headline-md text-primary">Aucune idée soumise</p>
            <p className="text-on-surface-variant">
              Soumets une idée depuis la vue d'ensemble : elle apparaîtra ici avec la réponse du manager.
            </p>
          </div>
        )}
        {mine.data && mine.data.length > 0 && (
          <section className="bg-surface-container-lowest border border-outline-variant p-md" aria-label="Mes idées">
            <div className="space-y-xs">
              {mine.data.map((s) => (
                <div key={s.id} className="p-sm border border-outline-variant bg-card min-w-0 overflow-hidden">
                  <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
                  <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
                  <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                    {s.status} • {s.team} • {timeAgo(s.created_at)}
                  </p>
                  {s.status === "en attente" && (
                    <p className="text-[11px] font-label-sm text-on-surface-variant mt-xs">Pas encore de réponse</p>
                  )}
                  {s.status === "validée" &&
                    (() => {
                      const response = myResponses.data?.find((r) => r.submission_id === s.id);
                      if (response) return <ResponseBlock response={response} className="mt-xs" />;
                      return myResponses.isSuccess ? (
                        <p className="text-[11px] font-label-sm text-on-surface-variant mt-xs">
                          Aucune réponse enregistrée
                        </p>
                      ) : null;
                    })()}
                  {s.status === "refusée" && s.rejection_category && (
                    <div className="mt-xs p-xs bg-error-container text-on-error-container text-body-sm wrap-anywhere">
                      <p className="font-bold">Motif : {s.rejection_category}</p>
                      <p className="whitespace-pre-line">
                        Raison : <Linkify text={s.rejection_note ?? ""} />
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <SubmissionReader submission={reading} onClose={() => setReading(null)} />
    </div>
  );
}
