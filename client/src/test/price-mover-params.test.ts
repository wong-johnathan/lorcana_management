import { describe, expect, it } from "vitest";
import { MOVER_DEFAULTS, moverControlsFromParams, moverParamsFromControls } from "../utils/priceMoverParams";

describe("price mover url params", () => {
  it("reads every control from the url", () => {
    const controls = moverControlsFromParams(
      new URLSearchParams("window=7d&type=losers&variant=Holofoil&rarity=Enchanted&field=lowPrice&minPrevPrice=5&minCurrentPrice=7.5&minChangePercent=25"),
    );

    expect(controls).toEqual({
      windowRange: "7d",
      type: "losers",
      variant: "Holofoil",
      rarity: "Enchanted",
      field: "lowPrice",
      minPrevPrice: "5",
      minCurrentPrice: "7.5",
      minChangePercent: "25",
    });
  });

  it("falls back to defaults for missing or unknown values instead of rendering a broken view", () => {
    expect(moverControlsFromParams(new URLSearchParams(""))).toEqual(MOVER_DEFAULTS);
    expect(moverControlsFromParams(new URLSearchParams("window=999d&type=sideways&variant=Bogus&rarity=Bogus&field=nope"))).toEqual(MOVER_DEFAULTS);
    expect(moverControlsFromParams(new URLSearchParams("foo=bar"))).toEqual(MOVER_DEFAULTS);
  });

  it("drops minimum values that are not plain non-negative numbers", () => {
    const controls = moverControlsFromParams(new URLSearchParams("minPrevPrice=abc&minCurrentPrice=-3&minChangePercent=1.2.3"));
    expect(controls.minPrevPrice).toBe("");
    expect(controls.minCurrentPrice).toBe("");
    expect(controls.minChangePercent).toBe("");
  });

  it("keeps partial numeric input so live typing is not interrupted", () => {
    expect(moverControlsFromParams(new URLSearchParams("minPrevPrice=1.")).minPrevPrice).toBe("1.");
    expect(moverControlsFromParams(new URLSearchParams("minPrevPrice=0.5")).minPrevPrice).toBe("0.5");
    expect(moverControlsFromParams(new URLSearchParams("minPrevPrice=%205%20")).minPrevPrice).toBe("5");
  });

  it("writes only non-default values so the default view stays a bare url", () => {
    expect(moverParamsFromControls({ ...MOVER_DEFAULTS }).toString()).toBe("");
  });

  it("round-trips a non-default view", () => {
    const controls = {
      windowRange: "30d" as const,
      type: "volatile" as const,
      variant: "Normal",
      rarity: "all",
      field: "marketPrice" as const,
      minPrevPrice: "5",
      minCurrentPrice: "",
      minChangePercent: "25",
    };
    const search = moverParamsFromControls(controls).toString();

    expect(search).toBe("window=30d&type=volatile&variant=Normal&minPrevPrice=5&minChangePercent=25");
    expect(moverControlsFromParams(new URLSearchParams(search))).toEqual(controls);
  });
});
