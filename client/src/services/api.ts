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
  MasterSetEstimate,
  SyncStatus,
  UserProfile,
  UserProfileUpdate,
  UserReference,
  ProfileImageUpload,
  InventoryPolicy,
  InventoryExtrasResponse,
  CardRetentionOverride,
  CardRetentionOverrideListItem,
  ExtraForSaleListing,
  InventoryVariant,
  ListingCurrency,
  PublicExtrasForSale,
  MarketplaceListParams,
  MarketplaceListResponse,
  MarketplaceCardOffersResponse,
  MarketplaceCreateEnquiryPayload,
  MarketplaceEnquiryDetailResponse,
  MarketplaceEnquiriesResponse,
  MarketplaceCreateOfferPayload,
  MarketplaceEnquiryOffer,
  MarketplaceReputationSummary,
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
    throw new Error(body.error || `Request failed: ${res.status}`);
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
  config: () => request<AuthConfig>("/auth/config"),
};

export const cards = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PaginatedCards>(`/cards${query}`);
  },
  get: (id: string) => request<Card>(`/cards/${id}`),
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
  getExtras: () => request<InventoryExtrasResponse>("/inventory/extras"),
  listRetentionOverrides: () => request<{ overrides: CardRetentionOverrideListItem[] }>("/inventory/retention"),
  getRetentionOverride: (cardId: string) => request<{ override: CardRetentionOverride | null }>(`/inventory/retention/${cardId}`),
  updateRetentionOverride: (cardId: string, data: Partial<CardRetentionOverride>) =>
    request<{ override: CardRetentionOverride }>(`/inventory/retention/${cardId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteRetentionOverride: (cardId: string) => request<void>(`/inventory/retention/${cardId}`, { method: "DELETE" }),
};

export const extrasForSale = {
  list: () => request<{ listings: ExtraForSaleListing[] }>("/extras-for-sale"),
  listAll: () => request<{ created: number; skipped: number }>("/extras-for-sale/list-all", { method: "POST" }),
  create: (data: { cardId: string; variant: InventoryVariant; desiredQuantity: number; note?: string | null; customPrice?: number | null; customPriceCurrency?: ListingCurrency; marketplaceVisible?: boolean; pricingMode?: string; askingPriceMinor?: number | null; currency?: ListingCurrency | null; condition?: string | null; cardLanguage?: string | null }) =>
    request<{ listing: ExtraForSaleListing }>("/extras-for-sale", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { desiredQuantity?: number; note?: string | null; status?: "active" | "paused"; customPrice?: number | null; customPriceCurrency?: ListingCurrency; marketplaceVisible?: boolean; pricingMode?: string; askingPriceMinor?: number | null; currency?: ListingCurrency | null; condition?: string | null; cardLanguage?: string | null }) =>
    request<{ listing: ExtraForSaleListing }>(`/extras-for-sale/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) => request<void>(`/extras-for-sale/${id}`, { method: "DELETE" }),
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
  createReference: (data: Omit<UserReference, "id">) =>
    request<UserReference>("/profile/me/references", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateReference: (id: string, data: Partial<Omit<UserReference, "id">>) =>
    request<UserReference>(`/profile/me/references/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteReference: (id: string) => request<void>(`/profile/me/references/${id}`, { method: "DELETE" }),
};

export const publicCollection = {
  get: (userId: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PublicCollection>(`/public/collection/${userId}${query}`);
  },
  extras: (userId: string) => request<PublicExtrasForSale>(`/public/collection/${userId}/extras`),
};

const marketplaceQuery = (params?: Record<string, string | undefined>) => {
  if (!params) return "";
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  ) as Record<string, string>;
  const query = new URLSearchParams(cleanParams).toString();
  return query ? `?${query}` : "";
};

export const marketplace = {
  list: (params?: MarketplaceListParams) =>
    request<MarketplaceListResponse>(`/marketplace${marketplaceQuery(params as Record<string, string | undefined> | undefined)}`),
  cardOffers: (cardId: string, params?: Pick<MarketplaceListParams, "shipsTo" | "sellerCountry" | "fulfilmentMethod">) =>
    request<MarketplaceCardOffersResponse>(`/marketplace/cards/${cardId}/offers${marketplaceQuery(params as Record<string, string | undefined> | undefined)}`),
  createEnquiry: (listingId: string, data: MarketplaceCreateEnquiryPayload) =>
    request<MarketplaceEnquiryDetailResponse>(`/marketplace/listings/${listingId}/enquiries`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listEnquiries: (params?: { status?: string }) =>
    request<MarketplaceEnquiriesResponse>(`/marketplace/enquiries${marketplaceQuery(params)}`),
  getEnquiry: (id: string) => request<MarketplaceEnquiryDetailResponse>(`/marketplace/enquiries/${id}`),
  sendMessage: (id: string, message: string) =>
    request<{ message: { id: string } }>(`/marketplace/enquiries/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  createOffer: (id: string, data: MarketplaceCreateOfferPayload) =>
    request<{ offer: MarketplaceEnquiryOffer }>(`/marketplace/enquiries/${id}/offers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  userReputation: (userId: string) =>
    request<MarketplaceReputationSummary>(`/marketplace/users/${userId}/reputation`),
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
