import { keccak256, toBytes, type Hex } from "viem";

/** Deterministic, invented sample birds. Not real farm records. */
export type SampleBird = { breed: number; sex: number; plumage: number; bornAt: number; recordHash: Hex };

export const SAMPLE_BIRD_COUNT = 300;
export const SAMPLE_REFERENCE_DATE = Date.UTC(2026, 10, 1) / 1000; // 1 Nov 2026 00:00 UTC
const SEED = 0x4b4b2026;
const DAY = 86_400;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleBirds(count = SAMPLE_BIRD_COUNT): SampleBird[] {
  const rand = mulberry32(SEED);
  const pick = (n: number) => Math.floor(rand() * n);
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    const breed = pick(10);
    const sex = rand() < 0.35 ? 1 : 0; // more hens than roosters, like a real flock
    const plumage = pick(8);
    const ageDays = (3 + pick(22)) * 30 + pick(30); // 3 to 24 months
    const bornAt = SAMPLE_REFERENCE_DATE - ageDays * DAY;
    const record = `Khai & Kai SAMPLE DATA | bird ${id} | breed ${breed} | sex ${sex} | plumage ${plumage} | bornAt ${bornAt}`;
    return { breed, sex, plumage, bornAt, recordHash: keccak256(toBytes(record)) };
  });
}
