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
