import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_DEFAULTS,
  marketplaceControlsFromParams,
  marketplaceParamsFromControls,
  priceMinorFromMajor,
  formatPriceMinor,
  marketplaceVariantLabel,
} from "../utils/marketplaceParams";

describe("marketplaceParams utils", () => {
  it("hydrates valid controls from URL params", () => {
    const params = new URLSearchParams(
      "q=mickey&variant=foil&condition=NM&currency=USD&priceMin=10&priceMax=50&page=2"
    );
    expect(marketplaceControlsFromParams(params)).toEqual({
      q: "mickey",
      variant: "foil",
      condition: "NM",
      currency: "USD",
      priceMin: "10",
      priceMax: "50",
      page: 2,
    });
  });

  it("degrades unknown or malformed params to defaults", () => {
    const params = new URLSearchParams(
      "q=&variant=bogus&condition=XX&currency=ZZZ&priceMin=-5&priceMax=abc&page=0"
    );
    expect(marketplaceControlsFromParams(params)).toEqual({
      q: "",
      variant: "",
      condition: "",
      currency: "",
      priceMin: "",
      priceMax: "",
      page: 1,
    });
  });

  it("handles a non-numeric page and missing params", () => {
    expect(marketplaceControlsFromParams(new URLSearchParams("page=abc")).page).toBe(1);
    expect(marketplaceControlsFromParams(new URLSearchParams()).page).toBe(1);
    expect(marketplaceControlsFromParams(new URLSearchParams("priceMin=1.")).priceMin).toBe("1.");
  });

  it("serializes only non-default controls back to params", () => {
    expect(marketplaceParamsFromControls(MARKETPLACE_DEFAULTS).toString()).toBe("");
    const params = marketplaceParamsFromControls({
      q: "elsa",
      variant: "foil",
      condition: "LP",
      currency: "EUR",
      priceMin: "10",
      priceMax: "",
      page: 3,
    });
    expect(params.toString()).toBe("q=elsa&variant=foil&condition=LP&currency=EUR&priceMin=10&page=3");
  });

  it("converts major-unit prices to minor units with validation", () => {
    expect(priceMinorFromMajor("10")).toBe(1000);
    expect(priceMinorFromMajor("10.50")).toBe(1050);
    expect(priceMinorFromMajor("")).toBeUndefined();
    expect(priceMinorFromMajor("   ")).toBeUndefined();
    expect(priceMinorFromMajor("-1")).toBeUndefined();
    expect(priceMinorFromMajor("abc")).toBeUndefined();
  });

  it("formats minor-unit prices and falls back on invalid currency codes", () => {
    expect(formatPriceMinor(2500, "USD")).toBe("$25.00");
    expect(formatPriceMinor(2500, "NOT_A_CURRENCY")).toBe("NOT_A_CURRENCY 25.00");
  });

  it("labels known variants and falls back to the raw value", () => {
    expect(marketplaceVariantLabel("normal")).toBe("Normal");
    expect(marketplaceVariantLabel("foil")).toBe("Foil");
    expect(marketplaceVariantLabel("holofoil")).toBe("Holofoil");
    expect(marketplaceVariantLabel("mystery")).toBe("mystery");
  });
});
