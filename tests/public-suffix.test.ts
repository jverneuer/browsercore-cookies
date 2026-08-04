/**
 * Public Suffix List + cookie prefix + same-site domain computation.
 *
 * Covers the bundled PSL snapshot (isPublicSuffix / registrableDomain), the
 * RFC 6265 §5.3 step 11 public-suffix rejection in setCookie, the __Host- /
 * __Secure- prefix rules, and the registrable-domain same-site comparison.
 */

import { describe, expect, it } from "vitest";
import {
    createCookieJar,
    isPublicSuffix,
    registrableDomain,
    parseSetCookieHeader,
    CookiePublicSuffixError,
    CookiePrefixError,
    isSameSiteHost,
    CookieParseError,
} from "../src/index.js";
import type { CookieUrl } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

const secureUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

describe("isPublicSuffix", () => {
    it("recognizes generic TLDs as public suffixes", () => {
        expect(isPublicSuffix("com")).toBe(true);
        expect(isPublicSuffix("org")).toBe(true);
        expect(isPublicSuffix("net")).toBe(true);
        expect(isPublicSuffix("edu")).toBe(true);
        expect(isPublicSuffix("gov")).toBe(true);
    });

    it("recognizes all bundled country-code TLDs as public suffixes", () => {
        expect(isPublicSuffix("uk")).toBe(true);
        expect(isPublicSuffix("de")).toBe(true);
        expect(isPublicSuffix("jp")).toBe(true);
        expect(isPublicSuffix("fr")).toBe(true);
        expect(isPublicSuffix("au")).toBe(true);
        expect(isPublicSuffix("br")).toBe(true);
        expect(isPublicSuffix("io")).toBe(true);
    });

    it("recognizes multi-level ICANN suffixes as public suffixes", () => {
        expect(isPublicSuffix("co.uk")).toBe(true);
        expect(isPublicSuffix("com.au")).toBe(true);
        expect(isPublicSuffix("co.jp")).toBe(true);
        expect(isPublicSuffix("com.br")).toBe(true);
        expect(isPublicSuffix("github.io")).toBe(true);
        expect(isPublicSuffix("cloudfront.net")).toBe(true);
        expect(isPublicSuffix("s3.amazonaws.com")).toBe(true);
    });

    it("treats a registrable name under a suffix as NOT a public suffix", () => {
        expect(isPublicSuffix("example.com")).toBe(false);
        expect(isPublicSuffix("shop.example.co.uk")).toBe(false);
        expect(isPublicSuffix("myapp.herokuapp.com")).toBe(false);
    });

    it("applies wildcard rules: any single label under the wildcard is a public suffix", () => {
        // *.ck → foo.ck is a public suffix
        expect(isPublicSuffix("foo.ck")).toBe(true);
        expect(isPublicSuffix("bar.ck")).toBe(true);
    });

    it("honors exception rules: the excepted name is NOT a public suffix", () => {
        // !www.ck overrides *.ck for www.ck specifically
        expect(isPublicSuffix("www.ck")).toBe(false);
        // But other names under *.ck are still public suffixes.
        expect(isPublicSuffix("other.ck")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isPublicSuffix("COM")).toBe(true);
        expect(isPublicSuffix("Example.COM")).toBe(false);
        expect(isPublicSuffix("Co.Uk")).toBe(true);
    });

    it("tolerates leading and trailing dots", () => {
        expect(isPublicSuffix(".com")).toBe(true);
        expect(isPublicSuffix("com.")).toBe(true);
        expect(isPublicSuffix("example.com.")).toBe(false);
    });

    it("returns false for empty input", () => {
        expect(isPublicSuffix("")).toBe(false);
    });
});

