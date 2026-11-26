import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Dict, type Key } from "./en";
import { th } from "./th";

export type Lang = "en" | "th";
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

const DICTS: Record<Lang, Dict> = { en, th };
export const STORAGE_KEY = "kk.lang";

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const text = DICTS[lang][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

// Non-React code (formatting helpers, error mapping) reads the language the provider last set.
let current: Lang = "en";
export const tNow: T = (key, vars) => translate(current, key, vars);

function readStored(): Lang | undefined {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "th" || v === "en" ? v : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

/** ?lang=th or ?lang=en wins and is remembered; otherwise the remembered choice; otherwise English. */
function initialLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "th" || q === "en") {
      writeStored(q);
      return q;
    }
  } catch {
    // ignore
  }
  return readStored() ?? "en";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => undefined });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = initialLang();
    current = l;
    return l;
  });
  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    writeStored(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** `t("key", { name })` with {name} interpolation. Works without a provider (English). */
export function useT(): T {
  const { lang } = useLang();
  return useCallback<T>((key, vars) => translate(lang, key, vars), [lang]);
}
