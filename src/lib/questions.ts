import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { db } from "@/lib/dashboard";

/** F5 : poser une question à une direction (équipe de `teams` ayant au moins un autre manager que l'auteur). */
export const QUESTION_MAX = 500;

export type Question = Database["public"]["Tables"]["questions"]["Row"];

export const questionSchema = z.object({
  team: z.string().trim().min(1, "Choisis une direction"),
  body: z
    .string()
    .trim()
    .min(1, "Écris ta question")
    .superRefine((v, ctx) => {
      if (v.length > QUESTION_MAX)
        ctx.addIssue({
          code: "custom",
          message: `Ta question dépasse ${QUESTION_MAX} caractères (${v.length.toLocaleString("fr-FR")} saisis). Raccourcis-la avant d'envoyer.`,
        });
    }),
});

export type QuestionInput = z.infer<typeof questionSchema>;

/** Directions proposées dans la fenêtre « Poser une question » (fonction `askable_teams`, CA-F5-3). */
export async function fetchAskableTeams(): Promise<string[]> {
  const { data, error } = await db.rpc("askable_teams");
  if (error) throw error;
  return data ?? [];
}

export async function askQuestion(input: QuestionInput) {
  const { error } = await db.from("questions").insert({
    team: input.team,
    body: input.body,
    // Valeurs provisoires, remplacées par le déclencheur set_question_author.
    asked_by_email: "",
    asked_by_name: "",
  });
  if (error) throw error;
}

/** Message affiché à l'utilisateur pour une erreur de la base sur une question. */
export function questionErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = (e as Error)?.message ?? String(e);
  if (code === "42501") return "Cette direction ne peut pas recevoir ta question.";
  if (msg.includes("questions_body_check")) return `La question doit faire entre 1 et ${QUESTION_MAX} caractères.`;
  return msg;
}

/** « Mes questions » (CA-F5-4, CA-F5-9) : le filtre sur l'auteur est nécessaire, car un manager lit aussi les questions de ses directions. */
export async function fetchMyQuestions(email: string): Promise<Question[]> {
  const { data, error } = await db
    .from("questions")
    .select("*")
    .eq("asked_by_email", email.toLowerCase())
    .order("asked_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Suppression d'une question en attente par son auteur (CA-F5-10). La base refuse une question déjà répondue. */
export async function deleteQuestion(id: string) {
  const { data, error } = await db.from("questions").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Cette question a déjà reçu une réponse : elle ne peut plus être supprimée.");
}

/** Questions à traiter (manager : ses directions ; admin : en attente, lecture seule). Les questions de l'utilisateur sont exclues : il les retrouve dans « Mes questions ». */
export async function fetchTeamQuestions(email: string): Promise<Question[]> {
  const { data, error } = await db
    .from("questions")
    .select("*")
    .neq("asked_by_email", email.toLowerCase())
    .order("asked_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const answerSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Écris ta réponse")
    .superRefine((v, ctx) => {
      if (v.length > QUESTION_MAX)
        ctx.addIssue({
          code: "custom",
          message: `Ta réponse dépasse ${QUESTION_MAX} caractères (${v.length.toLocaleString("fr-FR")} saisis). Raccourcis-la avant d'envoyer.`,
        });
    }),
});

export async function answerQuestion(id: string, body: string) {
  const { error } = await db.rpc("answer_question", { _question_id: id, _body: body });
  if (error) throw error;
}

/** Message affiché pour une erreur de la fonction `answer_question` (CA-F5-8). */
export function answerErrorMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (msg.includes("Question déjà répondue"))
    return "Question déjà répondue par un autre manager de la direction. Ta réponse n'a pas été enregistrée.";
  if (msg.includes("propre question")) return "Tu ne peux pas répondre à ta propre question.";
  if (msg.includes("réservée aux managers")) return "Seuls les managers de la direction peuvent répondre.";
  if (msg.includes("introuvable")) return "Cette question n'existe plus.";
  if (msg.includes("1 à 500")) return `La réponse doit faire entre 1 et ${QUESTION_MAX} caractères.`;
  return msg;
}

/** Managers de chaque direction, pour l'admin (écran 10) : prénoms par direction. */
export async function fetchManagersByTeam(): Promise<Record<string, string[]>> {
  const { data, error } = await db
    .from("manager_teams")
    .select("team, allowed_users!inner(first_name, last_name, email)");
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const r of data ?? []) {
    const u = r.allowed_users as { first_name: string | null; last_name: string | null; email: string };
    const name = (u.first_name ?? "").trim() || u.email.split("@")[0];
    (map[r.team] ??= []).push(name);
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => a.localeCompare(b, "fr"));
  return map;
}

/** « GONTRAN, OPÉRATIONS » : auteur et direction d'origine (vide si inconnue). */
export function authorLabel(q: Pick<Question, "asked_by_name" | "asked_by_team">): string {
  return q.asked_by_team ? `${q.asked_by_name}, ${q.asked_by_team}` : q.asked_by_name;
}
