/**
 * Core cookie logic — RFC 6265 parsing and URL matching.
 *
 * These are pure functions (no I/O, no jar state) so they can be unit-tested in
 * isolation and reused by any jar implementation.
 */

import type {
    Cookie,
    CookieMatchResult,
    CookieOptions,
    CookieUrl,
    SameSite,
    SameSiteContext,
} from "./types.js";
import { CookieParseError } from "./errors.js";

/**
 * HTTP methods considered "safe" (idempotent reads). SameSite=Lax permits these
 * on cross-site top-level navigations; unsafe methods (POST, PUT, …) are blocked.
 */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Same-site determination heuristic.
 *
 * A request is "same-site" when the request host shares the registrable domain
 * with the top-level site. We approximate the registrable-domain comparison
 * pragmatically: two hosts are same-site when they are exactly equal OR one is a
 * suffix of the other (e.g. `login.example.com` vs `example.com`). This covers
 * the common cases (exact match and parent/subdomain) without a public-suffix
 * lookup, at the cost of treating e.g. bare `example.com` vs `evil.example.com`
 * as same-site — acceptable for an in-process client library.
 */
export function isSameSiteHost(requestHost: string, topLevelSite: string): boolean {
    const request = normalizeDomain(requestHost);
    const top = normalizeDomain(topLevelSite);
    if (request === top) {
        return true;
    }
    return request.endsWith(`.${top}`) || top.endsWith(`.${request}`);
}

/** A cross-site top-level navigation using a safe method is Lax-allowed. */
function isSafeTopLevel(context: SameSiteContext): boolean {
    if (!context.isTopLevelNavigation) {
        return false;
    }
    const method = context.method;
    return method === undefined || SAFE_METHODS.has(method.toUpperCase());
}

/**
 * SameSite enforcement (RFC 6265bis §5.3.7 / §8.8.2).
 *
 * - Strict: send only on same-site requests.
 * - Lax: send on same-site requests and on safe cross-site top-level navigations.
 * - None: always send (Secure-ness is enforced separately by the Secure check).
 */
export function sameSiteAllows(cookie: Cookie, url: CookieUrl, context: SameSiteContext): boolean {
    const sameSite = isSameSiteHost(url.hostname, context.topLevelSite);
    switch (cookie.sameSite) {
        case "Strict":
            return sameSite;
        case "Lax":
            return sameSite || isSafeTopLevel(context);
        case "None":
            return true;
    }
}

/** Normalize a domain per RFC 6265 §5.1.2: lowercase, strip leading dot. */
export function normalizeDomain(domain: string): string {
    const trimmed = domain.trim().toLowerCase();
    return trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
}

/** Compute the default path per RFC 6265 §5.1.4 from a request path. */
export function defaultPath(pathname: string): string {
    if (pathname === "" || !pathname.startsWith("/")) {
        return "/";
    }
    // Use everything up to (but not including) the last "/".
    const lastSlash = pathname.lastIndexOf("/");
    if (lastSlash === 0) {
        return "/";
    }
    return pathname.slice(0, lastSlash);
}

/** Parse a single Set-Cookie header value into a {@link Cookie}. */
export function parseSetCookieHeader(raw: string, url: CookieUrl): Cookie {
    const now = Date.now();
    const parts = raw.split(";").map((p) => p.trim()).filter((p) => p !== "");

    if (parts.length === 0) {
        throw new CookieParseError(raw, "empty header");
    }

    const [nameValue, ...attrParts] = parts;
    if (nameValue === undefined) {
        throw new CookieParseError(raw, "missing name=value");
    }
    const eq = nameValue.indexOf("=");
    if (eq <= 0) {
        throw new CookieParseError(raw, "malformed name=value");
    }
    const name = nameValue.slice(0, eq).trim();
    const value = nameValue.slice(eq + 1).trim();

    // Defaults per RFC 6265 §5.2.
    let domain = normalizeDomain(url.hostname);
    let path = defaultPath(url.pathname);
    let expires: Date | undefined;
    let maxAge: number | undefined;
    let secure = false;
    let httpOnly = false;
    let sameSite: SameSite = "Lax";
    let partitioned = false;
    let hostOnly = true;

    for (const attr of attrParts) {
        const eqIdx = attr.indexOf("=");
        const attrName = (eqIdx === -1 ? attr : attr.slice(0, eqIdx)).trim().toLowerCase();
        const attrValue = eqIdx === -1 ? "" : attr.slice(eqIdx + 1).trim();

        switch (attrName) {
            case "expires": {
                const parsed = Date.parse(attrValue);
                if (Number.isNaN(parsed)) {
                    throw new CookieParseError(raw, `invalid Expires: ${attrValue}`);
                }
                expires = new Date(parsed);
                break;
            }
            case "max-age": {
                const seconds = Number(attrValue);
                if (!Number.isInteger(seconds) || attrValue === "") {
                    throw new CookieParseError(raw, `invalid Max-Age: ${attrValue}`);
                }
                maxAge = seconds;
                break;
            }
            case "domain":
                if (attrValue === "") {
                    throw new CookieParseError(raw, "empty Domain");
                }
                domain = normalizeDomain(attrValue);
                hostOnly = false;
                break;
            case "path":
                path = attrValue.startsWith("/") ? attrValue : defaultPath(url.pathname);
                break;
            case "secure":
                secure = true;
                break;
            case "httponly":
                httpOnly = true;
                break;
            case "samesite": {
                const normalized = attrValue.toLowerCase();
                if (normalized === "strict" || normalized === "lax" || normalized === "none") {
                    sameSite = (normalized.charAt(0).toUpperCase() + normalized.slice(1)) as SameSite;
                }
                break;
            }
            case "partitioned":
                partitioned = true;
                break;
            default:
                // Unknown attributes are ignored per RFC 6265 §5.2.6.
                break;
        }
    }

    return {
        name,
        value,
        domain,
        path,
        expires,
        maxAge,
        secure,
        httpOnly,
        sameSite,
        partitioned,
        hostOnly,
        creationTime: now,
        lastAccessTime: now,
    };
}

