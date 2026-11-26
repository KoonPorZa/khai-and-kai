import type { Dict } from "./en";
import { th as chickenTh } from "./parts/chicken";
import { th as commonTh } from "./parts/common";
import { th as coopTh } from "./parts/coop";
import { th as eggsTh } from "./parts/eggs";
import { th as farmTh } from "./parts/farm";
import { th as hatchTh } from "./parts/hatch";
import { th as homeTh } from "./parts/home";

// Thai copy. The type makes a missing or extra key a compile error.
export const th: Dict = {
  ...chickenTh,
  ...commonTh,
  ...coopTh,
  ...eggsTh,
  ...farmTh,
  ...hatchTh,
  ...homeTh,
};
