// Builds public/sw.js after `next build` (Serwist's bundler-agnostic "configurator" mode, so the
// Next build stays on Turbopack). Run by `npm run build`: `next build && serwist build ...`.
import fs from "node:fs";
import { generateGlobPatterns, serwist } from "@serwist/next/config";

// /live is the only page in the precache; tie its revision to the build so every deploy refreshes it.
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();

export default await serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Default globs: .next/static/** (hashed build assets) and public/**, plus the next/font
  // files the defaults leave out. No prerendered HTML: pages other than /live are never cached.
  globPatterns: [...generateGlobPatterns(".next/"), ".next/static/**/*.{woff,woff2}"],
  precachePrerendered: false,
  additionalPrecacheEntries: [
    { url: "/live", revision: buildId },
    { url: "/favicon.ico", revision: buildId },
  ],
});
