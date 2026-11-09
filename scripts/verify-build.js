import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve("dist");
const htmlPath = resolve(outputDirectory, "index.html");

function fail(message) {
  console.error(`Build verification failed: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(htmlPath)) {
  fail("dist/index.html was not generated.");
  process.exit();
}

const html = readFileSync(htmlPath, "utf8");

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function resolveBuiltAsset(reference) {
  const url = new URL(reference, "https://pages.invalid/chess/");
  if (url.origin !== "https://pages.invalid") {
    throw new Error(`Expected a same-origin build asset, got: ${reference}`);
  }

  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith("/chess/")) {
    throw new Error(`Asset is missing the /chess/ project base: ${reference}`);
  }

  return resolve(outputDirectory, pathname.slice("/chess/".length));
}

const stylesheetTags = [...html.matchAll(/<link\b[^>]*>/gi)]
  .map(([tag]) => tag)
  .filter((tag) => getAttribute(tag, "rel")?.toLowerCase() === "stylesheet");

const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)]
  .map(([tag]) => tag)
  .filter((tag) =>
    getAttribute(tag, "type")?.toLowerCase() === "module" &&
    getAttribute(tag, "src"),
  );

if (stylesheetTags.length === 0) {
  fail("Built index.html does not reference a stylesheet.");
} else {
  const href = getAttribute(stylesheetTags[0], "href");
  try {
    const cssPath = resolveBuiltAsset(href);
    if (!existsSync(cssPath) || !statSync(cssPath).isFile()) {
      fail(`Stylesheet file is missing: ${href}`);
    } else {
      const css = readFileSync(cssPath, "utf8");
      if (css.length < 1000 || !css.includes(".board")) {
        fail("Generated stylesheet is unexpectedly small or missing the chessboard rules.");
      }
    }
  } catch (error) {
    fail(error.message);
  }
}

if (scriptTags.length === 0) {
  fail("Built index.html does not reference the application module.");
} else {
  const src = getAttribute(scriptTags[0], "src");
  try {
    const jsPath = resolveBuiltAsset(src);
    if (!existsSync(jsPath) || !statSync(jsPath).isFile() || statSync(jsPath).size < 1000) {
      fail(`Application JavaScript bundle is missing or unexpectedly small: ${src}`);
    }
  } catch (error) {
    fail(error.message);
  }
}

const requiredAssets = [
  ["stockfish/stockfish-19-lite-single.js", 10000],
  ["stockfish/stockfish-19-lite-single.wasm", 100000],
  ["pieces/wK.svg", 500],
  ["pieces/bK.svg", 500],
];

for (const [relativePath, minimumBytes] of requiredAssets) {
  const assetPath = resolve(outputDirectory, relativePath);
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    fail(`Required runtime asset is missing: ${relativePath}`);
  } else if (statSync(assetPath).size < minimumBytes) {
    fail(`Required runtime asset is unexpectedly small: ${relativePath}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Build verification passed: CSS, JS, Stockfish, and piece assets are present.");
