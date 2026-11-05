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
  Select,
  TextArea,
  TextInput,
} from "@/components/manage/crud-ui";
import { CountBadge } from "@/components/count-badge";
import { MenuBar, menuTabClass, menuTabLabel } from "@/components/sub-menu";
import { blockerSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  createBlocker,
  deleteBlocker,
  fetchAllBlockers,
  timeAgo,
  updateBlocker,
  type Blocker,
  type BlockerInput,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/manage/blockers")({
  head: () => ({
    meta: [
      { title: "Gestion des points bloquants — Happy Place" },
      { name: "description", content: "Crée, modifie et supprime les points bloquants dans Happy Place." },
      { property: "og:title", content: "Gestion des points bloquants — Happy Place" },
      { property: "og:description", content: "Gérez les alertes opérationnelles des missions de recrutement dans Happy Place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // vue optionnelle : les liens existants vers /manage/blockers (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: BlockerView } =>
    BLOCKER_VIEWS.includes(search.vue as BlockerView) ? { vue: search.vue as BlockerView } : {},
  component: ManageBlockers,
});

/** Une vue par statut ; seul OUVERT est « à traiter » (badge). */
const BLOCKER_VIEWS = ["ouverts", "en-cours", "surveillance", "resolus"] as const;
type BlockerView = (typeof BLOCKER_VIEWS)[number];

const viewStatus: Record<BlockerView, Blocker["status"]> = {
  ouverts: "OUVERT",
  "en-cours": "EN COURS",
  surveillance: "SURVEILLANCE",
  resolus: "RÉSOLU",
};

function inView(b: Blocker, vue: BlockerView): boolean {
  return b.status === viewStatus[vue];
}

/** Vue qui affiche un statut donné (après création, on ouvre la vue du nouveau point). */
function viewOf(status: Blocker["status"]): BlockerView {
  return BLOCKER_VIEWS.find((v) => viewStatus[v] === status) ?? "ouverts";
}

const viewTitles: Record<BlockerView, string> = {
  ouverts: "Points bloquants ouverts",
  "en-cours": "Points bloquants en cours",
  surveillance: "Points bloquants en surveillance",
  resolus: "Points bloquants résolus",
};

const severityLabels: Record<string, string> = {
  critical: "Critique",
  warning: "Avertissement",
  info: "Information",
};

const empty: BlockerInput = {
  title: "",
  description: "",
  department: "",
  severity: "warning",
  status: "EN COURS",
};

function ManageBlockers() {
  const qc = useQueryClient();
  const [form, setForm] = useState<BlockerInput | null>(null);
  const [editing, setEditing] = useState<Blocker | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toDelete, setToDelete] = useState<Blocker | null>(null);

  const vue: BlockerView = Route.useSearch().vue ?? "ouverts";
  const navigate = Route.useNavigate();
  const list = useQuery({ queryKey: ["blockers", "all"], queryFn: fetchAllBlockers, retry: false });
  // Même requête qu'avant, filtrée côté client selon la vue.
  const shown = (list.data ?? []).filter((b) => inView(b, vue));
  // Même règle que le badge de l'onglet « POINTS BLOQUANTS » : statut OUVERT uniquement.
  const openCount = (list.data ?? []).filter((b) => inView(b, "ouverts")).length;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["blockers"] });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const save = useMutation({
    mutationFn: (input: BlockerInput) =>
      editing ? updateBlocker(editing.id, input) : createBlocker(input),
    onSuccess: (_data, input) => {
      const created = !editing;
      toast.success(created ? "Point bloquant créé" : "Point bloquant modifié");
      close();
      invalidate();
      // Création : afficher la vue du statut choisi, où le nouveau point apparaît.
      if (created) navigate({ search: { vue: viewOf(input.status as Blocker["status"]) } });
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteBlocker(id),
    onSuccess: () => {
      toast.success("Point bloquant supprimé");
      setToDelete(null);
      invalidate();
    },
    onError,
  });

  function close() {
    setForm(null);
    setEditing(null);
    setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const res = validate(blockerSchema, form);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    save.mutate(res.data);
  }

  return (
    <section className="space-y-md">
      <MenuBar label="Points bloquants">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setErrors({});
            setForm({ ...empty });
          }}
          className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md"
        >
          + NOUVEAU POINT BLOQUANT
        </button>
        <BlockerMenuLink to="ouverts" current={vue} label="OUVERTS" name="Ouverts" count={openCount} />
        <BlockerMenuLink to="en-cours" current={vue} label="EN COURS" />
        <BlockerMenuLink to="surveillance" current={vue} label="SURVEILLANCE" />
        <BlockerMenuLink to="resolus" current={vue} label="RÉSOLUS" />
      </MenuBar>
      <h2 className="font-headline-sm text-headline-sm text-primary">
        {viewTitles[vue]} ({shown.length})
      </h2>

      {list.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {list.isError && (
        <p className="text-body-sm text-error">Impossible de charger les points bloquants.</p>
      )}

      <div className="space-y-xs">
        {shown.map((b) => (
          <article
            key={b.id}
            className="flex items-start justify-between gap-sm p-sm bg-card border border-outline-variant"
          >
            <div>
              <p className="font-body-md text-primary font-bold">{b.title}</p>
              <p className="text-body-sm text-on-surface-variant">{b.description}</p>
              <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                 {b.department} • {severityLabels[b.severity] ?? b.severity} • {b.status} • {timeAgo(b.updated_at)}
              </p>
            </div>
            <RowActions
              onEdit={() => {
                setEditing(b);
                setErrors({});
                setForm({
                  title: b.title,
                  description: b.description ?? "",
                  department: b.department,
                  severity: b.severity,
                  status: b.status,
                });
              }}
              onDelete={() => setToDelete(b)}
            />
          </article>
        ))}
        {list.data && shown.length === 0 && (
          <p className="text-body-sm italic text-on-surface-variant">Aucun point bloquant.</p>
        )}
      </div>

      {form && (
        <Modal
          title={editing ? "Modifier le point bloquant" : "Nouveau point bloquant"}
          onClose={close}
        >
          <form onSubmit={submit} className="space-y-sm" noValidate>
            <ErrorSummary errors={errors} />
            <Field label="Titre" error={errors.title}>
              <TextInput
                value={form.title}
                maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Description" error={errors.description}>
              <TextArea
                rows={4}
                value={form.description}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Pôle concerné" error={errors.department}>
              <TextInput
                value={form.department}
                maxLength={60}
                placeholder="Ex. Data & IA"
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </Field>
            <Field label="Sévérité" error={errors.severity}>
              <Select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option value="critical">Critique</option>
                <option value="warning">Avertissement</option>
                <option value="info">Information</option>
              </Select>
            </Field>
            <Field label="Statut" error={errors.status}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="OUVERT">OUVERT</option>
                <option value="EN COURS">EN COURS</option>
                <option value="SURVEILLANCE">SURVEILLANCE</option>
                {editing && (
                  <option
                    value="RÉSOLU"
                    disabled={form.status === "OUVERT"}
                    title={form.status === "OUVERT" ? "Passe d'abord par EN COURS" : undefined}
                  >
                    RÉSOLU
                  </option>
                )}
              </Select>
            </Field>
            <FormActions pending={save.isPending} onCancel={close} />
          </form>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDelete
          label={toDelete.title}
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        />
      )}
    </section>
  );
}

function BlockerMenuLink({
  to,
  current,
  label,
  name,
  count = 0,
}: {
  to: BlockerView;
  current: BlockerView;
  label: string;
  name?: string;
  count?: number;
}) {
  const on = current === to;
  return (
    <Link
      to="/manage/blockers"
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
