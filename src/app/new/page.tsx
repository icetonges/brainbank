import { createNote } from "./actions";
import { startTextIngestion, startUrlIngestion } from "./ingest-actions";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import { IngestUploadWidget } from "@/components/ingest-upload-widget";

export default function NewNotePage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-fg">New knowledge</h1>
        <p className="mt-1 text-fg-secondary">
          Auto-build a page from a link or document, or write one by hand
          below. Write{" "}
          <code className="text-accent">[[Another Note&apos;s Title]]</code>{" "}
          anywhere to link it in the graph.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          Auto-build from a source
        </h2>
        <form action={startUrlIngestion} className="flex gap-2">
          <input
            type="url"
            name="url"
            required
            placeholder="Paste a URL or YouTube link…"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            Fetch &amp; build
          </button>
        </form>
        <form action={startTextIngestion} className="flex flex-col gap-2">
          <textarea
            name="text"
            required
            minLength={20}
            rows={5}
            placeholder="Paste an article, transcript, learning note, or Chinese text…"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="self-start rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-accent-fg"
          >
            Build page from text
          </button>
        </form>
        <IngestUploadWidget />
        <p className="text-xs text-fg-secondary">
          Fetches/parses the source, then an AI pass drafts the
          what/how/why/other page and suggests tags. Runs as a background
          job — the note shows a &quot;processing&quot; state until it&apos;s
          done.
        </p>
      </section>

      <AiAssistPanel />

      <form action={createNote} className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          Or write one by hand
        </h2>
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
