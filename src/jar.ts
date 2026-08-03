/**
 * In-memory cookie jar — the canonical {@link CookieJar} implementation.
 *
 * Cookies are stored in a flat `Map` keyed by a composite `domain\0path\0name`
 * string, so lookup/insert/delete are O(1) and insertion order is stable. getCookies
 * scans all stored cookies, applies RFC 6265 domain/path matching, and sorts the
 * results per §5.4 (longer path first, then earlier creation time).
 */

import type {
    Cookie,
    CookieJar,
    CookieJarOptions,
    CookieUrl,
    SameSiteContext,
} from "./types.js";
import { CookieDomainError } from "./errors.js";
import { cookieMatchesUrl, parseSetCookieHeader } from "./cookie.js";

/**
 * On-disk representation of a serialized jar. `expires` is an ISO string or null
 * (JSON has no Date type); on deserialize it is converted back to a {@link Cookie}.
 */
interface SerializedJar {
    readonly entries: readonly SerializedCookie[];
}

/** A cookie as written to disk: `expires` becomes an ISO string or null. */
type SerializedCookie = Omit<Cookie, "expires"> & {
    readonly expires: string | null;
};

/** Key used to look up a single cookie: domain + path + name. */
function cookieKey(domain: string, path: string, name: string): string {
    return `${domain}\0${path}\0${name}`;
}

/** Sort cookies per RFC 6265 §5.4: longer path first, then earlier creation time. */
function sortForHeader(cookies: readonly Cookie[]): Cookie[] {
    return [...cookies].sort((a, b) => {
        if (a.path.length !== b.path.length) {
            return b.path.length - a.path.length;
        }
        return a.creationTime - b.creationTime;
    });
}

export function createCookieJar(options: CookieJarOptions = {}): CookieJar {
    const rejectDomainMismatch = options.rejectDomainMismatch ?? true;
    // Primary store. A Map keeps insertion order stable and lookups O(1).
    const store = new Map<string, Cookie>();

    return {
        getCookies(url: CookieUrl, context?: SameSiteContext): Cookie[] {
            const matches: Cookie[] = [];
            for (const cookie of store.values()) {
                const result = cookieMatchesUrl(cookie, url, context);
                if (result.matched) {
                    matches.push(cookie);
                }
            }
            return sortForHeader(matches);
        },

        setCookie(raw: string, url: CookieUrl): void {
            const cookie = parseSetCookieHeader(raw, url);

            // RFC 6265 §5.3 step 11 — reject if the cookie's domain does not domain-match
            // the request host (when configured to do so).
            if (rejectDomainMismatch) {
                const normalizedCookieDomain = cookie.domain;
                const normalizedHost = url.hostname.toLowerCase();
                const ok =
                    normalizedHost === normalizedCookieDomain ||
                    (!cookie.hostOnly && normalizedHost.endsWith(`.${normalizedCookieDomain}`));
                if (!ok) {
                    throw new CookieDomainError(cookie.domain, url.hostname);
                }
            }

            store.set(cookieKey(cookie.domain, cookie.path, cookie.name), cookie);
        },

        removeCookie(name: string, domain: string, path: string): void {
            store.delete(cookieKey(domain, path, name));
        },

        clear(): void {
            store.clear();
        },

        serialize(): string {
            const entries = Array.from(store.values()).map(
                (c): SerializedCookie => ({
                    ...c,
                    expires: c.expires ? c.expires.toISOString() : null,
                }),
            );
            return JSON.stringify({ entries });
        },

        deserialize(json: string): void {
            store.clear();
            const parsed = JSON.parse(json) as SerializedJar;
            for (const entry of parsed.entries) {
                const cookie: Cookie = {
                    ...entry,
                    expires: entry.expires === null ? undefined : new Date(entry.expires),
                };
                store.set(cookieKey(cookie.domain, cookie.path, cookie.name), cookie);
            }
        },
    };
}
