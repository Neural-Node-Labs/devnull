import dns from "node:dns/promises";
import net from "node:net";

/**
 * Blocks server-side request forgery via the agent's URL-fetching tools (summarize_url_tool,
 * site_crawler_tool, crawl_and_generate_playwright_test_tool, api_test_tool). Previously these
 * called `fetch(url)` with zero validation on a URL that can come directly from an LLM-driven
 * tool call -- meaning a task (or content the agent picked up while crawling, then acted on)
 * could point any of these tools at http://169.254.169.254/... (cloud instance metadata),
 * http://localhost:<internal-port>/..., or an RFC1918 address, and have the result summarized
 * straight back into the agent's own context / the user-visible output.
 *
 * This resolves the hostname itself and checks the resulting IP(s) -- not just the hostname
 * string -- specifically to close the DNS-rebinding-style bypass where a public-looking
 * hostname resolves to a private address.
 */

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (includes cloud metadata endpoints)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
];

// Subset that stays blocked even when the caller explicitly allows private/local addresses
// (see `allowPrivate` on assertSafeToFetch/safeFetch below). There's no legitimate "test my own
// local API" reason to ever hit a cloud metadata endpoint or a multicast address, so these
// aren't something any caller should be able to opt out of.
const ALWAYS_BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["169.254.0.0", 16], // link-local / cloud metadata
  ["224.0.0.0", 4], // multicast
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function matchesAnyRange(ip: string, ranges: Array<[string, number]>): boolean {
  const ipInt = ipv4ToInt(ip);
  return ranges.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

function isBlockedIpv4(ip: string, allowPrivate: boolean): boolean {
  return matchesAnyRange(ip, allowPrivate ? ALWAYS_BLOCKED_IPV4_RANGES : BLOCKED_IPV4_RANGES);
}

function isBlockedIpv6(ip: string, allowPrivate: boolean): boolean {
  const lower = ip.toLowerCase();
  if (allowPrivate) {
    // Link-local stays blocked even with allowPrivate, same reasoning as IPv4 above.
    return lower.startsWith("fe80:");
  }
  return (
    lower === "::1" || // loopback
    lower === "::" ||
    lower.startsWith("fe80:") || // link-local
    lower.startsWith("fc") || // unique local (fc00::/7)
    lower.startsWith("fd") ||
    lower.startsWith("::ffff:") // IPv4-mapped -- treat as blocked by default rather than risk
    // an unwrapped private v4 address slipping through unchecked
  );
}

/**
 * Throws if `urlStr` is not a fetchable http(s) URL -- wrong scheme, or (unless `allowPrivate`
 * is true) resolves by hostname -> DNS lookup, not just string inspection -- to a
 * loopback/private/link-local address.
 *
 * `allowPrivate`: pass true for tools whose whole purpose is hitting the user's own local/
 * private-network services (api_test_tool testing "http://localhost:3000/health" is the
 * canonical case) -- blocking that unconditionally would break the tool's core use case. Leave
 * false (default) for tools that fetch untrusted external content on the agent's behalf
 * (summarize_url_tool, site_crawler_tool, the playwright crawler), where there's no legitimate
 * reason for the target to ever be an internal address. Link-local/metadata addresses
 * (169.254.0.0/16) and multicast stay blocked either way -- see ALWAYS_BLOCKED_IPV4_RANGES.
 *
 * Prefer `safeFetch()` below over calling this directly, since a URL that passes this check can
 * still redirect to an unsafe one -- this only validates a single URL at a single point in time.
 */
export async function assertSafeToFetch(urlStr: string, allowPrivate = false): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid URL: "${urlStr}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Refusing to fetch "${urlStr}": only http/https URLs are allowed (got "${parsed.protocol}")`);
  }

  const hostname = parsed.hostname;

  // Direct IP literal in the URL -- check it as-is, no DNS lookup needed.
  if (net.isIP(hostname)) {
    const blocked = net.isIP(hostname) === 4 ? isBlockedIpv4(hostname, allowPrivate) : isBlockedIpv6(hostname, allowPrivate);
    if (blocked) {
      throw new Error(`Refusing to fetch "${urlStr}": ${hostname} is a blocked (link-local/metadata/multicast) address`);
    }
    return;
  }

  if (hostname === "localhost" && !allowPrivate) {
    throw new Error(`Refusing to fetch "${urlStr}": localhost is not allowed`);
  }
  if (hostname === "localhost") {
    return; // allowPrivate: localhost is exactly the intended use case, skip the DNS lookup
  }

  // Hostname -> resolve and check the actual IP(s), so a public-looking hostname that resolves
  // to an internal address doesn't slip past a hostname-string-only check.
  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch (err) {
    throw new Error(`Refusing to fetch "${urlStr}": could not resolve hostname (${err})`);
  }

  for (const addr of addresses) {
    const blocked = net.isIP(addr) === 4 ? isBlockedIpv4(addr, allowPrivate) : isBlockedIpv6(addr, allowPrivate);
    if (blocked) {
      throw new Error(
        `Refusing to fetch "${urlStr}": hostname "${hostname}" resolves to ${addr}, a blocked (link-local/metadata/multicast) address`
      );
    }
  }
}

/**
 * fetch() wrapper that re-validates the target on every redirect hop, not just the initial
 * URL. Checking only the starting URL isn't sufficient: a public URL can 30x-redirect to
 * http://169.254.169.254/... or any other internal address, and fetch()'s default (and several
 * of these tools' explicit) `redirect: "follow"` would silently follow it without ever
 * re-checking against assertSafeToFetch. This does the redirect-following itself, one hop at a
 * time, checking each new Location before following it.
 */
export async function safeFetch(
  urlStr: string,
  init: RequestInit = {},
  options: { maxRedirects?: number; allowPrivate?: boolean } = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const allowPrivate = options.allowPrivate ?? false;
  let currentUrl = urlStr;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeToFetch(currentUrl, allowPrivate);
    const res = await fetch(currentUrl, { ...init, redirect: "manual" });

    // Opaque redirect (`type: "opaqueredirect"`) shows up when redirect:"manual" is used and
    // means we can't see the target -- treat as unsafe rather than silently returning it as-is.
    if (res.type === "opaqueredirect") {
      throw new Error(`Refusing to follow an opaque redirect from "${currentUrl}"`);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === maxRedirects) {
        throw new Error(`Too many redirects (>${maxRedirects}) starting from "${urlStr}"`);
      }
      currentUrl = new URL(res.headers.get("location")!, currentUrl).toString();
      continue;
    }

    return res;
  }
  // Unreachable, but keeps TypeScript happy about the return type.
  throw new Error(`Too many redirects (>${maxRedirects}) starting from "${urlStr}"`);
}
