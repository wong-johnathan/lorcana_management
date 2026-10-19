import type {
  AuthResponse,
  AuthConfig,
  PaginatedCards,
  Card,
  InventoryEntry,
  FilterOptions,
  InventoryStats,
  UserSettings,
  PublicCollection,
  CardAnalysis,
  CardPriceHistory,
  PriceMoverField,
  PriceMoverType,
  PriceMoverWindow,
  PriceMoversResponse,
  MasterSetEstimate,
  SyncStatus,
  UserProfile,
  UserProfileUpdate,
  ProfileImageUpload,
  InventoryPolicy,
  CardRetentionOverride,
  CardRetentionOverrideListItem,
  InventoryRemoveExtrasSummary,
  MarketplaceListingsResponse,
  MarketplaceListingDetail,
  MarketplaceSellerProfile,
  MarketplaceReview,
  UserReference,
  MarketplaceReport,
  MarketplaceEnquiriesResponse,
  MarketplaceEnquiryDetailResponse,
  MarketplaceEnquireResponse,
  MarketplacePhotoUpload,
  MarketplacePhotoUploadResult,
  MarketplaceMarkSoldResult,
  MarketplaceAdjustQuantityResult,
  MarketplaceConfirmResult,
  MarketplaceCancelResult,
  MarketplaceTransaction,
  MarketplacePendingSalesResponse,
  MarketplaceTransactionsResponse,
  MarketplaceMyListingsResponse,
  EnquiryMessage,
  MarketplaceListing,
} from "../types";

const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && body.error === "Invalid or expired token") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    const error = new Error(body.error || `Request failed: ${res.status}`) as Error & { status?: number; body?: unknown };
    error.status = res.status;
    error.body = body;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const auth = {
  register: (username: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  googleLogin: (credential: string) =>
    request<AuthResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  linkGoogle: (credential: string) =>
    request<AuthResponse>("/auth/link-google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  deleteAccount: (confirmUsername: string, confirmText: string) =>
    request<void>("/auth/me", {
      method: "DELETE",
      body: JSON.stringify({ confirmUsername, confirmText }),
    }),
  config: () => request<AuthConfig>("/auth/config"),
};

export const cards = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PaginatedCards>(`/cards${query}`);
  },
  get: (id: string) => request<Card>(`/cards/${id}`),
  priceMovers: (params?: { window?: PriceMoverWindow; type?: PriceMoverType; variant?: string; rarity?: string; field?: PriceMoverField; limit?: number; minPrevPrice?: string; minCurrentPrice?: string; minChangePercent?: string }) => {
    const query = params ? "?" + new URLSearchParams(Object.fromEntries(
      Object.entries(params).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])
    )).toString() : "";
    return request<PriceMoversResponse>(`/cards/price-movers${query}`);
  },
  priceHistory: (id: string, params?: { variant?: string; field?: string; days?: number }) => {
    const query = params ? "?" + new URLSearchParams(Object.fromEntries(
      Object.entries(params).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])
    )).toString() : "";
    return request<CardPriceHistory>(`/cards/${id}/price-history${query}`);
  },
  filters: () => request<FilterOptions>("/cards/filters"),
  masterSetEstimate: (params: Record<string, string>) =>
    request<MasterSetEstimate>(`/cards/master-set/estimate?${new URLSearchParams(params).toString()}`),
};

