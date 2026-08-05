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
import { CookieParseError, CookiePrefixError, CookiePublicSuffixError } from "./errors.js";
import { assertNever } from "./utils.js";
import { isPublicSuffix, registrableDomain } from "./public-suffix-list.js";

/**
 * HTTP methods considered "safe" (idempotent reads). SameSite=Lax permits these
 * on cross-site top-level navigations; unsafe methods (POST, PUT, …) are blocked.
 */
type SafeMethod = "GET" | "HEAD" | "OPTIONS" | "TRACE";
const SAFE_METHODS: ReadonlySet<SafeMethod> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Map from a lowercase SameSite attribute value to its canonical form. Modeling
 * the lookup (instead of capitalizing a `string` and casting) keeps the value
 * typed as {@link SameSite} with no type assertion.
 */
const SAME_SITE_BY_LOWERCASE: Readonly<Record<"strict" | "lax" | "none", SameSite>> = {
    strict: "Strict",
    lax: "Lax",
    none: "None",
};

/** Secure protocol scheme — cookies with the Secure attribute only send over it. */
const SECURE_PROTOCOL = "https:" as const;

/**
 * Same-site determination — registrable-domain comparison.
 *
 * Per the latest SameSite spec (RFC 6265bis), two hosts are "same-site" when
 * they share a registrable domain (eTLD+1). We use the bundled Public Suffix
 * List to compute the registrable base of each host and compare those.
 *
 * This fixes a cross-site leak in the previous suffix-match heuristic: a site
 * hosted on a public suffix (e.g. `foo.github.io` vs `bar.github.io`) was
 * incorrectly treated as same-site because `bar.github.io` ends with `.github.io`,
 * when in fact they are *cross-site* (their registrable domains differ). The
 * PSL-aware comparison correctly distinguishes these.
 *
 * For hosts whose TLD is not in the bundled PSL (private/unlisted TLDs), we
 * fall back to the registrable-domain computation that returns the rightmost
 * two labels — same behavior as the old heuristic for non-PSL TLDs.
 *
 * @param requestHost - The host the request is being made to.
 * @param topLevelSite - The hostname of the site in whose context the request was initiated.
 * @returns `true` when the two hosts are considered same-site.
 *
 * @example
 * ```ts
 * isSameSiteHost("login.example.com", "example.com"); // true — shared registrable domain
 * isSameSiteHost("foo.github.io", "bar.github.io");   // false — cross-site on a public suffix
 * isSameSiteHost("example.com", "example.com");       // true — exact match
 * isSameSiteHost("evil.com", "example.com");          // false — different registrable domain
 * ```
 *
 * @see sameSiteAllows for the full SameSite enforcement logic.
 * @since 0.1.0
 */
export function isSameSiteHost(requestHost: string, topLevelSite: string): boolean {
    const request = normalizeDomain(requestHost);
    const top = normalizeDomain(topLevelSite);
    if (request === top) {
        return true;
    }
    const requestBase = registrableDomain(request);
    const topBase = registrableDomain(top);
    // If either registrable base is null (the host IS a public suffix), they
    // can only be same-site when they are the exact same public suffix — and
    // that is covered by the `request === top` check above.
    if (requestBase === null || topBase === null) {
        return false;
    }
    return requestBase === topBase;
}

/** Type guard: narrows a `string` to {@link SafeMethod} when it is a known safe method. */
function isSafeMethod(method: string): method is SafeMethod {
    return SAFE_METHODS.has(method as SafeMethod);
}

/** A cross-site top-level navigation using a safe method is Lax-allowed. */
function isSafeTopLevel(context: SameSiteContext): boolean {
    if (context.isTopLevelNavigation !== true) {
        return false;
    }
    const method = context.method;
    return method === undefined || isSafeMethod(method.toUpperCase());
}

