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
      "q=mickey&variant=foil&condition=NM&currency=USD&priceMin=10&priceMax=50&costs=0,5&inkable=inkable&cardTypes=Action,Song&subtypes=Hero&page=2"
    );
    expect(marketplaceControlsFromParams(params)).toEqual({
      q: "mickey",
      variant: "foil",
      condition: "NM",
      currency: "USD",
      priceMin: "10",
      priceMax: "50",
      costs: "0,5",
      inkable: "inkable",
      cardTypes: "Action,Song",
      subtypes: "Hero",
      page: 2,
    });
  });

  it("degrades unknown or malformed params to defaults", () => {
    const params = new URLSearchParams(
      "q=&variant=bogus&condition=XX&currency=ZZZ&priceMin=-5&priceMax=abc&costs=abc,-1&inkable=bogus&page=0"
    );
    expect(marketplaceControlsFromParams(params)).toEqual({
      q: "",
      variant: "",
      condition: "",
      currency: "",
      priceMin: "",
      priceMax: "",
      costs: "",
      inkable: "",
      cardTypes: "",
      subtypes: "",
      page: 1,
    });
  });

  it("validates costs as CSV of non-negative integers, dropping invalid tokens", () => {
    expect(marketplaceControlsFromParams(new URLSearchParams("costs=0,1,bogus,5,-1,2.5")).costs).toBe("0,1,5");
    expect(marketplaceControlsFromParams(new URLSearchParams("costs=")).costs).toBe("");
    expect(marketplaceControlsFromParams(new URLSearchParams("costs=10,12")).costs).toBe("10,12");
  });

  it("validates inkable against the two literals", () => {
    expect(marketplaceControlsFromParams(new URLSearchParams("inkable=inkable")).inkable).toBe("inkable");
    expect(marketplaceControlsFromParams(new URLSearchParams("inkable=non-inkable")).inkable).toBe("non-inkable");
    expect(marketplaceControlsFromParams(new URLSearchParams("inkable=maybe")).inkable).toBe("");
    expect(marketplaceControlsFromParams(new URLSearchParams("inkable=")).inkable).toBe("");
  });

  it("passes cardTypes and subtypes through as trimmed CSV", () => {
    expect(marketplaceControlsFromParams(new URLSearchParams("cardTypes=Action,Song")).cardTypes).toBe("Action,Song");
    expect(marketplaceControlsFromParams(new URLSearchParams("subtypes=Hero,Princess")).subtypes).toBe("Hero,Princess");
    expect(marketplaceControlsFromParams(new URLSearchParams("cardTypes=")).cardTypes).toBe("");
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
      costs: "0,5",
      inkable: "non-inkable",
      cardTypes: "Action",
      subtypes: "",
      page: 3,
    });
    expect(params.toString()).toBe(
      "q=elsa&variant=foil&condition=LP&currency=EUR&priceMin=10&costs=0%2C5&inkable=non-inkable&cardTypes=Action&page=3"
    );
  });

  it("omits the enhanced params when empty", () => {
    const params = marketplaceParamsFromControls({
      ...MARKETPLACE_DEFAULTS,
      q: "elsa",
    });
    expect(params.toString()).toBe("q=elsa");
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
