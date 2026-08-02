import { describe, expect, it } from "vitest";
import {
    parseSetCookieHeader,
    cookieMatchesUrl,
    makeCookie,
    isSameSiteHost,
    sameSiteAllows,
    createCookieJar,
} from "../src/index.js";
import type { Cookie, CookieUrl, SameSiteContext } from "../src/types.js";

const exampleUrl: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

/** Build a cookie with an explicit SameSite value, hostOnly, default path/domain. */
function ssCookie(sameSite: "Strict" | "Lax" | "None", secure = false): Cookie {
    return makeCookie({ name: "a", value: "1", sameSite, secure }, exampleUrl);
}

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
