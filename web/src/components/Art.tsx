import { artManifest } from "../lib/art";
import { chickenDataUri } from "../lib/composeArt";
import eggUrl from "../assets/egg/egg.svg";
import crackedUrl from "../assets/egg/egg-crack-1.svg";
import logoMark from "../assets/brand/logo-mark.svg";
import feeding from "../assets/brand/feeding.svg?raw";
import health from "../assets/brand/health.svg?raw";
import weight from "../assets/brand/weight.svg?raw";
import vaccination from "../assets/brand/vaccination.svg?raw";
import photo from "../assets/brand/photo.svg?raw";
import note from "../assets/brand/note.svg?raw";
import { breedName, plumageName, sexName } from "../lib/format";

const EGG_OUTLINE = "M200 58 C128 58 88 157 96 240 C102 306 146 345 200 345 C254 345 298 306 304 240 C312 157 272 58 200 58Z";

/** The illustrator's egg frame, cut to the egg's outline so its square backdrop does not show. */
export function EggSvg({ width = 132, cracked = false, label = "An egg" }: { width?: number; cracked?: boolean; label?: string }) {
  return (
    <svg width={width} height={(width * 300) / 250} viewBox="75 48 250 300" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id="egg-outline">
          <path d={EGG_OUTLINE} />
        </clipPath>
      </defs>
      <image href={cracked ? crackedUrl : eggUrl} width="400" height="400" clipPath="url(#egg-outline)" />
    </svg>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src={logoMark} width={size} height={size} alt="" aria-hidden="true" />;
}

const KIND_ICONS = [feeding, health, weight, vaccination, photo, note];

/**
 * The illustrator's care icons (currentColor line art), indexed by proof kind.
 * Injecting raw markup is safe here only because the markup comes from the bundled KIND_ICONS map and `kind` merely
 * picks an entry; no chain data, URL or user text ever reaches it (test/hardening.test.tsx enforces that).
 */
export function KindIcon({ kind, size = 22 }: { kind: number; size?: number }) {
  const svg = (KIND_ICONS[kind] ?? note).replace(/width="24" height="24"/, `width="${size}" height="${size}"`);
  return <span className="kind-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** The chicken drawn from its traits by the shared kit, identical to the on-chain token art. */
export function BirdGlyph({ breed, sex, plumage, tokenId, width = 70, label }: { breed: number; sex: number; plumage: number; tokenId?: number | bigint; width?: number; label?: string }) {
  return <img className="bird-glyph" src={chickenDataUri({ breed, sex, plumage, tokenId })} width={width} height={width} alt={label ?? ""} aria-hidden={label ? undefined : true} />;
}

/** The breed illustration when the illustrator has delivered it, otherwise the kit drawing enlarged. */
export function BreedPortrait({ breed, sex, plumage, tokenId }: { breed: number; sex: number; plumage: number; tokenId?: number | bigint }) {
  const label = `Breed portrait: a ${plumageName(plumage).toLowerCase()} ${breedName(breed)} ${sexName(sex)}`;
  const src = artManifest.breeds[String(breed)];
  if (src) return <img className="portrait-img" src={src} width={768} height={768} alt={label} decoding="async" />;
  return <BirdGlyph breed={breed} sex={sex} plumage={plumage} tokenId={tokenId} width={280} label={label} />;
}

/** Breed illustration as a small square thumbnail, falling back to the kit drawing. */
export function BirdThumb({ breed, sex, plumage, tokenId, width, label }: { breed: number; sex: number; plumage: number; tokenId?: number | bigint; width: number; label?: string }) {
  const src = artManifest.breeds[String(breed)];
  if (src) return <img className="bird-glyph" src={src} width={width} height={width} alt={label ?? ""} aria-hidden={label ? undefined : true} loading="lazy" decoding="async" />;
  return <BirdGlyph breed={breed} sex={sex} plumage={plumage} tokenId={tokenId} width={width} label={label} />;
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
