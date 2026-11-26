// Source dictionary: every user-facing string of the web app, merged from parts/*.ts (both languages sit side by side there).
import { en as chickenEn } from "./parts/chicken";
import { en as commonEn } from "./parts/common";
import { en as coopEn } from "./parts/coop";
import { en as eggsEn } from "./parts/eggs";
import { en as farmEn } from "./parts/farm";
import { en as hatchEn } from "./parts/hatch";
import { en as homeEn } from "./parts/home";

export const en = {
  ...chickenEn,
  ...commonEn,
  ...coopEn,
  ...eggsEn,
  ...farmEn,
  ...hatchEn,
  ...homeEn,
} as const;

export type Key = keyof typeof en;
export type Dict = { [K in Key]: string };
