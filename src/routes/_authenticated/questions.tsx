import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BrandHeader } from "@/components/brand-header";
import { formatExactDate } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { ConfirmDelete } from "@/components/manage/crud-ui";
import { deleteQuestion, fetchMyQuestions, questionErrorMessage, type Question } from "@/lib/questions";

export const Route = createFileRoute("/_authenticated/questions")({
  head: () => ({
    meta: [
      { title: "Mes questions — Happy Place" },
      { name: "description", content: "Les questions que tu as posées aux directions et leurs réponses." },
    ],
  }),
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
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<Question | null>(null);

  const list = useQuery({
    queryKey: ["questions", "mine", email],
    queryFn: () => fetchMyQuestions(email),
    retry: false,
  });

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
        {list.data && list.data.length === 0 && (
          <div className="border border-outline-variant bg-surface-container-lowest p-md text-center space-y-xs">
            <p className="font-headline-md text-headline-md text-primary">Aucune question posée</p>
            <p className="text-on-surface-variant">
              Pose une question à une direction depuis la vue d'ensemble : elle apparaîtra ici avec sa réponse.
            </p>
          </div>
        )}
        {list.data && list.data.length > 0 && (
          <ul className="space-y-sm">
            {list.data.map((q) => (
              <QuestionCard key={q.id} q={q} onDelete={() => setToDelete(q)} />
            ))}
          </ul>
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
