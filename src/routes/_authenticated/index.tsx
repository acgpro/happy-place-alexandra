import { createFileRoute, Link } from "@tanstack/react-router";
import { signOut } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorSummary, Field, FormActions, Modal, Select, TextArea, TextInput, useFieldProps } from "@/components/manage/crud-ui";
import { submissionSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import { QUESTION_MAX, askQuestion, fetchAskableTeams, questionErrorMessage, questionSchema } from "@/lib/questions";
import { BrandHeader } from "@/components/brand-header";
import { AttachmentLink } from "@/components/attachment-link";
import { CharCounter, SubmissionPreview, formatExactDate, rejectionErrorMessage } from "@/components/expandable-card";
import { SubmissionReader } from "@/components/submission-reader";
import { TeamQuestions, useTeamQuestions } from "@/components/team-questions";
import { PendingSubmissions, usePendingSubmissions } from "@/components/pending-submissions";
import { NewsReader } from "@/components/news-reader";
import { DepartureNotices } from "@/components/departure-notices";
import { CountBadge } from "@/components/count-badge";
import { useAdminPendingCounts } from "@/lib/admin-pending";
import { answeredIdeaIds, readSeenIdeas } from "@/lib/idees-lues";
import { NewsImage, NewsLinks, NewsMediaEditor } from "@/components/news-media";
import { emptyMedia, linkErrors, mediaFromNews, toNewsLinks, type MediaDraft } from "@/lib/news-media";
import { BlockerArchive, ValidatedSubmissions } from "@/components/dashboard-extras";
import { Button } from "@/components/ui/button";
import {
  fetchBlockers,
  fetchMetrics,
  deltaText,
  fetchNews,
  fetchMyFullName,
  fetchMySubmissions,
  fetchResponses,
  exportMyRecentSubmissions,
  type News,
  type Submission,
  saveDraftNews,
  publishDraftNews,
  deleteDraftNews,
  submitIdea,
  timeAgo,
  updateBlockerStatus,
  formatFullDate,
  metricPeriodLabel,
  TREND_LABELS,
  type Metric,
  type SubmissionInput,
} from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Happy Place — Actualités et vue d'ensemble" },
      {
        name: "description",
        content:
          "Pilotez les missions de recrutement IT et digital, les idées des équipes, les alertes opérationnelles et les indicateurs du cabinet.",
      },
      { property: "og:title", content: "Happy Place — Vue d'ensemble" },
      {
        property: "og:description",
        content:
          "Suivez l'activité du cabinet, les missions de recrutement, les alertes et les indicateurs clés.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManagerSpace,
});

const PERF_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAz-Y4URSqOCzUaVC6vomdu54tTiFPC_bF9A_h0SjxJ1mq2OlNfOyeKTNkPIgtPRloYwE5JrWFm2FHBNUq0GScs0ALDVMiq16FLu95dHNGPjmybEoIb2uyz1OGozRn0XkudSMukcPY4gKfeOJMR_KAnhYbkZifswTCbpCs_aHZyMuoZRz_oc4KsWtWiryTdwVD0EKyvxScj3palbDIM2wMlnH0njPGj912mRwhMmTo3Yu07l6xfVv2Zuw";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

/** Transmet à un champ natif les attributs de son Field (libellé et message d'erreur reliés). */
function WithFieldProps({ children }: { children: (field: ReturnType<typeof useFieldProps>) => React.ReactNode }) {
  return <>{children(useFieldProps())}</>;
}

function trendText(m: Metric | undefined) {
  return m ? TREND_LABELS[m.trend] : "";
}

function formatMetric(m: Metric | undefined, fallback: string) {
  if (!m) return fallback;
  const v = Number(m.value);
  const formatted = m.unit === "%" ? v.toFixed(1).replace(".", ",") : v.toLocaleString("fr-FR");
  return `${formatted}${m.unit ?? ""}`;
}

