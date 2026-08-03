/**
 * RFC 6265 §5.1.3/§5.1.4/§5.3 — domain/path/secure/expiry matching boundaries.
 *
 * Complements cookie-matching.test.ts with the dot-boundary, hostOnly-scope,
 * path exact/prefix/trailing-slash and expiry-boundary cases, plus the
 * exhaustiveness guard in {@link sameSiteAllows}.
 */

import { describe, expect, it } from "vitest";
import {
    parseSetCookieHeader,
    cookieMatchesUrl,
    isExpired,
    isSameSiteHost,
    makeCookie,
    sameSiteAllows,
    normalizeDomain,
    defaultPath,
} from "../src/index.js";
import type { Cookie, CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

/** Helper to build a request URL with a given host/path/https scheme. */
function url(hostname: string, pathname = "/", protocol = "https:"): CookieUrl {
    return { hostname, pathname, protocol };
}

describe("RFC 6265 §5.1.3 — domain matching boundaries", () => {
    it("rejects a host that merely suffixes the domain without a dot boundary", () => {
        // "notexample.com" ends with "example.com" but NOT with ".example.com",
        // so it must NOT domain-match a cookie scoped to example.com.
        const cookie = parseSetCookieHeader("a=1; Domain=.example.com", exampleUrl);
        expect(cookie.hostOnly).toBe(false);
        expect(cookieMatchesUrl(cookie, url("notexample.com")).matched).toBe(false);
        expect(cookieMatchesUrl(cookie, url("notexample.com")).reason).toBe("domain_mismatch");
    });

    it("rejects a hyphen-suffixed host (evil-example.com is not example.com)", () => {
        const cookie = parseSetCookieHeader("a=1; Domain=.example.com", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("evil-example.com")).matched).toBe(false);
    });

    it("matches the apex and any subdomain of a Domain-scoped cookie", () => {
        const cookie = parseSetCookieHeader("a=1; Domain=.example.com", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("login.example.com")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("a.b.c.example.com")).matched).toBe(true);
    });

    it("domain matching is case-insensitive (request host is normalized)", () => {
        const cookie = parseSetCookieHeader("a=1", exampleUrl); // hostOnly, domain example.com
        expect(cookieMatchesUrl(cookie, url("EXAMPLE.COM")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("LoGiN.Example.COM")).matched).toBe(false); // hostOnly: subdomain rejected
    });
});

describe("RFC 6265 §5.1.3 — hostOnly scope", () => {
    it("hostOnly cookie matches the exact host but not a subdomain", () => {
        const cookie = parseSetCookieHeader("a=1", exampleUrl);
        expect(cookie.hostOnly).toBe(true);
        expect(cookieMatchesUrl(cookie, url("example.com")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("www.example.com")).matched).toBe(false);
        expect(cookieMatchesUrl(cookie, url("www.example.com")).reason).toBe("domain_mismatch");
    });
});

describe("RFC 6265 §5.1.4 — path matching boundaries", () => {
    it("cookie path '/' matches every request path", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com", "/")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("example.com", "/anything")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("example.com", "/a/b/c")).matched).toBe(true);
    });

    it("exact path equality matches", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/api", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com", "/api")).matched).toBe(true);
    });

    it("a cookie path ending in '/' matches any deeper path (prefix + trailing slash)", () => {
        // Exercises the `cookiePath.endsWith("/")` branch of the path predicate.
        const cookie = parseSetCookieHeader("a=1; Path=/api/", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com", "/api/users")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("example.com", "/api/")).matched).toBe(true);
        expect(cookieMatchesUrl(cookie, url("example.com", "/api")).matched).toBe(false); // prefix without boundary
    });

    it("rejects a prefix that is not followed by a '/' boundary", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/api", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com", "/apiv2")).matched).toBe(false);
        expect(cookieMatchesUrl(cookie, url("example.com", "/apiv2")).reason).toBe(
            "path_mismatch",
        );
    });

    it("rejects a multi-segment prefix without a boundary char", () => {
        const cookie = parseSetCookieHeader("a=1; Path=/a/b", exampleUrl);
        expect(cookieMatchesUrl(cookie, url("example.com", "/a/bc")).matched).toBe(false);
        expect(cookieMatchesUrl(cookie, url("example.com", "/a/b/c")).matched).toBe(true);
    });
});

describe("RFC 6265 §5.1.4 — defaultPath boundaries", () => {
    it("returns '/' for a single-segment path (lastSlash === 0)", () => {
        // The lastSlash===0 branch: "/a" -> "/". Distinct from pathname "/" which also
        // hits the same branch but is a different input shape.
        expect(defaultPath("/a")).toBe("/");
    });

    it("returns '/' for the root path", () => {
        expect(defaultPath("/")).toBe("/");
    });

    it("returns the directory prefix for nested paths", () => {
        expect(defaultPath("/a/b/c")).toBe("/a/b");
        expect(defaultPath("/a/b")).toBe("/a");
    });
});

