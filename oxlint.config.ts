import { defineConfig } from "oxlint";
import base from "@browsercore/dev/oxlint";

export default defineConfig({
	extends: [base],
	rules: {
		// Spreading inside .map() is the natural shape for object transformations
		// in this codebase; the perf win from in-place mutation isn't worth the
		// readability cost for cookie-jar serialization.
		"oxc/no-map-spread": "off",
	},
});
