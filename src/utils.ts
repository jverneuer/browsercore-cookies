/**
 * Small shared helpers for @browsercore/cookies.
 *
 * Kept dependency-free so every package can copy the pattern without pulling in
 * cross-package imports.
 */

import type { CookieJarId } from "./types.js";

/**
 * Compile-time exhaustiveness check for `switch`/`if-else` over discriminated unions.
 *
 * Call in the `default` branch with the narrowed variable: `default: assertNever(x)`.
 * The argument is typed `never`, so adding a new union member forces every handler
 * to compile-error until it handles the new case. At runtime (if the check is ever
 * bypassed by an untyped value) it throws with the offending value.
 *
 * @param x - A value that must be `never` at compile time.
 * @throws {Error} If reached at runtime with a non-`never` value.
 *
 * @example
 * ```ts
 * switch (cookie.sameSite) {
 *     case "Strict": return sameSite;
 *     case "Lax": return sameSite || allowTopLevel();
 *     case "None": return true;
 *     default: return assertNever(cookie.sameSite);
 * }
 * ```
 *
 * @since 0.1.0
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertNever(x: never): never {
    throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

/**
 * Build a branded {@link CookieJarId}.
 *
 * Combines the current timestamp (base-36) with a random suffix to produce
 * an opaque, collision-resistant id. **Not** cryptographically random.
 *
 * @param prefix - Human-readable prefix (e.g. `"jar"`).
 * @returns A branded {@link CookieJarId}.
 *
 * @example
 * ```ts
 * createId("jar"); // CookieJarId<"jar_lzq3k1_2f9x7">
 * ```
 *
 * @since 0.1.0
 */
export function createId(prefix: string): CookieJarId {
    const raw = `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    return raw as CookieJarId;
}
