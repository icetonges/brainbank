import Link from "next/link";
import type { TocSubcategory } from "@/lib/classroom/toc";
import type { Lang } from "@/lib/i18n";
import { sectionTone, NEUTRAL_TONE } from "@/lib/classroom/section-tones";

/**
 * Persistent "jump to any article" nav for classroom article pages — every
 * subcategory (classroom_subcategories), each broken into its sections in
 * order with a trailing catch-all, same grouping as the homepage's
 * "Browse by Category" preview and the subcategory's own landing page
 * (/[subcategorySlug]), just uncapped: a nav you can't actually reach
 * every article from isn't much of a nav.
 *
 * Pure HTML <details>/<summary> disclosure — no client JS needed. The
 * current article's own subcategory opens by default via the `open`
 * attribute; every other one starts collapsed so the list stays scannable
 * instead of dumping every article on the site into view at once.
 */
export function ClassroomSideNav({
  toc,
  currentSlug,
  currentSubcategoryId,
  lang,
  moreLabel,
}: {
  toc: TocSubcategory[];
  currentSlug: string;
  currentSubcategoryId: number | null;
  lang: Lang;
  moreLabel: string;
}) {
  if (toc.length === 0) return null;

  return (
    <nav className="flex flex-col gap-0.5 text-sm" aria-label="Classroom articles">
      {toc.map((sc) => (
        <details key={sc.id} open={sc.id === currentSubcategoryId} className="group">
          <summary className="flex list-none items-center gap-1.5 rounded-md px-2 py-1.5 font-semibold text-fg [&::-webkit-details-marker]:hidden cursor-pointer hover:text-accent">
            <ChevronIcon className="h-3 w-3 shrink-0 text-fg-secondary transition-transform group-open:rotate-90" />
            <span className="truncate">{sc.name}</span>
          </summary>
          <div className="ml-2 flex flex-col gap-2 border-l border-border py-1 pb-3 pl-3">
            {sc.sections.map((sec, i) => {
              const tone = sectionTone(i);
              return (
                <div key={sec.id} className="flex flex-col gap-0.5">
                  <p className={`flex items-center gap-1.5 truncate px-2 text-xs font-medium uppercase tracking-wide ${tone.text}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                    <span className="truncate">{sec.name}</span>
                  </p>
                  {sec.articles.map((a) => (
                    <ArticleLink key={a.slug} slug={a.slug} title={a.title} currentSlug={currentSlug} lang={lang} />
                  ))}
                </div>
              );
            })}
            {sc.unsectioned.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {sc.sections.length > 0 && (
                  <p className={`flex items-center gap-1.5 truncate px-2 text-xs font-medium uppercase tracking-wide ${NEUTRAL_TONE.text}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${NEUTRAL_TONE.dot}`} aria-hidden="true" />
                    <span className="truncate">{moreLabel}</span>
                  </p>
                )}
                {sc.unsectioned.map((a) => (
                  <ArticleLink key={a.slug} slug={a.slug} title={a.title} currentSlug={currentSlug} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </nav>
  );
}

function ArticleLink({
  slug,
  title,
  currentSlug,
  lang,
}: {
  slug: string;
  title: string;
  currentSlug: string;
  lang: Lang;
}) {
  const isCurrent = slug === currentSlug;
  return (
    <Link
      href={`/classroom/${slug}?lang=${lang}`}
      aria-current={isCurrent ? "page" : undefined}
      className={`truncate rounded-md px-2 py-1 transition-colors ${
        isCurrent
          ? "bg-accent/15 font-medium text-accent"
          : "text-fg-secondary hover:bg-bg hover:text-accent"
      }`}
    >
      {title}
    </Link>
  );
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
