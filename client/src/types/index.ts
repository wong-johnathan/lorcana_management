export interface Card {
  id: string;
  externalId: number;
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
}

export interface RecognizedCard {
  name: string;
  subtitle: string;
  set: string;
  color: string;
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
