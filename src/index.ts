/**
 * @browsercore/cookies — public API surface.
 *
 * RFC 6265-compliant cookie management independent from any HTTP transport.
 * Higher layers (http1, http2, fetch) compose through these exports.
 *
 * The package provides:
 * - {@link createCookieJar} — the canonical in-memory {@link CookieJar}
 * - {@link saveJar} / {@link loadJar} — JSON file persistence
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
    saveJar,
    loadJar,
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

export { assertNever } from "./utils.js";
