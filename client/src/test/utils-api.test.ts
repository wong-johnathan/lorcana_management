import { beforeEach, describe, expect, it, vi } from "vitest";
import { availableInventoryVariants, isInventoryVariantAvailable, totalInventoryCount } from "../utils/cardVariants";
import { formatTimeAgo } from "../utils/format";
import { auth, cards, inventory, sync, settings, publicCollection, analysis } from "../services/api";

describe("client utility helpers", () => {
  it("derives inventory variants from foilTypes and totals quantities", () => {
    expect(availableInventoryVariants({} as any)).toEqual(["normal"]);
    expect(availableInventoryVariants({ foilTypes: [] } as any)).toEqual(["normal"]);
    expect(availableInventoryVariants({ foilTypes: ["None"] } as any)).toEqual(["normal"]);
    expect(availableInventoryVariants({ foilTypes: ["Silver"] } as any)).toEqual(["foil"]);
    expect(availableInventoryVariants({ foilTypes: ["Lava"] } as any)).toEqual(["holofoil"]);
    expect(availableInventoryVariants({ foilTypes: ["None", "Silver", "Magma"] } as any)).toEqual(["normal", "foil", "holofoil"]);
    expect(isInventoryVariantAvailable({ foilTypes: ["Silver"] } as any, "foil")).toBe(true);
    expect(isInventoryVariantAvailable({ foilTypes: ["Silver"] } as any, "normal")).toBe(false);
    expect(totalInventoryCount({ quantity: 1, foilQuantity: 2, holofoilQuantity: 3 })).toBe(6);
    expect(totalInventoryCount({ quantity: 1 })).toBe(1);
    expect(totalInventoryCount({})).toBe(0);
  });

  it("formats relative times", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    expect(formatTimeAgo("")).toBe("");
    expect(formatTimeAgo("2026-01-01T23:59:30Z")).toBe("just now");
    expect(formatTimeAgo("2026-01-01T23:30:00Z")).toBe("30m ago");
    expect(formatTimeAgo("2026-01-01T21:00:00Z")).toBe("3h ago");
    expect(formatTimeAgo("2025-12-30T00:00:00Z")).toBe("3d ago");
    vi.useRealTimers();
  });
});

describe("API client wrapper", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  it("sends JSON requests, auth headers, and parses responses", async () => {
    localStorage.setItem("token", "abc");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "new", user: { id: "u", username: "jw" } }) });
    await expect(auth.login("JW", "secret")).resolves.toEqual({ token: "new", user: { id: "u", username: "jw" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer abc" }),
      body: JSON.stringify({ username: "JW", password: "secret" }),
    }));
  });

  it("dispatches auth:expired only for explicit expired-token 401s", async () => {
    const expired = vi.fn();
    window.addEventListener("auth:expired", expired);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Invalid or expired token" }) });
    await expect(cards.get("card_1")).rejects.toThrow("Invalid or expired token");
    expect(expired).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Authentication required" }) });
    await expect(inventory.stats()).rejects.toThrow("Authentication required");
    expect(expired).toHaveBeenCalledOnce();
  });



  it("surfaces fallback API errors and supports queryless endpoints", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(cards.filters()).rejects.toThrow("Request failed");

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ cards: [] }) });
    await expect(cards.list()).resolves.toEqual({ cards: [] });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/cards", expect.any(Object));

    localStorage.removeItem("token");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await inventory.stats();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/inventory/stats", expect.objectContaining({ headers: { "Content-Type": "application/json" } }));
  });

  it("covers exported endpoint methods and 204 empty responses", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    await expect(inventory.remove("entry_1")).resolves.toBeUndefined();

    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await Promise.all([
      auth.register("a", "secret"),
      auth.config(),
      cards.list({ search: "Mickey" }),
      cards.filters(),
      cards.masterSetEstimate({ setName: "Set" }),
      inventory.list({ color: "Amber" }),
      inventory.add("card_1", 1, 0, 0),
      inventory.update("entry_1", { quantity: 2 }),
      inventory.wipe(),
      sync.refresh(),
      sync.refreshStatus(),
      sync.prices(),
      sync.pricesStatus(),
      settings.get(),
      settings.update({ publicEnabled: true }),
      publicCollection.get("user_1", { rarity: "Common" }),
      analysis.get("card_1"),
      analysis.analyze("card_1"),
      analysis.batchAnalyze(),
      analysis.batchStatus(),
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/cards?search=Mickey", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/public/collection/user_1?rarity=Common", expect.any(Object));
  });
});
