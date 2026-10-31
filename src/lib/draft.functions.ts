import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// O1 : « Proposer un brouillon ». La fonction tourne côté serveur : l'adresse du
// scénario Make reste dans la variable d'environnement MAKE_WEBHOOK_URL et n'est
// jamais envoyée au navigateur. Seul le texte de l'idée part vers Make et OpenAI :
// ni le nom, ni l'e-mail, ni l'équipe de l'auteur (CA-O1-3).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPLY = 500;
const MAKE_TIMEOUT_MS = 25_000;

export type DraftResult = { ok: true; draft: string } | { ok: false };

function fitReply(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_REPLY) return t;
  const cut = t.slice(0, MAX_REPLY);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return end > 0 ? cut.slice(0, end + 1) : cut;
}

export const proposeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { submissionId: string }) => {
    if (!data || typeof data.submissionId !== "string" || !UUID.test(data.submissionId)) {
      throw new Error("Identifiant d'idée invalide");
    }
    return { submissionId: data.submissionId };
  })
  .handler(async ({ data, context }): Promise<DraftResult> => {
    try {
      const url = process.env["MAKE_WEBHOOK_URL"];
      if (!url) {
        console.error("[O1] MAKE_WEBHOOK_URL absente");
        return { ok: false };
      }

      // Seuls un manager ou un admin peuvent demander un brouillon.
      const email = typeof context.claims.email === "string" ? context.claims.email.toLowerCase() : "";
      const { data: user } = await context.supabase
        .from("allowed_users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!user) return { ok: false };
      const { data: roleRow } = await context.supabase
        .from("allowed_user_roles")
        .select("role")
        .eq("allowed_user_id", user.id)
        .maybeSingle();
      if (roleRow?.role !== "manager" && roleRow?.role !== "admin") return { ok: false };

      // Le texte est lu avec le jeton de l'utilisateur : la RLS limite aux idées qu'il peut voir.
      const { data: idea } = await context.supabase
        .from("submissions")
        .select("content, status")
        .eq("id", data.submissionId)
        .maybeSingle();
      if (!idea || idea.status !== "en attente" || !idea.content?.trim()) return { ok: false };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ idea_text: idea.content }),
        signal: AbortSignal.timeout(MAKE_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`[O1] Make a répondu ${res.status}`);
        return { ok: false };
      }
      const json = (await res.json()) as { draft?: unknown };
      if (typeof json.draft !== "string" || !json.draft.trim()) return { ok: false };
      return { ok: true, draft: fitReply(json.draft) };
    } catch (e) {
      console.error("[O1] échec du brouillon", e instanceof Error ? e.name : "erreur");
      return { ok: false };
    }
  });
