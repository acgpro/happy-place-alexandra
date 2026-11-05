import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CharCounter, formatExactDate } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { BlockCounter } from "@/components/count-badge";
import { ErrorSummary, Field, FormActions, Modal, TextArea } from "@/components/manage/crud-ui";
import { validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  answerErrorMessage,
  answerQuestion,
  answerSchema,
  authorLabel,
  fetchManagersByTeam,
  fetchTeamQuestions,
  managersLabel,
  QUESTION_MAX,
  type Question,
} from "@/lib/questions";

const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", collaborateur: "Collaborateur" };

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="material-symbols-outlined">
      {name}
    </span>
  );
}

function ageLabel(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "EN ATTENTE DEPUIS AUJOURD'HUI";
  return `EN ATTENTE DEPUIS ${days} JOUR${days > 1 ? "S" : ""}`;
}

/** Questions des directions (même requête et même filtre que le bloc), partagées avec le badge de l'accueil. */
export function useTeamQuestions(email: string, enabled = true) {
  const list = useQuery({
    queryKey: ["questions", "team", email],
    queryFn: () => fetchTeamQuestions(email),
    enabled,
    retry: false,
  });
  // CA-F5-7 : une question répondue quitte la liste des autres managers ; celui qui a répondu la garde.
  const all = (list.data ?? []).filter(
    (q) => q.status === "en attente" || q.answered_by_email?.toLowerCase() === email.toLowerCase(),
  );
  const pending = all.filter((q) => q.status === "en attente");
  return { list, all, pending };
}

/**
 * F5 — page manager « Questions collaborateur » (écran 8, vue en attente ou traitées) et accueil admin
 * (« Questions en attente », écran 10, lecture seule, sans bouton de réponse).
 */
export function TeamQuestions({
  role,
  email,
  view = "attente",
}: {
  role: "manager" | "admin";
  email: string;
  /** Manager : « attente » = sans réponse ; « traitees » = répondues par ce manager (CA-F5-7). */
  view?: "attente" | "traitees";
}) {
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [answering, setAnswering] = useState<Question | null>(null);
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const { list, all, pending } = useTeamQuestions(email);

  const managers = useQuery({
    queryKey: ["questions", "managers-by-team"],
    queryFn: fetchManagersByTeam,
    enabled: isAdmin,
    retry: false,
  });

  const answer = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => answerQuestion(id, text),
    onSuccess: () => {
      setAnswering(null);
      toast.success("Réponse envoyée");
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: unknown) => {
      toast.error(answerErrorMessage(e));
      setAnswering(null);
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  function open(q: Question) {
    setErrors({});
    setBody("");
    setAnswering(q);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!answering) return;
    const r = validate(answerSchema, { body });
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    answer.mutate({ id: answering.id, text: r.data.body });
  }

  const treated = all.filter((q) => q.status === "répondue");
  const showTreated = !isAdmin && view === "traitees";
  const shown = showTreated ? treated : pending;
  const title = showTreated ? "Questions traitées" : "Questions en attente";
  // « En attente » = sans réponse (statut « en attente ») pour l'admin comme pour le manager.
  const counter = showTreated ? `${treated.length} TRAITÉES` : `${pending.length} EN ATTENTE`;
  const empty = isAdmin
    ? "Aucune question en attente"
    : showTreated
      ? "Aucune question traitée"
      : "Aucune question en attente pour tes directions";

  return (
    <section
      aria-labelledby="team-questions-title"
      className="col-span-12 min-w-0 bg-surface-container-lowest border border-outline-variant p-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-xs border-b border-outline-variant pb-sm mb-md">
        <h2 id="team-questions-title" className="font-headline-sm text-headline-sm text-primary">
          {title}
        </h2>
        <BlockCounter>{counter}</BlockCounter>
      </div>

      {list.isLoading && <p className="text-on-surface-variant">Chargement…</p>}
      {list.isError && (
        <p role="alert" className="text-body-sm text-error">
          Impossible de charger les questions. Réessaie dans un instant.
        </p>
      )}
      {list.isSuccess && shown.length === 0 && <p className="text-on-surface-variant">{empty}</p>}

      <ul className="space-y-xs">
        {shown.map((q) => {
          const answered = q.status === "répondue";
          const firstName = (q.answered_by_name ?? "").trim().split(/\s+/)[0];
          return (
            <li key={q.id} className="p-sm border border-outline-variant bg-card min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-xs">
                <div className="min-w-0 space-y-xs">
                  <p className="font-body-md font-bold text-on-surface whitespace-pre-line wrap-anywhere">
                    <Linkify text={q.body} />
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    Direction : {q.team}
                    {isAdmin && managers.data?.[q.team] ? ` · Manager : ${managersLabel(managers.data[q.team])}` : ""} ·{" "}
                    {authorLabel(q)} · Posée le {formatExactDate(q.asked_at)}
                  </p>
                </div>
                <span className="flex items-center gap-1 border border-outline px-xs py-1 font-label-sm text-label-sm uppercase text-primary">
                  <Icon name={answered ? "check_circle" : "schedule"} />
                  {answered ? "Répondue" : isAdmin ? ageLabel(q.asked_at) : "En attente"}
                </span>
              </div>
              {answered && (
                <div className="mt-xs p-xs bg-surface-container text-on-surface text-body-sm wrap-anywhere">
                  <p className="font-bold">
                    Réponse de {firstName}, {ROLE_LABELS[q.answered_by_role ?? ""] ?? q.answered_by_role}, le{" "}
                    {q.answered_at ? formatExactDate(q.answered_at) : ""}
                  </p>
                  <p className="whitespace-pre-line">
                    <Linkify text={q.answer_body ?? ""} />
                  </p>
                </div>
              )}
              {!answered && !isAdmin && (
                <div className="mt-xs flex justify-end">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => open(q)}
                    className="min-h-[44px] px-md py-xs border border-primary bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-all"
                  >
                    RÉPONDRE
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {answering && (
        <Modal title="Répondre à la question" onClose={() => setAnswering(null)}>
          <form onSubmit={send} className="space-y-sm" noValidate>
            <ErrorSummary errors={errors} />
            <div className="p-sm bg-surface-container border border-outline-variant space-y-xs">
              <p className="italic text-on-surface whitespace-pre-line wrap-anywhere">“{answering.body}”</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                Direction : {answering.team} · {authorLabel(answering)} · {formatExactDate(answering.asked_at)}
              </p>
            </div>
            <Field label="Ta réponse" error={errors.body}>
              <TextArea
                rows={5}
                value={body}
                placeholder="Écris ta réponse…"
                onChange={(e) => setBody(e.target.value)}
              />
              <CharCounter value={body} max={QUESTION_MAX} />
            </Field>
            <p className="text-body-sm text-on-surface-variant">
              L'auteur de la question lira ta réponse dans « Mes questions ». Aucune notification n'est envoyée.
            </p>
            <FormActions
              pending={answer.isPending}
              submitLabel="ENVOYER LA RÉPONSE"
              disabled={body.trim().length === 0 || body.trim().length > QUESTION_MAX}
              onCancel={() => setAnswering(null)}
            />
          </form>
        </Modal>
      )}
    </section>
  );
}
