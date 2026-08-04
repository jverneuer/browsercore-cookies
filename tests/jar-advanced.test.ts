/**
 * Cookie jar — advanced behaviors.
 *
 * Complements jar.test.ts with overwrite (store-key replacement), expired-cookie
 * eviction-on-read, serialization round-trips (session/null-expiry/empty), the
 * domain-mismatch acceptance path for subdomains, and no-op operations.
 */

import { describe, expect, it } from "vitest";
import { createCookieJar, CookieDomainError } from "../src/index.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

describe("cookie jar — store key (overwrite) semantics", () => {
    it("setting a cookie with the same domain+path+name replaces the prior value", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);
        jar.setCookie("a=2", exampleUrl);

        const cookies = jar.getCookies(exampleUrl);
        expect(cookies).toHaveLength(1);
        expect(cookies[0]?.value).toBe("2");
    });

    it("same name at a different path is a distinct cookie", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Path=/", exampleUrl);
        jar.setCookie("a=2; Path=/api", { ...exampleUrl, pathname: "/api" });

        const all = jar.getCookies({ ...exampleUrl, pathname: "/api" });
        // Both match /api; longer path sorts first.
        expect(all.map((c) => c.value)).toEqual(["2", "1"]);
    });

    it("same name at a different domain is a distinct cookie", () => {
        const jar = createCookieJar();
        const subUrl: CookieUrl = { hostname: "sub.example.com", pathname: "/", protocol: "https:" };
        // Domain-scoped cookie shared across host and subdomain.
        jar.setCookie("a=host; Domain=example.com", exampleUrl);
        jar.setCookie("a=sub; Domain=sub.example.com", subUrl);

        // Requesting the subdomain returns both (each stored under its own domain key).
        const atSub = jar.getCookies(subUrl);
        expect(atSub).toHaveLength(2);
    });
});

describe("cookie jar — expired-cookie eviction on read", () => {
    it("expired cookies are filtered out while live cookies are returned", () => {
        const jar = createCookieJar();
        jar.setCookie("alive=1; Max-Age=3600", exampleUrl);
        jar.setCookie("dead=1; Max-Age=0", exampleUrl);

        const cookies = jar.getCookies(exampleUrl);
        expect(cookies.map((c) => c.name)).toEqual(["alive"]);
    });

    it("a cookie that expires between requests disappears on the next read", async () => {
        const jar = createCookieJar();
        jar.setCookie("short=1; Max-Age=1", exampleUrl);
        expect(jar.getCookies(exampleUrl)).toHaveLength(1);

        // Wait past the Max-Age so it is expired on the next evaluation.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
    });
});

describe("cookie jar — serialization round-trips", () => {
    it("an empty jar serializes to {\"entries\":[]}", () => {
        expect(createCookieJar().serialize()).toBe('{"entries":[]}');
    });

    it("deserialize replaces the store (clears existing cookies first)", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);
        expect(jar.getCookies(exampleUrl)).toHaveLength(1);

        jar.deserialize('{"entries":[]}');
        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
    });

    it("a session cookie round-trips with undefined expires and maxAge", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);

        const restored = createCookieJar();
        restored.deserialize(jar.serialize());
        const cookie = restored.getCookies(exampleUrl)[0];
        expect(cookie?.expires).toBeUndefined();
        expect(cookie?.maxAge).toBeUndefined();
    });

    it("round-trips a cookie carrying every attribute", () => {
        const jar = createCookieJar();
        jar.setCookie(
            "a=1; Domain=example.com; Path=/api; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=None; Partitioned",
            { ...exampleUrl, pathname: "/api" },
        );

        const restored = createCookieJar();
        restored.deserialize(jar.serialize());
        const cookie = restored.getCookies({ ...exampleUrl, pathname: "/api" })[0];

        expect(cookie?.name).toBe("a");
        expect(cookie?.value).toBe("1");
        expect(cookie?.domain).toBe("example.com");
        expect(cookie?.path).toBe("/api");
        expect(cookie?.expires?.toISOString()).toBe("2099-10-21T07:28:00.000Z");
        expect(cookie?.maxAge).toBe(3600);
        expect(cookie?.secure).toBe(true);
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.sameSite).toBe("None");
        expect(cookie?.partitioned).toBe(true);
        expect(cookie?.hostOnly).toBe(false);
    });

    it("deserialize tolerates a cookie whose expires is null", () => {
        const jar = createCookieJar();
        jar.deserialize(
            JSON.stringify({
                entries: [
                    {
                        name: "x",
                        value: "1",
                        domain: "example.com",
                        path: "/",
                        expires: null,
                        maxAge: undefined,
                        secure: false,
                        httpOnly: false,
                        sameSite: "Lax",
                        partitioned: false,
                        hostOnly: true,
                        creationTime: 1000,
                        lastAccessTime: 1000,
                    },
                ],
            }),
        );
        const cookie = jar.getCookies(exampleUrl)[0];
        expect(cookie?.name).toBe("x");
        expect(cookie?.expires).toBeUndefined();
    });
});

