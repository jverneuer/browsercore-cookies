# @browsercore/cookies

RFC 6265-compliant cookie management: parsing, jar, domain matching, persistence. Independent from HTTP.

## Responsibility

Parse `Set-Cookie` headers, match cookies against request URLs per RFC 6265 §5, and manage a cookie jar with serialize/deserialize for persistence. Higher layers (http1, http2, fetch) use this package to attach cookies to outgoing requests — this package performs no I/O of its own beyond the optional persistence module.

## What it does NOT know about

- HTTP request/response serialization
- Sockets or transports
- Browser fingerprints

## Public API

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

## Types

| Export | Kind | Purpose |
| --- | --- | --- |
| `Cookie` | interface | Immutable cookie value |
| `CookieJar` | interface | get/set/clear/serialize contract |
| `createCookieJar()` | function | Build an in-memory jar |
| `parseSetCookieHeader()` | function | RFC 6265 Set-Cookie parser |
| `cookieMatchesUrl()` | function | Domain + path + secure + expiry match test |
| `CookieMatchResult` | discriminated union | Why a cookie matched or not |
| `SameSite` | literal union | `"Strict" \| "Lax" \| "None"` |
| `CookieError` | class | Base typed error |
| `CookieDomainError` | class | Domain mismatch |
| `CookieParseError` | class | Unparseable Set-Cookie header |

## Dependency graph

```
@browsercore/cookies
  └─ node:fs (persistence only)
```

No other `@browsercore/*` packages are imported.
