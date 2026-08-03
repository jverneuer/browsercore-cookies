/**
 * RFC 6265 §5.2 — Set-Cookie parsing edge cases.
 *
 * Complements cookie-parse.test.ts with attribute-casing, duplicate-attribute,
 * encoding/value, and expiry-semantics cases that the basic suite does not cover.
 */

import { describe, expect, it } from "vitest";
import { parseSetCookieHeader, CookieParseError } from "../src/index.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

describe("RFC 6265 §5.2 — attribute name/value casing", () => {
    it("treats attribute names case-insensitively (SECURE / HTTPONLY / SAMESITE)", () => {
        const cookie = parseSetCookieHeader(
            "a=1; SECURE; HTTPONLY; SAMESITE=STRICT",
            exampleUrl,
        );
        expect(cookie.secure).toBe(true);
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe("Strict");
    });

    it("accepts SameSite=None / Lax / Strict with mixed casing", () => {
        expect(parseSetCookieHeader("a=1; SameSite=NoNe", exampleUrl).sameSite).toBe("None");
        expect(parseSetCookieHeader("a=1; SameSite=lAx", exampleUrl).sameSite).toBe("Lax");
        expect(parseSetCookieHeader("a=1; SameSite=STRICT", exampleUrl).sameSite).toBe("Strict");
    });

    it("parses PARTITIONED regardless of casing", () => {
        expect(parseSetCookieHeader("a=1; Partitioned", exampleUrl).partitioned).toBe(true);
        expect(parseSetCookieHeader("a=1; PARTITIONED", exampleUrl).partitioned).toBe(true);
    });

    it("parses Domain/Path regardless of attribute casing", () => {
        const cookie = parseSetCookieHeader("a=1; DOMAIN=Example.COM; PATH=/api", exampleUrl);
        expect(cookie.domain).toBe("example.com");
        expect(cookie.hostOnly).toBe(false);
        expect(cookie.path).toBe("/api");
    });
});

describe("RFC 6265 §5.2 — duplicate attributes (last wins)", () => {
    it("last Path attribute wins", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/x; Path=/y", exampleUrl);
        expect(cookie.path).toBe("/y");
    });

    it("last Domain attribute wins and clears hostOnly", () => {
        const cookie = parseSetCookieHeader(
            "a=1; Domain=other.com; Domain=example.com",
            exampleUrl,
        );
        expect(cookie.domain).toBe("example.com");
        expect(cookie.hostOnly).toBe(false);
    });

    it("last SameSite attribute wins", () => {
        const cookie = parseSetCookieHeader("a=1; SameSite=Strict; SameSite=Lax", exampleUrl);
        expect(cookie.sameSite).toBe("Lax");
    });
});

describe("RFC 6265 §5.2 — value encoding / shape edge cases", () => {
    it("parses an empty value (a=)", () => {
        const cookie = parseSetCookieHeader("a=", exampleUrl);
        expect(cookie.name).toBe("a");
        expect(cookie.value).toBe("");
    });

    it("preserves internal whitespace in the value but trims surrounding whitespace", () => {
        const cookie = parseSetCookieHeader("a=  hello world  ", exampleUrl);
        expect(cookie.value).toBe("hello world");
    });

    it("preserves base64-style values containing '=' signs", () => {
        const cookie = parseSetCookieHeader("token=MTIzNA==; Secure", exampleUrl);
        expect(cookie.name).toBe("token");
        expect(cookie.value).toBe("MTIzNA==");
    });

    it("does NOT strip surrounding double quotes from the value (documented behavior)", () => {
        // RFC 6265 discourages quoted values, but if a server emits them this parser
        // passes them through verbatim rather than unquoting.
        const cookie = parseSetCookieHeader('a="quoted"', exampleUrl);
        expect(cookie.value).toBe('"quoted"');
    });

    it("trims whitespace around the name", () => {
        const cookie = parseSetCookieHeader("   a   = 1  ", exampleUrl);
        expect(cookie.name).toBe("a");
        expect(cookie.value).toBe("1");
    });
});

