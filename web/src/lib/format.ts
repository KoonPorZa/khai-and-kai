import { formatEther } from "viem";
import { tNow } from "../i18n";
import type { Key } from "../i18n/en";

export const BREEDS = ["Silkie", "Brahma", "Serama", "Polish", "Cochin", "Sebright", "Orpington", "Wyandotte", "Leghorn", "Sussex"] as const;
export const SEXES = ["hen", "rooster"] as const;
export const PLUMAGES = ["White", "Black", "Buff", "Blue", "Splash", "Partridge", "Silver", "Gold"] as const;
export const PROOF_KINDS = ["Feeding", "Health check", "Weight", "Vaccination", "Photo", "Note"] as const;

export const breedName = (b: number) => BREEDS[b] ?? "Unknown breed";
export const plumageName = (p: number) => (PLUMAGES[p] ? tNow(`plumage.${p}` as Key) : tNow("plumage.unknown"));
export const sexName = (s: number) => tNow(SEXES[s] === "rooster" ? "sex.rooster" : "sex.hen");
export const kindName = (k: number) => tNow(`kind.${PROOF_KINDS[k] ? k : 5}` as Key);
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
  if (s < 60) return tNow("dur.s", { n: s });
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const days = (n: number) => tNow(n === 1 ? "dur.dayOne" : "dur.dayMany", { n });
  if (d > 0) return h > 0 ? `${days(d)} ${tNow("dur.h", { n: h })}` : days(d);
  if (h > 0) return m > 0 ? tNow("dur.hm", { h, m }) : tNow(h === 1 ? "dur.hourOne" : "dur.hourMany", { n: h });
  return tNow(m === 1 ? "dur.minOne" : "dur.minMany", { n: m });
}

export function periodLabel(periods: number, carePeriodSeconds: number): string {
  return tNow(periods === 1 ? "dur.period" : "dur.periods", { n: periods, total: formatDuration(periods * carePeriodSeconds) });
}

export function ageLabel(bornAt: number, nowSeconds: number): string {
  const days = Math.max(0, Math.floor((nowSeconds - bornAt) / 86400));
  if (days < 30) return tNow(days === 1 ? "age.dayOne" : "age.dayMany", { n: days });
  const months = Math.floor(days / 30.44);
  return tNow(months === 1 ? "age.monthOne" : "age.monthMany", { n: months });
}

export const formatDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatWhen(seconds: number, nowSeconds: number): string {
  const d = new Date(seconds * 1000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(nowSeconds * 1000).toDateString();
  const yesterday = new Date((nowSeconds - 86400) * 1000).toDateString();
  if (d.toDateString() === today) return tNow("when.today", { time });
  if (d.toDateString() === yesterday) return tNow("when.yesterday", { time });
  return `${formatDate(seconds)} ${time}`;
}

export const clockTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Next UTC midnight, the moment the daily egg quota resets. */
export function nextQuotaReset(nowSeconds: number): number {
  return (Math.floor(nowSeconds / 86400) + 1) * 86400;
}
