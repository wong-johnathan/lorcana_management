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

test("profile transaction history shows the trade and a counterpart link (AC-REV-4.x)", async ({ page }) => {
  await login(page);
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "Transaction history" })).toBeVisible();
  await expect(page.getByText("Mickey Mouse")).toBeVisible();
  await expect(page.getByText(/Normal · Qty 2/)).toBeVisible();
  await expect(page.getByText("Completed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sold by alice" })).toHaveAttribute(
    "href",
    "/marketplace/seller/seller_1"
  );
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
