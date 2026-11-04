import { createFileRoute, Link, redirect } from "@tanstack/react-router";
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
import { BrandHeader } from "@/components/brand-header";
import { newsSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import {
  db,
  createNews,
  deleteNews,
  fetchAllNews,
  timeAgo,
  updateNews,
  type News,
  type NewsInput,
} from "@/lib/dashboard";
import { NewsImage, NewsLinks, NewsMediaEditor } from "@/components/news-media";
import { emptyMedia, linkErrors, mediaFromNews, toNewsLinks, type MediaDraft } from "@/lib/news-media";

export const Route = createFileRoute("/_authenticated/actualites")({
  head: () => ({
    meta: [
      { title: "Gérer les actualités — Happy Place" },
      { name: "description", content: "Crée, modifie et supprime les actualités de Happy Place." },
      { property: "og:title", content: "Gérer les actualités — Happy Place" },
      { property: "og:description", content: "Gérez les actualités du cabinet de recrutement dans Happy Place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // vue optionnelle : les liens existants vers /actualites (sans paramètre) restent valides.
  validateSearch: (search: Record<string, unknown>): { vue?: NewsView } =>
    NEWS_VIEWS.includes(search.vue as NewsView) ? { vue: search.vue as NewsView } : {},
  beforeLoad: ({ context }) => {
    if (context.role !== "admin") throw redirect({ to: "/" });
  },
  component: NewsPage,
});

/** Vues du menu : mes = toutes mes actualités ; le reste filtre par statut et par auteur. */
const NEWS_VIEWS = ["mes", "brouillons-mes", "brouillons-valider", "publiees-mes", "publiees-manager"] as const;
type NewsView = (typeof NEWS_VIEWS)[number];

const viewTitles: Record<NewsView, string> = {
  mes: "Mes actualités",
  "brouillons-mes": "Mes brouillons",
  "brouillons-valider": "Brouillons à valider",
  "publiees-mes": "Mes actualités publiées",
  "publiees-manager": "Actualités manager",
};
const viewEmpty: Record<NewsView, string> = {
  mes: "Aucune actualité.",
  "brouillons-mes": "Aucun brouillon.",
  "brouillons-valider": "Aucun brouillon à valider.",
  "publiees-mes": "Aucune actualité publiée.",
  "publiees-manager": "Aucune actualité de manager publiée.",
};

/** Actualité de l'admin connecté ou ancienne ligne sans auteur identifié (relève de l'administration). */
function isMine(n: News, myEmail: string): boolean {
  return !n.author_email || n.author_email.toLowerCase() === myEmail;
}

/** Filtre une liste d'actualités selon la vue. Une actualité sans author_email (anciennes lignes) relève de l'administration : elle compte comme « à moi ». */
function filterNews(all: News[], vue: NewsView, myEmail: string): News[] {
  const mine = (n: News) => isMine(n, myEmail);
  switch (vue) {
    case "mes":
      return all.filter(mine);
    case "brouillons-mes":
      return all.filter((n) => n.status === "brouillon" && mine(n));
    case "brouillons-valider":
      return all.filter((n) => n.status === "brouillon" && !mine(n));
    case "publiees-mes":
      return all.filter((n) => n.status === "publiée" && mine(n));
    case "publiees-manager":
      return all.filter((n) => n.status === "publiée" && !mine(n));
  }
}

/** Page autonome « Gérer les actualités » (admin), sur le modèle de « Gestion des données », avec un menu à sous-menus (paramètre ?vue=). */
function NewsPage() {
  const vue: NewsView = Route.useSearch().vue ?? "mes";
  const { email } = Route.useRouteContext();
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen">
      <BrandHeader />
      <main className="w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-1">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Gérer les actualités
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Gérer les actualités</h1>
          </div>
          <Link
            to="/"
            className="px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
          >
            ← RETOUR À LA VUE D'ENSEMBLE
          </Link>
        </div>

        <ManageNews vue={vue} myEmail={(email ?? "").toLowerCase()} />
      </main>
    </div>
  );
}

const newsStatusLabels: Record<string, string> = {
  brouillon: "Brouillon",
  publiée: "Publiée",
};

const empty: NewsInput = { title: "", body: "", author: "", status: "brouillon" };
/** Direction proposée par défaut à l'admin (RH, communication interne), si elle existe dans `teams`. */
const DEFAULT_AUTHOR = "Direction RH - Communication Interne";

/** Directions existantes (table `teams`, lisible par les comptes connectés). */
async function fetchTeamNames(): Promise<string[]> {
  const { data, error } = await db.from("teams").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map((t) => t.name);
}

function ManageNews({ vue, myEmail }: { vue: NewsView; myEmail: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<NewsInput | null>(null);
  const [editing, setEditing] = useState<News | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toDelete, setToDelete] = useState<News | null>(null);
  const [media, setMedia] = useState<MediaDraft>(emptyMedia);
  const [showLinkErrs, setShowLinkErrs] = useState(false);

  const list = useQuery({ queryKey: ["news", "all"], queryFn: fetchAllNews, retry: false });
  const teams = useQuery({ queryKey: ["teams", "names"], queryFn: fetchTeamNames, retry: false });
  const teamNames = teams.data ?? [];
  // Une actualité ou un brouillon d'un autre compte (manager) garde sa direction émettrice.
  const authorLocked = !!editing && !isMine(editing, myEmail);
  const shown = filterNews(list.data ?? [], vue, myEmail);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["news"] });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const save = useMutation({
    mutationFn: (input: NewsInput) =>
      editing ? updateNews(editing.id, input, media) : createNews(input, media),
    onSuccess: () => {
      toast.success(editing ? "Actualité modifiée" : "Actualité créée");
      close();
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (n: News) => deleteNews(n.id, n.image_path),
    onSuccess: () => {
      toast.success("Actualité supprimée");
      setToDelete(null);
      invalidate();
    },
    onError,
  });

  function close() {
    setForm(null);
    setEditing(null);
    setErrors({});
    setMedia(emptyMedia());
    setShowLinkErrs(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const res = validate(newsSchema, form);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    setShowLinkErrs(true);
    if (Object.keys(linkErrors(media.links)).length) return;
    save.mutate({ ...res.data, links: toNewsLinks(media.links) });
  }

  return (
    <section className="space-y-md">
      <nav aria-label="Actualités" className="flex flex-wrap gap-xs border-b border-outline-variant pb-sm">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setErrors({});
            setMedia(emptyMedia());
            setShowLinkErrs(false);
            setForm({ ...empty, author: teamNames.includes(DEFAULT_AUTHOR) ? DEFAULT_AUTHOR : "" });
          }}
          className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md"
        >
          + NOUVELLE ACTUALITÉ
        </button>
        <MenuLink to="mes" current={vue} label="MES ACTUALITÉS" />
        <MenuLink
          to="brouillons-mes"
          current={vue}
          label="BROUILLONS"
          active={vue.startsWith("brouillons")}
        />
        <MenuLink
          to="publiees-mes"
          current={vue}
          label="ACTUALITÉS PUBLIÉES"
          active={vue.startsWith("publiees")}
        />
      </nav>

      {vue.startsWith("brouillons") && (
        <SubMenu label="Brouillons">
          <MenuLink to="brouillons-mes" current={vue} label="MES BROUILLONS" sub />
          <MenuLink to="brouillons-valider" current={vue} label="BROUILLONS À VALIDER" sub />
        </SubMenu>
      )}
      {vue.startsWith("publiees") && (
        <SubMenu label="Actualités publiées">
          <MenuLink to="publiees-mes" current={vue} label="MES ACTUALITÉS PUBLIÉES" sub />
          <MenuLink to="publiees-manager" current={vue} label="ACTUALITÉS MANAGER" sub />
        </SubMenu>
      )}

      <h2 className="font-headline-sm text-headline-sm text-primary">
        {viewTitles[vue]} ({shown.length})
      </h2>

      {list.isLoading && <p className="text-body-sm text-on-surface-variant">Chargement…</p>}
      {list.isError && (
        <p className="text-body-sm text-error">Impossible de charger les actualités.</p>
      )}

      <div className="space-y-xs">
        {shown.map((n) => (
          <article
            key={n.id}
            className="flex flex-col sm:flex-row items-start justify-between gap-sm p-sm min-w-0 overflow-hidden bg-card border border-outline-variant"
          >
            <div className="min-w-0 flex-1 space-y-xs">
              {n.image_path && <NewsImage path={n.image_path} alt={n.title} />}
              <p className="font-body-md text-primary font-bold wrap-anywhere">{n.title}</p>
              <p className="text-body-sm text-on-surface-variant line-clamp-2 wrap-anywhere">{n.body}</p>
              <NewsLinks links={n.links} />
              <p className="text-[11px] font-label-sm text-on-surface-variant uppercase mt-xs">
                 {newsStatusLabels[n.status] ?? n.status} • {n.author} • {timeAgo(n.created_at)}
              </p>
            </div>
            <RowActions
              onEdit={() => {
                setEditing(n);
                setErrors({});
                setMedia(mediaFromNews(n));
                setShowLinkErrs(false);
                setForm({
                  title: n.title,
                  body: n.body ?? "",
                  author: n.author ?? "",
                  status: n.status,
                });
              }}
              onDelete={() => setToDelete(n)}
            />
          </article>
        ))}
        {list.data && shown.length === 0 && (
          <p className="text-body-sm italic text-on-surface-variant">{viewEmpty[vue]}</p>
        )}
      </div>

      {form && (
        <Modal title={editing ? "Modifier l'actualité" : "Nouvelle actualité"} onClose={close}>
          <form onSubmit={submit} className="space-y-sm" noValidate>
            <ErrorSummary errors={errors} />
            <Field label="Titre" error={errors.title}>
              <TextInput
                value={form.title}
                maxLength={160}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Contenu" error={errors.body}>
              <TextArea
                rows={5}
                value={form.body}
                maxLength={5000}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </Field>
            <Field label="Image et liens">
              <NewsMediaEditor
                value={media}
                onChange={setMedia}
                linkErrs={showLinkErrs ? linkErrors(media.links) : {}}
                disabled={save.isPending}
                title={form.title}
              />
            </Field>
            <Field label="Auteur" error={errors.author}>
              <Select
                value={form.author}
                disabled={authorLocked}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              >
                <option value="">Choisir une direction</option>
                {form.author && !teamNames.includes(form.author) && (
                  <option value={form.author}>{form.author}</option>
                )}
                {teamNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              {authorLocked && (
                <p className="text-body-sm text-on-surface-variant mt-xs">
                  Direction émettrice : non modifiable.
                </p>
              )}
            </Field>
            <Field label="Statut" error={errors.status}>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="brouillon">Brouillon</option>
                <option value="publiée">Publiée</option>
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
          onConfirm={() => remove.mutate(toDelete)}
        />
      )}
    </section>
  );
}

/** Entrée de menu : lien vers /actualites?vue=... ; `active` marque l'entrée parente d'un sous-menu. */
function MenuLink({
  to,
  current,
  label,
  active,
  sub,
}: {
  to: NewsView;
  current: NewsView;
  label: string;
  active?: boolean;
  sub?: boolean;
}) {
  const on = active ?? current === to;
  return (
    <Link
      to="/actualites"
      search={{ vue: to }}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-xs px-md py-xs border font-label-md text-label-md ${
        on
          ? "bg-primary text-on-primary border-primary"
          : "text-on-surface-variant border-outline-variant hover:bg-surface-container"
      } ${sub ? "text-label-sm" : ""}`}
    >
      {label}
    </Link>
  );
}

function SubMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={`Sous-menu ${label}`} className="flex flex-wrap gap-xs pl-md border-l-2 border-primary">
      {children}
    </nav>
  );
}
