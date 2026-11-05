import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ConfirmDelete,
  ErrorSummary,
  Field,
  FormActions,
  Modal,
  RowActions,
  TextArea,
  TextInput,
} from "@/components/manage/crud-ui";
import { AttachmentLink } from "@/components/attachment-link";
import { CharCounter, rejectionErrorMessage } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { SubmissionReader } from "@/components/submission-reader";
import { SubmissionHistory } from "@/components/manage/submission-history";
import { CountBadge } from "@/components/count-badge";
import { useAdminActionableIdeas } from "@/components/pending-submissions";
import { MenuBar, menuTabClass, menuTabLabel } from "@/components/sub-menu";
import { submissionSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  createSubmission,
  deleteSubmission,
  fetchAllSubmissions,
  fetchMyFullName,
  timeAgo,
  type Submission,
  type SubmissionInput,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/manage/submissions")({
  head: () => ({
    meta: [
      { title: "Gestion des idées — Happy Place" },
      { name: "description", content: "Gestion des idées : crée, lis et supprime les idées dans Happy Place." },
      { property: "og:title", content: "Gestion des idées — Happy Place" },
      { property: "og:description", content: "Gestion des idées des pôles du cabinet dans Happy Place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // vue optionnelle : les liens existants vers /manage/submissions (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: IdeaView } =>
    IDEA_VIEWS.includes(search.vue as IdeaView) ? { vue: search.vue as IdeaView } : {},
  component: ManageSubmissions,
});

/** Vues du menu : attente = statut « en attente » ; traitees = validées ou refusées. */
const IDEA_VIEWS = ["attente", "traitees"] as const;
type IdeaView = (typeof IDEA_VIEWS)[number];

const submissionStatusLabels: Record<string, string> = {
  "en attente": "En attente",
  validée: "Validée",
  refusée: "Refusée",
};

// Création réservée à l'admin : la base impose l'équipe « Admin » et le statut « en attente ».
const empty: SubmissionInput = { author_name: "", team: "Admin", content: "", status: "en attente" };

function ManageSubmissions() {
  const qc = useQueryClient();
  const { email } = Route.useRouteContext();
  const vue: IdeaView = Route.useSearch().vue ?? "attente";
  // Même compteur que le badge de l'onglet « IDÉES » : idées que l'admin peut traiter.
  const actionable = useAdminActionableIdeas(email ?? "", !!email).length;
  const myName = useQuery({
    queryKey: ["allowed_users", "me", email],
    queryFn: () => fetchMyFullName(email ?? ""),
    enabled: !!email,
    retry: false,
  });
  // Nom lu dans la base : le champ est alors en lecture seule.
  const myFullName = myName.data ?? null;
  const [form, setForm] = useState<SubmissionInput | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toDelete, setToDelete] = useState<Submission | null>(null);

  const list = useQuery({
    queryKey: ["submissions", "all"],
    queryFn: fetchAllSubmissions,
    retry: false,
  });
  // Même requête qu'avant, filtrée côté client selon la vue.
  const shown = (list.data ?? []).filter((s) =>
    vue === "attente" ? s.status === "en attente" : s.status !== "en attente",
  );
  const [reading, setReading] = useState<Submission | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["submissions"] });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const save = useMutation({
    mutationFn: (input: SubmissionInput) => createSubmission(input),
    onSuccess: () => {
      toast.success("Idée créée");
      close();
      invalidate();
    },
    onError: (e: unknown) => toast.error(rejectionErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSubmission(id),
    onSuccess: () => {
      toast.success("Idée supprimée");
      setToDelete(null);
      invalidate();
    },
    onError,
  });

  function close() {
    setForm(null);
    setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const author_name = myFullName ?? form.author_name;
    const res = validate(submissionSchema, { ...form, author_name, team: "Admin", status: "en attente" });
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    save.mutate(res.data);
  }

  return (
    <section className="space-y-md">
      <MenuBar label="Idées">
        <IdeaMenuLink
          to="attente"
          current={vue}
          label="IDÉES EN ATTENTE"
          name="Idées en attente"
          count={actionable}
        />
        <IdeaMenuLink to="traitees" current={vue} label="IDÉES TRAITÉES" />
      </MenuBar>
      <div className="flex items-center justify-between">
        <h2 className="font-headline-sm text-headline-sm text-primary">
          {vue === "attente" ? "Idées en attente" : "Idées traitées"} ({shown.length})
        </h2>
        <button
          onClick={() => {
            setErrors({});
            setForm({ ...empty });
          }}
          className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md"
        >
          + NOUVELLE IDÉE
        </button>
      </div>

      {list.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {list.isError && (
        <p className="text-body-sm text-error">Impossible de charger les idées.</p>
      )}

      <div className="space-y-xs">
        {shown.map((s) => (
          <article
            key={s.id}
            className="flex min-w-0 overflow-hidden items-start justify-between gap-sm p-sm bg-card border border-outline-variant"
          >
            <div className="min-w-0 flex-1">
              <p className="font-body-md text-primary font-bold wrap-anywhere">
                {s.author_name} — {s.team}
              </p>
              <p className="text-body-sm text-on-surface-variant italic line-clamp-3 whitespace-pre-line wrap-anywhere">“<Linkify text={s.content} />”</p>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setReading(s)}
                className="font-label-sm text-label-sm text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Ouvrir
              </button>
              <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
              <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                 {submissionStatusLabels[s.status] ?? s.status} • {timeAgo(s.created_at)}
              </p>
              {s.status === "refusée" && s.rejection_category && (
                <p className="text-body-sm text-error mt-xs wrap-anywhere">
                  Motif : {s.rejection_category} — <Linkify text={s.rejection_note ?? ""} />
                </p>
              )}
              <SubmissionHistory submissionId={s.id} />
            </div>
            <RowActions onDelete={() => setToDelete(s)} />
          </article>
        ))}
        {list.data && shown.length === 0 && (
          <p className="text-body-sm italic text-on-surface-variant">
            {vue === "attente" ? "Aucune idée en attente." : "Aucune idée traitée."}
          </p>
        )}
      </div>

      <SubmissionReader
        submission={reading}
        statusLabel={reading ? submissionStatusLabels[reading.status] ?? reading.status : undefined}
        onClose={() => setReading(null)}
      />
      {form && (
        <Modal title="Nouvelle idée" onClose={close}>
          <form onSubmit={submit} className="space-y-sm" noValidate>
            <ErrorSummary errors={errors} />
            <Field label="Auteur" error={errors.author_name}>
              <TextInput
                value={myFullName ?? form.author_name}
                readOnly={!!myFullName}
                maxLength={80}
                placeholder="Prénom et nom"
                onChange={(e) => setForm({ ...form, author_name: e.target.value })}
              />
            </Field>
            <p className="text-body-sm text-on-surface-variant">Équipe : Admin</p>
            <Field label="Contenu" error={errors.content}>
              <TextArea
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <CharCounter value={form.content} max={2000} min={5} />
            </Field>
            <FormActions pending={save.isPending} onCancel={close} />
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete
          label={toDelete.author_name}
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        />
      )}
    </section>
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
      to="/manage/submissions"
      search={{ vue: to }}
      aria-current={on ? "page" : undefined}
      aria-label={name ? menuTabLabel(name, count) : undefined}
      className={menuTabClass(on)}
    >
      {label}
      <CountBadge count={count} />
    </Link>
  );
}
