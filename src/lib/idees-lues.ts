import type { Submission, SubmissionResponse } from "@/lib/dashboard";

/**
 * Signal « Nouveau » pour l'auteur d'une idée traitée (état dans le navigateur, sans base de données).
 * Clé propre à l'utilisateur : liste des identifiants d'idées dont la réponse a déjà été affichée.
 */
function storageKey(userId: string) {
  return `hp_lu_${userId}`;
}

export function readSeenIdeas(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function markIdeasSeen(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  try {
    const seen = readSeenIdeas(userId);
    ids.forEach((id) => seen.add(id));
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...seen]));
  } catch {
    // localStorage indisponible : la pastille restera affichée, sans autre effet.
  }
}

/** Idées traitées dont la réponse est visible par l'auteur (réponse enregistrée ou motif de refus). */
export function answeredIdeaIds(
  submissions: Submission[],
  responses: SubmissionResponse[] | undefined,
): string[] {
  return submissions
    .filter((s) =>
      s.status === "validée"
        ? !!responses?.some((r) => r.submission_id === s.id)
        : s.status === "refusée" && !!s.rejection_category,
    )
    .map((s) => s.id);
}
