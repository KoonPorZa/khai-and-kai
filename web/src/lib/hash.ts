import { keccak256, toBytes } from "viem";

export const MAX_NOTE_BYTES = 140;
export const noteBytes = (s: string) => new TextEncoder().encode(s).length;
export const recordHash = (text: string) => keccak256(toBytes(text));