/**
 * SameSite enforcement (RFC 6265bis §5.3.7 / §8.8.2).
 *
 * - **Strict**: send only on same-site requests.
 * - **Lax**: send on same-site requests and on safe cross-site top-level navigations.
 * - **None**: always send (Secure-ness is enforced separately by the Secure check).
 *
 * @param cookie - The cookie whose SameSite policy is being evaluated.
 * @param url - The request URL the cookie would be sent to.
 * @param context - The {@link SameSiteContext}: top-level site, navigation type, and method.
 * @returns `true` when the cookie's SameSite policy permits sending it for this request.
 *
 * @example
 * ```ts
 * sameSiteAllows(cookie, url, {
 *     topLevelSite: "example.com",
 *     isTopLevelNavigation: true,
 *     method: "GET",
 * });
 * ```
 *
 * @see isSameSiteHost for the same-site heuristic.
 * @since 0.1.0
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
        default:
            return assertNever(cookie.sameSite);
    }
}

/**
 * Normalize a domain per RFC 6265 §5.1.2: lowercase, strip leading AND trailing
 * dots. A trailing dot (`example.com.`) is a fully-qualified (absolute) DNS name
 * that browsers and RFC 6265 §5.1.3 domain matching treat as equivalent to its
 * non-absolute form. Because {@link normalizeDomain} is applied to BOTH the cookie
 * domain and the request host (see {@link cookieMatchesUrl} and {@link jar.ts}'s
 * setCookie check), stripping it symmetrically keeps comparisons consistent and
 * prevents a `Domain=example.com.` cookie from failing to match `example.com`.
 *
 * @param domain - The domain string to normalize.
 * @returns A lowercased domain with no leading or trailing dots.
 *
 * @example
 * ```ts
 * normalizeDomain("Example.COM");    // "example.com"
 * normalizeDomain(".example.com.");  // "example.com"
 * ```
 *
 * @since 0.1.0
 */
export function normalizeDomain(domain: string): string {
    return domain.trim().toLowerCase().replaceAll(/^\.+|\.+$/gu, "");
}

/**
 * Compute the default-path per RFC 6265 §5.1.4 from a request path.
 *
 * The default path is the "directory" of the request-uri: everything up to but
 * not including the last `/`. A request path of `/` or `/foo` yields `/`; a
 * request path of `/foo/bar` yields `/foo`.
 *
 * @param pathname - The request URL's pathname (e.g. `"/foo/bar"`).
 * @returns The default cookie path (always starts with `/`).
 *
 * @example
 * ```ts
 * defaultPath("/");         // "/"
 * defaultPath("/foo");      // "/"
 * defaultPath("/foo/bar");  // "/foo"
 * defaultPath("");          // "/"
 * ```
 *
 * @since 0.1.0
 */
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

/**
 * Parse a single `Set-Cookie` header value into a {@link Cookie}.
 *
 * Implements the parsing rules from RFC 6265 §5.2: extracts the `name=value` pair,
 * applies defaults for absent attributes, and interprets the standard attributes
 * (`Expires`, `Max-Age`, `Domain`, `Path`, `Secure`, `HttpOnly`, `SameSite`,
 * `Partitioned`).
 *
 * @param raw - The full `Set-Cookie` header value (e.g. `"session=abc; Path=/; Secure"`).
 * @param url - The request URL the cookie was received with, used for defaults
 *   (domain falls back to the host; path falls back to the request path).
 * @returns A fully populated {@link Cookie}.
 * @throws {CookieParseError} If the header is empty, has a malformed `name=value`
 *   pair, or carries an invalid `Expires` / `Max-Age` value.
 *
 * @example
 * ```ts
 * const cookie = parseSetCookieHeader(
 *     "session=abc123; Expires=Wed, 21 Oct 2025 07:28:00 GMT; Path=/; Secure; SameSite=Lax",
 *     { hostname: "example.com", pathname: "/", protocol: "https:" },
 * );
 * // cookie.name === "session"
 * // cookie.domain === "example.com"
 * ```
 *
 * @see makeCookie for building a cookie from {@link CookieOptions} without parsing.
 * @since 0.1.0
 */