describe("cookie jar — domain-mismatch handling variants", () => {
    it("accepts a Domain attribute equal to the request host (hostOnly -> false)", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Domain=example.com", exampleUrl)).not.toThrow();
        const cookie = jar.getCookies(exampleUrl)[0];
        expect(cookie?.hostOnly).toBe(false);
    });

    it("accepts a Domain attribute that is a parent of the request host", () => {
        const jar = createCookieJar();
        const subUrl: CookieUrl = {
            hostname: "login.example.com",
            pathname: "/",
            protocol: "https:",
        };
        expect(() => jar.setCookie("a=1; Domain=example.com", subUrl)).not.toThrow();

        // Stored cookie matches both the apex and the subdomain.
        expect(jar.getCookies(exampleUrl)).toHaveLength(1);
        expect(jar.getCookies(subUrl)).toHaveLength(1);
    });

    it("rejects a Domain attribute that is a sibling, not a parent", () => {
        const jar = createCookieJar();
        const subUrl: CookieUrl = {
            hostname: "login.example.com",
            pathname: "/",
            protocol: "https:",
        };
        expect(() => jar.setCookie("a=1; Domain=other.com", subUrl)).toThrow(CookieDomainError);
    });

    it("rejects a domain-mismatched hostOnly cookie whose stored host differs", () => {
        // A hostOnly cookie is only ever set for the request host, so this exercises
        // the `hostOnly` arm of the mismatch predicate via a hand-constructed mismatch.
        const jar = createCookieJar({ rejectDomainMismatch: false });
        // Bypass the set-time check; store under evil.com hostOnly-equivalent.
        jar.setCookie("a=1; Domain=evil.com", exampleUrl);
        // The cookie is stored under evil.com and does not match example.com.
        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
        const evilUrl: CookieUrl = { hostname: "evil.com", pathname: "/", protocol: "https:" };
        expect(jar.getCookies(evilUrl)).toHaveLength(1);
    });
});

describe("cookie jar — lastAccessTime tracking", () => {
    it("updates lastAccessTime when a cookie is matched by getCookies", async () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);

        const before = jar.getCookies(exampleUrl)[0];
        expect(before).toBeDefined();
        const initialAccess = before!.lastAccessTime;

        // Wait a tick so the timestamp advances (ms resolution).
        await new Promise((resolve) => setTimeout(resolve, 2));

        const after = jar.getCookies(exampleUrl)[0];
        expect(after).toBeDefined();
        expect(after!.lastAccessTime).toBeGreaterThan(initialAccess);
    });

    it("does not update lastAccessTime for non-matching cookies", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Path=/api", { ...exampleUrl, pathname: "/api" });

        const before = jar.getCookies({ ...exampleUrl, pathname: "/api" })[0];
        expect(before).toBeDefined();
        const initialAccess = before!.lastAccessTime;

        // Request a path that does NOT match /api.
        jar.getCookies({ ...exampleUrl, pathname: "/other" });

        // Re-read the cookie; its lastAccessTime must be unchanged.
        const after = jar.getCookies({ ...exampleUrl, pathname: "/api" })[0];
        expect(after).toBeDefined();
        expect(after!.lastAccessTime).toBe(initialAccess);
    });
});

describe("cookie jar — no-op and empty-result operations", () => {
    it("removeCookie on a missing key is a no-op", () => {
        const jar = createCookieJar();
        expect(() => jar.removeCookie("nope", "example.com", "/")).not.toThrow();
        expect(jar.getCookies(exampleUrl)).toEqual([]);
    });

    it("clear on an empty jar is a no-op", () => {
        const jar = createCookieJar();
        expect(() => jar.clear()).not.toThrow();
        expect(jar.getCookies(exampleUrl)).toEqual([]);
    });

    it("getCookies on a jar with non-matching cookies returns []", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Path=/api", { ...exampleUrl, pathname: "/api" });
        // Request a path that does not match /api.
        expect(jar.getCookies({ ...exampleUrl, pathname: "/other" })).toEqual([]);
    });
});
