import { describe, expect, it } from "vitest";
import {
    parseSetCookieHeader,
    CookieParseError,
} from "../src/index.js";
import type { Cookie, CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

describe("parseSetCookieHeader", () => {
    it("parses a realistic Set-Cookie header with attributes", () => {
        const raw = "session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax";
        const cookie = parseSetCookieHeader(raw, exampleUrl);

        expect(cookie.name).toBe("session");
        expect(cookie.value).toBe("abc123");
        expect(cookie.path).toBe("/");
        expect(cookie.secure).toBe(true);
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe("Lax");
        expect(cookie.domain).toBe("example.com");
    });

    it("parses Expires and Max-Age", () => {
        const raw = "id=42; Expires=Wed, 21 Oct 2025 07:28:00 GMT; Max-Age=3600";
        const cookie = parseSetCookieHeader(raw, exampleUrl);

        expect(cookie.expires).toBeInstanceOf(Date);
        expect(cookie.maxAge).toBe(3600);
    });

    it("normalizes a Domain attribute to lowercase", () => {
        const raw = "a=1; Domain=Example.COM";
        const cookie = parseSetCookieHeader(raw, exampleUrl);

        expect(cookie.domain).toBe("example.com");
        expect(cookie.hostOnly).toBe(false);
    });

    it("derives the default path from the request path", () => {
        const url: CookieUrl = { hostname: "example.com", pathname: "/a/b/c", protocol: "https:" };
        const cookie = parseSetCookieHeader("a=1", url);

        expect(cookie.path).toBe("/a/b");
    });
});

describe("parseSetCookieHeader error handling", () => {
    it("throws CookieParseError on an empty header", () => {
        expect(() => parseSetCookieHeader("", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError on a whitespace-only header", () => {
        // After trimming and filtering, no non-empty parts remain.
        expect(() => parseSetCookieHeader("   ;   ", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError when name=value has no '='", () => {
        expect(() => parseSetCookieHeader("noequals", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError when the name is empty", () => {
        // `=value` → eq === 0, which is rejected as malformed.
        expect(() => parseSetCookieHeader("=value", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError on an invalid Expires", () => {
        expect(() => parseSetCookieHeader("a=1; Expires=not-a-date", exampleUrl)).toThrow(
            CookieParseError,
        );
    });

    it("throws CookieParseError on a non-integer Max-Age", () => {
        expect(() => parseSetCookieHeader("a=1; Max-Age=abc", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError on an empty Max-Age", () => {
        expect(() => parseSetCookieHeader("a=1; Max-Age=", exampleUrl)).toThrow(CookieParseError);
    });

    it("throws CookieParseError on an empty Domain", () => {
        expect(() => parseSetCookieHeader("a=1; Domain=", exampleUrl)).toThrow(CookieParseError);
    });

    it("exposes the raw header on a parse error", () => {
        const raw = "a=1; Expires=bogus";
        try {
            parseSetCookieHeader(raw, exampleUrl);
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(CookieParseError);
            expect((e as CookieParseError).raw).toBe(raw);
        }
    });
});

describe("parseSetCookieHeader attributes", () => {
    it("parses the Partitioned attribute", () => {
        const cookie = parseSetCookieHeader("a=1; Partitioned", exampleUrl);
        expect(cookie.partitioned).toBe(true);
    });

    it("ignores unknown attributes", () => {
        const cookie = parseSetCookieHeader("a=1; FooBar=baz; Secure", exampleUrl);
        expect(cookie.name).toBe("a");
        expect(cookie.secure).toBe(true);
    });

    it("falls back to the default path when Path lacks a leading slash", () => {
        const url: CookieUrl = { hostname: "example.com", pathname: "/a/b", protocol: "https:" };
        const cookie = parseSetCookieHeader("a=1; Path=foo", url);
        expect(cookie.path).toBe("/a");
    });

    it("keeps the default SameSite (Lax) when the value is unrecognized", () => {
        const cookie = parseSetCookieHeader("a=1; SameSite=Bogus", exampleUrl);
        expect(cookie.sameSite).toBe("Lax");
    });

    it("parses a value containing '=' signs", () => {
        const cookie = parseSetCookieHeader("a=MTIzNA==", exampleUrl);
        expect(cookie.name).toBe("a");
        expect(cookie.value).toBe("MTIzNA==");
    });
});