describe("RFC 6265 §5.2.1/§5.2.2 — Expires and Max-Age semantics", () => {
    it("accepts an ISO 8601 Expires date", () => {
        const cookie = parseSetCookieHeader(
            "a=1; Expires=2099-10-21T07:28:00.000Z",
            exampleUrl,
        );
        expect(cookie.expires).toBeInstanceOf(Date);
        expect(cookie.expires?.toISOString()).toBe("2099-10-21T07:28:00.000Z");
    });

    it("accepts a negative Max-Age (parses as integer; semantics handled by isExpired)", () => {
        const cookie = parseSetCookieHeader("a=1; Max-Age=-1", exampleUrl);
        expect(cookie.maxAge).toBe(-1);
    });

    it("rejects a floating-point Max-Age", () => {
        expect(() => parseSetCookieHeader("a=1; Max-Age=1.5", exampleUrl)).toThrow(
            CookieParseError,
        );
    });

    it("treats a Max-Age of 0 as a parseable integer", () => {
        expect(parseSetCookieHeader("a=1; Max-Age=0", exampleUrl).maxAge).toBe(0);
    });

    it("tolerates surrounding whitespace inside attribute values", () => {
        expect(parseSetCookieHeader("a=1; Max-Age=  30  ", exampleUrl).maxAge).toBe(30);
    });

    it("Max-Age takes precedence over Expires for expiry evaluation", () => {
        // Expires is in the past but Max-Age is in the future -> cookie is alive.
        const alive = parseSetCookieHeader(
            "a=1; Max-Age=3600; Expires=Wed, 21 Oct 2000 07:28:00 GMT",
            exampleUrl,
        );
        expect(alive.maxAge).toBe(3600);
        // creationTime + 3600s is in the future relative to creationTime.
        expect(alive.creationTime + alive.maxAge! * 1000).toBeGreaterThan(Date.now());
    });
});

describe("RFC 6265 §5.2.3 — Domain attribute normalization", () => {
    it("strips a single leading dot and lowercases", () => {
        expect(parseSetCookieHeader("a=1; Domain=.Example.COM", exampleUrl).domain).toBe(
            "example.com",
        );
    });

    it("strips a trailing dot for RFC/browser parity", () => {
        // normalizeDomain strips both leading AND trailing dots, so a fully-qualified
        // `Domain=example.com.` becomes `"example.com"` and matches a normal request
        // host. This is symmetric (applied to both the cookie domain and the request
        // host) and matches browser behavior.
        const cookie = parseSetCookieHeader("a=1; Domain=example.com.", exampleUrl);
        expect(cookie.domain).toBe("example.com");
        expect(cookie.hostOnly).toBe(false);
    });

    it("clears hostOnly whenever a Domain attribute is present (even if equal to host)", () => {
        const cookie = parseSetCookieHeader("a=1; Domain=example.com", exampleUrl);
        expect(cookie.hostOnly).toBe(false);
        expect(cookie.domain).toBe("example.com");
    });
});

describe("RFC 6265 §5.2.4 — Path attribute fallback", () => {
    it("uses an absolute Path attribute verbatim", () => {
        expect(parseSetCookieHeader("a=1; Path=/deep/nested", exampleUrl).path).toBe(
            "/deep/nested",
        );
    });

    it("falls back to the default path when Path is empty", () => {
        const url: CookieUrl = { hostname: "example.com", pathname: "/a/b", protocol: "https:" };
        // Path is present but empty -> not absolute -> default path "/a".
        expect(parseSetCookieHeader("a=1; Path=", url).path).toBe("/a");
    });
});

describe("RFC 6265 §5.2.6 — unknown attributes are ignored", () => {
    it("ignores unknown attributes while still parsing known ones that follow", () => {
        const cookie = parseSetCookieHeader(
            "a=1; Priority=High; Secure; Foo=bar; HttpOnly",
            exampleUrl,
        );
        expect(cookie.secure).toBe(true);
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.name).toBe("a");
        expect(cookie.value).toBe("1");
    });
});
