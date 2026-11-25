/** Body and shade colours per plumage index (0 White ... 7 Gold). */
export const PLUMAGE_COLOURS: readonly [string, string][] = [
  ["#f2f4f7", "#c5ccd6"],
  ["#3a4250", "#262c36"],
  ["#c98a3c", "#a56c28"],
  ["#6b86b3", "#4d6690"],
  ["#aab3c5", "#8590a6"],
  ["#8a4b2a", "#683519"],
  ["#c5ccd6", "#9aa3b2"],
  ["#e0b040", "#b98a1e"],
];

export const TAIL_COLOURS = ["#7c5cff", "#4fe3a1", "#f0b90b", "#ff7a6b", "#5b43c9"];

/** Decodes a data:application/json;base64 tokenURI. */
export function decodeTokenUri(uri: string): { name?: string; description?: string; image?: string } | undefined {
  const prefix = "data:application/json;base64,";
  try {
    if (uri.startsWith(prefix)) {
      const bytes = Uint8Array.from(atob(uri.slice(prefix.length)), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    if (uri.startsWith("data:application/json,")) return JSON.parse(decodeURIComponent(uri.slice(22)));
  } catch {
    return undefined;
  }
  return undefined;
}

/** Only data:image URIs from the contract are rendered. */
export const isImageDataUri = (s: unknown): s is string => typeof s === "string" && /^data:image\/(svg\+xml|png|webp|jpeg)[;,]/.test(s);
