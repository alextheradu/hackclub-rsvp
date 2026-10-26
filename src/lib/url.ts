const MAX_LENGTH = 2048;

export type UrlResult = { ok: true; url: string | null } | { ok: false };

export function parseOptionalHttpUrl(value: string): UrlResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, url: null };
  if (trimmed.length > MAX_LENGTH) return { ok: false };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false };
  }
}
