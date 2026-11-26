import manifestJson from "../art/manifest.json";

/** Illustrator files present in public/art, written by `pnpm --filter web sync-art`. */
export type ArtManifest = { hero: string | null; og: string | null; emptyCoop: string | null; breeds: Record<string, string> };
export const artManifest = manifestJson as ArtManifest;
