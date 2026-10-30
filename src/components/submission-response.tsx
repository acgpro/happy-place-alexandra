import { Linkify } from "@/components/linkify";
import { formatExactDate } from "@/components/expandable-card";
import type { SubmissionResponse } from "@/lib/dashboard";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  collaborateur: "Collaborateur",
};

const VISIBILITY_LABELS: Record<string, string> = {
  auteur: "Visible par l'auteur seulement",
  entreprise: "Visible par toute l'entreprise",
};

/** Réponse du valideur à l'auteur, telle que renvoyée par la base. */
export function ResponseBlock({ response: r, className = "" }: { response: SubmissionResponse; className?: string }) {
  const firstName = r.responded_by_name.trim().split(/\s+/)[0];
  return (
    <div className={`p-xs bg-surface-container text-on-surface text-body-sm wrap-anywhere ${className}`}>
      <p className="font-bold">
        Réponse de {firstName}, {ROLE_LABELS[r.responded_by_role] ?? r.responded_by_role}, le{" "}
        {formatExactDate(r.responded_at)}
      </p>
      <p className="whitespace-pre-line">
        <Linkify text={r.body} />
      </p>
      <p className="text-on-surface-variant">{VISIBILITY_LABELS[r.visibility] ?? r.visibility}</p>
    </div>
  );
}
