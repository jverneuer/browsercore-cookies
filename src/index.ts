/**
 * @browsercore/cookies — public API surface.
 *
 * RFC 6265-compliant cookie management independent from any HTTP transport.
 * Higher layers (http1, http2, fetch) compose through these exports.
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
