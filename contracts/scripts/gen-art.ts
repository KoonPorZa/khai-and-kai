/**
 * Generates contracts/contracts/KaiArt.sol from design/svg/kit.json so that KaiRenderer reproduces
 * design/svg/compose.mjs byte for byte. Run: pnpm --filter contracts gen-art
 *
 * Layout of the generated tables (all bytes constants):
 *   SHAPES        concatenated shape openings, each ending in `fill="` (the colour and `"/>` are appended at render time)
 *   SHAPE_TABLE   per shape: uint16 start offset into SHAPES, uint8 colour slot; plus a sentinel entry (total length)
 *   PART_TABLE    per part: uint8 first shape index; plus a sentinel
 *   COMBO_TABLE   per (breed * 2 + sex): uint8 start index into COMBO_PARTS; plus a sentinel
 *   COMBO_PARTS   part ids in paint order for each breed/sex combination
 *   PALETTE       per plumage, per slot: 7 ASCII bytes "#rrggbb"
 *   TRANSFORMS    per breed: the frame text between HEAD and the body; TRANSFORM_TABLE holds uint16 offsets + sentinel
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.join(__dirname, "..", "..");
const KIT = path.join(ROOT, "design", "svg", "kit.json");
const COMPOSE = path.join(ROOT, "design", "svg", "compose.mjs");
const OUT = path.join(__dirname, "..", "contracts", "KaiArt.sol");

const BREEDS = ["Silkie", "Brahma", "Serama", "Polish", "Cochin", "Sebright", "Orpington", "Wyandotte", "Leghorn", "Sussex"];
const PLUMAGES = ["White", "Black", "Buff", "Blue", "Splash", "Partridge", "Silver", "Gold"];
const HEN_ONLY = ["henComb", "henFloppyComb", "shortTail", "fanTail", "cushionTail", "uprightTail"];
const SENTINEL_ID = 4242;

type Shape = { d?: string; circle?: number[]; ellipse?: number[]; fill: string };
type Kit = {
  viewBox: string;
  slots: string[];
  plumage: Record<string, string>[];
  fixed: Record<string, string>;
  parts: Record<string, Shape[]>;
  breeds: { name: string; parts: string[]; scale: number }[];
  sex: { rooster: { parts: string[] } };
};
type Compose = {
  composeChicken: (t: { breed: number; sex: number; plumage: number; tokenId: number }) => string;
  composeEgg: () => string;
};

// ts-node compiles to CommonJS, which would turn import() into require(); compose.mjs uses top-level await.
const importEsm = new Function("u", "return import(u)") as (u: string) => Promise<Compose>;
export const loadCompose = () => importEsm(pathToFileURL(COMPOSE).href);

function shapeOpening(s: Shape): string {
  if (s.d) return `<path d="${s.d}" fill="`;
  if (s.circle) return `<circle cx="${s.circle[0]}" cy="${s.circle[1]}" r="${s.circle[2]}" fill="`;
  if (s.ellipse) return `<ellipse cx="${s.ellipse[0]}" cy="${s.ellipse[1]}" rx="${s.ellipse[2]}" ry="${s.ellipse[3]}" fill="`;
  throw new Error(`Unsupported shape ${JSON.stringify(s)}`);
}

function partNames(kit: Kit, breed: number, sex: number): string[] {
  const names = [...kit.breeds[breed].parts];
  if (sex === 1) {
    for (const p of HEN_ONLY) {
      const i = names.indexOf(p);
      if (i !== -1) names.splice(i, 1);
    }
    names.push(...kit.sex.rooster.parts.filter((n) => n !== "longTail"));
    names.push("longTail");
  }
  return names;
}

const hex = (b: Buffer | string) => `hex"${Buffer.from(b).toString("hex")}"`;
const u16 = (n: number) => {
  if (n > 0xffff) throw new Error("offset overflow");
  return [n >> 8, n & 0xff];
};
const u8 = (n: number) => {
  if (n > 0xff) throw new Error("index overflow");
  return n;
};

async function main() {
  const kit: Kit = JSON.parse(fs.readFileSync(KIT, "utf8"));
  const compose = await loadCompose();

  if (kit.breeds.length !== 10 || kit.breeds.some((b, i) => b.name !== BREEDS[i])) throw new Error("kit breeds differ from SPEC");
  if (kit.plumage.length !== 8 || kit.plumage.some((p, i) => p.name !== PLUMAGES[i])) throw new Error("kit plumage differs from SPEC");

  // Parts that any combination uses, in first-use order.
  const partIds = new Map<string, number>();
  const combos: number[][] = [];
  for (let breed = 0; breed < 10; breed++) {
    for (let sex = 0; sex < 2; sex++) {
      combos.push(
        partNames(kit, breed, sex).map((n) => {
          if (!partIds.has(n)) partIds.set(n, partIds.size);
          return partIds.get(n)!;
        }),
      );
    }
  }

  // Shapes.
  const slotIndex = new Map(kit.slots.map((s, i) => [s, i]));
  let shapes = "";
  const shapeTable: number[] = [];
  const partTable: number[] = [];
  const shapeCountOfPart: number[] = [];
  let shapeCount = 0;
  for (const name of partIds.keys()) {
    partTable.push(u8(shapeCount));
    const list = kit.parts[name] ?? [];
    shapeCountOfPart.push(list.length);
    for (const s of list) {
      const slot = slotIndex.get(s.fill);
      if (slot === undefined) throw new Error(`Unknown fill slot ${s.fill}`);
      shapeTable.push(...u16(Buffer.byteLength(shapes)), u8(slot));
      shapes += shapeOpening(s);
      shapeCount++;
    }
  }
  partTable.push(u8(shapeCount));
  shapeTable.push(...u16(Buffer.byteLength(shapes)), 0);

  const comboTable: number[] = [];
  const comboParts: number[] = [];
  for (const c of combos) {
    comboTable.push(u8(comboParts.length));
    comboParts.push(...c.map(u8));
  }
  comboTable.push(u8(comboParts.length));

  // Palette: colors = { ...plumage, ...fixed } exactly as compose.mjs.
  let palette = "";
  for (const p of kit.plumage) {
    const colors: Record<string, string> = { ...p, ...kit.fixed };
    for (const slot of kit.slots) {
      const c = colors[slot];
      if (!/^#[0-9a-fA-F]{6}$/.test(c ?? "")) throw new Error(`Slot ${slot} of ${p.name} is not #rrggbb`);
      palette += c;
    }
  }

  // Body as the generated tables will produce it (JS model of the Solidity loop).
  const body = (breed: number, sex: number, plumage: number) => {
    const c = combos[breed * 2 + sex];
    let out = "";
    const names = [...partIds.keys()];
    for (const pid of c) {
      for (const s of kit.parts[names[pid]] ?? []) {
        const slot = slotIndex.get(s.fill)!;
        out += shapeOpening(s) + palette.slice((plumage * kit.slots.length + slot) * 7, (plumage * kit.slots.length + slot + 1) * 7) + `"/>`;
      }
    }
    return out;
  };

  // Frame pieces from compose.mjs itself, split around the body, band and breed name.
  const band = `KK-${String(SENTINEL_ID).padStart(4, "0")}`;
  const prefixes: string[] = [];
  let tail: [string, string, string] | undefined;
  for (let breed = 0; breed < 10; breed++) {
    const full = compose.composeChicken({ breed, sex: 0, plumage: 0, tokenId: SENTINEL_ID });
    const b = body(breed, 0, 0);
    const at = full.indexOf(b);
    if (at < 0) throw new Error(`Body of breed ${breed} not found in compose output`);
    prefixes.push(full.slice(0, at));
    const after = full.slice(at + b.length);
    const i = after.indexOf(band);
    const name = BREEDS[breed];
    const j = after.indexOf(name, i + band.length);
    if (i < 0 || j < 0) throw new Error("band or breed name not found in compose output");
    const t: [string, string, string] = [after.slice(0, i), after.slice(i + band.length, j), after.slice(j + name.length)];
    if (tail && t.join("|") !== tail.join("|")) throw new Error("frame differs between breeds");
    tail = t;
  }
  let common = prefixes[0];
  for (const p of prefixes) while (!p.startsWith(common)) common = common.slice(0, -1);
  const transforms = prefixes.map((p) => p.slice(common.length));
  let transformBlob = "";
  const transformTable: number[] = [];
  for (const t of transforms) {
    transformTable.push(...u16(Buffer.byteLength(transformBlob)));
    transformBlob += t;
  }
  transformTable.push(...u16(Buffer.byteLength(transformBlob)));

  // Full self-check against compose.mjs for every breed, sex and plumage.
  let maxBody = 0;
  for (let breed = 0; breed < 10; breed++)
    for (let sex = 0; sex < 2; sex++)
      for (let plumage = 0; plumage < 8; plumage++) {
        const b = body(breed, sex, plumage);
        maxBody = Math.max(maxBody, Buffer.byteLength(b));
        const id = 1 + breed * 16 + sex * 8 + plumage;
        const mine = common + transforms[breed] + b + tail![0] + `KK-${String(id).padStart(4, "0")}` + tail![1] + BREEDS[breed] + tail![2];
        if (mine !== compose.composeChicken({ breed, sex, plumage, tokenId: id })) throw new Error(`Mismatch at ${breed}/${sex}/${plumage}`);
      }

  const egg = compose.composeEgg();
  const pathBytes = Object.values(kit.parts).flat().reduce((n, s) => n + Buffer.byteLength(s.d ?? ""), 0);

  const sol = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// GENERATED by contracts/scripts/gen-art.ts from design/svg/kit.json. Do not edit by hand.
// ${partIds.size} parts, ${shapeCount} shapes, ${pathBytes} bytes of path data. Table layout is documented in gen-art.ts.
library KaiArt {
    uint256 internal constant SLOT_COUNT = ${kit.slots.length};
    uint256 internal constant MAX_BODY = ${maxBody};
    bytes internal constant SHAPES = ${hex(shapes)};
    bytes internal constant SHAPE_TABLE = ${hex(Buffer.from(shapeTable))};
    bytes internal constant PART_TABLE = ${hex(Buffer.from(partTable))};
    bytes internal constant COMBO_TABLE = ${hex(Buffer.from(comboTable))};
    bytes internal constant COMBO_PARTS = ${hex(Buffer.from(comboParts))};
    bytes internal constant PALETTE = ${hex(palette)};
    bytes internal constant TRANSFORMS = ${hex(transformBlob)};
    bytes internal constant TRANSFORM_TABLE = ${hex(Buffer.from(transformTable))};
    bytes internal constant HEAD = ${hex(common)};
    bytes internal constant BEFORE_BAND = ${hex(tail![0])};
    bytes internal constant BEFORE_NAME = ${hex(tail![1])};
    bytes internal constant END = ${hex(tail![2])};
    bytes internal constant EGG_SVG = ${hex(egg)};
}
`;
  fs.writeFileSync(OUT, sol);
  console.log(
    `Wrote ${path.relative(process.cwd(), OUT)}: ${partIds.size} parts, ${shapeCount} shapes, path data ${pathBytes} B, ` +
      `shape bytes ${Buffer.byteLength(shapes)} B, max body ${maxBody} B; 160 combinations match compose.mjs.`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