describe("isExpired — boundary and precedence behavior", () => {
    it("Max-Age boundary: exactly at creationTime+maxAge is expired (<=)", () => {
        const cookie = parseSetCookieHeader("a=1; Max-Age=10", exampleUrl);
        const expiryAt = cookie.creationTime + 10 * 1000;
        expect(isExpired(cookie, expiryAt - 1)).toBe(false); // one ms before -> alive
        expect(isExpired(cookie, expiryAt)).toBe(true); // exactly at boundary -> expired
    });

    it("Expires boundary: exactly at the expires time is expired (<=)", () => {
        const cookie = makeCookie(
            { name: "a", value: "1", expires: new Date(5_000) },
            exampleUrl,
            1_000,
        );
        expect(isExpired(cookie, 4_999)).toBe(false);
        expect(isExpired(cookie, 5_000)).toBe(true);
    });

    it("Max-Age takes precedence over Expires", () => {
        // Build via makeCookie so both fields are set with controlled times.
        const past = new Date(1_000); // expired long ago
        const cookie = makeCookie(
            { name: "a", value: "1", expires: past, maxAge: 3600 },
            exampleUrl,
            10_000,
        );
        // maxAge branch wins -> creationTime(10000) + 3600s is in the future -> not expired.
        expect(isExpired(cookie, 10_000)).toBe(false);

        // Reverse: maxAge already expired, expires far future -> still expired.
        const future = new Date(10_000_000_000_000);
        const expiredViaMaxAge = makeCookie(
            { name: "a", value: "1", expires: future, maxAge: 0 },
            exampleUrl,
            10_000,
        );
        expect(isExpired(expiredViaMaxAge, 10_000)).toBe(true);
    });

    it("negative Max-Age is immediately expired", () => {
        const cookie = makeCookie(
            { name: "a", value: "1", maxAge: -10 },
            exampleUrl,
            1_000,
        );
        expect(isExpired(cookie, 1_000)).toBe(true);
    });

    it("a session cookie (no expiry) never expires", () => {
        const cookie = makeCookie({ name: "a", value: "1" }, exampleUrl, 1_000);
        expect(isExpired(cookie, 1_000)).toBe(false);
        expect(isExpired(cookie, 999_999_999_999)).toBe(false);
    });
});

describe("isSameSiteHost — documented heuristic and its boundary", () => {
    it("exact host and parent/subdomain relations are same-site", () => {
        expect(isSameSiteHost("example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("login.example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("example.com", "login.example.com")).toBe(true);
    });

    it("a dot-suffix boundary is required (notexample.com is NOT example.com)", () => {
        expect(isSameSiteHost("notexample.com", "example.com")).toBe(false);
    });

    it("documented limitation: the apex is treated as same-site to a deeper host", () => {
        // The isSameSiteHost docstring calls this out: because the check uses a plain
        // suffix test without a registrable-domain lookup, "example.com" is reported
        // same-site to "evil.example.com". This pins the documented behavior.
        expect(isSameSiteHost("example.com", "evil.example.com")).toBe(true);
    });
});

describe("sameSiteAllows exhaustiveness guard (cookie.ts default branch)", () => {
    it("throws on an out-of-domain SameSite value (compile-time guard reached at runtime)", () => {
        // Cookie.sameSite is typed SameSite; the switch's default branch is only
        // reachable when the type system is bypassed. We force it here to cover the
        // assertNever guard.
        const base = makeCookie({ name: "a", value: "1" }, exampleUrl);
        const badCookie: Cookie = { ...base, sameSite: "Bogus" as Cookie["sameSite"] };
        expect(() =>
            sameSiteAllows(badCookie, exampleUrl, { topLevelSite: "example.com" }),
        ).toThrow(/Unexpected value/);
    });
});

describe("cookieMatchesUrl — order of checks", () => {
    it("expiry is evaluated before domain/path/secure", () => {
        // An expired cookie is reported "expired" even when the domain is also wrong.
        const cookie = parseSetCookieHeader("a=1; Max-Age=0; Domain=.other.com", exampleUrl);
        const result = cookieMatchesUrl(cookie, exampleUrl);
        expect(result.matched).toBe(false);
        expect(result.reason).toBe("expired");
    });

    it("secure is evaluated after domain+path match", () => {
        const cookie = parseSetCookieHeader("a=1; Secure; Domain=other.com", exampleUrl);
        // Domain matches other.com, path "/" matches, but protocol is http -> secure_required.
        const httpOther: CookieUrl = { hostname: "other.com", pathname: "/", protocol: "http:" };
        const result = cookieMatchesUrl(cookie, httpOther);
        expect(result.matched).toBe(false);
        expect(result.reason).toBe("secure_required");
    });
});
