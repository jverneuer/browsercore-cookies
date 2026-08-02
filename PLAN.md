# @browsercore/cookies — Implementation Plan

RFC 6265-compliant cookie management. Implement in this order; each step is
independently testable.

## Step 1 — Cookie type + parsing (DONE)

Define `Cookie`, `CookieOptions`, `CookieUrl`, `CookieMatchResult` in `src/types.ts`.
Implement `parseSetCookieHeader()` in `src/cookie.ts` to parse name=value plus
attributes (Expires, Max-Age, Domain, Path, Secure, HttpOnly, SameSite, Partitioned)
with RFC 6265 defaults.

## Step 2 — Domain matching (DONE)

Implement `cookieMatchesUrl()` domain matching per RFC 6265 §5.1.3: exact match
for hostOnly cookies, suffix match for domain cookies (with leading-dot handling).

## Step 3 — Path matching (DONE)

Implement path matching per RFC 6265 §5.1.4 in `cookieMatchesUrl()`: exact match
or request path starts with cookie path followed by "/" (or cookie path ends with "/").

## Step 4 — Expiration handling (DONE)

Implement `isExpired()` honoring both `Max-Age` (relative to creationTime) and
`Expires` (absolute). `getCookies()` filters expired cookies.

## Step 5 — Jar data structure (DONE)

Implement `createCookieJar()` in `src/jar.ts` backed by a `Map<domain\0path\0name, Cookie>`.
Supports setCookie (with optional domain-mismatch rejection), removeCookie, clear.

## Step 6 — getCookies filtering (DONE)

`getCookies()` iterates the store, applies `cookieMatchesUrl()`, and returns only
matching, non-expired cookies.

## Step 7 — SameSite enforcement (PARTIAL)

SameSite is parsed and stored. Cross-site enforcement (whether to send on a request)
is left to the higher layer — this package exposes the attribute and lets callers
decide based on request context.

## Step 8 — Secure / HttpOnly flags (DONE)

Secure is enforced in `cookieMatchesUrl()` (only sent over https). HttpOnly is
stored but not enforced at the transport level (it is a client-script restriction).

## Step 9 — Persistence (JSON file) (DONE)

Implement `saveJar()` / `loadJar()` in `src/persistence.ts` using `node:fs/promises`.
`serialize()` / `deserialize()` on the jar convert cookies to/from JSON.

## Step 10 — Cookie sorting (RFC 6265 §5.4) (DONE)

`getCookies()` sorts results by longer path first, then earlier creation time.

## Definition of done

- [x] Cookie type + RFC 6265 Set-Cookie parser.
- [x] Domain matching per RFC 6265 §5.1.3.
- [x] Path matching per RFC 6265 §5.1.4.
- [x] Expiration handling (Max-Age + Expires).
- [x] Jar data structure with set/remove/clear.
- [x] getCookies filtering by match + expiry.
- [x] Secure flag enforcement.
- [x] JSON persistence via node:fs.
- [x] RFC 6265 §5.4 sorting.
- [ ] SameSite cross-site enforcement at the jar level.
- [ ] Every test in `tests/` passes; `tsc --build` is clean.
