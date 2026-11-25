import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const LOCAL = process.env.VITE_LOCAL === "1";

// Drops every deployment except BNB testnet (97) from production bundles.
function onlyTestnetDeployments(): Plugin {
  return {
    name: "only-testnet-deployments",
    enforce: "pre",
    transform(code, id) {
      if (LOCAL || !id.endsWith("deployments.json")) return null;
      const all = JSON.parse(code) as Record<string, unknown>;
      const kept = all["97"] ? { "97": all["97"] } : {};
      return { code: JSON.stringify(kept), map: null };
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === "build" && LOCAL) {
    throw new Error("VITE_LOCAL=1 is for the dev server only. Production builds target BNB testnet (97).");
  }
  return {
    plugins: [react(), onlyTestnetDeployments()],
    define: { __LOCAL__: JSON.stringify(LOCAL) },
    build: { chunkSizeWarningLimit: 900 },
  };
});
