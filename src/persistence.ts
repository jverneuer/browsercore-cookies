/**
 * Cookie jar persistence — pure serialization helpers.
 *
 * These functions are I/O-free: {@link serializeJar} turns a jar into a JSON
 * string, {@link deserializeJar} rebuilds a jar from that string. The caller
 * handles file I/O, keeping the cookies package runtime-independent
 * (Rule #21) and unit-testable without a real filesystem.
 */

import type { CookieJar } from "./types.js";
import { createCookieJar } from "./jar.js";
import { CookieSerializationError } from "./errors.js";

/**
 * Serialize a cookie jar to a JSON string.
 *
 * The inverse of {@link deserializeJar}. The caller is responsible for writing
 * the result to disk (e.g. via `node:fs`).
 *
 * @param jar - The {@link CookieJar} to serialize.
 * @returns A JSON string representing the jar's contents.
 *
 * @example
 * ```ts
 * import { writeFile } from "node:fs/promises";
 * await writeFile("./cookies.json", serializeJar(jar), "utf8");
 * ```
 *
 * @see deserializeJar for the inverse operation.
 * @since 0.1.0
 */
export function serializeJar(jar: CookieJar): string {
    return jar.serialize();
}

/**
 * Deserialize a JSON string into a cookie jar.
 *
 * Creates a fresh jar (via {@link createCookieJar}) and populates it from the
 * given JSON string (via {@link CookieJar.deserialize}). The returned jar has
 * a new id (a fresh call to {@link createId}).
 *
 * @param data - A JSON string produced by {@link serializeJar}.
 * @returns A populated {@link CookieJar}.
 * @throws {@link CookieSerializationError} If the JSON is malformed or does
 *   not conform to the expected schema.
 *
 * @example
 * ```ts
 * import { readFile } from "node:fs/promises";
 * const json = await readFile("./cookies.json", "utf8");
 * const jar = deserializeJar(json);
 * ```
 *
 * @see serializeJar for the inverse operation.
 * @since 0.1.0
 */
export function deserializeJar(data: string): CookieJar {
    const jar = createCookieJar();
    try {
        jar.deserialize(data);
    } catch (err) {
        throw new CookieSerializationError(
            `Failed to deserialize cookie jar: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? { cause: err } : undefined,
        );
    }
    return jar;
}
