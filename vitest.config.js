import { defineConfig } from "vitest/config";

// Config independiente de astro.config.mjs: las pruebas unitarias de src/lib
// no necesitan los plugins de Astro/React/Tailwind. ESM puro (package.json
// tiene "type": "module"); esbuild de Vitest transpila los .ts sobre la marcha.
export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.{js,ts}"],
	},
});
