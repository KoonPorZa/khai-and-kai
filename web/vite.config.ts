import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";

const LOCAL = process.env.VITE_LOCAL === "1";

// Drops every deployment except BNB testnet (97) from production bundles.
function onlyTestnetDeployments(): Plugin {
  return {
    name: "only-testnet-deployments",
    enforce: "pre",
    transform(code, id) {
      if (LOCAL || !id.endsWith("deployments.json")) return null;
      const all = JSON.parse(code) as Record<string, unknown>;
      // KK_HIDE_DEPLOYMENT=1 builds the "not deployed yet" state on purpose (used to capture its screenshot).
      const kept = all["97"] && process.env.KK_HIDE_DEPLOYMENT !== "1" ? { "97": all["97"] } : {};
      return { code: JSON.stringify(kept), map: null };
    },
  };
}

// The one place the public address lives (override with VITE_SITE_URL). Social tags need absolute URLs.
const SITE_URL = (process.env.VITE_SITE_URL ?? "https://khai-and-kai.koonporza-learn.workers.dev").replace(/\/$/, "");

// Adds og:url, and og:image / twitter:image once the illustrator's og image has been synced (see scripts/sync-art.mjs).
function socialPreview(): Plugin {
  return {
    name: "social-preview",
    transformIndexHtml() {
      const file = new URL("./src/art/manifest.json", import.meta.url);
      const og = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { og?: string | null }).og : null;
      const hero = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { hero?: string | null }).hero : null;
      const preload = hero ? [{ tag: "link", attrs: { rel: "preload", as: "image", href: hero, media: "(min-width: 900px)" }, injectTo: "head" as const }] : [];
      const url = { tag: "meta", attrs: { property: "og:url", content: `${SITE_URL}/` }, injectTo: "head" as const };
      if (!og) return [...preload, url];
      const image = `${SITE_URL}${og}`;
      return [
        ...preload,
        url,
        { tag: "meta", attrs: { property: "og:image", content: image }, injectTo: "head" },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "twitter:image", content: image }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === "build" && LOCAL) {
    throw new Error("VITE_LOCAL=1 is for the dev server only. Production builds target BNB testnet (97).");
  }
  return {
    plugins: [react(), onlyTestnetDeployments(), socialPreview()],
    define: { __LOCAL__: JSON.stringify(LOCAL) },
    build: { chunkSizeWarningLimit: 900 },
  };
});
