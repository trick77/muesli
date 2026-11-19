import { defineConfig } from "vitest/config";

// Relative base: the same build runs at a domain root or under a sub-path behind a prefix-stripping proxy.
export default defineConfig({
  base: './',
  build: {
    // Straight into the Go binary's embed directory, never ui/dist. emptyOutDir off: it would delete the tracked
    // .gitkeep go:embed needs; ship check (ui.embed) clears the stale bundle instead.
    outDir: "../backend/web/dist",
    emptyOutDir: false,
    target: 'safari15',
    assetsInlineLimit: 0,
  },
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: 'v8',
      // lcov feeds ship's UI floor and patch gate, text-summary is for whoever reads the log.
      reporter: ['text-summary', 'lcov'],
      // ship resolves the lcov from the repo root (ui.lcov), so it lands outside ui/.
      reportsDirectory: "../coverage/ui",
      include: ['src/**/*.ts'],
      // main.ts is the composition root: wiring only, driven by e2e.
      exclude: ['src/test/**', 'src/**/*.d.ts', 'src/main.ts'],
    },
  },
});
