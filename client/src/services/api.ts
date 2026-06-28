import type {
  AuthResponse,
  PaginatedCards,
  Card,
  InventoryEntry,
  FilterOptions,
  InventoryStats,
  RecognizeResult,
  BatchItem,
  BatchResult,
  UserSettings,
  PublicCollection,
  CardAnalysis,
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
};

export const cards = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<PaginatedCards>(`/cards${query}`);
  },
  get: (id: string) => request<Card>(`/cards/${id}`),
  filters: () => request<FilterOptions>("/cards/filters"),
  recognize: (image: string) =>
    request<RecognizeResult>("/cards/recognize", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
};

export const inventory = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<InventoryEntry[]>(`/inventory${query}`);
  },
  add: (cardId: string, quantity: number, foilQuantity: number) =>
    request<InventoryEntry>("/inventory", {
      method: "POST",
      body: JSON.stringify({ cardId, quantity, foilQuantity }),
    }),
  update: (id: string, data: { quantity?: number; foilQuantity?: number }) =>
    request<InventoryEntry>(`/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/inventory/${id}`, { method: "DELETE" }),
  stats: () => request<InventoryStats>("/inventory/stats"),
  batchAdd: (items: BatchItem[]) =>
    request<BatchResult>("/inventory/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};

export const sync = {
  refresh: () =>
    request<{ message: string; count: number }>("/sync/refresh", {
      method: "POST",
    }),
};

export const settings = {
  get: () => request<UserSettings>("/settings/profile"),
  update: (data: { publicEnabled: boolean }) =>
    request<UserSettings>("/settings/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
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
};
