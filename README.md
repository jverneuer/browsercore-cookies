# @browsercore/cookies


[![npm version](https://img.shields.io/npm/v/@browsercore/cookies)](https://www.npmjs.com/package/@browsercore/cookies)
[![coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jverneuer/browsercore-cookies/main/.github/coverage-badge.json)](https://github.com/jverneuer/browsercore-cookies/blob/main/COVERAGE.md)
[![lint](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-cookies/ci.yml?label=lint)](https://github.com/jverneuer/browsercore-cookies/actions/workflows/ci.yml)

RFC 6265-compliant cookie management: parsing, jar, domain matching, SameSite enforcement, and JSON persistence — independent from any HTTP transport.

## Responsibility

Parse `Set-Cookie` headers, match cookies against request URLs per RFC 6265 §5 (domain, path, Secure, expiry) plus RFC 6265bis SameSite, and manage an in-memory cookie jar with serialize/deserialize for persistence. Higher layers (`http1`, `http2`, `fetch`) compose through these exports — this package performs no I/O of its own beyond the optional `saveJar`/`loadJar` module.

## What it does NOT know about

- HTTP request/response serialization
- Sockets or transports
- Browser fingerprints

## Install

```bash
npm install @browsercore/cookies
```

## Quick usage

```ts
import { createCookieJar, parseSetCookieHeader } from "@browsercore/cookies";

const jar = createCookieJar();
jar.setCookie("session=abc; Secure; SameSite=Lax", {
    hostname: "example.com",
    pathname: "/",
    protocol: "https:",
});

const cookies = jar.getCookies({
    hostname: "example.com",
    pathname: "/account",
    protocol: "https:",
});
```

## Public API

| Export | Kind | Purpose |
| --- | --- | --- |
| `createCookieJar()` | function | Build an in-memory jar |
| `parseSetCookieHeader()` | function | RFC 6265 `Set-Cookie` parser |
| `cookieMatchesUrl()` | function | Domain + path + secure + expiry + SameSite match test |
| `CookieMatchResult` | discriminated union | Why a cookie matched or not |
| `Cookie` | interface | Immutable cookie value |
| `CookieJar` | interface | get/set/clear/serialize contract |
| `CookieOptions` | interface | Fields for `makeCookie()` |
| `CookieUrl` | interface | URL parts relevant to matching |
| `SameSite` | literal union | `"Strict" \| "Lax" \| "None"` |
| `SameSiteContext` | interface | Request context for SameSite evaluation |
| `CookieJarOptions` | interface | Tuning options (`rejectDomainMismatch`) |
| `CookieJarId` | branded type | Opaque jar identifier |
| `makeCookie()` | function | Build a `Cookie` from options with RFC defaults |
| `isExpired()` | function | Expiry predicate (Max-Age / Expires) |
| `normalizeDomain()` | function | RFC 6265 §5.1.2 domain normalization |
| `defaultPath()` | function | RFC 6265 §5.1.4 default path derivation |
| `sameSiteAllows()` | function | SameSite enforcement decision |
| `isSameSiteHost()` | function | Same-site host heuristic |
| `saveJar()` / `loadJar()` | function | JSON file persistence |
| `assertNever()` | function | Exhaustiveness check for switches |
| `CookieError` | class | Base typed error (matched on `kind`) |
| `CookieDomainError` | class | Domain mismatch |
| `CookieParseError` | class | Unparseable `Set-Cookie` header |

## Dependency graph

```
@browsercore/cookies
  └─ node:fs (persistence only)
```

No other `@browsercore/*` packages are imported.

## License

MIT
