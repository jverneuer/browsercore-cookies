/**
 * CookieJarConsumer conformance — compile proofs against the canonical
 * consumer surface re-exported from @browsercore/contracts 0.2.6
 * (src/config.ts).
 *
 * contracts declares the minimal jar surface a cookie-consuming client
 * (fetch) needs — nothing else (no id, no clone, no clear/serialize):
 *
 *   interface CookieJarConsumer {
 *       getCookies(url: string): readonly Cookie[];
 *       setCookie(raw: string, url: string): void;
 *   }
 *
 * The rich @browsercore/cookies jar is INTENDED to satisfy it structurally
 * (contracts' own doc: "satisfies this interface structurally as a strict
 * superset"). As of contracts 0.2.6 the direct assignment does not compile —
 * two divergences, pinned verbatim below:
 *
 *   1. URL vocabulary — the consumer passes plain `string` urls; this jar's
 *      methods take a parsed {@link CookieUrl} (so callers parse once).
 *   2. Wire Cookie.expires representation — contracts' wire Cookie carries
 *      `expires?: number` (epoch ms); the rich Cookie here carries
 *      `expires: Date | undefined`.
 *
 * Neither divergence is fixable with an additive-optional-params-only change
 * to this package (the url would have to widen `CookieUrl` → `string |
 * CookieUrl`, and expires would change representation entirely), so this file
 * instead pins everything that DOES conform and installs a drift alarm on the
 * assignment itself: the day a contracts/cookies release makes it compile,
 * the @ts-expect-error turns unused and FAILS the gate, forcing the proof to
 * flip positive.
 *
 * The type-level assertions are enforced by the dual typecheck gate
 * (`tsc -p tsconfig.test.json`).
 */

import { describe, expect, it } from "vitest";
import { createCookieJar, makeCookie } from "../src/index.js";
import type { Cookie, CookieJar, CookieUrl } from "../src/index.js";
// Via the barrel re-export — proves the canonical surface is re-exported.
import type { CookieJarConsumer } from "../src/index.js";

const url: CookieUrl = {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
};

const jar: CookieJar = createCookieJar();
jar.setCookie("session=abc; Path=/", url);
const served: Cookie[] = jar.getCookies(url);

// Arity/contravariance proof: the jar's getCookies takes (url, context?) —
// an extra OPTIONAL param. A function with extra optional params is
// assignable where a stricter (url)-only signature is expected, so the
// SameSite context param is NOT one of the divergences.
const arityProof: (url: CookieUrl) => Cookie[] = jar.getCookies;

// Return variance proof: the jar's mutable Cookie[] satisfies a consumer
// that declares a readonly Cookie[] return.
const readonlyProof: readonly Cookie[] = served;

// Field-level proofs: every wire Cookie field except `expires` is satisfied
// by the rich cookie (contracts marks all wire fields optional; required
// rich fields satisfy optional wire fields).
const richCookie = makeCookie({ name: "session", value: "abc" }, url);
const wireName: string | undefined = richCookie.name;
const wireValue: string | undefined = richCookie.value;
const wireDomain: string | undefined = richCookie.domain;
const wirePath: string | undefined = richCookie.path;
const wireMaxAge: number | undefined = richCookie.maxAge;
const wireSecure: boolean | undefined = richCookie.secure;
const wireHttpOnly: boolean | undefined = richCookie.httpOnly;
const wireSameSite: "Strict" | "Lax" | "None" | undefined = richCookie.sameSite;

// The sole field-level divergence, verbatim (tsc):
//   error TS2322: Type 'Date | undefined' is not assignable to type 'number | undefined'.
// @ts-expect-error — expires: rich Date model vs wire epoch-ms number.
const wireExpires: number | undefined = richCookie.expires;

// Drift alarm — the direct assignment, verbatim tsc output today:
//   error TS2322: Type 'CookieJar' is not assignable to type 'CookieJarConsumer'.
//     Types of property 'getCookies' are incompatible.
//       Type '(url: CookieUrl, context?: SameSiteContext | undefined) => Cookie[]'
//         is not assignable to type '(url: string) => readonly Cookie[]'.
//       Types of parameters 'url' and 'url' are incompatible.
//         Type 'string' is not assignable to type 'CookieUrl'.
//   (setCookie carries the same url divergence; the return element then trips
//   TS2375 on the expires field under exactOptionalPropertyTypes.)
// @ts-expect-error — remove when the url vocabulary and the expires
// representation align (contracts 0.2.x / cookies 0.3.x decision); then make
// the positive assignment the conformance proof.
const consumer: CookieJarConsumer = jar;

describe("CookieJarConsumer conformance (contracts 0.2.6)", () => {
    it("serves and stores through exactly the two consumer methods", () => {
        expect(served.map((c) => `${c.name}=${c.value}`)).toEqual(["session=abc"]);
        expect(consumer).toBe(jar); // same object — the divergence is static, not runtime
    });

    it("optional SameSite context param is consumer-compatible (arity proof)", () => {
        expect(arityProof).toBeTypeOf("function");
        expect(readonlyProof).toBe(served);
    });

    it("every wire Cookie field except expires is satisfied by the rich cookie", () => {
        expect(wireName).toBe("session");
        expect(wireValue).toBe("abc");
        expect(wireDomain).toBe("example.com");
        expect(wirePath).toBe("/");
        expect(wireMaxAge).toBeUndefined();
        expect(wireSecure).toBe(false);
        expect(wireHttpOnly).toBe(false);
        expect(wireSameSite).toBe("Lax"); // absent option defaults to Lax (RFC 6265bis default)
        expect(wireExpires).toBeUndefined(); // no expiry set — the Date|number divergence is representational
    });
});
