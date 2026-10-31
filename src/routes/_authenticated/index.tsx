import { createFileRoute, Link } from "@tanstack/react-router";
import { signOut } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { proposeDraft } from "@/lib/draft.functions";
import { ErrorSummary, Field, FormActions, Modal, Select, TextArea, TextInput, useFieldProps } from "@/components/manage/crud-ui";
import { rejectionSchema, responseSchema, submissionSchema, validate, type FieldErrors } from "@/lib/manage-schemas";
import { QUESTION_MAX, askQuestion, fetchAskableTeams, questionErrorMessage, questionSchema } from "@/lib/questions";
import { BrandHeader } from "@/components/brand-header";
import { AttachmentLink } from "@/components/attachment-link";
import { CharCounter, SubmissionPreview, formatExactDate, rejectionErrorMessage } from "@/components/expandable-card";
import { Linkify } from "@/components/linkify";
import { SubmissionReader } from "@/components/submission-reader";
import { TeamQuestions } from "@/components/team-questions";
import { ResponseBlock } from "@/components/submission-response";
import { NewsReader } from "@/components/news-reader";
import { DepartureNotices } from "@/components/departure-notices";
import { NewsImage, NewsLinks, NewsMediaEditor } from "@/components/news-media";
import { emptyMedia, linkErrors, mediaFromNews, toNewsLinks, type MediaDraft } from "@/lib/news-media";
import { BlockerArchive, ValidatedSubmissions } from "@/components/dashboard-extras";
import { Button } from "@/components/ui/button";
import {
  fetchBlockers,
  fetchMetrics,
  deltaText,
  fetchNews,
  fetchSubmissions,
  fetchMySubmissions,
  fetchMyFullName,
  fetchResponses,
  exportMyRecentSubmissions,
  REJECTION_CATEGORIES,
  type News,
  type ResponseVisibility,
  type Submission,
  saveDraftNews,
  publishDraftNews,
  deleteDraftNews,
  reviewSubmission,
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

/** Liste des motifs de refus, reliée à son libellé et à son message d'erreur. */
function RejectionCategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
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
  const canWriteNews = canReview;
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
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [reading, setReading] = useState<Submission | null>(null);
  const [readingNews, setReadingNews] = useState<News | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [rejectForm, setRejectForm] = useState({ rejection_category: "", rejection_note: "" });
  const [rejectErrors, setRejectErrors] = useState<FieldErrors>({});
  const [validating, setValidating] = useState<Submission | null>(null);
  const [responseForm, setResponseForm] = useState<{ body: string; visibility: ResponseVisibility }>({
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

  const news =useQuery({ queryKey: ["news"], queryFn: fetchNews, retry: false });
  const submissions = useQuery({
    queryKey: ["submissions"],
    queryFn: fetchSubmissions,
    retry: false,
  });
  const mine = useQuery({
    queryKey: ["submissions", "mine", email],
    queryFn: () => fetchMySubmissions(email ?? ""),
    enabled: !!email,
    retry: false,
  });
  const myIds = mine.data?.map((s) => s.id) ?? [];
  const myResponses = useQuery({
    queryKey: ["responses", myIds],
    queryFn: () => fetchResponses(myIds),
    enabled: myIds.length > 0,
    retry: false,
  });
  // Admin : rôle des auteurs affichés, pour ne proposer que les idées de managers et d'admins.
  const authorEmails = [
    ...new Set((submissions.data ?? []).map((s) => (s.submitted_by_email ?? "").toLowerCase()).filter(Boolean)),
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
      return new Map((data ?? []).map((u) => [u.email.toLowerCase(), u.allowed_user_roles?.role ?? "collaborateur"]));
    },
  });
  /** Boutons VALIDER / REFUSER : personne ne traite sa propre idée ; l'admin traite celles des managers et des admins. */
  function canActOn(s: Submission) {
    const author = (s.submitted_by_email ?? "").toLowerCase();
    if (!canReview || !author || author === myEmail) return false;
    if (!isAdmin) return true;
    const authorRole = authorRoles.data?.get(author);
    return authorRole === "manager" || authorRole === "admin";
  }
  const myNameQuery = useQuery({
    queryKey: ["allowed_users", "me", email],
    queryFn: () => fetchMyFullName(email ?? ""),
    enabled: !!email,
    retry: false,
  });
  // Nom lu dans la base : le champ « Nom » est alors en lecture seule.
  const myFullName = myNameQuery.data ?? null;
  // File de validation : jamais ses propres idées.
  const pendingForMe = (submissions.data ?? []).filter(
    (s) => !myEmail || (s.submitted_by_email ?? "").toLowerCase() !== myEmail,
  );
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

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col">
      <BrandHeader />
      <main className="flex-grow w-full max-w-interface mx-auto p-sm md:p-md space-y-md">
        {email && <DepartureNotices email={email} />}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm mb-lg">
          <div className="space-y-sm">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
              Vue d'ensemble
            </p>
            <h1 className="font-headline-lg text-headline-lg text-primary">Happy Place</h1>
            <div className="flex flex-wrap gap-xs">
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
              <button
                type="button"
                onClick={() => {
                  setQuestionErrors({});
                  setQuestionForm({ team: "", body: "" });
                }}
                className="flex items-center gap-xs px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container transition-all"
              >
                <Icon name="help" /> POSER UNE QUESTION
              </button>
              <Link
                to="/questions"
                className="flex items-center gap-xs px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container transition-all"
              >
                <Icon name="chat" /> MES QUESTIONS
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-xs items-center md:items-end md:justify-end">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {email} · {roleLabel}
            </span>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-xs px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container"
            >
              <Icon name="logout" /> DÉCONNEXION
            </button>
            {isAdmin && (<Link
              to="/manage/news"
              className="flex items-center gap-xs px-md py-xs border border-outline bg-surface text-primary font-label-md text-label-md hover:bg-surface-container transition-all"
            >
              <Icon name="database" /> GÉRER LES DONNÉES
            </Link>)}
            <Button
              type="button"
              variant="outline"
              disabled={exportReport.isPending}
              onClick={() => exportReport.mutate()}
              className="h-auto rounded-none border-outline bg-surface px-md py-xs font-label-md text-label-md text-primary shadow-none hover:bg-surface-container"
            >
              <Icon name="file_download" /> {exportReport.isPending ? "EXPORT EN COURS…" : "EXPORTER LE RAPPORT"}
            </Button>
          </div>
        </div>

        <div className="bento-grid">
          {/* News Management & Input */}
          <section className={`col-span-12 ${canReview ? "lg:col-span-8" : "lg:col-span-12"} bg-surface-container-lowest border border-outline-variant p-md flex flex-col gap-md`}>
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
              <h2 className="font-headline-sm text-headline-sm text-primary">
                Actualités du cabinet
              </h2>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {drafts} brouillon{drafts > 1 ? "s" : ""} en attente
              </span>
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
            <div className="mt-md pt-md border-t border-outline-variant">
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
                    {isAdmin && <Icon name="edit" className="text-on-surface-variant" />}
                    </div>
                    <NewsLinks links={n.links} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Pending Submissions */}
          {canReview && <section className="col-span-12 lg:col-span-4 min-w-0 bg-surface-container-lowest border border-outline-variant p-md flex flex-col">
            <div className="flex items-center justify-between border-b border-outline-variant pb-sm mb-md">
              <h2 className="font-headline-sm text-headline-sm text-primary">
                Idées en attente
              </h2>
              <div className="bg-tertiary-fixed text-on-tertiary-fixed px-xs py-1 rounded-full font-label-sm text-label-sm">
                {pendingForMe.length} NOUVELLES
              </div>
            </div>
            <div className="space-y-sm flex-grow min-w-0">
              {submissions.isError && (
                <p className="text-body-sm text-error">
                  Les idées sont indisponibles.
                </p>
              )}
              {submissions.data && pendingForMe.length === 0 && (
                <p className="text-body-sm text-on-surface-variant italic">
                  Aucune idée en attente.
                </p>
              )}
              {pendingForMe.map((s) => (
                <div
                  key={s.id}
                  className="p-sm border border-outline-variant bg-card space-y-sm min-w-0 overflow-hidden"
                >
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-full bg-secondary-fixed flex items-center justify-center">
                      <Icon name="person" className="text-sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-body-sm text-primary font-bold wrap-anywhere">{s.author_name}</p>
                      <p className="text-[10px] text-on-surface-variant font-label-sm wrap-anywhere">{s.team}</p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-label-sm whitespace-nowrap">
                      {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <SubmissionPreview content={s.content} onOpen={() => setReading(s)} />
                  <AttachmentLink path={s.attachment_path} name={s.attachment_name} />
                  {canActOn(s) && <div className="flex gap-xs pt-xs">
                    <button
                      onClick={() => startReject(s)}
                      className="flex-1 py-1 border border-outline text-primary font-label-sm text-label-sm hover:bg-surface-container transition-colors"
                    >
                      REFUSER
                    </button>
                    <button
                      onClick={() => startValidate(s)}
                      className="flex-1 py-1 bg-primary text-on-primary font-label-sm text-label-sm hover:opacity-90 transition-colors"
                    >
                      VALIDER
                    </button>
                  </div>}
                </div>
              ))}
            </div>
          </section>}

          {/* F5 : questions des collaborateurs (manager : répondre ; admin : lecture seule) */}
          {(role === "manager" || isAdmin) && email && (
            <TeamQuestions role={isAdmin ? "admin" : "manager"} email={email} />
          )}

          {/* Mes soumissions */}
          {mine.data && mine.data.length > 0 && (
            <section className="col-span-12 min-w-0 bg-surface-container-lowest border border-outline-variant p-md">
              <h2 className="font-headline-sm text-headline-sm text-primary border-b border-outline-variant pb-sm mb-md">
                Mes idées
              </h2>
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
                        <p className="whitespace-pre-line">Raison : <Linkify text={s.rejection_note ?? ""} /></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

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
        onReject={reading && canActOn(reading) && reading.status === "en attente" ? () => startReject(reading) : undefined}
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
            <p className="max-h-48 overflow-y-auto border border-outline-variant bg-surface-container-low p-xs text-body-sm italic text-on-surface-variant whitespace-pre-line wrap-anywhere">“{rejecting.content}”</p>
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
