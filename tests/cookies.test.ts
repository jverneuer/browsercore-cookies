import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createCookieJar,
    parseSetCookieHeader,
    cookieMatchesUrl,
    isExpired,
    normalizeDomain,
    defaultPath,
    CookieDomainError,
    CookieParseError,
    CookieError,
    makeCookie,
    isSameSiteHost,
    sameSiteAllows,
    saveJar,
    loadJar,
    assertNever,
} from "../src/index.js";
import { createId } from "../src/utils.js";
import type { Cookie, CookieUrl, SameSiteContext } from "../src/types.js";

/** Build a cookie with an explicit SameSite value, hostOnly, default path/domain. */
function ssCookie(sameSite: "Strict" | "Lax" | "None", secure = false) {
    return makeCookie({ name: "a", value: "1", sameSite, secure }, exampleUrl);
}

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

    it("expired cookies are filtered from getCookies", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Max-Age=0", exampleUrl);
        const url: CookieUrl = { hostname: "example.com", pathname: "/", protocol: "https:" };

        expect(jar.getCookies(url)).toHaveLength(0);
    });
});

describe("cookie jar", () => {
    it("stores and retrieves cookies by url", () => {
        const jar = createCookieJar();
        jar.setCookie("session=abc", exampleUrl);
        jar.setCookie("prefs=dark", exampleUrl);

        const cookies = jar.getCookies(exampleUrl);
        expect(cookies.map((c) => c.name).sort()).toEqual(["prefs", "session"]);
    });

    it("removeCookie deletes a specific cookie", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);
        jar.removeCookie("a", "example.com", "/");

        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
    });

    it("clear empties the jar", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", exampleUrl);
        jar.clear();

        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
    });

    it("serialize + deserialize round-trips cookies", () => {
        const jar = createCookieJar();
        jar.setCookie("session=abc123; Path=/; Secure", exampleUrl);

        const json = jar.serialize();
        const restored = createCookieJar();
        restored.deserialize(json);

        expect(restored.getCookies(exampleUrl)).toHaveLength(1);
        expect(restored.getCookies(exampleUrl)[0]?.value).toBe("abc123");
    });

    it("rejects cookies whose domain does not match the request host", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Domain=.evil.com", exampleUrl)).toThrow(
            CookieDomainError,
        );
    });
});

describe("utility functions", () => {
    it("normalizeDomain strips leading dot and lowercases", () => {
        expect(normalizeDomain(".Example.COM")).toBe("example.com");
    });

    it("defaultPath derives the directory prefix", () => {
        expect(defaultPath("/a/b/c")).toBe("/a/b");
        expect(defaultPath("/")).toBe("/");
        expect(defaultPath("")).toBe("/");
        expect(defaultPath("nopath")).toBe("/");
    });
});

