import { defineConfig } from "vite";

export default defineConfig({
  // This is a project site, not a user/org root site.
  base: "/chess/",

  // The raw GitHub Pages branch deployment stores assets under /public.
  // Vite builds instead copy those assets to dist root, so the runtime prefix is empty.
  define: {
    __PUBLIC_ASSET_PREFIX__: JSON.stringify(""),
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },

  // Asset copying is handled by copy-public-assets.js so branch and Vite
  // deployments can use predictable, matching asset locations.
  publicDir: false,
});
