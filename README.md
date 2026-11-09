# Stockfish Trainer

Play chess against Stockfish, review your moves, and track an estimated playing strength.

## Requirements

- Node.js 22 or newer
- npm

## Local development

```sh
npm ci
npm run dev
```

Create and verify a production build:

```sh
npm run build
npm run preview
```

The build command verifies that the generated CSS and JavaScript bundles, Stockfish WebAssembly files, and chess-piece images are all present.

## GitHub Pages

This repository is configured for the project-site URL:

`https://oefhrihc.github.io/chess/`

The Vite build uses the `/chess/` base path. The source files also use relative URLs so the site can still work when GitHub Pages is configured to publish the `main` branch directly.

**Recommended Pages setting:** open **Settings → Pages → Build and deployment**, select **GitHub Actions**, and let `.github/workflows/deploy.yml` publish the verified `dist` output. This avoids running both the raw branch publisher and the Vite publisher.

A root `.nojekyll` file is included for direct branch publishing. In that mode, the browser loads `src/main.js` and `src/style.css` directly, and resolves `chess.js` using the pinned esm.sh import map in `index.html`.