describe("registrableDomain", () => {
    it("returns the registrable domain one label above the public suffix", () => {
        expect(registrableDomain("example.com")).toBe("example.com");
        expect(registrableDomain("www.example.com")).toBe("example.com");
        expect(registrableDomain("a.b.example.com")).toBe("example.com");
    });

    it("respects multi-level suffixes", () => {
        expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
        expect(registrableDomain("example.co.uk")).toBe("example.co.uk");
        expect(registrableDomain("myapp.herokuapp.com")).toBe("myapp.herokuapp.com");
    });

    it("returns null when the input IS a public suffix (nothing to register above it)", () => {
        expect(registrableDomain("com")).toBeNull();
        expect(registrableDomain("co.uk")).toBeNull();
        expect(registrableDomain("github.io")).toBeNull();
    });

    it("returns null for wildcard public suffixes", () => {
        // foo.ck is itself a public suffix via *.ck → no registrable domain.
        expect(registrableDomain("foo.ck")).toBeNull();
    });

    it("returns the excepted name as a registrable domain", () => {
        // www.ck is excepted from *.ck, so its registrable domain is www.ck (under ck).
        expect(registrableDomain("www.ck")).toBe("www.ck");
    });

    it("returns null for empty input", () => {
        expect(registrableDomain("")).toBeNull();
    });

    it("is case-insensitive and dot-tolerant", () => {
        expect(registrableDomain("WWW.Example.COM")).toBe("example.com");
        expect(registrableDomain("example.com.")).toBe("example.com");
    });
});