describe("SameSite enforcement", () => {
    const crossSiteSubresource: SameSiteContext = {
        topLevelSite: "other.com",
        isTopLevelNavigation: false,
    };
    const crossSiteGetNavigation: SameSiteContext = {
        topLevelSite: "other.com",
        isTopLevelNavigation: true,
        method: "GET",
    };
    const crossSitePost: SameSiteContext = {
        topLevelSite: "other.com",
        isTopLevelNavigation: false,
        method: "POST",
    };
    const sameSiteContext: SameSiteContext = {
        topLevelSite: "example.com",
        isTopLevelNavigation: false,
    };

    it("isSameSiteHost treats exact and suffix host matches as same-site", () => {
        expect(isSameSiteHost("example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("login.example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("example.com", "login.example.com")).toBe(true);
        expect(isSameSiteHost("other.com", "example.com")).toBe(false);
        expect(isSameSiteHost("evil-example.com", "example.com")).toBe(false);
    });

    it("Strict cookie matches a same-site request", () => {
        const cookie = ssCookie("Strict");
        expect(cookieMatchesUrl(cookie, exampleUrl, sameSiteContext).matched).toBe(true);
    });

    it("Strict cookie is blocked on a cross-site subresource request", () => {
        const cookie = ssCookie("Strict");
        const result = cookieMatchesUrl(cookie, exampleUrl, crossSiteSubresource);
        expect(result.matched).toBe(false);
        expect(result.reason).toBe("same_site");
    });

    it("Lax cookie matches a same-site request", () => {
        const cookie = ssCookie("Lax");
        expect(cookieMatchesUrl(cookie, exampleUrl, sameSiteContext).matched).toBe(true);
    });

    it("Lax cookie matches a cross-site safe top-level navigation (GET)", () => {
        const cookie = ssCookie("Lax");
        expect(cookieMatchesUrl(cookie, exampleUrl, crossSiteGetNavigation).matched).toBe(true);
    });

    it("Lax cookie is blocked on a cross-site non-safe subresource (POST)", () => {
        const cookie = ssCookie("Lax");
        const result = cookieMatchesUrl(cookie, exampleUrl, crossSitePost);
        expect(result.matched).toBe(false);
        expect(result.reason).toBe("same_site");
    });

    it("Lax cookie defaults to safe when method is omitted on a top-level navigation", () => {
        const cookie = ssCookie("Lax");
        const ctx: SameSiteContext = { topLevelSite: "other.com", isTopLevelNavigation: true };
        expect(sameSiteAllows(cookie, exampleUrl, ctx)).toBe(true);
    });

    it("None (Secure) cookie matches a cross-site request", () => {
        const cookie = ssCookie("None", true);
        expect(cookieMatchesUrl(cookie, exampleUrl, crossSiteSubresource).matched).toBe(true);
    });

    it("None cookie still requires a secure transport", () => {
        const cookie = ssCookie("None", true);
        const httpUrl: CookieUrl = { hostname: "example.com", pathname: "/", protocol: "http:" };
        const result = cookieMatchesUrl(cookie, httpUrl, crossSiteSubresource);
        expect(result.matched).toBe(false);
        expect(result.reason).toBe("secure_required");
    });

    it("omitting context preserves domain/path/secure/expiry-only behavior", () => {
        const strict = ssCookie("Strict");
        // Without context, a Strict cookie is NOT blocked — SameSite is not enforced.
        expect(cookieMatchesUrl(strict, exampleUrl).matched).toBe(true);

        const none = ssCookie("None", true);
        const httpUrl: CookieUrl = { hostname: "example.com", pathname: "/", protocol: "http:" };
        expect(cookieMatchesUrl(none, httpUrl).matched).toBe(false);
        // Overriding the union reason to confirm it's the Secure check, not SameSite.
        expect(cookieMatchesUrl(none, httpUrl).reason).toBe("secure_required");
    });

    it("getCookies applies SameSite when a context is provided", () => {
        const jar = createCookieJar();
        jar.setCookie("strict=1; SameSite=Strict", exampleUrl);
        jar.setCookie("lax=1; SameSite=Lax", exampleUrl);
        jar.setCookie("none=1; SameSite=None; Secure", exampleUrl);

        const all = jar.getCookies(exampleUrl);
        expect(all.map((c) => c.name).sort()).toEqual(["lax", "none", "strict"]);

        const crossSite = jar.getCookies(exampleUrl, crossSiteSubresource);
        // Only the None cookie survives a cross-site subresource request.
        expect(crossSite.map((c) => c.name)).toEqual(["none"]);
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

describe("makeCookie defaults", () => {
    it("applies RFC 6265 defaults when optional fields are omitted", () => {
        const url: CookieUrl = { hostname: "Example.COM", pathname: "/x/y", protocol: "https:" };
        const cookie = makeCookie({ name: "a", value: "1" }, url, 1000);

        expect(cookie.domain).toBe("example.com");
        expect(cookie.path).toBe("/x");
        expect(cookie.secure).toBe(false);
        expect(cookie.httpOnly).toBe(false);
        expect(cookie.sameSite).toBe("Lax");
        expect(cookie.partitioned).toBe(false);
        expect(cookie.hostOnly).toBe(true);
        expect(cookie.creationTime).toBe(1000);
        expect(cookie.lastAccessTime).toBe(1000);
    });

    it("honors every explicit option", () => {
        const expires = new Date(Date.now() + 60_000);
        const cookie = makeCookie(
            {
                name: "a",
                value: "1",
                domain: ".Example.com",
                path: "/api",
                expires,
                maxAge: 30,
                secure: true,
                httpOnly: true,
                sameSite: "Strict",
                partitioned: true,
                hostOnly: false,
            },
            exampleUrl,
            2000,
        );

        expect(cookie.domain).toBe("example.com");
        expect(cookie.path).toBe("/api");
        expect(cookie.expires).toBe(expires);
        expect(cookie.maxAge).toBe(30);
        expect(cookie.secure).toBe(true);
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe("Strict");
        expect(cookie.partitioned).toBe(true);
        expect(cookie.hostOnly).toBe(false);
        expect(cookie.creationTime).toBe(2000);
    });
});

describe("cookie jar sorting and domain-mismatch handling", () => {
    it("sorts cookies by longer path first (RFC 6265 §5.4)", () => {
        const jar = createCookieJar();
        // Both match "/a" but have different path lengths.
        jar.setCookie("short=1; Path=/", exampleUrl);
        jar.setCookie("long=1; Path=/a", { ...exampleUrl, pathname: "/a" });

        const cookies = jar.getCookies({ ...exampleUrl, pathname: "/a" });
        expect(cookies.map((c) => c.name)).toEqual(["long", "short"]);
    });

    it("breaks path-length ties by earlier creation time", () => {
        const jar = createCookieJar();
        jar.setCookie("first=1; Path=/api", exampleUrl);
        jar.setCookie("second=2; Path=/api", exampleUrl);

        const cookies = jar.getCookies({ ...exampleUrl, pathname: "/api" });
        expect(cookies.map((c) => c.name)).toEqual(["first", "second"]);
    });

    it("accepts a domain-mismatched cookie when rejectDomainMismatch is false", () => {
        const jar = createCookieJar({ rejectDomainMismatch: false });
        // Would throw under the default (true) setting.
        expect(() => jar.setCookie("a=1; Domain=.evil.com", exampleUrl)).not.toThrow();
        // The cookie is stored under evil.com; it matches that host, not example.com.
        const evilUrl: CookieUrl = { hostname: "evil.com", pathname: "/", protocol: "https:" };
        expect(jar.getCookies(evilUrl)).toHaveLength(1);
    });
});

describe("cookie jar serialization with expiry", () => {
    it("round-trips a cookie that has an Expires date", () => {
        const jar = createCookieJar();
        // Far enough in the future that the cookie is not expired when read back.
        jar.setCookie("a=1; Expires=Wed, 21 Oct 2099 07:28:00 GMT", exampleUrl);

        const restored = createCookieJar();
        restored.deserialize(jar.serialize());

        const cookies = restored.getCookies(exampleUrl);
        expect(cookies).toHaveLength(1);
        expect(cookies[0]?.expires).toBeInstanceOf(Date);
        expect(cookies[0]?.expires?.toISOString()).toBe("2099-10-21T07:28:00.000Z");
    });
});

describe("persistence (saveJar / loadJar)", () => {
    it("writes a jar to disk and reads it back", async () => {
        const dir = await mkdtemp(join(tmpdir(), "cookies-"));
        const file = join(dir, "jar.json");
        try {
            const jar = createCookieJar();
            jar.setCookie("session=abc; Path=/; Secure", exampleUrl);
            jar.setCookie("prefs=dark", exampleUrl);
            await saveJar(jar, file);

            const loaded = await loadJar(file);
            const cookies = loaded.getCookies(exampleUrl);
            expect(cookies.map((c) => c.name).sort()).toEqual(["prefs", "session"]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("error classes", () => {
    it("CookieDomainError carries its kind and fields", () => {
        const err = new CookieDomainError(".evil.com", "example.com");
        expect(err).toBeInstanceOf(CookieError);
        expect(err.kind).toBe("CookieDomainError");
        expect(err.domain).toBe(".evil.com");
        expect(err.requestHost).toBe("example.com");
        expect(err.name).toBe("CookieDomainError");
    });

    it("CookieParseError carries its kind and raw header", () => {
        const err = new CookieParseError("bad", "empty header");
        expect(err).toBeInstanceOf(CookieError);
        expect(err.kind).toBe("CookieParseError");
        expect(err.raw).toBe("bad");
        expect(err.name).toBe("CookieParseError");
    });

    it("CookieError records an optional cause", () => {
        const cause = new Error("root");
        const err = new CookieError("TestError", "boom", { cause });
        expect(err.kind).toBe("TestError");
        expect(err.cause).toBe(cause);
        expect(err.name).toBe("CookieError");
    });
});

describe("utility functions", () => {
    it("assertNever throws on any value", () => {
        // `assertNever` is typed `(x: never)`; callers only hit it on exhaustiveness
        // failures, so we exercise the throw with a forced `never` argument.
        expect(() => assertNever("surprise" as never)).toThrow(/Unexpected value/);
    });

    it("createId builds a branded id with the given prefix", () => {
        const id = createId("jar");
        expect(id.startsWith("jar_")).toBe(true);
        // prefix + "_" + timestamp(base36) + "_" + random(base36).
        expect(id.split("_")).toHaveLength(3);
    });
});
