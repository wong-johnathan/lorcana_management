export type InventoryTab = "collection" | "stats" | "profile";

export function parseInventoryTab(value: string | null): InventoryTab {
  return value === "stats" || value === "collection" || value === "profile" ? value : "collection";
}
