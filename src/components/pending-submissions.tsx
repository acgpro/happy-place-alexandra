import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { proposeDraft } from "@/lib/draft.functions";
import { AttachmentLink } from "@/components/attachment-link";
import {
  CharCounter,
  SubmissionPreview,
  formatExactDate,
  rejectionErrorMessage,
} from "@/components/expandable-card";
import {
  ErrorSummary,
  Field,
  FormActions,
  Modal,
  TextArea,
  useFieldProps,
} from "@/components/manage/crud-ui";
import { SubmissionReader } from "@/components/submission-reader";
import { rejectionSchema, responseSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  fetchSubmissions,
  REJECTION_CATEGORIES,
  reviewSubmission,
  timeAgo,
  type ResponseVisibility,
  type Submission,
} from "@/lib/dashboard";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

/** Liste des motifs de refus, reliée à son libellé et à son message d'erreur. */
function RejectionCategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const field = useFieldProps();
  return (
    <select
      {...field}
      className="w-full border border-outline-variant bg-card p-xs text-body-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— Choisir un motif —</option>
      {REJECTION_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

/** File de validation : jamais ses propres idées. */
function pendingFor(list: Submission[] | undefined, myEmail: string) {
  return (list ?? []).filter(
    (s) => !myEmail || (s.submitted_by_email ?? "").toLowerCase() !== myEmail,
  );
}

/** Idées en attente visibles par ce valideur (même requête et même filtre que le bloc). */
export function usePendingSubmissions(email: string, enabled = true) {
  const myEmail = email.toLowerCase();
  const submissions = useQuery({
    queryKey: ["submissions"],
    queryFn: fetchSubmissions,
    enabled,
    retry: false,
  });
  return { submissions, pending: pendingFor(submissions.data, myEmail) };
}

/**
 * Bloc « Idées en attente » : accueil admin, page « Idées collaborateur » du manager.
 * Refus (motif + raison), validation (réponse, visibilité, brouillon IA) et lecture.
 */
export function PendingSubmissions({
  role,
  email,
  className = "",
}: {
  role: "manager" | "admin";
  email: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const myEmail = email.toLowerCase();
  const { submissions, pending: pendingForMe } = usePendingSubmissions(email);

  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [reading, setReading] = useState<Submission | null>(null);
  const [rejectForm, setRejectForm] = useState({ rejection_category: "", rejection_note: "" });
  const [rejectErrors, setRejectErrors] = useState<FieldErrors>({});
  const [validating, setValidating] = useState<Submission | null>(null);
  const [responseForm, setResponseForm] = useState<{
    body: string;
    visibility: ResponseVisibility;
  }>({
    body: "",
    visibility: "auteur",
  });
  const [responseErrors, setResponseErrors] = useState<FieldErrors>({});
  const [draftPending, setDraftPending] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const validatingId = useRef<string | null>(null);

  async function requestDraft(s: Submission) {
    setDraftPending(true);
    setDraftMessage("");
    let draft: string | null = null;
    try {
      const r = await proposeDraft({ data: { submissionId: s.id } });
      draft = r.ok ? r.draft : null;
    } catch {
      draft = null;
    }
    setDraftPending(false);
    if (validatingId.current !== s.id) return;
    if (draft) {
      setResponseForm((f) => (f.body.trim() ? f : { ...f, body: draft }));
      setDraftMessage("Brouillon proposé par l'IA : relis-le et modifie-le avant d'envoyer.");
    } else {
      setDraftMessage("Le brouillon n'a pas pu être généré. Rédige ta réponse toi-même.");
    }
  }

  // Admin : rôle des auteurs affichés, pour ne proposer que les idées de managers et d'admins.
  const authorEmails = [
    ...new Set(
      (submissions.data ?? [])
        .map((s) => (s.submitted_by_email ?? "").toLowerCase())
        .filter(Boolean),
    ),
  ].sort();
  const authorRoles = useQuery({
    queryKey: ["allowed_users", "roles", authorEmails],
    enabled: isAdmin && authorEmails.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allowed_users")
        .select("email, allowed_user_roles(role)")
        .in("email", authorEmails);
      if (error) throw error;
      return new Map(
        (data ?? []).map((u) => [
          u.email.toLowerCase(),
          u.allowed_user_roles?.role ?? "collaborateur",
        ]),
      );
    },
  });
  /** Boutons VALIDER / REFUSER : personne ne traite sa propre idée ; l'admin traite celles des managers et des admins. */
  function canActOn(s: Submission) {
    const author = (s.submitted_by_email ?? "").toLowerCase();
    if (!author || author === myEmail) return false;
    if (!isAdmin) return true;
    const authorRole = authorRoles.data?.get(author);
    return authorRole === "manager" || authorRole === "admin";
  }

  const review = useMutation({
    mutationFn: reviewSubmission,
    onSuccess: (_d, vars) => {
      if (vars.status === "refusée") {
        setRejecting(null);
        toast.success("Idée refusée");
      } else {
        setValidating(null);
        setReading((r) => (r?.id === vars.id ? null : r));
        toast.success("Idée validée");
        qc.invalidateQueries({ queryKey: ["responses"] });
      }
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (e: unknown) => toast.error(rejectionErrorMessage(e)),
  });

  function startReject(s: Submission) {
    setReading(null);
    setRejecting(s);
    setRejectErrors({});
    setRejectForm({ rejection_category: "", rejection_note: "" });
  }

  function startValidate(s: Submission) {
    setReading(null);
    setValidating(s);
    validatingId.current = s.id;
    setDraftMessage("");
    setDraftPending(false);
    setResponseErrors({});
    setResponseForm({ body: "", visibility: "auteur" });
  }

  return (
    <section
      className={`min-w-0 bg-surface-container-lowest border border-outline-variant p-md flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
        <h2 className="font-headline-sm text-headline-sm text-primary">Idées en attente</h2>
        <div className="bg-tertiary-fixed text-on-tertiary-fixed px-xs py-1 rounded-full font-label-sm text-label-sm">
          {pendingForMe.length} NOUVELLES
        </div>
      </div>
      <div className="space-y-sm flex-grow min-w-0">
        {submissions.isError && (
          <p className="text-body-sm text-error">Les idées sont indisponibles.</p>
        )}
        {submissions.data && pendingForMe.length === 0 && (
          <p className="text-body-sm text-on-surface-variant italic">Aucune idée en attente.</p>
        )}
        {pendingForMe.map((s) => (
          <div
            key={s.id}
            className="p-sm border border-outline-variant bg-card space-y-sm min-w-0 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-xs">
              <div className="flex items-center gap-sm min-w-0 flex-1">
                <div className="w-8 h-8 shrink-0 rounded-full bg-secondary-fixed flex items-center justify-center">
                  <Icon name="person" className="text-sm" />
                </div>
                <div className="min-w-0">
                  <p className="font-body-sm text-primary font-bold wrap-anywhere">{s.author_name}</p>
                  <p className="text-[10px] text-on-surface-variant font-label-sm wrap-anywhere">
                    {s.team} · {timeAgo(s.created_at)}
                  </p>
                </div>
              </div>
              {canActOn(s) && (
                <button
                  type="button"
                  onClick={() => startReject(s)}
                  className="shrink-0 box-border inline-flex h-[44px] min-w-[7.5rem] items-center justify-center whitespace-nowrap border px-md py-0 font-label-md text-label-md transition-colors border-outline text-primary hover:bg-surface-container"
                >
                  REFUSER
                </button>
              )}
            </div>
            <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
            <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
            {canActOn(s) && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => startValidate(s)}
                  className="box-border inline-flex h-[44px] min-w-[7.5rem] items-center justify-center whitespace-nowrap border px-md py-0 font-label-md text-label-md transition-colors border-primary bg-primary text-on-primary hover:opacity-90"
                >
                  VALIDER
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <SubmissionReader
        submission={reading}
        onClose={() => setReading(null)}
        onReject={
          reading && canActOn(reading) && reading.status === "en attente"
            ? () => startReject(reading)
            : undefined
        }
        onApprove={
          reading && canActOn(reading) && reading.status === "en attente"
            ? () => startValidate(reading)
            : undefined
        }
        approving={review.isPending}
      />
      {rejecting && (
        <Modal title="Refuser l'idée du collaborateur" onClose={() => setRejecting(null)}>
          <form
            noValidate
            className="space-y-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const res = validate(rejectionSchema, rejectForm);
              if (!res.ok) return setRejectErrors(res.errors);
              setRejectErrors({});
              review.mutate({ id: rejecting.id, status: "refusée", ...res.data });
            }}
          >
            <p className="max-h-48 overflow-y-auto border border-outline-variant bg-surface-container-low p-xs text-body-sm italic text-on-surface-variant whitespace-pre-line wrap-anywhere">
              “{rejecting.content}”
            </p>
            <ErrorSummary errors={rejectErrors} />
            <Field label="Motif du refus" error={rejectErrors.rejection_category}>
              <RejectionCategorySelect
                value={rejectForm.rejection_category}
                onChange={(v) => setRejectForm({ ...rejectForm, rejection_category: v })}
              />
            </Field>
            <Field label="Raison du refus (obligatoire)" error={rejectErrors.rejection_note}>
              <TextArea
                rows={4}
                value={rejectForm.rejection_note}
                placeholder="Explique au collaborateur pourquoi son idée est refusée…"
                onChange={(e) => setRejectForm({ ...rejectForm, rejection_note: e.target.value })}
              />
              <CharCounter value={rejectForm.rejection_note} max={500} />
            </Field>
            <FormActions pending={review.isPending} onCancel={() => setRejecting(null)} />
          </form>
        </Modal>
      )}
      {validating && (
        <Modal
          title="Valider l'idée de mon collaborateur"
          onClose={() => {
            validatingId.current = null;
            setValidating(null);
          }}
        >
          <form
            noValidate
            className="space-y-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const res = validate(responseSchema, responseForm);
              if (!res.ok) return setResponseErrors(res.errors);
              setResponseErrors({});
              review.mutate({ id: validating.id, status: "validée", response: res.data });
            }}
          >
            <p className="max-h-48 overflow-y-auto border border-outline-variant bg-surface-container-low p-xs text-body-sm italic text-on-surface-variant whitespace-pre-line wrap-anywhere">
              “{validating.content}”
            </p>
            <p className="text-[11px] font-label-sm text-on-surface-variant uppercase wrap-anywhere">
              <span className="text-primary font-bold">{validating.author_name}</span> •{" "}
              {validating.team} • Soumise le {formatExactDate(validating.created_at)}
            </p>
            <ErrorSummary errors={responseErrors} />
            <div className="flex flex-wrap items-center gap-xs">
              <button
                type="button"
                onClick={() => requestDraft(validating)}
                disabled={draftPending || !!responseForm.body.trim()}
                className="px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container disabled:opacity-50"
              >
                {draftPending ? "GÉNÉRATION…" : "PROPOSER UN BROUILLON"}
              </button>
              <span className="border border-outline px-xs font-label-sm text-label-sm text-on-surface-variant uppercase">
                IA, à relire
              </span>
            </div>
            <p role="status" className="font-body-sm text-body-sm text-on-surface-variant">
              {draftMessage}
            </p>
            <Field label="Réponse à l'auteur" error={responseErrors.body}>
              <TextArea
                rows={4}
                value={responseForm.body}
                placeholder="Explique au collaborateur la suite donnée à son idée…"
                onChange={(e) => setResponseForm({ ...responseForm, body: e.target.value })}
              />
              <CharCounter value={responseForm.body} max={500} />
            </Field>
            <fieldset className="space-y-xs">
              <legend className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
                Visibilité de la réponse
              </legend>
              {(
                [
                  { value: "auteur", label: "Visible par l'auteur seulement" },
                  { value: "entreprise", label: "Visible par toute l'entreprise" },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer gap-sm border p-sm ${
                    responseForm.visibility === o.value
                      ? "border-primary bg-surface-container"
                      : "border-outline-variant"
                  }`}
                >
                  <input
                    type="radio"
                    name="response-visibility"
                    value={o.value}
                    checked={responseForm.visibility === o.value}
                    onChange={() => setResponseForm({ ...responseForm, visibility: o.value })}
                    className="mt-1 accent-[var(--color-primary)]"
                  />
                  <span className="font-body-sm text-body-sm text-on-surface">{o.label}</span>
                </label>
              ))}
            </fieldset>
            <FormActions
              pending={review.isPending}
              disabled={!responseForm.body.trim()}
              submitLabel="VALIDER ET ENVOYER"
              onCancel={() => {
                validatingId.current = null;
                setValidating(null);
              }}
            />
          </form>
        </Modal>
      )}
    </section>
  );
}
