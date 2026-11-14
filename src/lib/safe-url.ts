/**
 * Links the user stores (payment pages) are rendered as clickable hrefs, so
 * only http and https are allowed through. `javascript:`, `data:`, `vbscript:`
 * and anything else would run or render in the app's own origin.
 *
 * Checked on the way in (forms, import) and again on the way out, so a value
 * stored before the check existed can never become a live link.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text || text.length > 2048) return null;
  // Control characters and whitespace inside a URL are a smuggling trick.
  if (/[\u0000-\u001f\u007f\s]/.test(text)) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url.toString();
}
