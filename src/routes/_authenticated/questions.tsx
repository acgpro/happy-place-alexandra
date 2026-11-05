import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BrandHeader } from "@/components/brand-header";
import { formatExactDate } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { MyViewBlock, MyViewsMenu } from "@/components/my-views";
import { ConfirmDelete } from "@/components/manage/crud-ui";
import { deleteQuestion, fetchMyQuestions, questionErrorMessage, type Question } from "@/lib/questions";

/** Vues : attente = sans réponse ; traitees = répondues. */
const VIEWS = ["attente", "traitees"] as const;
type View = (typeof VIEWS)[number];

const BLOCKS: Record<View, { title: string; counter: string; empty: string }> = {
  attente: {
    title: "Questions en attente",
    counter: "EN ATTENTE",
    empty: "Aucune question en attente.",
  },
  traitees: { title: "Questions traitées", counter: "TRAITÉES", empty: "Aucune question traitée." },
};

export const Route = createFileRoute("/_authenticated/questions")({
  head: () => ({
    meta: [
      { title: "Mes questions — Happy Place" },
      { name: "description", content: "Les questions que tu as posées aux directions et leurs réponses." },
    ],
  }),
  // vue optionnelle : les liens existants vers /questions (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: View } =>
    VIEWS.includes(search.vue as View) ? { vue: search.vue as View } : {},
  component: MyQuestions,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  collaborateur: "Collaborateur",
};

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="material-symbols-outlined">
      {name}
    </span>
  );
}

function MyQuestions() {
  const { email } = Route.useRouteContext();
  const vue: View = Route.useSearch().vue ?? "attente";
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<Question | null>(null);

  const list = useQuery({
    queryKey: ["questions", "mine", email],
    queryFn: () => fetchMyQuestions(email),
    retry: false,
  });

  const shown = (list.data ?? []).filter((q) => (q.status === "répondue") === (vue === "traitees"));

  const remove = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => {
      toast.success("Question supprimée");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e) => {
      toast.error(questionErrorMessage(e));
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-1">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Questions aux directions
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Mes questions</h1>
          </div>
          <Link
            to="/"
            className="px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            ← RETOUR À LA VUE D'ENSEMBLE
          </Link>
        </div>

        {list.isLoading && <p className="text-on-surface-variant">Chargement…</p>}
        {list.isError && (
          <p role="alert" className="text-error">
            Impossible de charger tes questions. Réessaie dans un instant.
          </p>
        )}
        {list.data && (
          <>
            {/* Aucun suivi de lecture des réponses aux questions : pas de badge sur « traitées ». */}
            <MyViewsMenu
              to="/questions"
              label="Mes questions"
              current={vue}
              tabs={[
                { vue: "attente", label: "QUESTIONS EN ATTENTE", name: "Questions en attente" },
                { vue: "traitees", label: "QUESTIONS TRAITÉES", name: "Questions traitées" },
              ]}
            />
            <MyViewBlock
              title={BLOCKS[vue].title}
              counter={`${shown.length} ${BLOCKS[vue].counter}`}
              empty={BLOCKS[vue].empty}
              isEmpty={shown.length === 0}
            >
              <ul className="space-y-sm">
                {shown.map((q) => (
                  <QuestionCard key={q.id} q={q} onDelete={() => setToDelete(q)} />
                ))}
              </ul>
            </MyViewBlock>
          </>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          label={`ta question à la direction ${toDelete.team}`}
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        />
      )}
    </div>
  );
}

function QuestionCard({ q, onDelete }: { q: Question; onDelete: () => void }) {
  const answered = q.status === "répondue";
  const firstName = (q.answered_by_name ?? "").trim().split(/\s+/)[0];
  return (
    <li className="border border-outline-variant bg-surface-container-lowest p-md space-y-xs">
      <div className="flex flex-wrap items-start justify-between gap-xs">
        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
          Direction : {q.team} · Posée le {formatExactDate(q.asked_at)}
        </p>
        <span className="flex items-center gap-1 font-label-sm text-label-sm uppercase text-primary">
          <Icon name={answered ? "check_circle" : "schedule"} />
          {answered ? "Répondue" : "En attente"}
        </span>
      </div>
      <p className="font-body-md text-on-surface whitespace-pre-line wrap-anywhere">
        <Linkify text={q.body} />
      </p>
      {answered ? (
        <div className="p-xs bg-surface-container text-on-surface text-body-sm wrap-anywhere">
          <p className="font-bold">
            Réponse de {firstName}, {ROLE_LABELS[q.answered_by_role ?? ""] ?? q.answered_by_role}, le{" "}
            {q.answered_at ? formatExactDate(q.answered_at) : ""}
          </p>
          <p className="whitespace-pre-line">
            <Linkify text={q.answer_body ?? ""} />
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-xs">
          <p className="text-on-surface-variant text-body-sm">Pas encore de réponse.</p>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-xs px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            <Icon name="delete" /> SUPPRIMER
          </button>
        </div>
      )}
    </li>
  );
}
