/**
 * @browsercore/cookies — public API surface.
 *
 * RFC 6265-compliant cookie management independent from any HTTP transport.
 * Higher layers (http1, http2, fetch) compose through these exports.
 *
 * The package provides:
 * - {@link createCookieJar} — the canonical in-memory {@link CookieJar}
 * - {@link serializeJar} / {@link deserializeJar} — JSON serialization helpers
 * - {@link parseSetCookieHeader} / {@link makeCookie} — cookie construction
 * - {@link cookieMatchesUrl} / {@link isExpired} / {@link normalizeDomain} / {@link defaultPath} — matching primitives
 * - {@link sameSiteAllows} / {@link isSameSiteHost} — SameSite enforcement
 * - A typed error hierarchy ({@link CookieError}, {@link CookieDomainError}, {@link CookieParseError})
 *
 * @module
 */

export {
    createCookieJar,
} from "./jar.js";

export {
    serializeJar,
    deserializeJar,
} from "./persistence.js";

export {
    parseSetCookieHeader,
    cookieMatchesUrl,
    isExpired,
    normalizeDomain,
    defaultPath,
    makeCookie,
    sameSiteAllows,
    isSameSiteHost,
} from "./cookie.js";

export {
    isPublicSuffix,
    registrableDomain,
} from "./public-suffix-list.js";

export {
    CookieError,
    CookieDomainError,
    CookieParseError,
    CookiePublicSuffixError,
    CookiePrefixError,
    CookieSerializationError,
} from "./errors.js";

export type {
    Cookie,
    CookieJar,
    CookieJarOptions,
    CookieJarId,
    CookieMatchResult,
    CookieOptions,
    CookieUrl,
    SameSite,
    SameSiteContext,
} from "./types.js";

// Canonical consumer surface (config-type-home unification, audit 2026-11-16
// item #3 groundwork): the minimal jar interface a cookie-consuming client
// (fetch) needs — getCookies(url) + setCookie(raw, url), nothing else.
// Declared canonically in @browsercore/contracts (src/config.ts) and
// re-exported here so consumers can name it from either package. The rich
// CookieJar above is the intended structural implementor; the two known
// divergences (string-vs-CookieUrl url vocabulary, Date-vs-epoch-ms expires)
// are pinned verbatim in tests/cookie-jar-consumer.test.ts.
export type { CookieJarConsumer } from "@browsercore/contracts";

export { assertNever } from "./utils.js";
