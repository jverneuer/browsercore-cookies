import { describe, expect, it } from "vitest";
import {
    makeCookie,
    normalizeDomain,
    defaultPath,
    CookieDomainError,
    CookieParseError,
    CookieError,
    assertNever,
} from "../src/index.js";
import { createId } from "../src/utils.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

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
