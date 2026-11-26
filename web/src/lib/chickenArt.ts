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

/**
 * Only data:image URIs from the contract are rendered. The image must only ever be used as the src of an <img> element
 * (never inlined as markup): inside <img> an SVG cannot run scripts.
 */
export const isImageDataUri = (s: unknown): s is string => typeof s === "string" && /^data:image\/(svg\+xml|png|webp|jpeg)[;,]/.test(s);
