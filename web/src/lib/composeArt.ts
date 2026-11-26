import kit from "../art/kit.json";

/**
 * Browser port of design/svg/compose.mjs (same kit.json, same output byte for byte; test/art.test.ts compares them).
 * The contract draws the on-chain token art with the same kit, so this is the picture a wallet or explorer shows.
 */
type Shape = { d?: string; circle?: number[]; ellipse?: number[]; fill: string };
type Kit = {
  viewBox: string;
  plumage: Record<string, string>[];
  fixed: Record<string, string>;
  parts: Record<string, Shape[]>;
  breeds: { name: string; parts: string[]; scale: number }[];
  sex: { rooster: { parts: string[] } };
};
const k = kit as unknown as Kit;

const esc = (v: string | number) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

function partSvg(name: string, colors: Record<string, string>): string {
  return (k.parts[name] ?? [])
    .map((s) => {
      const fill = colors[s.fill];
      if (s.d) return `<path d="${s.d}" fill="${fill}"/>`;
      if (s.circle) return `<circle cx="${s.circle[0]}" cy="${s.circle[1]}" r="${s.circle[2]}" fill="${fill}"/>`;
      if (s.ellipse) return `<ellipse cx="${s.ellipse[0]}" cy="${s.ellipse[1]}" rx="${s.ellipse[2]}" ry="${s.ellipse[3]}" fill="${fill}"/>`;
      return "";
    })
    .join("");
}

export function composeChicken({ breed = 0, sex = 0, plumage = 0, tokenId = 42 }: { breed?: number; sex?: number; plumage?: number; tokenId?: number | bigint } = {}): string {
  const b = k.breeds[Number(breed)];
  const p = k.plumage[Number(plumage)];
  if (!b || !p || ![0, 1].includes(Number(sex))) throw new RangeError("breed, sex, or plumage index out of range");
  const colors = { ...p, ...k.fixed };
  const names = [...b.parts];
  if (Number(sex) === 1) {
    for (const part of ["henComb", "henFloppyComb", "shortTail", "fanTail", "cushionTail", "uprightTail"]) {
      const i = names.indexOf(part);
      if (i !== -1) names.splice(i, 1);
    }
    names.push(...k.sex.rooster.parts.filter((n) => n !== "longTail"));
    names.push("longTail");
  }
  const body = names.map((n) => partSvg(n, colors)).join("");
  const band = `KK-${String(tokenId).padStart(4, "0")}`;
  const s = Number(b.scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${k.viewBox}"><rect width="400" height="400" rx="24" fill="#161b23"/><g transform="translate(${200 * (1 - s)} ${330 * (1 - s)}) scale(${s})">${body}</g><text x="24" y="376" text-anchor="start" fill="#8c95a3" font-family="monospace" font-size="18">${esc(band)}</text><text x="376" y="376" text-anchor="end" fill="#8c95a3" font-family="monospace" font-size="18">${esc(b.name)}</text></svg>`;
}

/** The composed chicken as an <img>-ready data URI. */
export const chickenDataUri = (o: Parameters<typeof composeChicken>[0]) => `data:image/svg+xml;utf8,${encodeURIComponent(composeChicken(o))}`;
