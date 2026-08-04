/**
 * Typed errors for @browsercore/cookies.
 *
 * Errors are part of the API — callers match on `kind` instead of parsing messages.
 */

/** Base class for all cookie failures. */
export class CookieError extends Error {
    public readonly kind: string;
    public override readonly cause: Error | undefined;

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

/** A cookie's domain attribute does not match the request URL per RFC 6265 §5.1.3. */
export class CookieDomainError extends CookieError {
    public override readonly kind = "CookieDomainError" as const;
    public readonly domain: string;
    public readonly requestHost: string;

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

/** A Set-Cookie header could not be parsed. */
export class CookieParseError extends CookieError {
    public override readonly kind = "CookieParseError" as const;
    public readonly raw: string;

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
