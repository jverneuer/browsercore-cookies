/**
 * Domain types for @browsercore/cookies.
 *
 * RFC 6265-compliant cookie management. This package knows nothing about HTTP
 * transports — it only models cookies, a cookie jar, and the rules for matching
 * them against request URLs.
 */

/** Branded cookie-jar identifier. */
export type CookieJarId = string & { __brand: "CookieJarId" };

/** SameSite policy for a cookie. */
export type SameSite = "Strict" | "Lax" | "None";

/**
 * A single cookie. All fields are readonly once constructed — the jar treats
 * cookies as immutable values and replaces them wholesale on update.
 *
 * Built via {@link parseSetCookieHeader} (from a `Set-Cookie` header) or
 * {@link makeCookie} (from {@link CookieOptions}).
 */
export interface Cookie {
    readonly name: string;
    readonly value: string;
    /** Domain the cookie is scoped to (with or without leading dot). */
    readonly domain: string;
    /** Path the cookie is scoped to. */
    readonly path: string;
    /** Absolute expiration date. Mutually exclusive with maxAge. */
    readonly expires: Date | undefined;
    /** Relative expiration in seconds from when the cookie was set. */
    readonly maxAge: number | undefined;
    /** Only send over HTTPS. */
    readonly secure: boolean;
    /** Inaccessible to client-side scripts — not used by the jar directly. */
    readonly httpOnly: boolean;
    readonly sameSite: SameSite;
    /** CHIPS (Cookies Having Independent Partitioned State) partition key. */
    readonly partitioned: boolean;
    /** If true, the cookie only matches the exact domain, not subdomains. */
    readonly hostOnly: boolean;
    /** When the cookie was created (ms epoch). */
    readonly creationTime: number;
    /** When the cookie was last accessed (ms epoch). */
    readonly lastAccessTime: number;
}

/** Options for constructing a cookie. Absent fields get RFC 6265 defaults. */
export interface CookieOptions {
    readonly name: string;
    readonly value: string;
    readonly domain?: string;
    readonly path?: string;
    readonly expires?: Date;
    readonly maxAge?: number;
    readonly secure?: boolean;
    readonly httpOnly?: boolean;
    readonly sameSite?: SameSite;
    readonly partitioned?: boolean;
    readonly hostOnly?: boolean;
}

/**
 * A URL parsed to the parts relevant for cookie matching.
 *
 * Passed to jar methods instead of a raw string so the URL is parsed once by
 * the caller. Only `hostname`, `pathname`, and `protocol` are needed for
 * RFC 6265 matching.
 */
export interface CookieUrl {
    readonly hostname: string;
    readonly pathname: string;
    readonly protocol: string;
}

/**
 * Result of testing whether a cookie matches a request URL.
 *
 * A discriminated union: `{ matched: true }` when the cookie should be sent, or
 * `{ matched: false, reason }` with the specific RFC 6265 rule that rejected it.
 *
 * @see cookieMatchesUrl for the matching logic.
 */
export type CookieMatchResult =
    | { readonly matched: true; readonly reason: "ok" }
    | { readonly matched: false; readonly reason: "domain_mismatch" }
    | { readonly matched: false; readonly reason: "path_mismatch" }
    | { readonly matched: false; readonly reason: "secure_required" }
    | { readonly matched: false; readonly reason: "expired" }
    | { readonly matched: false; readonly reason: "same_site" };

/**
 * Request context needed to evaluate a cookie's SameSite attribute.
 *
 * `topLevelSite` is the hostname of the site in whose context the request was
 * initiated (for a top-level navigation, the destination site; for a subresource,
 * the embedding page). The jar passes this into {@link cookieMatchesUrl} so it can
 * decide whether a cross-site request is allowed to carry the cookie.
 */
export interface SameSiteContext {
    /** Hostname of the top-level / initiator site. */
    readonly topLevelSite: string;
    /** True for top-level navigations (as opposed to subresource fetches). */
    readonly isTopLevelNavigation?: boolean;
    /** HTTP method of the request, used to identify safe navigations. */
    readonly method?: string;
}

/**
 * A cookie jar — the mutable container that stores cookies and serves them for
 * matching URLs. Implementations must be safe to use across requests.
 *
 * The canonical implementation is {@link createCookieJar}. Persist a jar with
 * {@link saveJar} / {@link loadJar}.
 */
export interface CookieJar {
    /** Opaque identifier for this jar. */
    readonly id: CookieJarId;
    /**
     * Return all cookies that match the given URL, ordered per RFC 6256 §5.4.
     * When `context` is supplied, SameSite enforcement is applied on top of the
     * domain/path/secure/expiry checks.
     *
     * @see cookieMatchesUrl for the matching rules.
     */
    getCookies(url: CookieUrl, context?: SameSiteContext): Cookie[];
    /** Parse a Set-Cookie header value and store the resulting cookie.
     * @see parseSetCookieHeader for the parsing rules.
     */
    setCookie(raw: string, url: CookieUrl): void;
    /** Remove a single cookie by name + domain + path. */
    removeCookie(name: string, domain: string, path: string): void;
    /** Remove every cookie from the jar. */
    clear(): void;
    /** Serialize the jar to a JSON string for persistence. */
    serialize(): string;
    /** Replace the jar's contents with cookies deserialized from JSON. */
    deserialize(json: string): void;
}

/** Tuning options for {@link createCookieJar}. */
export interface CookieJarOptions {
    /**
     * Reject cookies whose domain does not match the request URL per RFC 6265 §5.3.
     * When enabled (the default), {@link CookieJar.setCookie} throws a
     * {@link CookieDomainError} for a mismatched domain.
     *
     * @defaultValue true
     */
    readonly rejectDomainMismatch?: boolean;
}