describe("parseSetCookieHeader — public-suffix rejection (RFC 6265 §5.3 step 11)", () => {
    it("rejects a Domain attribute that is a generic TLD", () => {
        expect(() => parseSetCookieHeader("a=1; Domain=com", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
    });

    it("rejects a Domain attribute that is a country-code TLD", () => {
        expect(() => parseSetCookieHeader("a=1; Domain=uk", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
    });

    it("rejects a Domain attribute that is a multi-level suffix", () => {
        expect(() => parseSetCookieHeader("a=1; Domain=co.uk", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
        expect(() => parseSetCookieHeader("a=1; Domain=github.io", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
    });

    it("rejects a Domain attribute that is a private-domain suffix", () => {
        expect(() => parseSetCookieHeader("a=1; Domain=cloudfront.net", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
        expect(() => parseSetCookieHeader("a=1; Domain=azurewebsites.net", secureUrl)).toThrow(
            CookiePublicSuffixError,
        );
    });

    it("does NOT reject a Domain that is a registrable name under a suffix", () => {
        // example.com is registrable under com — not a public suffix itself.
        expect(() => parseSetCookieHeader("a=1; Domain=example.com", secureUrl)).not.toThrow();
    });

    it("exposes the offending domain on the error", () => {
        try {
            parseSetCookieHeader("a=1; Domain=co.uk", secureUrl);
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(CookiePublicSuffixError);
            expect((e as CookiePublicSuffixError).domain).toBe("co.uk");
        }
    });

    it("rejects a public-suffix domain even when rejectDomainMismatch is false", () => {
        // RFC 6265 §5.3 step 11 is mandatory — public-suffix rejection cannot be opted out.
        const jar = createCookieJar({ rejectDomainMismatch: false });
        expect(() => jar.setCookie("a=1; Domain=com", exampleUrl)).toThrow(
            CookiePublicSuffixError,
        );
    });

    it("does not reject when no Domain attribute is given and the host is registrable", () => {
        // Implicit domain = url.hostname = "example.com", which is registrable.
        expect(() => parseSetCookieHeader("a=1", secureUrl)).not.toThrow();
    });
});

describe("parseSetCookieHeader — __Host- prefix enforcement", () => {
    const hostCookieRaw = "__Host-token=abc; Secure; Path=/";

    it("accepts a valid __Host- cookie (Secure, Path=/, no Domain)", () => {
        const cookie = parseSetCookieHeader(hostCookieRaw, secureUrl);
        expect(cookie.name).toBe("__Host-token");
        expect(cookie.secure).toBe(true);
        expect(cookie.path).toBe("/");
        expect(cookie.hostOnly).toBe(true);
    });

    it("rejects __Host- cookie without Secure", () => {
        expect(() =>
            parseSetCookieHeader("__Host-token=abc; Path=/", secureUrl),
        ).toThrow(CookiePrefixError);
    });

    it("rejects __Host- cookie without Path=/", () => {
        expect(() =>
            parseSetCookieHeader("__Host-token=abc; Secure; Path=/api", secureUrl),
        ).toThrow(CookiePrefixError);
    });

    it("rejects __Host- cookie that carries a Domain attribute", () => {
        expect(() =>
            parseSetCookieHeader(
                "__Host-token=abc; Secure; Path=/; Domain=example.com",
                secureUrl,
            ),
        ).toThrow(CookiePrefixError);
    });

    it("exposes the cookie name and detail on a prefix error", () => {
        try {
            parseSetCookieHeader("__Host-x=1", secureUrl);
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(CookiePrefixError);
            const err = e as CookiePrefixError;
            expect(err.cookieName).toBe("__Host-x");
            expect(err.detail).toContain("Secure");
        }
    });
});

describe("parseSetCookieHeader — __Secure- prefix enforcement", () => {
    it("accepts a valid __Secure- cookie (Secure)", () => {
        const cookie = parseSetCookieHeader("__Secure-id=abc; Secure", secureUrl);
        expect(cookie.name).toBe("__Secure-id");
        expect(cookie.secure).toBe(true);
    });

    it("rejects __Secure- cookie without Secure", () => {
        expect(() => parseSetCookieHeader("__Secure-id=abc", secureUrl)).toThrow(
            CookiePrefixError,
        );
    });

    it("does not enforce __Secure- rules on an un-prefixed cookie", () => {
        // A cookie named "securely" must NOT be treated as __Secure-.
        const cookie = parseSetCookieHeader("securely=abc", secureUrl);
        expect(cookie.secure).toBe(false);
    });
});

describe("parseSetCookieHeader — cookie prefix does not shadow parse errors", () => {
    it("still throws CookieParseError on a malformed header before prefix checks", () => {
        // No '=' at all — fails at name=value parsing, never reaches prefix logic.
        expect(() => parseSetCookieHeader("__Host-badnoeq", secureUrl)).toThrow(
            CookieParseError,
        );
    });
});

describe("isSameSiteHost — registrable-domain comparison", () => {
    it("same registrable domain → same-site", () => {
        expect(isSameSiteHost("example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("www.example.com", "example.com")).toBe(true);
        expect(isSameSiteHost("example.com", "shop.example.com")).toBe(true);
        expect(isSameSiteHost("a.b.example.com", "example.com")).toBe(true);
    });

    it("different registrable domains under a shared suffix → cross-site", () => {
        expect(isSameSiteHost("other.com", "example.com")).toBe(false);
        expect(isSameSiteHost("evil-example.com", "example.com")).toBe(false);
    });

    it("distinguishes registrants under a public-suffix host (the old leak)", () => {
        // Both are registrable names under github.io, but they are DIFFERENT
        // registrable domains → cross-site. The old suffix matcher would have
        // incorrectly returned true because "bar.github.io" ends with ".github.io".
        expect(isSameSiteHost("foo.github.io", "bar.github.io")).toBe(false);
        // Same registrable domain → same-site.
        expect(isSameSiteHost("foo.github.io", "www.foo.github.io")).toBe(true);
    });

    it("respects multi-level suffixes", () => {
        // Same registrable domain under co.uk.
        expect(isSameSiteHost("shop.example.co.uk", "example.co.uk")).toBe(true);
        // Different registrable domains under co.uk.
        expect(isSameSiteHost("shop.example.co.uk", "other.co.uk")).toBe(false);
    });

    it("returns false when either host IS a public suffix (no registrable domain)", () => {
        // "com" has no registrable domain → can't be same-site with anything.
        expect(isSameSiteHost("com", "example.com")).toBe(false);
        expect(isSameSiteHost("example.com", "com")).toBe(false);
    });

    it("returns false for two different public suffixes", () => {
        // com and org are both public suffixes but distinct.
        expect(isSameSiteHost("com", "org")).toBe(false);
    });

    it("treats an identical public suffix as same-site with itself", () => {
        // Exact-match short-circuit: a host is trivially same-site with itself
        // even if it is a public suffix (no cross-site leakage possible).
        expect(isSameSiteHost("com", "com")).toBe(true);
    });
});

describe("cookie jar — public-suffix rejection end-to-end", () => {
    it("setCookie throws when the implicit host domain is a public suffix", () => {
        const jar = createCookieJar();
        const comUrl: CookieUrl = { hostname: "com", pathname: "/", protocol: "https:" };
        // Implicit Domain = "com" (the request host) which is a public suffix.
        expect(() => jar.setCookie("a=1", comUrl)).toThrow(CookiePublicSuffixError);
    });

    it("setCookie does not store a rejected public-suffix cookie", () => {
        const jar = createCookieJar();
        try {
            jar.setCookie("a=1; Domain=com", exampleUrl);
        } catch {
            // expected — public suffix rejected
        }
        // No cookie was stored under com or example.com.
        expect(jar.getCookies(exampleUrl)).toHaveLength(0);
    });
});
