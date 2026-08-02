/**
 * Cookie jar persistence — JSON file load/save.
 *
 * Uses node:fs for file I/O. This is the only module in the package that touches
 * the filesystem; the core jar logic stays I/O-free.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { CookieJar } from "./types.js";
import { createCookieJar } from "./jar.js";

/** Persist a jar's contents to a JSON file. */
export async function saveJar(jar: CookieJar, filePath: string): Promise<void> {
    const json = jar.serialize();
    await writeFile(filePath, json, "utf8");
}

/** Load a jar from a JSON file. Returns a fresh jar populated from disk. */
export async function loadJar(filePath: string): Promise<CookieJar> {
    const json = await readFile(filePath, "utf8");
    const jar = createCookieJar();
    jar.deserialize(json);
    return jar;
}
