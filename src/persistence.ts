/**
 * Cookie jar persistence — JSON file load/save.
 *
 * Uses node:fs for file I/O. This is the only module in the package that touches
 * the filesystem; the core jar logic stays I/O-free.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { CookieJar } from "./types.js";
import { createCookieJar } from "./jar.js";

/**
 * Persist a jar's contents to a JSON file.
 *
 * Writes the output of {@link CookieJar.serialize} to disk using `node:fs/promises`.
 * This is the only module in the package that touches the filesystem; the core
 * jar logic stays I/O-free.
 *
 * @param jar - The {@link CookieJar} to persist.
 * @param filePath - Destination file path.
 * @returns A promise that resolves once the file is written.
 *
 * @example
 * ```ts
 * await saveJar(jar, "./cookies.json");
 * ```
 *
 * @see loadJar for the inverse operation.
 * @since 0.1.0
 */
export async function saveJar(jar: CookieJar, filePath: string): Promise<void> {
    const json = jar.serialize();
    await writeFile(filePath, json, "utf8");
}

/**
 * Load a jar from a JSON file.
 *
 * Reads a file previously written by {@link saveJar}, creates a fresh jar
 * (via {@link createCookieJar}), and populates it via {@link CookieJar.deserialize}.
 * The returned jar has a new id (a fresh call to {@link createId}).
 *
 * @param filePath - Path to a JSON file produced by {@link saveJar}.
 * @returns A promise that resolves with a populated {@link CookieJar}.
 * @throws {Error} If the file cannot be read or contains invalid JSON.
 *
 * @example
 * ```ts
 * const jar = await loadJar("./cookies.json");
 * ```
 *
 * @see saveJar for the inverse operation.
 * @since 0.1.0
 */
export async function loadJar(filePath: string): Promise<CookieJar> {
    const json = await readFile(filePath, "utf8");
    const jar = createCookieJar();
    jar.deserialize(json);
    return jar;
}
