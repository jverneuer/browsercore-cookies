/**
 * Typed errors for @browsercore/cookies.
 *
 * Errors are part of the API — callers match on `kind` instead of parsing messages.
 */

/**
 * Base class for all cookie failures.
 *
 * Extends `Error` with a `kind` discriminator and an optional `cause`. All
 * cookie-package errors extend this class, so a single `catch` on `CookieError`
 * captures every failure mode the package raises, while `instanceof` against a
 * subclass narrows to a specific case (domain mismatch, parse failure, etc.).
 *
 * @example
 * ```ts
 * try {
 *     jar.setCookie(rawCookie, url);
 * } catch (e) {
 *     if (e instanceof CookieDomainError) {
 *         // silently drop cookies that don't match the request domain
 *     }
 * }
 * ```
 *
 * @since 0.1.0
 */
export class CookieError extends Error {
    public readonly kind: string;
    public override readonly cause: Error | undefined;

    /**
     * @param kind - Discriminator string for `instanceof`-free matching.
     * @param message - Human-readable description of the failure.
     * @param options - Standard `Error` options; `cause` preserves the wrapped error.
     */
    constructor(
        kind: string,
        message: string,
        options?: { cause?: Error },
    ) {
        super(message, options);
        this.name = new.target.name;
        this.kind = kind;
        this.cause = options?.cause;
    }
}

/**
 * A cookie's `Domain` attribute does not match the request URL per RFC 6265 §5.1.3.
 *
 * Raised by {@link CookieJar.setCookie} when the jar is configured to reject
 * domain mismatches (the default). The `domain` and `requestHost` fields identify
 * the offending cookie and the URL it was rejected for.
 *
 * @example
 * ```ts
 * try {
 *     jar.setCookie("session=abc; Domain=evil.com", { hostname: "example.com", ... });
 * } catch (e) {
 *     if (e instanceof CookieDomainError) {
 *         console.warn(`Rejected cookie for ${e.domain}`);
 *     }
 * }
 * ```
 *
 * @since 0.1.0
 */
export class CookieDomainError extends CookieError {
    public override readonly kind = "CookieDomainError" as const;
    public readonly domain: string;
    public readonly requestHost: string;

    /**
     * @param domain - The cookie's `Domain` attribute.
     * @param requestHost - The request hostname that did not match.
     */
    constructor(domain: string, requestHost: string) {
        super(
            "CookieDomainError",
            `Cookie domain "${domain}" does not match request host "${requestHost}"`,
        );
        this.name = "CookieDomainError";
        this.domain = domain;
        this.requestHost = requestHost;
    }
}

/**
 * A `Set-Cookie` header could not be parsed.
 *
 * Raised by {@link parseSetCookieHeader} when the header is empty, has a malformed
 * `name=value` pair, or carries an invalid `Expires` / `Max-Age` value. The `raw`
 * field preserves the original header string for debugging.
 *
 * @example
 * ```ts
 * try {
 *     parseSetCookieHeader("not a cookie", url);
 * } catch (e) {
 *     if (e instanceof CookieParseError) {
 *         console.warn(`Bad Set-Cookie: ${e.raw}`);
 *     }
 * }
 * ```
 *
 * @since 0.1.0
 */
export class CookieParseError extends CookieError {
    public override readonly kind = "CookieParseError" as const;
    public readonly raw: string;

    /**
     * @param raw - The original `Set-Cookie` header string that failed to parse.
     * @param reason - Human-readable explanation of the parse failure.
     */
    constructor(raw: string, reason: string) {
        super("CookieParseError", `Failed to parse Set-Cookie: ${reason}`);
        this.name = "CookieParseError";
        this.raw = raw;
    }
}

/**
 * RFC 6265 §5.3 step 11 — the cookie's Domain attribute is a public suffix.
 *
 * A public suffix (e.g. "com", "co.uk", "github.io") is a domain under which
 * users register names. Setting a cookie whose scope is a public suffix would
 * let the cookie leak to every registrant under that suffix, so the spec
 * mandates the cookie be ignored entirely.
 */
export class CookiePublicSuffixError extends CookieError {
    public override readonly kind = "CookiePublicSuffixError" as const;
    public readonly domain: string;

    constructor(domain: string) {
        super(
            "CookiePublicSuffixError",
            `Cookie domain "${domain}" is a public suffix (RFC 6265 §5.3 step 11)`,
        );
        this.name = "CookiePublicSuffixError";
        this.domain = domain;
    }
}

/**
 * A cookie jar could not be serialized or deserialized.
 *
 * Raised by {@link serializeJar} / {@link deserializeJar} when the JSON is
 * malformed or does not conform to the expected schema. The `cause` preserves
 * the underlying `JSON.parse` / Zod error for debugging.
 *
 * @since 0.1.0
 */
export class CookieSerializationError extends CookieError {
    public override readonly kind = "CookieSerializationError" as const;

    constructor(message: string, options?: { cause?: Error }) {
        super("CookieSerializationError", message, options);
        this.name = "CookieSerializationError";
    }
}

/**
 * A `__Host-` or `__Secure-` prefixed cookie violates its prefix's requirements.
 *
 * These prefixes (RFC 6265bis §4.1.3.2 / §4.1.3.1) constrain the cookie's
 * attributes: `__Host-` requires Secure, Path=/, and no Domain; `__Secure-`
 * requires Secure. A header carrying the prefix but missing the required
 * attribute must be rejected.
 */
export class CookiePrefixError extends CookieError {
    public override readonly kind = "CookiePrefixError" as const;
    public readonly cookieName: string;
    public readonly detail: string;

    constructor(name: string, detail: string) {
        super("CookiePrefixError", `Cookie "${name}": ${detail}`);
        this.name = "CookiePrefixError";
        this.cookieName = name;
        this.detail = detail;
    }
}
