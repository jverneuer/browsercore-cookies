import { describe, expect, it } from "vitest";
import {
    parseSetCookieHeader,
    cookieMatchesUrl,
    isExpired,
    makeCookie,
} from "../src/index.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

describe("domain matching", () => {
    it("subdomain matches parent domain with leading dot", () => {
        const cookie = parseSetCookieHeader("a=1; Domain=.example.com", exampleUrl);
        const subUrl: CookieUrl = {
            hostname: "login.example.com",
            pathname: "/",
            protocol: "https:",
        };

        expect(cookieMatchesUrl(cookie, subUrl).matched).toBe(true);
    });

    it("hostOnly cookie does NOT match a subdomain", () => {
        // No `Domain` attribute → the cookie is hostOnly and scoped to the exact
        // request host (example.com). It must NOT match a subdomain.
        const cookie = parseSetCookieHeader("a=1", exampleUrl);
        const subUrl: CookieUrl = {
            hostname: "login.example.com",
            pathname: "/",
            protocol: "https:",
        };

        expect(cookie.hostOnly).toBe(true);
        expect(cookieMatchesUrl(cookie, subUrl).matched).toBe(false);
    });

    it("hostOnly cookie matches its exact host", () => {
        const cookie = parseSetCookieHeader("a=1", exampleUrl);

        expect(cookieMatchesUrl(cookie, exampleUrl).matched).toBe(true);
    });

    it("rejects a domain that does not match at all", () => {
        const cookie = parseSetCookieHeader("a=1; Domain=.other.com", exampleUrl);

        expect(cookieMatchesUrl(cookie, exampleUrl).matched).toBe(false);
    });
});

describe("path matching", () => {
    it("matches when request path starts with cookie path", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/api", exampleUrl);
        const url: CookieUrl = { hostname: "example.com", pathname: "/api/users", protocol: "https:" };

        expect(cookieMatchesUrl(cookie, url).matched).toBe(true);
    });

    it("does NOT match a sibling path", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/api", exampleUrl);
        const url: CookieUrl = { hostname: "example.com", pathname: "/apiv2", protocol: "https:" };

        expect(cookieMatchesUrl(cookie, url).matched).toBe(false);
    });
});

describe("secure attribute", () => {
    it("secure cookie only matches https", () => {
        const cookie = parseSetCookieHeader("a=1; Secure", exampleUrl);
        const httpUrl: CookieUrl = { hostname: "example.com", pathname: "/", protocol: "http:" };

        expect(cookieMatchesUrl(cookie, httpUrl).matched).toBe(false);
        expect(cookieMatchesUrl(cookie, exampleUrl).matched).toBe(true);
    });
});

describe("expiration", () => {
    it("isExpired returns true past Max-Age", () => {
        const cookie = parseSetCookieHeader("a=1; Max-Age=0", exampleUrl);
        // creationTime is "now"; maxAge 0 means already expired at now.
        expect(isExpired(cookie, cookie.creationTime)).toBe(true);
    });
});

describe("isExpired", () => {
    it("returns true past the Expires date", () => {
        const past = new Date(Date.now() - 1000);
        const cookie = makeCookie({ name: "a", value: "1", expires: past }, exampleUrl);
        expect(isExpired(cookie, Date.now())).toBe(true);
    });

    it("returns false before the Expires date", () => {
        const future = new Date(Date.now() + 60_000);
        const cookie = makeCookie({ name: "a", value: "1", expires: future }, exampleUrl);
        expect(isExpired(cookie, Date.now())).toBe(false);
    });

    it("treats a session cookie (no expiry) as never expired", () => {
        const cookie = makeCookie({ name: "a", value: "1" }, exampleUrl);
        expect(isExpired(cookie, Date.now() + 10 ** 9)).toBe(false);
    });
});
