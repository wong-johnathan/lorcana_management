import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
  };
}

Object.defineProperty(globalThis, "localStorage", { value: createStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: createStorage(), configurable: true });
Object.defineProperty(window, "localStorage", { value: globalThis.localStorage, configurable: true });
Object.defineProperty(window, "sessionStorage", { value: globalThis.sessionStorage, configurable: true });

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });
