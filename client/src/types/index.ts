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

// ─────────────────────────────────────────────────────────────────────────────
// Lorcana Marketplace (Lean V2)
// Client types mirror the frozen server contract (design §7) and B3's response
// envelopes. Wire values are the design §4/§7 strings: variant is lowercase
// "normal" | "foil" | "holofoil" (D1), condition "NM" | "LP" | "MP" | "HP",
// currency an ISO-4217 uppercase code.
// ─────────────────────────────────────────────────────────────────────────────

export type MarketplaceVariant = "normal" | "foil" | "holofoil";
export type MarketplaceCondition = "NM" | "LP" | "MP" | "HP";

export interface MarketplaceListingPhoto {
  id: string;
  url: string;
  sortOrder: number;
}

/** The `seller` object embedded in every serialized listing. */
export interface MarketplaceSellerSummary {
  id: string;
  username: string;
  profile: PublicUserProfile;
}

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  cardId: string;
  variant: string;
  quantity: number;
  priceMinor: number;
  currency: string;
  condition: string | null;
  location: string;
  note: string | null;
  status: string;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  card: Card | null;
  seller: MarketplaceSellerSummary | null;
  photos: MarketplaceListingPhoto[];
}

/** GET /marketplace/listings/:id — the listing plus the pending-sale count. */
export interface MarketplaceListingDetail extends MarketplaceListing {
  pendingQuantity: number;
}

export interface MarketplacePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** GET /marketplace/listings */
export interface MarketplaceListingsResponse {
  listings: MarketplaceListing[];
  pagination: MarketplacePagination;
}

export interface MarketplaceReview {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer: { id: string; username: string };
}

/** A vouch (reference check) with the completed-deal badge computed at read time (REQ-21). */
export interface UserReference {
  id: string;
  authorId: string;
  author: { id: string; username: string };
  subjectId: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  hasCompletedDeal: boolean;
}

/** GET /marketplace/sellers/:userId */
export interface MarketplaceSellerProfile {
  user: { id: string; username: string; profile: PublicUserProfile };
  listings: MarketplaceListing[];
  reviews: MarketplaceReview[];
  references: UserReference[];
}

export interface MarketplaceReport {
  id: string;
  reporterId: string;
  targetType: "LISTING" | "USER";
  targetId: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
}

/** GET /marketplace/enquiries — a thread summary in the seller/buyer inbox (F2 surfaces). */
export interface MarketplaceEnquirySummary {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  requestedQuantity: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    cardId: string;
    variant: string;
    quantity: number;
    priceMinor: number;
    currency: string;
    status: string;
    card: Card;
  };
  buyer: { id: string; username: string };
  seller: { id: string; username: string };
  lastMessageAt: string;
}

export interface EnquiryMessage {
  id: string;
  enquiryId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface MarketplaceTransaction {
  id: string;
  enquiryId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  cardId: string;
  variant: string;
  quantity: number;
  priceMinor: number;
  currency: string;
  status: string;
  completedCause: string | null;
  cancelledBy: string | null;
  soldAt: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  buyer: { id: string; username: string };
  seller: { id: string; username: string };
  card: { id: string; name: string; setName: string };
}

/** GET /marketplace/me/pending — computed pending-sale breakdown (AC-15.3). */
export interface MarketplacePendingSaleItem {
  cardId: string;
  variant: string;
  quantity: number;
  transactionId: string;
  buyerUsername: string | null;
  soldAt: string;
}

export interface MarketplacePendingSalesResponse {
  items: MarketplacePendingSaleItem[];
}

/** GET /marketplace/transactions — the caller's own transactions (buyer OR seller). */
export interface MarketplaceTransactionsResponse {
  transactions: MarketplaceTransaction[];
}

/** GET /marketplace/listings/mine — the seller's own listings, incl. CLOSED/hidden. */
export interface MarketplaceMyListingsResponse {
  listings: MarketplaceListing[];
}

// ─────────────────────────────────────────────────────────────────────────────
// F2 additions — authed/transactional surfaces (chat, sell, transactions).
// ─────────────────────────────────────────────────────────────────────────────

/** GET /marketplace/enquiries — the seller/buyer inbox. */
export interface MarketplaceEnquiriesResponse {
  enquiries: MarketplaceEnquirySummary[];
}

/**
 * GET /marketplace/enquiries/:id — thread + messages. The embedded `listing` is
 * the raw Prisma listing (card + photos, no `seller`), so `seller` is unused.
 */
export interface MarketplaceEnquiryDetail {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  requestedQuantity: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  listing: MarketplaceListing;
  buyer: { id: string; username: string };
  seller: { id: string; username: string };
}

export interface MarketplaceEnquiryDetailResponse {
  enquiry: MarketplaceEnquiryDetail;
  messages: EnquiryMessage[];
}

/** POST /marketplace/listings/:id/enquire → { enquiryId }. */
export interface MarketplaceEnquireResponse {
  enquiryId: string;
}

/** Listing photo upload body (dataUrl + contentType; REQ-23 / D7). */
export interface MarketplacePhotoUpload {
  dataUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

/** POST /marketplace/listings/:id/photos — the persisted photo row. */
export interface MarketplacePhotoUploadResult extends MarketplaceListingPhoto {
  listingId: string;
  objectKey: string;
  createdAt: string;
}

/** Thin results returned by the B2 transition write endpoints. */
export interface MarketplaceMarkSoldResult {
  transactionId: string;
  quantity: number;
  status: string;
  listingQuantity: number;
  listingStatus: string;
}

export interface MarketplaceAdjustQuantityResult {
  transactionId: string;
  quantity: number;
}

export interface MarketplaceConfirmResult {
  transactionId: string;
  alreadyCompleted: boolean;
  status?: string;
}

export interface MarketplaceCancelResult {
  transactionId: string;
  alreadyCancelled: boolean;
  status?: string;
}
