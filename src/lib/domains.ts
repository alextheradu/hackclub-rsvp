import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";
import { rootDomain } from "@/lib/domain";

export type CustomHostResult =
  | { ok: true; host: string }
  | { ok: false; reason: "apex" | "ip" | "reserved" | "format" };

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME = new RegExp(`^(?=.{1,253}$)${LABEL}(?:\\.${LABEL})+$`);

// Organizers CNAME a subdomain they own to domains.<root>. Apex domains can't
// CNAME, IPs and our own hosts must never be attached, and the host must sit
// under a real public suffix so Cloudflare can issue a certificate.
export function validateCustomHost(
  raw: string,
  root: string = rootDomain(),
): CustomHostResult {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");
  if (isIP(trimmed.replace(/^\[(.*)\]$/, "$1"))) {
    return { ok: false, reason: "ip" };
  }

  // domainToASCII silently truncates at "/", so allow only hostname characters
  // (plus non-ASCII for IDNs) before converting.
  if (!trimmed || /[^a-z0-9.\-\u0080-￿]/.test(trimmed)) {
    return { ok: false, reason: "format" };
  }
  const host = domainToASCII(trimmed);
  if (!host || !HOSTNAME.test(host)) return { ok: false, reason: "format" };
  if (host === root || host.endsWith(`.${root}`)) {
    return { ok: false, reason: "reserved" };
  }

  const parsed = parse(host);
  if (!parsed.isIcann || !parsed.domain || parsed.hostname !== host) {
    return { ok: false, reason: "format" };
  }
  if (!parsed.subdomain) return { ok: false, reason: "apex" };
  return { ok: true, host };
}
