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

/** `url` when it is an absolute http(s) URL, else null: an upstream image
 * or link URL goes through this before it lands in `src` or `href`. */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
