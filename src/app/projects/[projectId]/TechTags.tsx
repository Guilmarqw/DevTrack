"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { TechCategory, TechOrigin } from "@/generated/prisma/enums";
import {
  addTechTag,
  confirmTechTag,
  deleteTechTag,
  dismissTechTag,
  restoreTechTag,
  type TechActionState,
} from "./techActions";

export type Tag = {
  id: string;
  name: string;
  category: TechCategory;
  origin: TechOrigin;
  evidence: string | null;
  dismissedAt: Date | null;
};

const CATEGORY_LABEL: Record<TechCategory, string> = {
  FRONTEND: "Front end",
  BACKEND: "Back end",
  DATABASE: "Database",
  OTHER: "Other",
};

const ORDER: TechCategory[] = ["FRONTEND", "BACKEND", "DATABASE", "OTHER"];

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-line px-3 py-1.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {pending ? "Adding…" : "Add"}
    </button>
  );
}

function Chip({ tag, projectId }: { tag: Tag; projectId: string }) {
  const isSuggestion = tag.origin === "DETECTED";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-xs"
      title={tag.evidence ?? "Added by hand"}
    >
      <span>{tag.name}</span>

      {isSuggestion ? (
        <>
          {/* A guess is labelled as a guess. The evidence is in the title, so
              the reader can check why DevTrack thinks this. */}
          <span className="text-faint">guess</span>
          <form action={confirmTechTag.bind(null, projectId, tag.id)}>
            <button
              type="submit"
              title="Keep this tag"
              className="px-1 text-muted transition-colors hover:text-accent"
            >
              keep
            </button>
          </form>
          <form action={dismissTechTag.bind(null, projectId, tag.id)}>
            <button
              type="submit"
              title="Not part of this project"
              className="px-1 text-faint transition-colors hover:text-accent"
            >
              ×
            </button>
          </form>
        </>
      ) : (
        <form action={deleteTechTag.bind(null, projectId, tag.id)}>
          <button
            type="submit"
            title="Remove this tag"
            className="px-1 text-faint transition-colors hover:text-accent"
          >
            ×
          </button>
        </form>
      )}
    </span>
  );
}

export function TechTags({
  projectId,
  tags,
  dismissed,
}: {
  projectId: string;
  tags: Tag[];
  dismissed: Tag[];
}) {
  const [state, formAction] = useActionState<TechActionState, FormData>(
    addTechTag,
    { error: null },
  );

  const grouped = ORDER.map((category) => ({
    category,
    items: tags.filter((tag) => tag.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      {grouped.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-medium">No stack detected yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
            DevTrack reads package.json, requirements.txt, go.mod, Cargo.toml
            and composer.json, plus config files like next.config and
            Dockerfile. Upload a project with one of those, or add a tag by
            hand below.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-xs text-faint">
                {CATEGORY_LABEL[group.category]}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.items.map((tag) => (
                  <Chip key={tag.id} tag={tag} projectId={projectId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="mt-4 flex items-end gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="flex-1">
          <label htmlFor="techName" className="block text-xs font-medium text-muted">
            Add a technology
          </label>
          <input
            id="techName"
            name="name"
            required
            maxLength={191}
            placeholder="Redis"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm placeholder:text-faint focus:border-accent"
          />
        </div>
        <div>
          <label htmlFor="techCategory" className="block text-xs font-medium text-muted">
            Category
          </label>
          <select
            id="techCategory"
            name="category"
            defaultValue="OTHER"
            className="mt-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm focus:border-accent"
          >
            {ORDER.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABEL[category]}
              </option>
            ))}
          </select>
        </div>
        <AddButton />
      </form>

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-muted">
          {state.error}
        </p>
      )}

      {dismissed.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-faint">
            {dismissed.length} dismissed
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dismissed.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line py-1 pl-2.5 pr-1.5 text-xs text-muted"
                title={tag.evidence ?? undefined}
              >
                <span className="line-through">{tag.name}</span>
                <form action={restoreTechTag.bind(null, projectId, tag.id)}>
                  <button
                    type="submit"
                    className="px-1 text-faint transition-colors hover:text-accent"
                    title="Restore this tag"
                  >
                    restore
                  </button>
                </form>
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
