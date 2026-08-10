export interface CardPrice {
  variant: string;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  updatedAt: string;
}

export interface Card {
  id: string;
  externalId: number;
  tcgPlayerId: number | null;
  cardTraderUrl: string | null;
  cardmarketUrl: string | null;
  name: string;
  subtitle: string;
  character: string | null;
  types: string[];
  cardType: string;
  color: string;
  setCode: string;
  setName: string;
  rarity: string;
  inkCost: number;
  strength: number;
  willpower: number;
  lore: number;
  abilities: string;
  cardNumber: string;
  imageUrl: string;
  prices: CardPrice[];
}

export interface InventoryEntry {
  id: string;
  quantity: number;
  foilQuantity: number;
  userId: string;
  cardId: string;
  card: Card;
}

export interface User {
  id: string;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface PaginatedCards {
  cards: Card[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FilterOptions {
  colors: string[];
  sets: string[];
  rarities: string[];
  cardTypes: string[];
  types: string[];
}

export interface RecognizedCard {
  name: string;
  subtitle: string;
  color: string;
  inkCost: number;
  strength: number;
  willpower: number;
  cardNumber: string;
}

export interface RecognizeResult {
  recognized: RecognizedCard | null;
  matches: Card[];
  error?: string;
}

export interface BatchItem {
  image: string;
  quantity: number;
  foilQuantity: number;
}

export interface BatchResultItem {
  index: number;
  status: "success" | "failed";
  recognized: RecognizedCard | null;
  card?: Card;
  error?: string;
  quantity?: number;
  foilQuantity?: number;
  entryId?: string;
}

export interface BatchResult {
  results: BatchResultItem[];
}

export interface InventoryStats {
  totalUnique: number;
  totalCards: number;
  setBreakdown: { setName: string; owned: number; total: number }[];
}

export interface UserSettings {
  publicEnabled: boolean;
  publicUrl: string;
}

export interface PublicCollection {
  user: User;
  cards: { card: Card; quantity: number; foilQuantity: number }[];
  stats: InventoryStats;
}

export interface PillarScore {
  name: string;
  score: number;
  maxScore: number;
  details: string;
}

export interface CardAnalysis {
  summary: string | null;
  lastSold: string | null;
  currentAverage: string | null;
  fullAnalysis: string | null;
  investmentScore: number | null;
  investmentTier: string | null;
  pillarScores: PillarScore[] | null;
  status: "pending" | "completed" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface SyncStatus {
  status: "idle" | "running" | "completed" | "error";
  total: number;
  completed: number;
  failed: number;
  currentItem: string | null;
  startedAt: string | null;
  completedAt: string | null;
}


export type MasterSetPriceField = "lowPrice" | "midPrice" | "highPrice" | "marketPrice";

export interface MasterSetBreakdownByRarity {
  rarity: string;
  cardCount: number;
  pricedVariantCount: number;
  missingVariantCount: number;
  total: number;
}

export interface MasterSetBreakdownByVariant {
  variant: string;
  pricedCount: number;
  missingCount: number;
  total: number;
}

export interface MasterSetMissingPrice {
  cardId: string;
  name: string;
  subtitle: string;
  rarity: string;
  cardNumber: string;
  variant: string;
  reason: "no_tcgplayer_id" | "no_price_for_variant" | "null_price";
}

export interface MasterSetEstimate {
  setName: string;
  setCode: string;
  selectedRarities: string[];
  selectedVariants: string[];
  priceField: MasterSetPriceField;
  cardCount: number;
  pricedVariantCount: number;
  missingVariantCount: number;
  total: number;
  breakdownByRarity: MasterSetBreakdownByRarity[];
  breakdownByVariant: MasterSetBreakdownByVariant[];
  missing: MasterSetMissingPrice[];
}
