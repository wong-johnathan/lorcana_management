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
  foilTypes: string[];
  imageUrl: string;
  prices: CardPrice[];
}

export interface InventoryEntry {
  id: string;
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
  userId: string;
  cardId: string;
  card: Card;
}

export interface User {
  id: string;
  username: string;
  email?: string | null;
  emailVerifiedAt?: string | null;
  authProvider?: "LOCAL" | "GOOGLE" | string;
  googleLinked?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthConfig {
  registrationEnabled: boolean;
  googleClientId: string | null;
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

export interface InventoryStats {
  totalUnique: number;
  totalCards: number;
  totalValue?: number;
  missingPriceCount?: number;
  setBreakdown: { setName: string; owned: number; total: number }[];
}

export interface InventoryPolicy {
  keepNormalQuantity: number;
  keepFoilQuantity: number;
  keepHolofoilQuantity: number;
}

export interface CardRetentionOverride {
  cardId?: string;
  keepNormalQuantity: number | null;
  keepFoilQuantity: number | null;
  keepHolofoilQuantity: number | null;
}

export interface CardRetentionOverrideListItem {
  cardId: string;
  card: Card;
  keepNormalQuantity: number | null;
  keepFoilQuantity: number | null;
  keepHolofoilQuantity: number | null;
}

export interface InventoryCountSet {
  quantity: number;
  foilQuantity: number;
  holofoilQuantity: number;
}

export interface InventoryRemoveExtrasSummary {
  updatedEntries: number;
  deletedEntries: number;
  removedCopies: InventoryCountSet;
}

export interface UserSettings {
  publicEnabled: boolean;
  publicUrl: string;
}

export interface UserProfile {
  displayName: string | null;
  profileImageUrl: string | null;
  profileImageObjectKey: string | null;
  countryOfResidence: string | null;
  instagram: string | null;
  instagramVisible: boolean;
  telegram: string | null;
  telegramVisible: boolean;
  facebook: string | null;
  facebookVisible: boolean;
  email: string | null;
  emailVisible: boolean;
  phoneNumber: string | null;
  phoneNumberVisible: boolean;
}

export type UserProfileUpdate = Omit<UserProfile, "profileImageUrl" | "profileImageObjectKey">;

export interface ProfileImageUpload {
  dataUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

export interface PublicUserProfile {
  displayName?: string;
  profileImageUrl?: string;
  countryOfResidence?: string;
  instagram?: string;
  telegram?: string;
  facebook?: string;
  email?: string;
  phoneNumber?: string;
}

export interface PublicCollection {
  user: User;
  profile?: PublicUserProfile;
  cards: { card: Card; quantity: number; foilQuantity: number; holofoilQuantity: number }[];
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
  latestSnapshotRun?: {
    id: number;
    categoryId: number;
    sourceUpdatedAt: string;
    status: "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
    groupCount: number;
    successfulGroups: number;
    failedGroups: number;
    rowCount: number;
    startedAt: string;
    completedAt: string | null;
    errorSummary: unknown;
  } | null;
}

export interface CardPriceHistoryPoint {
  sourceUpdatedAt: string;
  price: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
}

export interface CardPriceHistorySummary {
  current: number | null;
  /** First priced point inside the selected range — the baseline changeAmount/changePercent compare against. */
  rangeStart: number | null;
  low: number | null;
  high: number | null;
  changeAmount: number | null;
  changePercent: number | null;
}

export interface CardPriceHistory {
  cardId: string;
  tcgPlayerId: number | null;
  variant: string;
  field: "lowPrice" | "midPrice" | "highPrice" | "marketPrice" | "directLowPrice";
  currency: "USD";
  rangeDays: number;
  points: CardPriceHistoryPoint[];
  summary: CardPriceHistorySummary;
  /** Earliest snapshot that has a price for this variant/field, across all history. */
  earliestSourceUpdatedAt: string | null;
  latestSourceUpdatedAt: string | null;
  /** Day span the card's stored history actually covers, so the UI can hide unsupported ranges. */
  availableDays: number;
  emptyReason?: "NO_TCGPLAYER_ID" | "NO_HISTORY" | "NO_VARIANT_HISTORY";
}

export type PriceMoverWindow = "24h" | "7d" | "30d" | "90d";
export type PriceMoverType = "gainers" | "losers" | "volatile" | "dollars";
export type PriceMoverField = "lowPrice" | "midPrice" | "highPrice" | "marketPrice" | "directLowPrice";

export interface PriceMoverItem {
  card: Card;
  variant: string;
  currentPrice: number;
  previousPrice: number;
  changeAmount: number;
  changePercent: number | null;
}

export interface PriceMoverMinFilters {
  minPrevPrice: number | null;
  minCurrentPrice: number | null;
  minChangePercent: number | null;
}

export interface PriceMoversResponse {
  window: PriceMoverWindow;
  type: PriceMoverType;
  variant: string;
  rarity: string;
  field: PriceMoverField;
  currency: "USD";
  currentSourceUpdatedAt: string | null;
  previousSourceUpdatedAt: string | null;
  earliestSourceUpdatedAt?: string | null;
  filters: PriceMoverMinFilters;
  comparedCount?: number;
  unchangedCount?: number;
  movedCount?: number;
  gainersCount?: number;
  losersCount?: number;
  items: PriceMoverItem[];
  emptyReason?: "NO_COMPLETED_RUNS" | "NO_COMPARISON_RUN" | "NO_MOVERS";
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