export const inventory = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<InventoryEntry[]>(`/inventory${query}`);
  },
  add: (cardId: string, quantity: number, foilQuantity: number, holofoilQuantity = 0) =>
    request<InventoryEntry>("/inventory", {
      method: "POST",
      body: JSON.stringify({ cardId, quantity, foilQuantity, holofoilQuantity }),
    }),
  update: (id: string, data: { quantity?: number; foilQuantity?: number; holofoilQuantity?: number }) =>
    request<InventoryEntry>(`/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/inventory/${id}`, { method: "DELETE" }),
  wipe: () =>
    request<{ deleted: number }>("/inventory", { method: "DELETE" }),
  stats: () => request<InventoryStats>("/inventory/stats"),
  getPolicy: () => request<InventoryPolicy>("/inventory/policy"),
  updatePolicy: (data: Partial<InventoryPolicy>) =>
    request<InventoryPolicy>("/inventory/policy", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeExtras: () => request<InventoryRemoveExtrasSummary>("/inventory/remove-extras", { method: "POST" }),
  listRetentionOverrides: () => request<{ overrides: CardRetentionOverrideListItem[] }>("/inventory/retention"),
  getRetentionOverride: (cardId: string) => request<{ override: CardRetentionOverride | null }>(`/inventory/retention/${cardId}`),
  updateRetentionOverride: (cardId: string, data: Partial<CardRetentionOverride>) =>
    request<{ override: CardRetentionOverride }>(`/inventory/retention/${cardId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteRetentionOverride: (cardId: string) => request<void>(`/inventory/retention/${cardId}`, { method: "DELETE" }),
};

export const sync = {
  refresh: () =>
    request<{ status: string; message: string; total: number }>("/sync/refresh", {
      method: "POST",
    }),
  refreshStatus: () => request<SyncStatus>("/sync/refresh/status"),
  prices: () =>
    request<{ status: string; message: string; total: number }>("/sync/prices", {
      method: "POST",
    }),
  pricesStatus: () => request<SyncStatus>("/sync/prices/status"),
};

export const settings = {
  get: () => request<UserSettings>("/settings/profile"),
  update: (data: { publicEnabled: boolean }) =>
    request<UserSettings>("/settings/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const profile = {
  get: () => request<UserProfile>("/profile/me"),
  update: (data: UserProfileUpdate) =>
    request<UserProfile>("/profile/me", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  uploadPhoto: (data: ProfileImageUpload) =>
    request<UserProfile>("/profile/me/photo", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deletePhoto: () => request<void>("/profile/me/photo", { method: "DELETE" }),
};

export const publicCollection = {
  get: (userId: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PublicCollection>(`/public/collection/${userId}${query}`);
  },
};

export const analysis = {
  get: (cardId: string) => request<CardAnalysis>(`/cards/${cardId}/analysis`),
  analyze: (cardId: string) =>
    request<{ status: string; message: string }>(`/cards/${cardId}/analyze`, {
      method: "POST",
    }),
  batchAnalyze: () =>
    request<{ status: string; message: string; total: number }>("/cards/analyze-batch", {
      method: "POST",
    }),
  batchStatus: () =>
    request<{ status: string; total: number; completed: number; failed: number; currentCard: string | null; startedAt: string | null }>("/cards/analyze-batch/status"),
};

/**
 * Lorcana Marketplace (Lean V2).
 *
 * F1 owns the public/read surface plus the report write (REQ-22) and the vouch
 * write (REQ-20, see the F1 card + plan.md ownership matrix). F2 appends the
 * remaining authed write functions (enquire/messages/mark-sold/confirm/cancel/
 * adjust/review/photo-upload) onto this namespace without re-defining these.
 */
export const marketplace = {
  listings: (params?: {
    q?: string;
    variant?: string;
    condition?: string;
    priceMin?: string;
    priceMax?: string;
    currency?: string;
    costs?: string;
    inkable?: string;
    cardTypes?: string;
    subtypes?: string;
    colors?: string;
    sets?: string;
    rarities?: string;
    sellerId?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = params
      ? "?" +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, value]) => value != null && value !== "")
              .map(([key, value]) => [key, String(value)])
          )
        ).toString()
      : "";
    return request<MarketplaceListingsResponse>(`/marketplace/listings${query}`);
  },
  listing: (id: string) =>
    request<MarketplaceListingDetail>(`/marketplace/listings/${id}`),
  seller: (userId: string) =>
    request<MarketplaceSellerProfile>(`/marketplace/sellers/${userId}`),
  reviews: (userId: string) =>
    request<{ reviews: MarketplaceReview[] }>(`/marketplace/users/${userId}/reviews`),
  references: (userId: string) =>
    request<{ references: UserReference[] }>(`/marketplace/users/${userId}/references`),
  vouch: (userId: string, comment: string) =>
    request<UserReference>(`/marketplace/users/${userId}/references`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
  report: (body: {
    targetType: "LISTING" | "USER";
    targetId: string;
    reason: string;
  }) =>
    request<MarketplaceReport>("/marketplace/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── F2: authed/transactional writes and reads (design §7) ────────────────

  /** POST /marketplace/listings/:id/enquire (REQ-11/12) → { enquiryId }. */
  enquire: (listingId: string, requestedQuantity: number) =>
    request<MarketplaceEnquireResponse>(`/marketplace/listings/${listingId}/enquire`, {
      method: "POST",
      body: JSON.stringify({ requestedQuantity }),
    }),

  /** GET /marketplace/enquiries — my threads (buyer or seller). */
  getEnquiries: () => request<MarketplaceEnquiriesResponse>("/marketplace/enquiries"),

  /** GET /marketplace/enquiries/:id — thread + messages (buyer/seller only). */
  getEnquiry: (id: string) =>
    request<MarketplaceEnquiryDetailResponse>(`/marketplace/enquiries/${id}`),

  /** POST /marketplace/enquiries/:id/messages — plain text (REQ-13). */
  postMessage: (id: string, body: string) =>
    request<EnquiryMessage>(`/marketplace/enquiries/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  /** POST /marketplace/enquiries/:id/mark-sold (seller; q defaults to requested). */
  markSold: (id: string, quantity?: number) =>
    request<MarketplaceMarkSoldResult>(`/marketplace/enquiries/${id}/mark-sold`, {
      method: "POST",
      body: JSON.stringify(quantity != null ? { quantity } : {}),
    }),

  /** PATCH /marketplace/transactions/:id/quantity (AC-14.5). */
  adjustQuantity: (transactionId: string, quantity: number) =>
    request<MarketplaceAdjustQuantityResult>(
      `/marketplace/transactions/${transactionId}/quantity`,
      {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      }
    ),

  /** POST /marketplace/transactions/:id/confirm (buyer, REQ-16). */
  confirm: (transactionId: string) =>
    request<MarketplaceConfirmResult>(`/marketplace/transactions/${transactionId}/confirm`, {
      method: "POST",
    }),

  /** POST /marketplace/transactions/:id/cancel (buyer/seller, REQ-18). */
  cancel: (transactionId: string) =>
    request<MarketplaceCancelResult>(`/marketplace/transactions/${transactionId}/cancel`, {
      method: "POST",
    }),

  /** GET /marketplace/transactions/:id — status + parties + cause. */
  getTransaction: (transactionId: string) =>
    request<MarketplaceTransaction>(`/marketplace/transactions/${transactionId}`),

  /** GET /marketplace/transactions — my transactions (buyer OR seller, newest-first). */
  getTransactions: (status?: string) => {
    const query = status ? `?${new URLSearchParams({ status }).toString()}` : "";
    return request<MarketplaceTransactionsResponse>(`/marketplace/transactions${query}`);
  },

  /** GET /marketplace/listings/mine — my listings incl. CLOSED/hidden (D2). */
  getMyListings: () =>
    request<MarketplaceMyListingsResponse>("/marketplace/listings/mine"),

  /** GET /marketplace/me/pending — seller's pending-sale breakdown (REQ-15). */
  getMyPending: () => request<MarketplacePendingSalesResponse>("/marketplace/me/pending"),

  /** POST /marketplace/transactions/:id/review (REQ-19; COMPLETED only). */
  postReview: (transactionId: string, rating: number, comment?: string) =>
    request<MarketplaceReview>(`/marketplace/transactions/${transactionId}/review`, {
      method: "POST",
      body: JSON.stringify({ rating, ...(comment != null ? { comment } : {}) }),
    }),

  /** POST /marketplace/listings/:id/photos (REQ-23; dataUrl + contentType). */
  uploadPhoto: (listingId: string, photo: MarketplacePhotoUpload) =>
    request<MarketplacePhotoUploadResult>(`/marketplace/listings/${listingId}/photos`, {
      method: "POST",
      body: JSON.stringify(photo),
    }),

  /** DELETE /marketplace/listings/:id/photos/:photoId. */
  deletePhoto: (listingId: string, photoId: string) =>
    request<void>(`/marketplace/listings/${listingId}/photos/${photoId}`, {
      method: "DELETE",
    }),

  /** PATCH /marketplace/listings/:id/photos/:photoId (REQ-POL-15; { label }). */
  updatePhotoLabel: (listingId: string, photoId: string, label: string | null) =>
    request<MarketplacePhotoUploadResult>(
      `/marketplace/listings/${listingId}/photos/${photoId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ label }),
      }
    ),

  /** POST /marketplace/listings (REQ-3/4/5). */
  createListing: (body: {
    cardId: string;
    variant: string;
    quantity: number;
    priceMinor: number;
    currency: string;
    condition?: string | null;
    location?: string;
    note?: string | null;
  }) =>
    request<MarketplaceListing>("/marketplace/listings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** PATCH /marketplace/listings/:id (REQ-7/8). */
  updateListing: (
    id: string,
    body: {
      quantity?: number;
      priceMinor?: number;
      currency?: string;
      condition?: string | null;
      location?: string;
      note?: string | null;
    }
  ) =>
    request<MarketplaceListing>(`/marketplace/listings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  /** DELETE /marketplace/listings/:id (AC-8.3 / D9). */
  deleteListing: (id: string) =>
    request<void>(`/marketplace/listings/${id}`, { method: "DELETE" }),
};
