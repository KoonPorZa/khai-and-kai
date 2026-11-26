// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reset } from "./wagmiMock";

vi.mock("wagmi", async () => (await import("./wagmiMock")).wagmiMock);
vi.mock("wagmi/actions", async () => (await import("./wagmiMock")).actions);

import { App } from "../src/App";
import { en } from "../src/i18n/en";
import { th } from "../src/i18n/th";
import { LangProvider, STORAGE_KEY, translate } from "../src/i18n";
import { formatDuration, periodLabel } from "../src/lib/format";
import { friendlyError } from "../src/lib/errors";

function show(path = "/") {
  return render(
    <LangProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LangProvider>,
  );
}

beforeEach(() => {
  reset();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  document.documentElement.lang = "";
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
  window.scrollTo = (() => undefined) as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("language toggle", () => {
  it("is English by default and switches the visible text, the html lang and the remembered choice", () => {
    show();
    expect(screen.getAllByText("Eggs").length).toBeGreaterThan(0);
    const th = screen.getByRole("button", { name: "ไทย" });
    expect(th.getAttribute("aria-pressed")).toBe("false");
    expect((th as HTMLButtonElement).type).toBe("button");
    fireEvent.click(th);
    expect(screen.getAllByText("หน้าแรก").length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe("th");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("th");
    expect(screen.getByRole("button", { name: "ไทย" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("starts in the remembered language", () => {
    window.localStorage.setItem(STORAGE_KEY, "th");
    show();
    expect(screen.getAllByText("หน้าแรก").length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe("th");
  });

  it("?lang=th selects Thai and remembers it, and ?lang=en beats a remembered Thai", () => {
    window.history.replaceState({}, "", "/?lang=th");
    show();
    expect(screen.getAllByText("หน้าแรก").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("th");
    cleanup();
    window.history.replaceState({}, "", "/?lang=en");
    show();
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("ignores unknown values", () => {
    window.history.replaceState({}, "", "/?lang=fr");
    window.localStorage.setItem(STORAGE_KEY, "xx");
    show();
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
  });

  it("keeps working when storage throws", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom, clear: boom });
    window.history.replaceState({}, "", "/?lang=th");
    show();
    expect(screen.getAllByText("หน้าแรก").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
  });

  it("formatting helpers and error messages follow the language but keep numbers and dates", () => {
    window.localStorage.setItem(STORAGE_KEY, "th");
    show();
    expect(formatDuration(3600 * 5 + 120)).toBe("5 ชม. 2 นาที");
    expect(periodLabel(1, 3600)).toBe("1 รอบ (1 ชั่วโมง)");
    expect(friendlyError(new Error("provider not found")).title).toBe("ไม่พบกระเป๋าในเบราว์เซอร์นี้");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(formatDuration(3600 * 5 + 120)).toBe("5 h 2 min");
  });
});

describe("dictionaries", () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("English and Thai have exactly the same keys", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).length).toBeGreaterThan(200);
  });

  it("no value is empty and every {placeholder} exists on both sides", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), `en ${key}`).not.toBe("");
      expect(th[key].trim(), `th ${key}`).not.toBe("");
      expect(placeholders(th[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("interpolates and falls back to the key text for a missing variable", () => {
    expect(translate("en", "home.birdsRegistered", { n: 300 })).toBe("300 birds registered");
    expect(translate("th", "home.birdsRegistered", { n: 300 })).toBe("ลงทะเบียนไก่แล้ว 300 ตัว");
    expect(translate("en", "home.birdsRegistered")).toBe("{n} birds registered");
  });

  it("Thai copy never promises ownership, never uses polite particles or exclamation marks", () => {
    for (const key of Object.keys(th) as (keyof typeof th)[]) {
      expect(th[key], key).not.toMatch(/[!！]|ครับ|ค่ะ|คะ(?![ก-๙])/);
    }
  });
});
