export type InventoryTab = "collection" | "stats" | "profile" | "extras";

export function parseInventoryTab(value: string | null): InventoryTab {
  return value === "stats" || value === "collection" || value === "profile" || value === "extras" ? value : "collection";
}
