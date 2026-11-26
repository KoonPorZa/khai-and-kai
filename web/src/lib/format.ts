import { formatEther } from "viem";

export const BREEDS = ["Silkie", "Brahma", "Serama", "Polish", "Cochin", "Sebright", "Orpington", "Wyandotte", "Leghorn", "Sussex"] as const;
export const SEXES = ["hen", "rooster"] as const;
export const PLUMAGES = ["White", "Black", "Buff", "Blue", "Splash", "Partridge", "Silver", "Gold"] as const;
export const PROOF_KINDS = ["Feeding", "Health check", "Weight", "Vaccination", "Photo", "Note"] as const;

export const breedName = (b: number) => BREEDS[b] ?? "Unknown breed";
export const plumageName = (p: number) => PLUMAGES[p] ?? "Unknown";
export const sexName = (s: number) => SEXES[s] ?? "hen";
export const kindName = (k: number) => PROOF_KINDS[k] ?? "Note";
export const speciesLabel = (b: number, s: number) => `${breedName(b)} ${sexName(s)}`;

/** KK-0042 */
export const bandId = (birdId: bigint | number) => `KK-${String(birdId).padStart(4, "0")}`;

/** Accepts "KK-0042", "kk42" or "42". */
export function parseBand(input: string): bigint | undefined {
  const m = /^\s*(?:kk-?)?(\d{1,9})\s*$/i.exec(input);
  if (!m?.[1]) return undefined;
  const n = BigInt(m[1]);
  return n > 0n ? n : undefined;
}

export const shortHex = (h: string, head = 6, tail = 4) => (h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);

export const formatNumber = (n: bigint | number) => Number(n).toLocaleString("en-US");

/** 0.0100 -> "0.01", keeps up to 4 decimals. */
export function formatNative(wei: bigint, max = 4): string {
  const s = formatEther(wei);
  const [i = "0", f = ""] = s.split(".");
  const frac = f.slice(0, max).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h > 0 ? `${plural(d, "day")} ${h} h` : plural(d, "day");
  if (h > 0) return m > 0 ? `${h} h ${m} min` : plural(h, "hour");
  return plural(m, "minute");
}

export function periodLabel(periods: number, carePeriodSeconds: number): string {
  const total = formatDuration(periods * carePeriodSeconds);
  return `${periods} ${periods === 1 ? "period" : "periods"} (${total})`;
}

export function ageLabel(bornAt: number, nowSeconds: number): string {
  const days = Math.max(0, Math.floor((nowSeconds - bornAt) / 86400));
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.floor(days / 30.44);
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export const formatDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatWhen(seconds: number, nowSeconds: number): string {
  const d = new Date(seconds * 1000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(nowSeconds * 1000).toDateString();
  const yesterday = new Date((nowSeconds - 86400) * 1000).toDateString();
  if (d.toDateString() === today) return `Today ${time}`;
  if (d.toDateString() === yesterday) return `Yesterday ${time}`;
  return `${formatDate(seconds)} ${time}`;
}

export const clockTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Next UTC midnight, the moment the daily egg quota resets. */
export function nextQuotaReset(nowSeconds: number): number {
  return (Math.floor(nowSeconds / 86400) + 1) * 86400;
}
