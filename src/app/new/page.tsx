import { createNote } from "./actions";
import { AiAssistPanel } from "@/components/ai-assist-panel";

export default function NewNotePage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">New knowledge</h1>
        <p className="mt-1 text-fg-secondary">
          Manual entry today; pasting a URL, video link, or uploading a
          document to auto-build this page arrives in a later phase (PLAN.md
          §5).
        </p>
      </div>

      <AiAssistPanel />

      <form action={createNote} className="flex flex-col gap-5">
        <Field label="Title" name="title" required />
        <Field label="What (the concept or fact)" name="what" textarea />
        <Field label="How (mechanism / steps to apply it)" name="how" textarea />
        <Field label="Why (context / reasoning)" name="why" textarea />
        <Field label="Other (sources, open questions)" name="other" textarea />

        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
        >
          Create page
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  textarea,
}: {
  label: string;
  name: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const className =
    "rounded-md border border-border bg-bg-elevated px-3 py-2 text-fg outline-none focus:border-accent";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      {textarea ? (
        <textarea id={name} name={name} rows={3} className={className} />
      ) : (
        <input id={name} name={name} required={required} className={className} />
      )}
    </div>
  );
}
