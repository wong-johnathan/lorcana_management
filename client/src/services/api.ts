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
