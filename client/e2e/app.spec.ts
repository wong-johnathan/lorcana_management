import { expect, test, type Page } from "@playwright/test";

const card = {
  id: "card_1",
  externalId: 1,
  tcgPlayerId: 12345,
  cardTraderUrl: null,
  cardmarketUrl: null,
  name: "Mickey Mouse",
  subtitle: "Brave Little Tailor",
  character: "Mickey Mouse",
  types: ["Hero"],
  cardType: "Character",
  color: "Amber",
  setCode: "SET1",
  setName: "The First Chapter",
  rarity: "Legendary",
  inkCost: 8,
  strength: 5,
  willpower: 5,
  lore: 4,
  abilities: "Evasive",
  cardNumber: "1/204 • EN • 1",
  foilTypes: ["None", "Silver", "Lava"],
  imageUrl: "",
  prices: [
    {
      variant: "Normal",
      lowPrice: 1,
      midPrice: 2,
      highPrice: 3,
      marketPrice: 4,
      updatedAt: new Date().toISOString(),
    },
  ],
};

const inventoryEntry = {
  id: "entry_1",
  cardId: "card_1",
  userId: "user_1",
  quantity: 1,
  foilQuantity: 0,
  holofoilQuantity: 0,
  card,
};

const validClientToken = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJleHAiOjQxMDI0NDQ4MDB9.signature";

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/config") {
      return route.fulfill({ json: { registrationEnabled: true } });
    }
    if (path === "/api/auth/login") {
      return route.fulfill({ json: { token: validClientToken, user: { id: "user_1", username: "jw" } } });
    }
    if (path === "/api/cards/filters") {
      return route.fulfill({
        json: {
          colors: ["Amber"],
          types: ["Hero"],
          sets: ["The First Chapter"],
          rarities: ["Legendary"],
          cardTypes: ["Character"],
        },
      });
    }
    if (path === "/api/cards/master-set/estimate") {
      return route.fulfill({
        json: {
          setName: "The First Chapter",
          setCode: "SET1",
          selectedRarities: ["Legendary"],
          selectedVariants: ["Normal"],
          priceField: "marketPrice",
          cardCount: 1,
          pricedVariantCount: 1,
          missingVariantCount: 0,
          total: 4,
          breakdownByRarity: [
            { rarity: "Legendary", cardCount: 1, pricedVariantCount: 1, missingVariantCount: 0, total: 4 },
          ],
          breakdownByVariant: [{ variant: "Normal", pricedCount: 1, missingCount: 0, total: 4 }],
          missing: [],
        },
      });
    }
    if (path === "/api/cards/card_1/analysis") {
      return route.fulfill({ status: 404, json: { status: "none" } });
    }
    if (path === "/api/cards/card_1") {
      return route.fulfill({ json: card });
    }
    if (path === "/api/cards") {
      return route.fulfill({ json: { cards: [card], pagination: { page: 1, limit: 40, total: 1, totalPages: 1 } } });
    }
    if (path === "/api/inventory/stats") {
      return route.fulfill({
        json: {
          totalUnique: 1,
          totalCards: 1,
          totalValue: 4,
          missingPriceCount: 0,
          setBreakdown: [{ setName: "The First Chapter", owned: 1, total: 1 }],
        },
      });
    }
    if (path === "/api/inventory") {
      if (request.method() === "POST") return route.fulfill({ status: 201, json: inventoryEntry });
      return route.fulfill({ json: [inventoryEntry] });
    }
    if (path === "/api/settings/profile") {
      return route.fulfill({ json: { publicEnabled: true, publicUrl: "http://127.0.0.1:5173/collection/user_1" } });
    }
    if (path === "/api/public/collection/user_1") {
      return route.fulfill({
        json: {
          user: { id: "user_1", username: "jw" },
          cards: [{ card, quantity: 1, foilQuantity: 0, holofoilQuantity: 0 }],
          stats: {
            totalUnique: 1,
            totalCards: 1,
            totalValue: 4,
            missingPriceCount: 0,
            setBreakdown: [{ setName: "The First Chapter", owned: 1, total: 1 }],
          },
        },
      });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mocked API route: ${path}` } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("anonymous user browses database, opens card detail, and runs master-set estimate", async ({ page }) => {
  await page.goto("/database");
  await expect(page.getByText("Mickey Mouse").first()).toBeVisible();

  await page.getByText("Mickey Mouse").first().click();
  await expect(page.getByRole("heading", { name: "Mickey Mouse" })).toBeVisible();
  await expect(page.getByRole("link", { name: /sold/i })).toBeVisible();

  await page.goto("/master-set");
  await page.selectOption("select", "The First Chapter");
  await page.getByRole("button", { name: /calculate master set/i }).click();
  await expect(page.getByText(/\$4\.00/).first()).toBeVisible();
});

test("authenticated user logs in, sees inventory, and public collection stays read-only", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="text"]').fill("jw");
  await page.locator('input[type="password"]').fill("secret1");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByText("Inventory").first()).toBeVisible();
  await page.goto("/database");
  await page.getByRole("button", { name: /add normal card/i }).click();
  await expect(page.getByText("1x").first()).toBeVisible();

  await page.goto("/collection/user_1");
  await expect(page.getByText("Mickey Mouse").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /add normal card/i })).toHaveCount(0);
});
