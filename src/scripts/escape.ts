// Every value from upstream or from storage that lands in an HTML string
// goes through escapeHtml, so a name like `<img onerror>` shows as text.

/** `text` with the five HTML metacharacters as entities; null, undefined
 * and the empty string give "". Safe in text and in quoted attributes. */
export function escapeHtml(text: unknown): string {
  if (text == null || text === "") return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