export function parseSetCookieHeader(raw: string, url: CookieUrl): Cookie {
    const now = Date.now();
    const parts = raw.split(";").map((p) => p.trim()).filter((p) => p !== "");

    // `parts[0]` is `string | undefined` under noUncheckedIndexedAccess; the filter
    // above makes the undefined case reachable only for an empty/whitespace header.
    const nameValue = parts[0];
    if (nameValue === undefined) {
        throw new CookieParseError(raw, "empty header");
    }
    const attrParts = parts.slice(1);
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
                // RFC 6265 §5.1.4: a Path attribute that is not absolute does not
                // define a scope — fall back to the request-path default instead.
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
                    sameSite = SAME_SITE_BY_LOWERCASE[normalized];
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

    // RFC 6265bis §4.1.3.1 (__Host-) and §4.1.3.2 (__Secure-) prefix
    // enforcement. Prefix validation runs last, after all attributes have been
    // parsed, so it can check Secure, Path, and Domain (hostOnly) together.
    if (name.startsWith("__Host-")) {
        if (!secure) {
            throw new CookiePrefixError(name, "__Host- prefix requires the Secure attribute");
        }
        if (path !== "/") {
            throw new CookiePrefixError(name, "__Host- prefix requires Path=/");
        }
        // A __Host- cookie must not carry a Domain attribute (hostOnly must be true).
        if (!hostOnly) {
            throw new CookiePrefixError(name, "__Host- prefix forbids the Domain attribute");
        }
    }
    if (name.startsWith("__Secure-") && !secure) {
        throw new CookiePrefixError(name, "__Secure- prefix requires the Secure attribute");
    }

    // RFC 6265 §5.3 step 11 — reject if the cookie's scope is a public suffix.
    // A cookie whose Domain attribute (or implicit host) is a public suffix would
    // be shared across every registrant under that suffix, so the spec mandates
    // the cookie be ignored entirely.
    if (isPublicSuffix(domain)) {
        throw new CookiePublicSuffixError(domain);
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

/**
 * Check whether the cookie has expired relative to `now` (ms epoch).
 *
 * A cookie expires when its `Max-Age` window (from `creationTime`) has elapsed,
 * or when its absolute `Expires` date has passed. A session cookie (neither
 * `maxAge` nor `expires`) never expires.
 *
 * @param cookie - The {@link Cookie} to test.
 * @param now - The current time in ms epoch (defaults to `Date.now()`).
 * @returns `true` when the cookie has expired.
 *
 * @example
 * ```ts
 * isExpired(sessionCookie, Date.now()); // false (session cookie)
 * ```
 *
 * @since 0.1.0
 */
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
 *
 * Checks are applied in the order: expiration → domain → path → secure → same-site,
 * and the first failure short-circuits with its reason.
 *
 * @param cookie - The {@link Cookie} to test.
 * @param url - The request URL the cookie would be sent to.
 * @param context - Optional {@link SameSiteContext} to enforce the SameSite attribute.
 * @param now - Current time in ms epoch, for the expiry check. Defaults to `Date.now()`.
 * @returns A {@link CookieMatchResult} indicating whether the cookie should be sent.
 *
 * @example
 * ```ts
 * const result = cookieMatchesUrl(cookie, {
 *     hostname: "example.com",
 *     pathname: "/account",
 *     protocol: "https:",
 * });
 * if (!result.matched) {
 *     console.log(`Rejected: ${result.reason}`);
 * }
 * ```
 *
 * @see isExpired for the expiry check alone.
 * @see sameSiteAllows for SameSite enforcement alone.
 * @since 0.1.0
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
    if (cookie.secure && url.protocol !== SECURE_PROTOCOL) {
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

/**
 * Build a {@link Cookie} from {@link CookieOptions}, applying RFC 6265 defaults.
 *
 * Unlike {@link parseSetCookieHeader}, this does not parse a header — it constructs
 * a cookie from a structured options object, filling in sensible defaults for
 * any absent field (e.g. `Secure` → `false`, `SameSite` → `"Lax"`, `hostOnly` → `true`).
 *
 * @param options - The cookie fields. Absent fields get defaults.
 * @param url - The request URL, used for domain/path defaults when not specified.
 * @param now - Creation/access time in ms epoch. Defaults to `Date.now()`.
 * @returns A fully populated {@link Cookie}.
 *
 * @example
 * ```ts
 * const cookie = makeCookie(
 *     { name: "theme", value: "dark", path: "/", secure: true },
 *     { hostname: "example.com", pathname: "/", protocol: "https:" },
 * );
 * ```
 *
 * @see parseSetCookieHeader for parsing a `Set-Cookie` header.
 * @since 0.1.0
 */
export function makeCookie(options: CookieOptions, url: CookieUrl, now = Date.now()): Cookie {
    return {
        name: options.name,
        value: options.value,
        domain: normalizeDomain(options.domain ?? url.hostname),
        path: options.path ?? defaultPath(url.pathname),
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
