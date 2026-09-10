/**
 * Stamps the saved theme on <html> before first paint.
 *
 * It has to be a blocking inline script: applying the choice after hydration
 * would flash the light palette at anyone who picked dark. Because this
 * changes an attribute React also hydrates, the <html> element carries
 * suppressHydrationWarning — that attribute mismatch is expected and correct,
 * not a bug to chase.
 */
export function BootScript() {
  const script = `
(function () {
  try {
    var theme = localStorage.getItem("devtrack-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch (e) {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
