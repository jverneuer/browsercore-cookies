import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "cookies",
        root: ".",
        include: ["tests/**/*.test.ts"],
        environment: "node",
        globals: false,
        testTimeout: 30_000,
        hookTimeout: 30_000,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            // types.ts is type-only (compiles to `export {}`); it carries no
            // executable statements, so it is excluded from coverage measurement.
            exclude: ["src/types.ts"],
            reporter: ["text"],
        },
    },
});
