// Runs before hydration to avoid a flash of the wrong theme. Dark is the
// default; we only ever need to *add* the `.light` class when the visitor
// previously chose light mode.
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.classList.add("light");
    }
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
