/**
 * Builds a self-contained "dark replica" of an uploaded HTML file: every
 * bit of the original markup, structure, layout, AND behavior survives
 * untouched — including inline/embedded <script>, which many of these
 * uploaded files turn out to need (interactive diagrams, tabbed
 * traversals, anything that draws into the DOM at runtime rather than
 * being static markup) — but the whole page is forced dark by inverting
 * its rendered colors — the same trick browser "force dark" extensions
 * (Dark Reader et al.) use — and media elements get a compensating
 * re-invert so photos/video still look roughly natural instead of coming
 * out as photo negatives.
 *
 * This deliberately does NOT try to parse or understand the source page's
 * own CSS (no light/dark variables to detect, no stylesheet to rewrite) —
 * it works purely at the paint level, after all of the original CSS has
 * already been resolved, so it's robust against arbitrary, uncooperative
 * HTML uploaded by the user. That's the point: we don't control what
 * shape the uploaded file takes.
 *
 * Shared by the classroom and diary composers (see handleHtmlFile in
 * classroom-composer.tsx / diary-composer.tsx) — both read the uploaded
 * File's text client-side, run it through this, then upload the result
 * in place of the original so the stored/served copy is already dark.
 *
 * Scripts are intentionally left in place, not stripped — see the `img`
 * override in markdown.tsx for how the replica is rendered (a sandboxed
 * `<iframe sandbox="allow-scripts">`, no `allow-same-origin`) and why
 * that's the actual safety boundary rather than anything done here.
 *
 * Only <img>/<video>/<picture> get the compensating re-invert. Earlier
 * this list also included canvas/svg/iframe/embed/object, on the theory
 * that any "media" element should look natural rather than like a photo
 * negative — but once scripts run (see the fix above), a JS-driven
 * diagram that draws itself into a <canvas> or inline <svg> counts as
 * "media" too, and re-inverting it exactly cancels the outer html-level
 * invert: the diagram comes back out in its original light colors,
 * white background and all, while the rest of the page stays dark. That
 * was reported directly — a replicated interactive graph rendering with
 * a white background and dark text despite the dark-mode CSS being
 * injected. canvas/svg are how these uploaded cheatsheets/diagrams
 * actually draw their content, not how photos get embedded, so they
 * belong with the rest of the page (inverted), not with img/video.
 */
export function buildDarkModeHtmlReplica(html: string): string {
  const darkStyle =
    '<style id="__brainbank_force_dark">' +
    "html{background:#fff !important;filter:invert(1) hue-rotate(180deg) !important;}" +
    "img,video,picture{filter:invert(1) hue-rotate(180deg) !important;}" +
    "</style>";

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${darkStyle}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${darkStyle}</head>`);
  }
  // No <html>/<head> at all — a bare fragment. Wrap it in a minimal shell
  // so the <style> tag has somewhere valid to live.
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${darkStyle}</head><body>${html}</body></html>`;
}

/** File extensions this feature accepts, and the matching test — shared so
 * the composers and the <input accept> attribute stay in sync. */
export const HTML_REPLICA_EXTENSIONS = /\.html?$/i;

export function isHtmlReplicaFile(file: File): boolean {
  return HTML_REPLICA_EXTENSIONS.test(file.name) || file.type === "text/html";
}

/** True for a markdown image `src` that points at a replicated HTML file
 * (query/hash-safe) — used by the <Markdown> renderer to decide whether
 * to render an <iframe> instead of an <img>. */
export function isHtmlReplicaSrc(src: string): boolean {
  return /\.html?(?:[?#]|$)/i.test(src);
}
