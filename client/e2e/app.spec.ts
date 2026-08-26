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
  let savedProfile: any = {
    displayName: null,
    profileImageUrl: null,
    profileImageObjectKey: null,
    countryOfResidence: null,
    instagram: null,
    instagramVisible: false,
    telegram: null,
    telegramVisible: false,
    facebook: null,
    facebookVisible: false,
    email: null,
    emailVisible: false,
    phoneNumber: null,
    phoneNumberVisible: false,
    references: [] as Array<{ id: string; name: string; description: string | null; contactInfo: string | null; visible: boolean }>,
  };

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
    if (path === "/api/inventory/policy") {
      return route.fulfill({ json: { keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1, autoSuggestExtras: true } });
    }
    if (path === "/api/inventory") {
      if (request.method() === "POST") return route.fulfill({ status: 201, json: inventoryEntry });
      return route.fulfill({ json: [inventoryEntry] });
    }
    if (path === "/api/settings/profile") {
      return route.fulfill({ json: { publicEnabled: true, publicUrl: "/collection/user_1" } });
    }
    if (path === "/api/profile/me") {
      if (request.method() === "PUT") {
        savedProfile = { ...savedProfile, ...(await request.postDataJSON()) };
      }
      return route.fulfill({ json: savedProfile });
    }
    if (path === "/api/profile/me/photo") {
      savedProfile = {
        ...savedProfile,
        profileImageUrl: "/api/profile-images/profile-images/user_1/avatar.png",
        profileImageObjectKey: "profile-images/user_1/avatar.png",
      };
      return route.fulfill({ json: savedProfile });
    }
    if (path === "/api/profile/me/references") {
      const body = await request.postDataJSON();
      const reference = { id: "ref_1", name: body.name, description: body.description, contactInfo: body.contactInfo, visible: body.visible };
      savedProfile = { ...savedProfile, references: [...savedProfile.references, reference] };
      return route.fulfill({ status: 201, json: reference });
    }
    if (path === "/api/public/collection/user_1") {
      return route.fulfill({
        json: {
          user: { id: "user_1", username: "jw" },
          profile: {
            displayName: savedProfile.displayName || undefined,
            profileImageUrl: savedProfile.profileImageUrl || undefined,
            countryOfResidence: savedProfile.countryOfResidence || undefined,
            instagram: savedProfile.instagramVisible ? savedProfile.instagram : undefined,
            telegram: savedProfile.telegramVisible ? savedProfile.telegram : undefined,
            facebook: savedProfile.facebookVisible ? savedProfile.facebook : undefined,
            email: savedProfile.emailVisible ? savedProfile.email : undefined,
            phoneNumber: savedProfile.phoneNumberVisible ? savedProfile.phoneNumber : undefined,
            references: savedProfile.references.filter((reference: any) => reference.visible),
          },
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
    if (path === "/api/public/collection/user_1/extras") {
      return route.fulfill({
        json: {
          user: { id: "user_1", username: "jw" },
          profile: {},
          listings: [],
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

test("user edits public profile and shared collection profile tab only shows visible fields", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="text"]').fill("jw");
  await page.locator('input[type="password"]').fill("secret1");
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.getByRole("link", { name: "jw" }).first().click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile Settings" })).toBeVisible();
  await page.getByLabel("Upload profile picture").setInputFiles("e2e/fixtures/avatar.png");
  await expect(page.getByText("Edit profile picture")).toBeVisible();
  await page.getByLabel("Rotate right").click();
  await page.getByRole("button", { name: "Save picture" }).click();

  await page.getByLabel("Country of residence").fill("Singapore");
  await page.getByRole("textbox", { name: "Instagram", exact: true }).fill("john.cards");
  await page.getByRole("textbox", { name: "Telegram", exact: true }).fill("johntelegram");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("john@example.com");
  await page.getByRole("textbox", { name: "HP number", exact: true }).fill("+659****9999");
  await page.getByLabel("Show Instagram publicly").check();
  await page.getByLabel("Show Telegram publicly").check();
  await page.getByRole("button", { name: "Save profile" }).click();

  await page.getByLabel("Reference name").fill("Alice");
  await page.getByLabel("Relationship / description").fill("Trade reference");
  await page.getByLabel("Contact method or note").fill("@alice");
  await page.getByLabel("Show this reference publicly").check();
  await page.getByRole("button", { name: "Add reference" }).click();

  await page.goto("/collection/user_1?tab=profile");
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Singapore")).toBeVisible();
  await expect(page.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/john.cards");
  await expect(page.getByRole("link", { name: "Telegram" })).toHaveAttribute("href", "https://t.me/johntelegram");
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  await expect(page.getByText("john@example.com")).toHaveCount(0);
  await expect(page.getByText("+6599999999")).toHaveCount(0);
});
