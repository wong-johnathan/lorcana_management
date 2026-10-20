import { expect, test, type Page } from "@playwright/test";

/**
 * Real-layout coverage for the listing image gallery (REQ-GAL-1..4).
 *
 * AC-GAL-1.3 ("the page never scrolls horizontally at 320 px and the thumbnail
 * strip scrolls inside its own container") and the responsive geometry behind
 * AC-GAL-3.2/4.1/4.2/4.4 cannot be asserted in jsdom, which does not lay out.
 * This spec runs the real app in Chromium at a 320 px viewport with the API
 * mocked at the network layer, exactly like the other e2e specs.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFhAIAH7Z0NwAAAABJRU5ErkJggg==",
  "base64"
);

const card = {
  id: "card_elsa",
  externalId: 1,
  tcgPlayerId: 100,
  cardTraderUrl: null,
  cardmarketUrl: null,
  name: "Elsa, Snow Queen",
  subtitle: "Ice Queen",
  character: "Elsa",
  types: ["Hero"],
  cardType: "Character",
  color: "Amethyst",
  setCode: "TFC",
  setName: "The First Chapter",
  rarity: "Legendary",
  inkCost: 5,
  inkable: true,
  strength: 3,
  willpower: 3,
  lore: 2,
  abilities: "Evasive",
  cardNumber: "1/204 • EN • 1",
  foilTypes: ["None", "Silver"],
  imageUrl: "https://img.example/elsa.jpg",
  prices: [],
};

const photos = [
  { id: "front", url: "https://img.example/front.jpg", sortOrder: 0, label: "Front" },
  { id: "back", url: "https://img.example/back.jpg", sortOrder: 1, label: "Back" },
  { id: "corners", url: "https://img.example/corners.jpg", sortOrder: 2, label: "Corners" },
  { id: "surface", url: "https://img.example/surface.jpg", sortOrder: 3, label: "Surface" },
  { id: "edges", url: "https://img.example/edges.jpg", sortOrder: 4, label: "Edge wear" },
  { id: "sleeve", url: "https://img.example/sleeve.jpg", sortOrder: 5, label: "Sleeve" },
];

const listing = {
  id: "listing_1",
  sellerId: "seller_1",
  cardId: card.id,
  variant: "foil",
  quantity: 2,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: null,
  status: "ACTIVE",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "seller_1", username: "alice", profile: {} },
  photos,
  pendingQuantity: 0,
};

/** 7 images (card art + 6 photos) → the strip cannot fit 320 px. */
const IMAGE_COUNT = photos.length + 1;

async function mockApi(page: Page) {
  // Registered first so the image mocks below (matched most-recent-first) win.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/config") {
      return route.fulfill({ json: { registrationEnabled: true, googleClientId: null } });
    }
    if (path === "/api/marketplace/listings/listing_1") {
      return route.fulfill({ json: listing });
    }
    return route.fulfill({ status: 404, json: { error: `unmocked ${path}` } });
  });
  await page.route("**/api/card-images/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png" })
  );
  await page.route("https://img.example/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png" })
  );
}

async function openGallery(page: Page) {
  await mockApi(page);
  await page.goto("/marketplace/listing/listing_1", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Listing images" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Image thumbnails" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Front, image 2 of ${IMAGE_COUNT}` })).toBeVisible();
}

function thumbnailStrip(page: Page) {
  return page.getByRole("group", { name: "Image thumbnails" });
}

function primaryTrigger(page: Page) {
  return page.getByRole("button", { name: /^View / });
}

test.describe("listing image gallery layout at 320 px", () => {
  test.use({ viewport: { width: 320, height: 800 } });
  // The dev server cold-starts inside the global 30 s budget; the first
  // navigation transforms the whole app graph, so allow more headroom.
  test.setTimeout(90_000);

  test("never scrolls the page horizontally and scrolls the strip in-container (AC-GAL-1.3)", async ({
    page,
  }) => {
    await openGallery(page);

    // The document (not just the body) fits the viewport width.
    const document_ = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(document_.clientWidth).toBe(320);
    expect(document_.scrollWidth).toBeLessThanOrEqual(320);
    expect(document_.bodyScrollWidth).toBeLessThanOrEqual(320);

    // The strip itself is the only horizontally scrollable element …
    const strip = thumbnailStrip(page);
    const before = await strip.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
    }));
    expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
    expect(before.scrollLeft).toBe(0);

    // … and it really scrolls (chevrons mount from the real overflow measurement).
    const right = page.getByRole("button", { name: "Scroll thumbnails right" });
    await expect(right).toBeVisible();
    await right.click();
    await expect
      .poll(() => strip.evaluate((element) => element.scrollLeft), { timeout: 5000 })
      .toBeGreaterThan(0);

    // Scrolling the strip never turns into page-level horizontal scrolling.
    const after = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(after).toBeLessThanOrEqual(320);
  });

  test("keeps a contain-fit primary in a constant bounded frame with 48 px thumbnails (AC-GAL-3.2, 4.1, 4.2, 4.4)", async ({
    page,
  }) => {
    await openGallery(page);

    const primary = primaryTrigger(page);
    const primaryImage = primary.locator("img");

    // The contain-fit image is squeezed into the bounded 55vh (≤ 520 px) frame.
    expect(await primaryImage.evaluate((element) => getComputedStyle(element).objectFit)).toBe(
      "contain"
    );
    const frame = await primary.boundingBox();
    expect(frame).not.toBeNull();
    // clamp(15rem, 55vh, 32.5rem) at an 800 px viewport → 55vh = 440 px.
    expect(frame!.height).toBeGreaterThanOrEqual(15 * 16);
    expect(frame!.height).toBeLessThanOrEqual(32.5 * 16);
    expect(Math.abs(frame!.height - 440)).toBeLessThanOrEqual(5);
    expect(frame!.width).toBeLessThanOrEqual(320);

    // Thumbnails are 48 px squares (h-12/w-12 at the base breakpoint).
    const firstThumb = thumbnailStrip(page).getByRole("button").first();
    const thumbBox = await firstThumb.boundingBox();
    expect(thumbBox).not.toBeNull();
    expect(Math.round(thumbBox!.width)).toBe(48);
    expect(Math.round(thumbBox!.height)).toBe(48);
    expect(
      await firstThumb.locator("img").evaluate((element) => getComputedStyle(element).objectFit)
    ).toBe("cover");

    // Selecting another image cannot resize the frame (AC-GAL-4.4/4.5).
    await page.getByRole("button", { name: `Back, image 3 of ${IMAGE_COUNT}` }).click();
    await expect(primaryTrigger(page)).toHaveAccessibleName("View Back");
    const afterSelection = await primaryTrigger(page).boundingBox();
    expect(afterSelection).not.toBeNull();
    expect(Math.round(afterSelection!.height)).toBe(Math.round(frame!.height));
    expect(Math.round(afterSelection!.width)).toBe(Math.round(frame!.width));
    expect(
      await primaryTrigger(page)
        .locator("img")
        .evaluate((element) => getComputedStyle(element).objectFit)
    ).toBe("contain");

    // Still no page-level horizontal overflow after the selection change.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
