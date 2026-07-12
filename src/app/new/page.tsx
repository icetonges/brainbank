import { createNote } from "./actions";
import { startTextIngestion, startUrlIngestion } from "./ingest-actions";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import { IngestUploadWidget } from "@/components/ingest-upload-widget";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang = await getLang(langParam);
  const s = t(lang).newPage;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold text-fg">{s.title}</h1>
        <p className="mt-1 text-fg-secondary">
          {s.intro1}
          <code className="text-accent">[[Another Note&apos;s Title]]</code>
          {s.intro2}
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          {s.autoBuild}
        </h2>
        <form action={startUrlIngestion} className="flex gap-2">
          <input
            type="url"
            name="url"
            required
            placeholder={s.urlPlaceholder}
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"
          >
            {s.fetchBuild}
          </button>
        </form>
        <form action={startTextIngestion} className="flex flex-col gap-2">
          <textarea
            name="text"
            required
            minLength={20}
            rows={5}
            placeholder={s.textPlaceholder}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="self-start rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent hover:text-accent-fg"
          >
            {s.buildFromText}
          </button>
        </form>
        <IngestUploadWidget />
        <p className="text-xs text-fg-secondary">{s.pipelineHint}</p>
      </section>

      <AiAssistPanel />

      <form action={createNote} className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          {s.byHand}
        </h2>
        <Field label={s.fieldTitle} name="title" required />
        <Field label={s.fieldWhat} name="what" textarea />
        <Field label={s.fieldHow} name="how" textarea />
        <Field label={s.fieldWhy} name="why" textarea />
        <Field label={s.fieldOther} name="other" textarea />

        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:opacity-90 transition-opacity"
        >
          {s.createPage}
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
