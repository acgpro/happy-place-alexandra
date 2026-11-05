import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AttachmentLink } from "@/components/attachment-link";
import { BrandHeader } from "@/components/brand-header";
import { SubmissionPreview } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { ResponseBlock } from "@/components/submission-response";
import { SubmissionReader } from "@/components/submission-reader";
import { MyViewBlock, MyViewsMenu } from "@/components/my-views";
import { fetchMySubmissions, fetchResponses, timeAgo, type Submission } from "@/lib/dashboard";
import { answeredIdeaIds, markIdeasSeen, readSeenIdeas } from "@/lib/idees-lues";

/** Vues : attente = sans réponse ; validees / refusees = idées traitées selon leur statut. */
const VIEWS = ["attente", "validees", "refusees"] as const;
type View = (typeof VIEWS)[number];
const VIEW_STATUS: Record<View, Submission["status"]> = {
  attente: "en attente",
  validees: "validée",
  refusees: "refusée",
};

export const Route = createFileRoute("/_authenticated/idees")({
  head: () => ({
    meta: [
      { title: "Mes idées — Happy Place" },
      { name: "description", content: "Les idées que tu as soumises, leur statut et les réponses des managers." },
    ],
  }),
  // vue optionnelle : les liens existants vers /idees (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: View } =>
    VIEWS.includes(search.vue as View) ? { vue: search.vue as View } : {},
  component: MyIdeas,
});

const BLOCKS: Record<View, { title: string; counter: string; empty: string }> = {
  attente: { title: "Idées en attente", counter: "EN ATTENTE", empty: "Aucune idée en attente." },
  validees: { title: "Idées validées", counter: "VALIDÉES", empty: "Aucune idée validée." },
  refusees: { title: "Idées refusées", counter: "REFUSÉES", empty: "Aucune idée refusée." },
};

function MyIdeas() {
  const { email, user } = Route.useRouteContext();
  const vue: View = Route.useSearch().vue ?? "attente";
  const [reading, setReading] = useState<Submission | null>(null);
  // Idées déjà vues, lues une seule fois à l'ouverture : les pastilles restent stables pendant la visite.
  const [seenAtOpening] = useState(() => readSeenIdeas(user.id));

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
  const answeredIds = mine.data ? answeredIdeaIds(mine.data, myResponses.data) : [];
  const shown = (mine.data ?? []).filter((s) => s.status === VIEW_STATUS[vue]);
  // Réponses nouvelles par vue : mêmes règles que la pastille « Nouveau ».
  const unread = (status: Submission["status"]) =>
    (mine.data ?? []).filter(
      (s) => s.status === status && answeredIds.includes(s.id) && !seenAtOpening.has(s.id),
    ).length;
  // Réponses affichées (cumul des vues ouvertes) : enregistrées comme vues au démontage, jamais avant l'affichage.
  const displayedAnswers = useRef<Set<string>>(new Set());
  useEffect(() => {
    shown.forEach((s) => answeredIds.includes(s.id) && displayedAnswers.current.add(s.id));
  });
  useEffect(() => () => markIdeasSeen(user.id, [...displayedAnswers.current]), [user.id]);

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
        {mine.data && (
          <>
            <MyViewsMenu
              to="/idees"
              label="Mes idées"
              current={vue}
              tabs={[
                { vue: "attente", label: "IDÉES EN ATTENTE", name: "Idées en attente" },
                {
                  vue: "validees",
                  label: "IDÉES VALIDÉES",
                  name: "Idées validées",
                  unread: unread("validée"),
                },
                {
                  vue: "refusees",
                  label: "IDÉES REFUSÉES",
                  name: "Idées refusées",
                  unread: unread("refusée"),
                },
              ]}
            />
            <MyViewBlock
              title={BLOCKS[vue].title}
              counter={`${shown.length} ${BLOCKS[vue].counter}`}
              empty={BLOCKS[vue].empty}
              isEmpty={shown.length === 0}
            >
              <div className="space-y-xs">
                {shown.map((s) => (
                  <div
                    key={s.id}
                    className="p-sm border border-outline-variant bg-card min-w-0 overflow-hidden"
                  >
                    <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
                    <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
                    <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                      {answeredIds.includes(s.id) && !seenAtOpening.has(s.id) && (
                        <span className="bg-tertiary-fixed text-on-tertiary-fixed px-xs font-label-sm text-label-sm normal-case mr-xs">
                          Nouveau
                        </span>
                      )}
                      {s.status} • {s.team} • {timeAgo(s.created_at)}
                    </p>
                    {s.status === "en attente" && (
                      <p className="text-[11px] font-label-sm text-on-surface-variant mt-xs">
                        Pas encore de réponse
                      </p>
                    )}
                    {s.status === "validée" &&
                      (() => {
                        const response = myResponses.data?.find((r) => r.submission_id === s.id);
                        if (response)
                          return <ResponseBlock response={response} className="mt-xs" />;
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
            </MyViewBlock>
          </>
        )}
      </main>
      <SubmissionReader submission={reading} onClose={() => setReading(null)} />
    </div>
  );
}
