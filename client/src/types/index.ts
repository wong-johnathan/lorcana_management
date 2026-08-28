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
  emailVerifiedAt?: string | null;
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

export interface InventoryStats {
  totalUnique: number;
  totalCards: number;
  totalValue?: number;
  missingPriceCount?: number;
  setBreakdown: { setName: string; owned: number; total: number }[];
}

export type InventoryVariant = "normal" | "foil" | "holofoil";
export type ListingCurrency = "USD" | "SGD" | "MYR" | "EUR" | "GBP" | "AUD" | "CAD" | "JPY";

export interface InventoryPolicy {
  keepNormalQuantity: number;
  keepFoilQuantity: number;
  keepHolofoilQuantity: number;
  autoSuggestExtras: boolean;
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

export interface InventoryExtrasCard {
  card: Card;
  owned: InventoryCountSet;
  keep: InventoryCountSet;
  extras: InventoryCountSet;
  activeListings: InventoryCountSet;
  availableToList: InventoryCountSet;
  referencePrices: { normal: number | null; foil: number | null; holofoil: number | null };
}

export interface InventoryExtrasResponse {
  policy: InventoryPolicy;
  cards: InventoryExtrasCard[];
}

export interface ExtraForSaleListing {
  id: string;
  cardId: string;
  card: Card;
  variant: InventoryVariant;
  desiredQuantity: number;
  publicQuantity: number;
  referencePrice: number | null;
  referencePriceCurrency: "USD";
  customPrice: number | null;
  customPriceCurrency: ListingCurrency;
  note: string | null;
  status: "active" | "paused";
  marketplaceVisible?: boolean;
  pricingMode?: MarketplacePricingMode;
  askingPriceMinor?: number | null;
  currency?: ListingCurrency | null;
  condition?: MarketplaceCondition | null;
  cardLanguage?: string | null;
  originCountryCode?: string | null;
  publicLocality?: string | null;
  allowsMeetup?: boolean;
  shipsDomestically?: boolean;
  shipsInternationally?: boolean;
  shipsWorldwide?: boolean;
  destinationCountries?: string[];
  fulfilment?: MarketplaceFulfilmentCoverage | null;
  eligibility?: MarketplaceListingEligibility;
}

export interface PublicExtraForSaleListing {
  id: string;
  card: Card;
  variant: InventoryVariant;
  quantity: number;
  referencePrice: number | null;
  referencePriceCurrency: "USD";
  customPrice: number | null;
  customPriceCurrency: ListingCurrency;
  note: string | null;
}

export interface PublicExtrasForSale {
  user: User;
  profile?: PublicUserProfile;
  listings: PublicExtraForSaleListing[];
}

export interface UserSettings {
  publicEnabled: boolean;
  publicUrl: string;
}

export interface UserReference {
  id: string;
  name: string;
  description: string | null;
  contactInfo: string | null;
  visible: boolean;
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
  references: UserReference[];
}

export type UserProfileUpdate = Omit<UserProfile, "profileImageUrl" | "profileImageObjectKey" | "references">;

export interface ProfileImageUpload {
  dataUrl: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

export interface PublicReference {
  id: string;
  name: string;
  description?: string | null;
  contactInfo?: string | null;
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
  references?: PublicReference[];
}

export interface PublicCollection {
  user: User;
  profile?: PublicUserProfile;
  cards: { card: Card; quantity: number; foilQuantity: number; holofoilQuantity: number }[];
  stats: InventoryStats;
}

export type MarketplacePricingMode = "FIXED" | "ACCEPTS_OFFERS";
export type MarketplaceCondition = "MINT" | "NEAR_MINT" | "LIGHTLY_PLAYED" | "MODERATELY_PLAYED" | "HEAVILY_PLAYED" | "DAMAGED";
export type MarketplaceFulfilmentMethod = "MEETUP" | "DOMESTIC_SHIPPING" | "INTERNATIONAL_SHIPPING";
export type MarketplaceEnquiryStatus =
  | "PENDING_SELLER"
  | "AWAITING_BUYER"
  | "RESERVED"
  | "AWAITING_BUYER_CONFIRMATION"
  | "COMPLETED"
  | "DECLINED"
  | "WITHDRAWN"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";

export interface MarketplaceMoney {
  amountMinor: number;
  currency: ListingCurrency;
}

export interface MarketplaceApproximateMoney extends MarketplaceMoney {
  rateSource?: string;
  fetchedAt?: string;
}

export interface MarketplaceReputationSummary {
  userId: string;
  role: "buyer" | "seller";
  ratingAverage: number | null;
  reviewCount: number;
  completedDeals: number;
  uniqueCounterparties: number;
  memberSince: string;
  emailVerified: boolean;
}

export interface MarketplaceFulfilmentCoverage {
  allowsMeetup: boolean;
  shipsDomestically: boolean;
  shipsInternationally: boolean;
  shipsWorldwide: boolean;
  destinationCountryCodes: string[];
}

export interface MarketplaceListingEligibility {
  marketplaceVisible: boolean;
  sellerEmailVerified: boolean;
  active: boolean;
  hasAskingPrice: boolean;
  hasCondition: boolean;
  hasCardLanguage: boolean;
  hasFulfilmentCoverage: boolean;
  availableQuantity: number;
  eligible: boolean;
  blockers: string[];
}

export interface MarketplaceCardResult {
  card: Card;
  variant: InventoryVariant;
  offersCount: number;
  availableQuantity: number;
  lowestPrice: MarketplaceMoney | null;
  approximateConvertedPrice?: MarketplaceApproximateMoney | null;
  canFulfilToViewer: boolean;
}

export interface MarketplaceListParams {
  search?: string;
  set?: string;
  rarity?: string;
  color?: string;
  variant?: InventoryVariant;
  condition?: MarketplaceCondition;
  language?: string;
  sellerCountry?: string;
  shipsTo?: string;
  fulfilmentMethod?: MarketplaceFulfilmentMethod;
  availableOnly?: string;
  page?: string;
  limit?: string;
}

export interface MarketplaceListResponse {
  results: MarketplaceCardResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MarketplaceCardOffer {
  listingId: string;
  seller: User;
  sellerVerified: boolean;
  variant: InventoryVariant;
  availableQuantity: number;
  pricingMode: MarketplacePricingMode;
  askingPrice: MarketplaceMoney;
  approximateConvertedPrice?: MarketplaceApproximateMoney | null;
  condition: MarketplaceCondition;
  cardLanguage: string;
  originCountryCode: string;
  publicLocality?: string | null;
  fulfilment: MarketplaceFulfilmentCoverage;
  reputation: MarketplaceReputationSummary;
  eligibility?: MarketplaceListingEligibility;
}

export interface MarketplaceCardOffersResponse {
  card: Card;
  offers: MarketplaceCardOffer[];
}

export interface MarketplaceEnquiryOfferSummary {
  quantity: number;
  unitPrice: MarketplaceMoney;
  shippingPrice?: MarketplaceMoney | null;
  fulfilmentMethod: MarketplaceFulfilmentMethod;
}

export interface MarketplaceEnquirySummary {
  id: string;
  status: MarketplaceEnquiryStatus;
  listingId: string;
  buyer: User;
  seller: User;
  card: Card;
  variant: InventoryVariant;
  quantity: number;
  lastActivityAt: string;
  unreadCount: number;
  latestOffer?: MarketplaceEnquiryOfferSummary | null;
}

export interface MarketplaceEnquiriesResponse {
  enquiries: MarketplaceEnquirySummary[];
}

export interface MarketplaceEnquiryMessage {
  id: string;
  enquiryId: string;
  sender: User;
  message: string;
  createdAt: string;
}

export interface MarketplaceEnquiryOffer extends MarketplaceEnquiryOfferSummary {
  id: string;
  enquiryId: string;
  proposedBy: User;
  createdAt: string;
}

export interface MarketplaceEnquiryDetail extends MarketplaceEnquirySummary {
  messages: MarketplaceEnquiryMessage[];
  offers: MarketplaceEnquiryOffer[];
}

export interface MarketplaceEnquiryDetailResponse {
  enquiry: MarketplaceEnquiryDetail;
}

export interface MarketplaceCreateEnquiryPayload {
  quantity: number;
  message?: string;
  unitPriceMinor?: number;
  currency?: ListingCurrency;
  fulfilmentMethod?: MarketplaceFulfilmentMethod;
  buyerCountryCode?: string;
}

export interface MarketplaceCreateOfferPayload {
  quantity: number;
  unitPriceMinor: number;
  shippingPriceMinor?: number;
  currency: ListingCurrency;
  fulfilmentMethod: MarketplaceFulfilmentMethod;
  buyerCountryCode: string;
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
