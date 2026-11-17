# @browsercore/cookies


[![npm version](https://img.shields.io/npm/v/@browsercore/cookies)](https://www.npmjs.com/package/@browsercore/cookies)
[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-cookies/badge.json)](https://jverneuer.github.io/browsercore-cookies/COVERAGE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-cookies/ci.yml?label=ci)](https://github.com/jverneuer/browsercore-cookies/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@browsercore/cookies.svg)](LICENSE)

RFC 6265-compliant cookie management: parsing, jar, domain matching, SameSite enforcement, and JSON persistence. It's independent from any HTTP transport.

## Responsibility

Parse `Set-Cookie` headers, match cookies against request URLs per RFC 6265 §5 (domain, path, Secure, expiry) plus RFC 6265bis SameSite, and manage an in-memory cookie jar with serialize/deserialize for persistence. Higher layers (`http1`, `http2`, `fetch`) compose through these exports; this package performs no I/O of its own beyond the optional `saveJar`/`loadJar` module.

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

**Canonical consumer surface (0.2.1).** `CookieJarConsumer`, the minimal jar interface a cookie-consuming client needs (`getCookies(url)` + `setCookie(raw, url)`, nothing else). is declared canonically in `@browsercore/contracts` 0.2.6 (`src/config.ts`) and re-exported from this package; fetch consumes this surface next wave, dropping its direct type dependency on `@browsercore/cookies`. This rich `CookieJar` is the intended structural implementor. Two divergences currently block the direct `const consumer: CookieJarConsumer = jar` assignment (pinned verbatim, with compile proofs and a drift alarm, in `tests/cookie-jar-consumer.test.ts`):

1. **URL vocabulary**: the consumer passes plain `string` urls; this jar's methods take a parsed `CookieUrl` (callers parse once).
2. **`expires` representation**: contracts' wire `Cookie` carries `expires?: number` (epoch ms); the rich `Cookie` here carries `expires: Date | undefined`.

Everything else conforms (the optional SameSite `context` param, return variance, and every wire `Cookie` field except `expires`). Neither divergence is fixable with an additive-optional-params-only change to this package, so alignment is a deliberate contracts-0.2.x / cookies-0.3.x decision, and the drift-alarm test fails the typecheck gate the moment an upstream change makes the assignment compile.

## Public API

| Export | Kind | Purpose |
| --- | --- | --- |
| `createCookieJar()` | function | Build an in-memory jar |
| `parseSetCookieHeader()` | function | RFC 6265 `Set-Cookie` parser |
| `cookieMatchesUrl()` | function | Domain + path + secure + expiry + SameSite match test |
| `CookieMatchResult` | discriminated union | Why a cookie matched or not |
| `Cookie` | interface | Immutable cookie value |
| `CookieJar` | interface | get/set/clear/serialize contract |
| `CookieJarConsumer` | interface | Canonical minimal consumer surface (fetch), re-exported from `@browsercore/contracts` |
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


## Contributing

Contributions are welcome: bug reports, reproductions, docs and code alike. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the full guide lives in the [browsersmith repo](https://github.com/jverneuer/browsersmith/blob/main/CONTRIBUTING.md). First timer? Check the [`good first issue`](https://github.com/jverneuer/browsercore-cookies/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) label. Security issues: [SECURITY.md](SECURITY.md), never a public issue.

## License

MIT