function ManagerSpace() {
  const qc = useQueryClient();
  const { role, email, user } = Route.useRouteContext();
  const isAdmin = role === "admin";
  const canReview = role === "admin" || role === "manager";
  const canWriteNews = role === "manager";
  const myEmail = (email ?? "").toLowerCase();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const myName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    myEmail;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaDraft>(emptyMedia);
  const [showLinkErrs, setShowLinkErrs] = useState(false);
  const newsLinkErrs = showLinkErrs ? linkErrors(media.links) : {};
  const [submissionForm, setSubmissionForm] = useState<SubmissionInput | null>(null);
  const [submissionErrors, setSubmissionErrors] = useState<FieldErrors>({});
  const [questionForm, setQuestionForm] = useState<{ team: string; body: string } | null>(null);
  const [questionErrors, setQuestionErrors] = useState<FieldErrors>({});
  const myTeams = useQuery({
    queryKey: ["manager_teams", "mine", email],
    enabled: role === "manager" && !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manager_teams")
        .select("team, allowed_users!inner(email)")
        .eq("allowed_users.email", (email ?? "").toLowerCase());
      if (error) throw error;
      return (data ?? []).map((t) => t.team).sort();
    },
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [reading, setReading] = useState<Submission | null>(null);
  const [readingNews, setReadingNews] = useState<News | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const news =useQuery({ queryKey: ["news"], queryFn: fetchNews, retry: false });
  const myNameQuery = useQuery({
    queryKey: ["allowed_users", "me", email],
    queryFn: () => fetchMyFullName(email ?? ""),
    enabled: !!email,
    retry: false,
  });
  // Nom lu dans la base : le champ « Nom » est alors en lecture seule.
  const myFullName = myNameQuery.data ?? null;
  const blockers = useQuery({ queryKey: ["blockers"], queryFn: fetchBlockers, retry: false });
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, retry: false });
  const onError = (e: unknown) => toast.error((e as Error).message);

  const exportReport = useMutation({
    mutationFn: () => {
      if (!email) throw new Error("Ton adresse e-mail est indisponible.");
      return exportMyRecentSubmissions(email);
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("Aucune idée en attente ou validée sur les 30 derniers jours.");
        return;
      }
      toast.success(`${count} idée${count > 1 ? "s" : ""} exportée${count > 1 ? "s" : ""} au format CSV.`);
    },
    onError,
  });

  const saveDraft = useMutation({
    mutationFn: saveDraftNews,
    onSuccess: () => {
      setTitle("");
      setBody("");
      setEditingNewsId(null);
      setMedia(emptyMedia());
      setShowLinkErrs(false);
      toast.success("Brouillon enregistré");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const publishDraft = useMutation({
    mutationFn: publishDraftNews,
    onSuccess: () => {
      toast.success("Actualité publiée");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const removeDraft = useMutation({
    mutationFn: (n: { id: string; image_path?: string | null }) => deleteDraftNews(n.id, n.image_path),
    onSuccess: () => {
      toast.success("Brouillon supprimé");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError,
  });

  const submit = useMutation({
    mutationFn: (input: SubmissionInput) => submitIdea({
      author_name: input.author_name,
      team: input.team,
      content: input.content,
    }, attachment),
    onSuccess: () => {
      setSubmissionForm(null);
      setAttachment(null);
      setSubmissionErrors({});
      toast.success("Idée envoyée");
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (e: unknown) => toast.error(rejectionErrorMessage(e)),
  });

  // F5 : directions ouvertes à la question, chargées à l'ouverture de la fenêtre.
  const askableTeams = useQuery({
    queryKey: ["questions", "askable-teams", email],
    queryFn: fetchAskableTeams,
    enabled: !!questionForm,
    retry: false,
  });

  const ask = useMutation({
    mutationFn: askQuestion,
    onSuccess: () => {
      setQuestionForm(null);
      setQuestionErrors({});
      toast.success("Question envoyée. Tu la retrouveras dans « Mes questions ».");
      qc.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (e: unknown) => toast.error(questionErrorMessage(e)),
  });

  function sendQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!questionForm) return;
    const result = validate(questionSchema, questionForm);
    if (!result.ok) {
      setQuestionErrors(result.errors);
      return;
    }
    setQuestionErrors({});
    ask.mutate(result.data);
  }

  const setBlocker = useMutation({
    mutationFn: updateBlockerStatus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["blockers"] }),
    onError,
  });

  const visibleDrafts = news.data?.filter((n) => n.status === "brouillon") ?? [];
  const drafts = visibleDrafts.length;
  const published = news.data?.filter((n) => n.status === "publiée") ?? [];
  const roleLabel = role === "admin" ? "ADMIN" : role === "manager" ? "MANAGER" : "COLLABORATEUR";
  // Badges de l'accueil manager : mêmes requêtes (lecture seule) et mêmes filtres que les pages dédiées.
  const pendingIdeas = usePendingSubmissions(myEmail, role === "manager" && !!myEmail).pending.length;
  const pendingQuestions = useTeamQuestions(email ?? "", role === "manager" && !!email).pending.length;
  // Badges admin : « GÉRER LES ACTUALITÉS » = brouillons ; « GÉRER LES DONNÉES » = idées à valider + points bloquants OUVERT
  const adminCounts = useAdminPendingCounts(myEmail, isAdmin && !!myEmail);
  const adminNews = adminCounts.news;
  const adminPending = adminCounts.total;
  // Badge « MES IDÉES » : mêmes requêtes et mêmes clés de cache que la page « Mes idées ».
  const myIdeas = useQuery({
    queryKey: ["submissions", "mine", email],
    queryFn: () => fetchMySubmissions(email ?? ""),
    enabled: !!email,
    retry: false,
  });
  const myIdeaIds = myIdeas.data?.map((s) => s.id) ?? [];
  const myIdeaResponses = useQuery({
    queryKey: ["responses", myIdeaIds],
    queryFn: () => fetchResponses(myIdeaIds),
    enabled: myIdeaIds.length > 0,
    retry: false,
  });
  // Lu dans un effet à chaque montage : après l'enregistrement fait par « Mes idées » en quittant la page.
  const [seenIdeas, setSeenIdeas] = useState<Set<string> | null>(null);
  useEffect(() => {
    setSeenIdeas(readSeenIdeas(user.id));
  }, [user.id]);
  const unreadIdeas =
    seenIdeas && myIdeas.data
      ? answeredIdeaIds(myIdeas.data, myIdeaResponses.data).filter((id) => !seenIdeas.has(id)).length
      : 0;

  function sendSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!submissionForm) return;
    // Collaborators: team is set server-side from their account
    // Admin: always the « Admin » team (set server-side); manager: one of their teams
    const team = role === "collaborateur" ? "auto" : role === "admin" ? "Admin" : submissionForm.team;
    const author_name = myFullName ?? submissionForm.author_name;
    const result = validate(submissionSchema, { ...submissionForm, author_name, team, status: "en attente" });
    if (!result.ok) {
      setSubmissionErrors(result.errors);
      return;
    }
    setSubmissionErrors({});
    submit.mutate(result.data);
  }

  const secondaryButton =
    "flex items-center gap-xs px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container transition-all";
  const submitIdeaButton = (
    <button
      onClick={() => {
        setSubmissionErrors({});
        const only = role === "manager" && myTeams.data?.length === 1 ? myTeams.data[0] : "";
        setSubmissionForm({ author_name: "", team: only, content: "", status: "en attente" });
      }}
      className="flex items-center gap-xs px-md py-xs border border-primary bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-all"
    >
      <Icon name="add" /> SOUMETTRE UNE IDÉE
    </button>
  );
  const myIdeasLink = (
    <Link
      to="/idees"
      aria-label={unreadIdeas > 0 ? `Mes idées, ${unreadIdeas} ${unreadIdeas > 1 ? "réponses non lues" : "réponse non lue"}` : undefined}
      className={secondaryButton}
    >
      <Icon name="lightbulb" /> MES IDÉES
      <CountBadge count={unreadIdeas} />
    </Link>
  );
  const askQuestionButton = (
    <button
      type="button"
      onClick={() => {
        setQuestionErrors({});
        setQuestionForm({ team: "", body: "" });
      }}
      className={secondaryButton}
    >
      <Icon name="help" /> POSER UNE QUESTION
    </button>
  );
  const myQuestionsLink = (
    <Link to="/questions" className={secondaryButton}>
      <Icon name="chat" /> MES QUESTIONS
    </Link>
  );

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        {email && <DepartureNotices email={email} />}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
          <div className="space-y-sm">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Vue d'ensemble
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Happy Place</h1>
          </div>
          <div className="flex flex-col gap-xs items-start md:items-end">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {email} · {roleLabel}
            </span>
            <div className="flex flex-wrap gap-xs md:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() => exportReport.mutate()}
              className="h-auto rounded-none border-outline bg-surface px-md py-xs font-label-md text-label-md text-primary shadow-none hover:bg-surface-container"
            >
              <Icon name="file_download" /> {exportReport.isPending ? "EXPORT EN COURS…" : "EXPORTER LE RAPPORT"}
            </Button>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-xs px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
            >
              <Icon name="logout" /> DÉCONNEXION
            </button>
            </div>
          </div>
        </div>

        {/* Collaborateur et admin : une rangée pleine largeur, idées à gauche, questions (et gestion) à droite */}
        {role === "collaborateur" && (
          <div className="flex flex-col items-stretch gap-xs mb-lg sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col items-stretch gap-xs sm:flex-row sm:flex-wrap">
              {submitIdeaButton}
              {myIdeasLink}
            </div>
            <div className="flex flex-col items-stretch gap-xs sm:flex-row sm:flex-wrap">
              {askQuestionButton}
              {myQuestionsLink}
            </div>
          </div>
        )}
        {role === "admin" && (
          <div className="flex flex-col items-stretch gap-xs mb-lg sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {submitIdeaButton}
            {myIdeasLink}
            {askQuestionButton}
            {myQuestionsLink}
            <Link
              to="/actualites"
              aria-label={adminNews > 0 ? `Gérer les actualités, ${adminNews} en attente` : undefined}
              className={secondaryButton}
            >
              <Icon name="newspaper" /> GÉRER LES ACTUALITÉS
              <CountBadge count={adminNews} />
            </Link>
            <Link
              to="/manage/submissions"
              aria-label={adminPending > 0 ? `Gérer les données, ${adminPending} en attente` : undefined}
              className={secondaryButton}
            >
              <Icon name="database" /> GÉRER LES DONNÉES
              <CountBadge count={adminPending} />
            </Link>
          </div>
        )}
        {role === "manager" && (
          <div className="flex flex-col items-stretch gap-xs mb-lg sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {submitIdeaButton}
            {myIdeasLink}
            {askQuestionButton}
            {myQuestionsLink}
            <Link
              to="/idees-collaborateur"
              aria-label={pendingIdeas > 0 ? `Idées collaborateur, ${pendingIdeas} en attente` : undefined}
              className={secondaryButton}
            >
              <Icon name="inbox" /> IDÉES COLLABORATEUR
              <CountBadge count={pendingIdeas} />
            </Link>
            <Link
              to="/questions-collaborateur"
              aria-label={pendingQuestions > 0 ? `Questions collaborateur, ${pendingQuestions} en attente` : undefined}
              className={secondaryButton}
            >
              <Icon name="forum" /> QUESTIONS COLLABORATEUR
              <CountBadge count={pendingQuestions} />
            </Link>
          </div>
        )}

        <div className="bento-grid">
          {/* News Management & Input */}
          <section className={`col-span-12 ${isAdmin ? "lg:col-span-8" : "lg:col-span-12"} bg-surface-container-lowest border border-outline-variant p-md flex flex-col gap-md`}>
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
              <h2 className="font-headline-sm text-headline-sm text-primary">
                Actualités du cabinet
              </h2>
              {canWriteNews && (
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {drafts} brouillon{drafts > 1 ? "s" : ""} en attente
                </span>
              )}
            </div>
            {canWriteNews && <form
              className="space-y-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                setShowLinkErrs(true);
                if (Object.keys(linkErrors(media.links)).length) {
                  toast.error("Corrige les liens invalides avant d'enregistrer.");
                  return;
                }
                saveDraft.mutate({
                  links: toNewsLinks(media.links),
                  media,
                  id: editingNewsId ?? undefined,
                  title: title.trim(),
                  body,
                  author: myName,
                  author_email: myEmail,
                });
              }}
            >
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant block">
                  TITRE
                </label>
                <input
                  className="w-full bg-transparent border-b border-outline-variant focus:border-primary transition-colors font-headline-sm text-headline-sm px-0 py-xs"
                   placeholder="Saisis un titre…"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant block">
                  CONTENU
                </label>
                <textarea
                  className="w-full bg-card border border-outline-variant focus:border-primary p-sm font-body-md"
                   placeholder="Rédige l'actualité…"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-sm">
                <NewsMediaEditor
                  value={media}
                  onChange={setMedia}
                  linkErrs={newsLinkErrs}
                  disabled={saveDraft.isPending}
                  title={title}
                />
                <div className="flex items-center gap-sm">
                  {editingNewsId && (
                    <button
                      type="button"
                      className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                      onClick={() => {
                        setEditingNewsId(null);
                        setTitle("");
                        setBody("");
                        setMedia(emptyMedia());
                        setShowLinkErrs(false);
                      }}
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saveDraft.isPending}
                    className="px-lg py-xs bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
                  >
                    {saveDraft.isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
                  </button>
                </div>
              </div>
            </form>}
            {/* Séparateur sous le formulaire de rédaction : affiché seulement quand ce formulaire existe (manager) */}
            <div className={canWriteNews ? "mt-md pt-md border-t border-outline-variant" : ""}>
              {canWriteNews && visibleDrafts.length > 0 && (
                <>
                  <h3 className="font-label-md text-label-md text-on-surface-variant mb-sm">
                    BROUILLONS
                  </h3>
                  <div className="space-y-xs mb-md">
                    {visibleDrafts.map((n) => {
                      const own = (n.author_email ?? "").toLowerCase() === myEmail;
                      const allowed = isAdmin || own;
                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between gap-sm p-sm bg-surface-container"
                        >
                          <div className="flex items-center gap-md min-w-0">
                            <Icon name="draft" className="text-on-surface-variant" />
                            <div className="min-w-0">
                              <p className="font-body-md text-primary flex items-center gap-xs">
                                <span className="truncate">{n.title}</span>
                                <span className="shrink-0 border border-outline-variant px-xs font-label-sm text-label-sm text-on-surface-variant">
                                  Brouillon
                                </span>
                              </p>
                              <p className="text-xs text-on-surface-variant uppercase font-label-sm">
                                Créé {timeAgo(n.created_at)} • Par {n.author}
                              </p>
                            </div>
                          </div>
                          {allowed && (
                            <div className="flex items-center gap-sm shrink-0">
                              <button
                                type="button"
                                className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary"
                                onClick={() => {
                                  setEditingNewsId(n.id);
                                  setTitle(n.title);
                                  setBody(n.body ?? "");
                                  setMedia(mediaFromNews(n));
                                  setShowLinkErrs(false);
                                }}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="font-label-sm text-label-sm text-error"
                                disabled={removeDraft.isPending}
                                onClick={() => {
                                  if (window.confirm(`Supprimer le brouillon « ${n.title} » ?`))
                                    removeDraft.mutate(n);
                                }}
                              >
                                Supprimer
                              </button>
                              <button
                                type="button"
                                className="px-sm py-1 bg-primary text-on-primary font-label-sm text-label-sm disabled:opacity-50"
                                disabled={publishDraft.isPending}
                                onClick={() => {
                                  if (window.confirm(`Publier l'actualité « ${n.title} » ? Elle sera visible par tous.`))
                                    publishDraft.mutate(n.id);
                                }}
                              >
                                Publier
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <h3 className="font-label-md text-label-md text-on-surface-variant mb-sm">
                PUBLIÉES RÉCEMMENT
              </h3>
              <div className="space-y-xs">
                {news.isLoading && (
                  <p className="text-body-sm text-on-surface-variant">Chargement…</p>
                )}
                {news.isError && (
                  <p className="text-body-sm text-error">
                    Les actualités sont indisponibles.
                  </p>
                )}
                {published.slice(0, 4).map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setReadingNews(n)}
                    aria-haspopup="dialog"
                    className="w-full text-left p-sm bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer group min-w-0 overflow-hidden space-y-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {n.image_path && <NewsImage path={n.image_path} alt={n.title} />}
                    <div className="flex items-center justify-between gap-sm min-w-0">
                    <div className="flex items-center gap-md min-w-0">
                      <Icon name="article" className="text-on-surface-variant" />
                      <div className="min-w-0">
                        <p className="font-body-md text-primary group-hover:underline wrap-anywhere">{n.title}</p>
                        <p className="text-xs text-on-surface-variant uppercase font-label-sm">
                          Publiée {timeAgo(n.created_at)} • Par {n.author}
                        </p>
                      </div>
                    </div>
                    </div>
                    <NewsLinks links={n.links} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Idées en attente : accueil admin ; le manager les traite sur /idees-collaborateur */}
          {isAdmin && email && (
            <PendingSubmissions role="admin" email={email} className="col-span-12 lg:col-span-4" />
          )}

          {/* F5 : questions des collaborateurs (manager : répondre ; admin : lecture seule) */}
          {/* Questions : accueil admin (lecture seule) ; le manager répond sur /questions-collaborateur */}
          {isAdmin && email && <TeamQuestions role="admin" email={email} />}

          <ValidatedSubmissions
            role={role}
            email={myEmail}
            managerTeams={myTeams.data ?? []}
            onRead={setReading}
          />

          {/* Points Bloquants */}
          <section className="col-span-12 md:col-span-7 bg-surface-container-lowest border border-outline-variant p-md">
            <div className="flex items-center justify-between mb-md">
              <div className="flex items-center gap-sm">
                <h2 className="font-headline-sm text-headline-sm text-primary">Points Bloquants</h2>
                <span className="text-xs bg-error-container text-on-error-container px-xs py-1 font-label-sm">
                  PRIORITÉ HAUTE
                </span>
              </div>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setArchiveOpen(true)}
                className="text-primary font-label-sm text-label-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                 VOIR L'ARCHIVE
              </button>
            </div>
            <div className="space-y-sm">
              {blockers.isError && (
                <p className="text-body-sm text-error">
                  Les points bloquants sont indisponibles.
                </p>
              )}
              {blockers.data?.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucun point bloquant en cours.
                </p>
              )}
              {blockers.data?.map((b) => {
                const critical = b.severity === "critical";
                return (
                  <div
                    key={b.id}
                    className={`${critical ? "accent-bar " : ""}bg-card border border-outline-variant p-sm flex items-start justify-between`}
                  >
                    <div className="flex gap-md">
                      <Icon
                        name={critical ? "error" : "warning"}
                        className={
                          critical
                            ? "text-error mt-1 [font-variation-settings:'FILL'_1]"
                            : "text-secondary mt-1"
                        }
                      />
                      <div>
                        <p className="font-body-md text-primary font-bold">{b.title}</p>
                        <p className="text-body-sm text-on-surface-variant">{b.description}</p>
                        <div className="flex items-center gap-sm mt-xs">
                          <span className="text-[11px] font-label-sm bg-surface-container-highest px-xs py-0.5">
                            {b.department}
                          </span>
                          <span className="text-[11px] font-label-sm text-on-surface-variant">
                            Mis à jour {timeAgo(b.updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <select
                      aria-label={`Statut de ${b.title}`}
                      value={b.status}
                      disabled={!isAdmin}
                      onChange={(e) => setBlocker.mutate({ id: b.id, status: e.target.value })}
                      className={`bg-transparent border-none text-xs font-label-sm cursor-pointer ${critical ? "text-error" : "text-on-surface-variant"}`}
                    >
                      <option>OUVERT</option>
                      <option>EN COURS</option>
                      <option>SURVEILLANCE</option>
                      <option
                        disabled={b.status === "OUVERT"}
                        title={b.status === "OUVERT" ? "Passe d'abord par EN COURS" : undefined}
                      >
                        RÉSOLU
                      </option>
                    </select>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Performance Hub */}
          <section className="col-span-12 md:col-span-5 bg-surface-container-lowest border border-outline-variant p-md flex flex-col">
            <div className="flex items-center justify-between mb-md">
              <h2 className="font-headline-sm text-headline-sm text-primary">Indicateurs</h2>
              {isAdmin && <Icon name="settings" className="text-on-surface-variant cursor-pointer" />}
            </div>
            <div className="grid grid-cols-2 gap-sm mb-md">
              {metrics.data?.map((m) => (
                <div key={m.key} className="p-sm bg-card border border-outline-variant text-center">
                  <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                    {m.label}
                  </p>
                  <p className="font-label-md text-[32px] tabular-nums text-primary">
                    {formatMetric(m, "—")}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-label-sm">
                    {trendText(m)}
                    {deltaText(m) && ` · ${deltaText(m)}`}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-label-sm">
                    Mis à jour {timeAgo(m.updated_at)},{" "}
                    <time dateTime={m.updated_at}>{formatFullDate(m.updated_at)}</time>
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-label-sm">
                    Période : {metricPeriodLabel(m.period)}
                  </p>
                </div>
              ))}
              {metrics.data?.length === 0 && (
                <p className="col-span-2 text-body-sm italic text-on-surface-variant">
                  Aucun indicateur.
                </p>
              )}
            </div>
            <div className="mt-auto pt-md">
              <img
                src={PERF_IMAGE}
                 alt="Graphiques minimalistes à barres et à lignes dans un tableau de bord anthracite et blanc"
                loading="lazy"
                className="w-full h-24 object-cover border border-outline-variant"
              />
            </div>
          </section>
        </div>
      </main>
      <BlockerArchive open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      <NewsReader news={readingNews} onClose={() => setReadingNews(null)} />
      <SubmissionReader
        submission={reading}
        onClose={() => setReading(null)}
      />
      {submissionForm && (
        <Modal title="Soumettre une idée" onClose={() => setSubmissionForm(null)}>
          <form onSubmit={sendSubmission} className="space-y-sm" noValidate>
            <ErrorSummary errors={submissionErrors} />
            <Field label="Nom" error={submissionErrors.author_name}>
              <TextInput
                value={myFullName ?? submissionForm.author_name}
                readOnly={!!myFullName}
                maxLength={80}
                placeholder="Prénom et nom"
                onChange={(e) => setSubmissionForm({ ...submissionForm, author_name: e.target.value })}
              />
            </Field>
            {role === "manager" && (
              <Field label="Équipe" error={submissionErrors.team}>
                <WithFieldProps>
                  {(field) => (
                    <select
                      {...field}
                      required
                      value={submissionForm.team}
                      onChange={(e) => setSubmissionForm({ ...submissionForm, team: e.target.value })}
                      className="w-full border border-outline-variant bg-surface px-sm py-xs font-body-md"
                    >
                      <option value="">Choisis une de tes équipes</option>
                      {myTeams.data?.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  )}
                </WithFieldProps>
              </Field>
            )}
            {role === "admin" && (
              <p className="text-body-sm text-on-surface-variant">Équipe : Admin</p>
            )}
            <Field label="Idée" error={submissionErrors.content}>
              <TextArea
                rows={5}
                value={submissionForm.content}
                placeholder="Décris l'amélioration proposée pour le cabinet…"
                onChange={(e) => setSubmissionForm({ ...submissionForm, content: e.target.value })}
              />
              <CharCounter value={submissionForm.content} max={2000} min={5} />
            </Field>
            <Field label="Document PDF (optionnel, 20 Mo max)" error={submissionErrors.attachment}>
              <WithFieldProps>
                {(field) => (
                  <input
                    {...field}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="block w-full text-body-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.type !== "application/pdf") {
                        setSubmissionErrors({ ...submissionErrors, attachment: "Seuls les fichiers PDF sont acceptés." });
                        e.target.value = ""; setAttachment(null); return;
                      }
                      if (f && f.size > 20 * 1024 * 1024) {
                        setSubmissionErrors({ ...submissionErrors, attachment: "Le fichier dépasse 20 Mo." });
                        e.target.value = ""; setAttachment(null); return;
                      }
                      const { attachment: _a, ...rest } = submissionErrors;
                      setSubmissionErrors(rest);
                      setAttachment(f);
                    }}
                  />
                )}
              </WithFieldProps>
            </Field>
            <FormActions
              pending={submit.isPending}
              submitLabel="ENVOYER"
              onCancel={() => setSubmissionForm(null)}
            />
          </form>
        </Modal>
      )}
      {questionForm && (
        <Modal title="Poser une question" onClose={() => setQuestionForm(null)}>
          <form onSubmit={sendQuestion} className="space-y-sm" noValidate>
            <ErrorSummary errors={questionErrors} />
            <Field label="Direction concernée" error={questionErrors.team}>
              <Select
                value={questionForm.team}
                disabled={askableTeams.data?.length === 0}
                onChange={(e) => setQuestionForm({ ...questionForm, team: e.target.value })}
              >
                <option value="">Choisis une direction</option>
                {askableTeams.data?.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            {askableTeams.isError && (
              <p role="alert" className="text-body-sm text-error">
                La liste des directions n'a pas pu être chargée. Ferme la fenêtre et réessaie.
              </p>
            )}
            {askableTeams.data && askableTeams.data.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">
                Aucune direction ne peut recevoir ta question pour le moment.
              </p>
            )}
            <Field label="Ta question" error={questionErrors.body}>
              <TextArea
                rows={5}
                value={questionForm.body}
                placeholder="Pose ta question, nous te répondrons dans les meilleurs délais…"
                onChange={(e) => setQuestionForm({ ...questionForm, body: e.target.value })}
              />
              <CharCounter value={questionForm.body} max={QUESTION_MAX} />
            </Field>
            <p className="text-body-sm text-on-surface-variant">
              Tu retrouveras la réponse dans « Mes questions ». Aucune notification n'est envoyée.
            </p>
            <FormActions
              pending={ask.isPending}
              submitLabel="ENVOYER LA QUESTION"
              disabled={
                !questionForm.team ||
                questionForm.body.trim().length === 0 ||
                questionForm.body.trim().length > QUESTION_MAX
              }
              onCancel={() => setQuestionForm(null)}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}
