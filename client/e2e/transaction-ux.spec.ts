import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "user_1",
  username: "jw",
  email: "jw@example.com",
  emailVerifiedAt: "2026-08-28T00:00:00.000Z",
  authProvider: "LOCAL",
  googleLinked: false,
};

const card = {
  id: "card_1",
  name: "Mickey Mouse",
  setName: "The First Chapter",
};

const transaction = {
  id: "tx_1",
  enquiryId: "enq_1",
  listingId: "listing_1",
  buyerId: "user_1",
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 2,
  priceMinor: 1000,
  currency: "USD",
  status: "COMPLETED",
  completedCause: null,
  cancelledBy: null,
  soldAt: "2026-10-18T00:00:00.000Z",
  confirmedAt: "2026-10-18T00:01:00.000Z",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:01:00.000Z",
  buyer: { id: "user_1", username: "jw" },
  seller: { id: "seller_1", username: "alice" },
  card,
  myReview: { rating: 5, comment: "great" },
  counterpartReview: { rating: 4, comment: "ok" },
};

const enquiry = {
  id: "enq_1",
  listingId: "listing_1",
  buyerId: "user_1",
  sellerId: "seller_1",
  requestedQuantity: 2,
  status: "ACTIVE",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  listing: {
    id: "listing_1",
    sellerId: "seller_1",
    cardId: "card_1",
    variant: "normal",
    quantity: 2,
    priceMinor: 1000,
    currency: "USD",
    condition: "NM",
    location: null,
    note: null,
    status: "ACTIVE",
    hiddenAt: null,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    card,
    photos: [],
  },
  buyer: { id: "user_1", username: "jw" },
  seller: { id: "seller_1", username: "alice" },
};

async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/auth/config") {
      return route.fulfill({ json: { registrationEnabled: true, googleClientId: null } });
    }
    if (path === "/api/cards/filters") {
      return route.fulfill({ json: { colors: [], types: [], sets: [], rarities: [], cardTypes: [] } });
    }
    if (path === "/api/cards") {
      return route.fulfill({ json: { cards: [], pagination: { page: 1, limit: 40, total: 0, totalPages: 0 } } });
    }
    if (path === "/api/settings/profile") {
      return route.fulfill({ json: { publicEnabled: true, publicUrl: "/collection/user_1" } });
    }
    if (path === "/api/profile/me") {
      return route.fulfill({
        json: {
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
        },
      });
    }
    if (path === "/api/inventory/policy") {
      return route.fulfill({ json: { keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1 } });
    }
    if (path === "/api/marketplace/transactions") {
      return route.fulfill({ json: { transactions: [transaction] } });
    }
    if (path === "/api/marketplace/enquiries/enq_1") {
      return route.fulfill({ json: { enquiry, messages: [], transactions: [transaction] } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled mocked API route: ${path}` } });
  });
}

async function login(page: Page) {
  const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { token, user }
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("removed singular transaction route redirects to /database (AC-REV-1.3)", async ({ page }) => {
  await page.goto("/marketplace/transactions/tx_1");

  await expect(page).toHaveURL(/\/database$/);
  await expect(page.getByRole("link", { name: "← All transactions" })).toHaveCount(0);
});

test("profile transaction history starts collapsed and reveals the trade on demand (AC-ACC-1.3, AC-REV-4.x)", async ({ page }) => {
  await login(page);
  await page.goto("/profile");

  const toggle = page.getByRole("button", { name: /transaction history/i });
  await expect(page.getByRole("heading", { name: /transaction history/i })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("1 transaction")).toBeVisible();
  await expect(page.getByText("Mickey Mouse")).toBeHidden();
  await expect(page.getByRole("link", { name: "Sold by alice" })).toHaveCount(0);

  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Mickey Mouse")).toBeVisible();
  await expect(page.getByText(/Normal · Qty 2/)).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sold by alice" })).toHaveAttribute(
    "href",
    "/marketplace/seller/seller_1"
  );
});

test("profile transaction history paginates five entries per page (AC-PAG-1.x)", async ({ page }) => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    ...transaction,
    id: `tx_${index + 1}`,
    card: { id: `card_${index + 1}`, name: `Card ${index + 1}`, setName: "The First Chapter" },
  }));
  await page.route("**/api/marketplace/transactions", (route) =>
    route.fulfill({ json: { transactions: many } })
  );

  await login(page);
  await page.goto("/profile");

  await expect(page.getByRole("button", { name: /transaction history/i })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("12 transactions")).toBeVisible();

  await page.getByRole("button", { name: /transaction history/i }).click();

  await expect(page.getByTestId("transaction-history-entry")).toHaveCount(5);
  await expect(page.getByText("Card 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();

  await page.getByRole("button", { name: "Next page" }).click();

  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(page.getByText("Card 6", { exact: true })).toBeVisible();
  await expect(page.getByText("Card 1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous page" })).toBeEnabled();
});

test("share profile copies the public seller URL (AC-SHP-1.2/1.5/1.8)", async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied?: string }).__copied = text;
        },
      },
    });
  });

  await login(page);
  await page.goto("/profile");

  const shareButton = page.getByRole("button", { name: "Share profile" });
  await expect(shareButton).toBeVisible();
  await expect(shareButton).toHaveAttribute("aria-describedby", /.+/);

  const profileUrlBefore = page.url();
  await shareButton.click();

  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  expect(page.url()).toBe(profileUrlBefore);

  const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
  expect(copied).toBe("http://127.0.0.1:5173/marketplace/seller/user_1");

  // The copied URL is the public, ungated seller page: it renders logged-out.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/config") {
      return route.fulfill({ json: { registrationEnabled: true, googleClientId: null } });
    }
    if (path === "/api/marketplace/sellers/user_1") {
      return route.fulfill({
        json: { user: { id: "user_1", username: "jw", profile: {} }, listings: [], reviews: [], references: [] },
      });
    }
    return route.fulfill({ status: 404, json: { error: `Unhandled mocked API route: ${path}` } });
  });

  await anonPage.goto(copied as string);
  await expect(anonPage).toHaveURL(/\/marketplace\/seller\/user_1$/);
  await expect(anonPage.getByRole("heading", { level: 1, name: "jw" })).toBeVisible();
  await anonContext.close();
});

test("chat thread accordion reveals labelled reviews without a View transaction link (AC-REV-2.x)", async ({ page }) => {
  await login(page);
  await page.goto("/marketplace/chat/enq_1");

  await expect(page.getByRole("link", { name: "View transaction" })).toHaveCount(0);

  const accordion = page.getByRole("button", { name: "View reviews" });
  await expect(accordion).toBeVisible();
  await expect(accordion).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Your review")).not.toBeVisible();

  await accordion.click();

  await expect(accordion).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Your review")).toBeVisible();
  await expect(page.getByText("Seller's review")).toBeVisible();
  await expect(page.getByText("great")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
});
