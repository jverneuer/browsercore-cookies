import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createCookieJar,
    parseSetCookieHeader,
    CookieDomainError,
    saveJar,
    loadJar,
} from "../src/index.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

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

    it("accepts a Domain with a trailing dot — matches the bare host (rejectDomainMismatch on)", () => {
        // normalizeDomain strips the trailing dot, so `Domain=example.com.` is
        // equivalent to `Domain=example.com` and must not trip rejectDomainMismatch.
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Domain=example.com.", exampleUrl)).not.toThrow();
        // The stored cookie is served back for a request to the bare host.
        expect(jar.getCookies(exampleUrl).map((c) => c.name)).toEqual(["a"]);
    });

    it("expired cookies are filtered from getCookies", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Max-Age=0", exampleUrl);
        const url: CookieUrl = { hostname: "example.com", pathname: "/", protocol: "https:" };

        expect(jar.getCookies(url)).toHaveLength(0);
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