/** Check whether the cookie has expired relative to `now` (ms epoch). */
export function isExpired(cookie: Cookie, now: number): boolean {
    if (cookie.maxAge !== undefined) {
        return cookie.creationTime + cookie.maxAge * 1000 <= now;
    }
    if (cookie.expires !== undefined) {
        return cookie.expires.getTime() <= now;
    }
    return false;
}

/**
 * Test whether a cookie matches a request URL per RFC 6265 §5.1.3 (domain) and
 * §5.1.4 (path), plus the Secure and expiration checks. When `context` is
 * supplied, SameSite enforcement (RFC 6265bis) is applied on top: a cookie is
 * rejected with reason `"same_site"` when its SameSite policy forbids sending it
 * for the given request initiator/navigation.
 */
export function cookieMatchesUrl(
    cookie: Cookie,
    url: CookieUrl,
    context?: SameSiteContext,
    now = Date.now(),
): CookieMatchResult {
    if (isExpired(cookie, now)) {
        return { matched: false, reason: "expired" };
    }

    // Domain match (RFC 6265 §5.1.3).
    const cookieDomain = cookie.domain;
    const requestHost = normalizeDomain(url.hostname);
    const domainMatches = cookie.hostOnly
        ? requestHost === cookieDomain
        : requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);
    if (!domainMatches) {
        return { matched: false, reason: "domain_mismatch" };
    }

    // Path match (RFC 6265 §5.1.4).
    const requestPath = url.pathname;
    const cookiePath = cookie.path;
    const pathMatches =
        requestPath === cookiePath ||
        (requestPath.startsWith(cookiePath) &&
            (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/"));
    if (!pathMatches) {
        return { matched: false, reason: "path_mismatch" };
    }

    // Secure attribute (RFC 6265 §5.3 step 6 — only send over secure transport).
    if (cookie.secure && url.protocol !== "https:") {
        return { matched: false, reason: "secure_required" };
    }

    // SameSite attribute (RFC 6265bis). Only enforced when the caller supplies the
    // request's initiator/navigation context; without it, the cookie is treated
    // as before (domain/path/secure/expiry only).
    if (context !== undefined && !sameSiteAllows(cookie, url, context)) {
        return { matched: false, reason: "same_site" };
    }

    return { matched: true, reason: "ok" };
}

/** Build a {@link Cookie} from {@link CookieOptions}, applying defaults. */
export function makeCookie(options: CookieOptions, url: CookieUrl, now = Date.now()): Cookie {
    return {
        name: options.name,
        value: options.value,
        domain: options.domain === undefined ? normalizeDomain(url.hostname) : normalizeDomain(options.domain),
        path: options.path === undefined ? defaultPath(url.pathname) : options.path,
        expires: options.expires,
        maxAge: options.maxAge,
        secure: options.secure ?? false,
        httpOnly: options.httpOnly ?? false,
        sameSite: options.sameSite ?? "Lax",
        partitioned: options.partitioned ?? false,
        hostOnly: options.hostOnly ?? true,
        creationTime: now,
        lastAccessTime: now,
    };
}
