/**
 * Typed errors for @network/cookies.
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
