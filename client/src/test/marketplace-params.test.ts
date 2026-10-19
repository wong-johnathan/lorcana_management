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
      "q=mickey&variant=foil&condition=NM&currency=USD&priceMin=10&priceMax=50&costs=0,5&inkable=inkable&cardTypes=Action,Song&subtypes=Hero&colors=Amber,Ruby&sets=The%20First%20Chapter&rarities=Legendary&page=2"
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
      colors: "Amber,Ruby",
      sets: "The First Chapter",
      rarities: "Legendary",
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
      colors: "",
      sets: "",
      rarities: "",
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
      colors: "Amber",
      sets: "The First Chapter",
      rarities: "",
      page: 3,
    });
    expect(params.toString()).toBe(
      "q=elsa&variant=foil&condition=LP&currency=EUR&priceMin=10&costs=0%2C5&inkable=non-inkable&cardTypes=Action&colors=Amber&sets=The+First+Chapter&page=3"
    );
  });

  it("round-trips colors/sets/rarities CSV through fromParams and toParams", () => {
    const params = new URLSearchParams(
      "colors=Amber%2CRuby&sets=The%20First%20Chapter%2CRise%20of%20the%20Floodborn&rarities=Legendary"
    );
    const controls = marketplaceControlsFromParams(params);
    expect(controls.colors).toBe("Amber,Ruby");
    expect(controls.sets).toBe("The First Chapter,Rise of the Floodborn");
    expect(controls.rarities).toBe("Legendary");

    const serialized = marketplaceParamsFromControls(controls);
    expect(serialized.get("colors")).toBe("Amber,Ruby");
    expect(serialized.get("sets")).toBe("The First Chapter,Rise of the Floodborn");
    expect(serialized.get("rarities")).toBe("Legendary");
  });

  it("omits the new params when empty", () => {
    const params = marketplaceParamsFromControls({
      ...MARKETPLACE_DEFAULTS,
      q: "elsa",
      colors: "",
      sets: "",
      rarities: "",
    });
    expect(params.toString()).toBe("q=elsa");
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
