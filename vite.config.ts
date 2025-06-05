import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        // Disable lazy route discovery to ensure all routes are discovered properly
        v3_lazyRouteDiscovery: false,
      },
      // Explicitly ignore the directory structure convention
      ignoredRouteFiles: ["**/*.css", "**/*.test.{js,jsx,ts,tsx}"],
    }),
    tsconfigPaths(),
  ],
  ssr: {
    // Don't bundle these server-only modules for SSR
    noExternal: [],
    // External these packages to avoid bundling native modules
    external: ["dockerode", "cpu-features", "ssh2"],
  },
  optimizeDeps: {
    // Exclude server-only packages from dependency optimization
    exclude: ["dockerode", "cpu-features", "ssh2", "@remix-run/node"],
  },
  build: {
    rollupOptions: {
      external: [
        // Exclude native node modules from client bundle
        /\.node$/,
        "dockerode",
        "cpu-features",
        "ssh2",
      ],
    },
  },
});
