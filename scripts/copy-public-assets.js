import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";

const publicDirectory = resolve("public");
const outputDirectory = resolve("dist");

if (!existsSync(publicDirectory)) {
  throw new Error(`Required public asset directory not found: ${publicDirectory}`);
}

mkdirSync(outputDirectory, { recursive: true });

// Copy the contents of public/ to the output root. This keeps the built
// URLs /pieces/... and /stockfish/... consistent with Vite's BASE_URL.
for (const entry of readdirSync(publicDirectory, { withFileTypes: true })) {
  cpSync(
    resolve(publicDirectory, entry.name),
    resolve(outputDirectory, entry.name),
    { recursive: true, force: true },
  );
}

// Preserve .nojekyll in the artifact as well as the repository root.
const nojekyllSource = resolve(".nojekyll");
if (existsSync(nojekyllSource)) {
  copyFileSync(nojekyllSource, resolve(outputDirectory, ".nojekyll"));
}

console.log("Copied public assets into dist.");
