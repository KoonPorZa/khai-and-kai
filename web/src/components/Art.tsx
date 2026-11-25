import { useState } from "react";
import { PLUMAGE_COLOURS, TAIL_COLOURS } from "../lib/chickenArt";
import { breedName, plumageName, sexName } from "../lib/format";

export function EggSvg({ width = 132, cracked = false, label = "An egg" }: { width?: number; cracked?: boolean; label?: string }) {
  return (
    <svg width={width} height={(width * 64) / 50} viewBox="0 0 50 64" role="img" aria-label={label}>
      <path d="M25 3 C38 3 47 24 47 38 C47 52 37 61 25 61 C13 61 3 52 3 38 C3 24 12 3 25 3 Z" fill="#f2f4f7" />
      <path d="M12 22 C14 14 19 8 24 7" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      {cracked ? (
        <path d="M5 33 L12 28 L17 35 L24 27 L30 35 L37 28 L45 34" fill="none" stroke="#0e1116" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      ) : (
        <ellipse cx="25" cy="48" rx="16" ry="9" fill="#c5ccd6" opacity="0.45" />
      )}
    </svg>
  );
}

/** Small chicken drawn from the bird's traits. Decorative unless a label is given. */
export function BirdGlyph({ breed, sex, plumage, width = 70, label }: { breed: number; sex: number; plumage: number; width?: number; label?: string }) {
  const [body, shade] = PLUMAGE_COLOURS[plumage] ?? PLUMAGE_COLOURS[0]!;
  const tail = TAIL_COLOURS[breed % TAIL_COLOURS.length]!;
  const rooster = sex === 1;
  const dark = plumage === 1;
  const crest = breed === 0 || breed === 3 || breed === 8;
  return (
    <svg
      width={width}
      height={(width * 130) / 140}
      viewBox="0 0 140 130"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={rooster ? "M38 62 C6 52 0 18 20 6 C22 32 34 44 52 50 Z" : "M38 62 C10 50 6 22 22 12 C24 34 34 44 52 50 Z"} fill={tail} />
      <ellipse cx="68" cy="78" rx={rooster ? 40 : 38} ry={rooster ? 34 : 32} fill={body} />
      <circle cx="98" cy="44" r="19" fill={body} />
      {crest ? (
        <>
          <circle cx="92" cy="26" r="9" fill={body} />
          <circle cx="102" cy="23" r="9" fill={body} />
          <circle cx="110" cy="29" r="7" fill={body} />
        </>
      ) : (
        <path d={rooster ? "M86 28 C86 14 96 14 97 24 C99 10 111 12 108 25 C114 18 121 24 113 33 Z" : "M88 28 C88 20 95 19 96 26 C98 18 106 18 106 27 Z"} fill="#ff5d73" />
      )}
      <path d="M40 80 C52 62 80 66 82 84 C70 98 50 96 40 80 Z" fill={shade} />
      <path d="M104 60 C108 70 100 72 99 62 Z" fill="#ff5d73" />
      <path d="M115 44 L130 49 L115 54 Z" fill="#f0b90b" />
      <circle cx="103" cy="42" r="3" fill={dark ? "#f2f4f7" : "#0e1116"} />
      <path d="M60 108 V124 M78 108 V124" stroke="#f0b90b" strokeWidth="4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** `/art/breeds/<id>.webp` when the file exists, otherwise the on-chain token art enlarged, otherwise a drawn glyph. */
export function BreedPortrait({ breed, sex, plumage, tokenImage }: { breed: number; sex: number; plumage: number; tokenImage?: string }) {
  const [failed, setFailed] = useState(false);
  const label = `Breed portrait: a ${plumageName(plumage).toLowerCase()} ${breedName(breed)} ${sexName(sex)}`;
  if (!failed) {
    return <img className="portrait-img" src={`/art/breeds/${breed}.webp`} alt={label} onError={() => setFailed(true)} />;
  }
  if (tokenImage) return <img className="portrait-img portrait-onchain" src={tokenImage} alt={label} />;
  return <BirdGlyph breed={breed} sex={sex} plumage={plumage} width={280} label={label} />;
}

export function Check({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="#4fe3a1" />
      <path d="M6.5 11.5 L9.8 14.5 L15.5 8" fill="none" stroke="#0e1116" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Warn({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 L23 21 H1 Z" fill="#ff7a6b" />
      <path d="M12 9 V14 M12 17 V17.5" stroke="#0e1116" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Lock({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="9" width="14" height="9" rx="2" fill="#ff7a6b" />
      <path d="M6 9 V6 a4 4 0 0 1 8 0 V9" fill="none" stroke="#ff7a6b" strokeWidth="2" />
    </svg>
  );
}
