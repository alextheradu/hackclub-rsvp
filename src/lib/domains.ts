import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";
import {
  CloudflareError,
  cloudflareFromEnv,
  type Cloudflare,
} from "@/lib/cloudflare";
import { q, sql, withTx } from "@/lib/db";
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

export type AddDomainResult =
  | { ok: true; id: number; host: string }
  | {
      ok: false;
      reason:
        | Extract<CustomHostResult, { ok: false }>["reason"]
        | "not_found"
        | "event_has_domain"
        | "host_taken"
        | "cap_reached"
        | "cloudflare_error";
    };

export type AddDomainOptions = {
  cloudflare?: Pick<Cloudflare, "createHostname">;
  maxDomains?: number;
  ttlDays?: number;
};

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Cloudflare bills past 100 custom hostnames, so pending + active domains are
// capped. Every add takes the same transaction-scoped advisory lock, which
// serializes the count-then-insert across concurrent requests.
export async function addDomain(
  eventId: number,
  rawHost: string,
  opts: AddDomainOptions = {},
): Promise<AddDomainResult> {
  const valid = validateCustomHost(rawHost);
  if (!valid.ok) return valid;
  const host = valid.host;
  const maxDomains =
    opts.maxDomains ?? positiveIntFromEnv("CF_MAX_DOMAINS", 90);
  const ttlDays = opts.ttlDays ?? positiveIntFromEnv("CF_DOMAIN_TTL_DAYS", 90);

  try {
    return await withTx(async (client): Promise<AddDomainResult> => {
      const db = q(client);
      await db.exec(
        sql`SELECT pg_advisory_xact_lock(hashtext('custom_domains'))`,
      );

      if (!(await db.exec(sql`SELECT 1 FROM events WHERE id = ${eventId}`))) {
        return { ok: false, reason: "not_found" };
      }
      const live = await db.many<{ event_id: string; host: string }>(sql`
        SELECT event_id, host FROM custom_domains
        WHERE status IN ('pending', 'active')
          AND (event_id = ${eventId} OR host = ${host})`);
      if (live.some((row) => Number(row.event_id) === eventId)) {
        return { ok: false, reason: "event_has_domain" };
      }
      if (live.length > 0) return { ok: false, reason: "host_taken" };

      const { count } = await db.one<{ count: number }>(sql`
        SELECT count(*)::int AS count FROM custom_domains
        WHERE status IN ('pending', 'active')`);
      if (count >= maxDomains) return { ok: false, reason: "cap_reached" };

      const row = await db.one<{ id: string }>(sql`
        INSERT INTO custom_domains (event_id, host, status, expires_at)
        VALUES (${eventId}, ${host}, 'pending',
                now() + make_interval(days => ${ttlDays}))
        RETURNING id`);
      const id = Number(row.id);

      // A failure here rolls the row back. If the commit fails after
      // Cloudflare succeeded, the weekly reconcile deletes the orphan.
      const cloudflare = opts.cloudflare ?? cloudflareFromEnv();
      const { id: cfId } = await cloudflare.createHostname(host);
      await db.exec(sql`
        UPDATE custom_domains SET cf_hostname_id = ${cfId} WHERE id = ${id}`);
      return { ok: true, id, host };
    });
  } catch (error) {
    if (error instanceof CloudflareError) {
      console.error(`custom domain ${host}: ${error.message}`);
      return { ok: false, reason: "cloudflare_error" };
    }
    throw error;
  }
}
