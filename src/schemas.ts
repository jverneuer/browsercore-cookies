/**
 * Zod schemas for serialized cookie-jar persistence (the JSON boundary).
 *
 * {@link SerializedCookie} and {@link SerializedJar} are the on-disk shapes:
 * `expires` is an ISO string or null (JSON has no Date type), and `maxAge` is
 * omitted when undefined (JSON drops undefined values). These schemas validate
 * that boundary instead of trusting `JSON.parse` output with a type assertion.
 */

import { z } from "zod";

/** Zod enum for the SameSite attribute — mirrors the {@link SameSite} union. */
export const SameSiteSchema = z.enum(["Strict", "Lax", "None"]);

/** Zod schema for a single serialized cookie (on-disk shape). */
export const SerializedCookieSchema = z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string(),
    expires: z.string().nullable(),
    maxAge: z.number().int().optional(),
    secure: z.boolean(),
    httpOnly: z.boolean(),
    sameSite: SameSiteSchema,
    partitioned: z.boolean(),
    hostOnly: z.boolean(),
    creationTime: z.number().int(),
    lastAccessTime: z.number().int(),
});

/** Zod schema for a serialized cookie jar (on-disk shape). */
export const JarSchema = z.object({
    entries: z.array(SerializedCookieSchema),
});

/** Inferred type from {@link SerializedCookieSchema}. */
export type SerializedCookie = z.infer<typeof SerializedCookieSchema>;

/** Inferred type from {@link JarSchema}. */
export type SerializedJar = z.infer<typeof JarSchema>;
