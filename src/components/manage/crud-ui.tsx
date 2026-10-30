import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import type { FieldErrors } from "@/lib/manage-schemas";

export function ManageIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

const inputBase =
  "w-full bg-card border border-outline-variant focus:border-primary p-sm font-body-md text-on-surface";

/** Identifiants du champ courant : relie le libellé et le message d'erreur au contrôle. */
const FieldContext = createContext<{ id: string; errorId?: string } | null>(null);

/** Attributs à poser sur le contrôle d'un Field (id, aria-describedby, aria-invalid). */
export function useFieldProps() {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.id,
    "aria-describedby": field.errorId,
    "aria-invalid": field.errorId ? true : undefined,
  };
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <FieldContext.Provider value={{ id, errorId: error ? errorId : undefined }}>
      <div className="space-y-xs">
        <label htmlFor={id} className="font-label-sm text-label-sm text-on-surface-variant uppercase block">
          {label}
        </label>
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-body-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldProps();
  return (
    <input
      {...field}
      {...props}
      className={`${inputBase} read-only:bg-surface-container read-only:cursor-default ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldProps();
  return <textarea {...field} {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldProps();
  return <select {...field} {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  FIELD_SELECTOR,
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Fenêtres ouvertes, la dernière est au premier plan : seule elle réagit au clavier. */
const openDialogs: HTMLElement[] = [];

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(dialog);

    const firstField = focusableIn(dialog).find((el) => el.matches(FIELD_SELECTOR));
    (firstField ?? closeRef.current)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (!dialog || openDialogs[openDialogs.length - 1] !== dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableIn(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-sm md:p-lg">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl bg-surface-container-lowest border border-outline p-md space-y-md"
      >
        <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
          <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="text-on-surface-variant hover:text-primary"
          >
            <ManageIcon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormActions({
  pending,
  onCancel,
  submitLabel = "ENREGISTRER",
  disabled,
}: {
  pending?: boolean;
  onCancel: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-xs pt-sm">
      <button
        type="button"
        onClick={onCancel}
        className="px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container"
      >
        ANNULER
      </button>
      <button
        type="submit"
        disabled={pending || disabled}
        className="px-lg py-xs bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50"
      >
        {pending ? "…" : submitLabel}
      </button>
    </div>
  );
}

export function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const count = Object.keys(errors).length;
  if (!count) return null;
  return (
    <div role="alert" className="text-body-sm text-error border border-error/40 bg-error-container/30 p-sm wrap-anywhere">
      <p>{count} champ{count > 1 ? "s" : ""} à corriger avant l'enregistrement.</p>
      <ul className="mt-xs list-disc pl-md">
        {Object.entries(errors).map(([k, m]) => (
          <li key={k}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

export function RowActions({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="flex gap-xs shrink-0">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="px-sm py-1 border border-outline text-primary font-label-sm text-label-sm hover:bg-surface-container"
        >
          MODIFIER
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="px-sm py-1 border border-error text-error font-label-sm text-label-sm hover:bg-error-container disabled:opacity-50"
      >
        SUPPRIMER
      </button>
    </div>
  );
}

export function ConfirmDelete({
  label,
  onCancel,
  onConfirm,
  pending,
}: {
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Modal title="Confirmer la suppression" onClose={onCancel}>
      <p className="font-body-md text-on-surface">
        Supprimer définitivement <strong className="text-primary">{label}</strong> ? Cette action est
        irréversible.
      </p>
      <div className="flex justify-end gap-xs pt-sm">
        <button
          type="button"
          onClick={onCancel}
          className="px-md py-xs border border-outline text-primary font-label-md text-label-md hover:bg-surface-container"
        >
          ANNULER
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="px-lg py-xs bg-error text-on-error font-label-md text-label-md disabled:opacity-50"
        >
          {pending ? "SUPPRESSION…" : "SUPPRIMER"}
        </button>
      </div>
    </Modal>
  );
}
