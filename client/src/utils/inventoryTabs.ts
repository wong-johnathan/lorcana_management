export type InventoryTab = "collection" | "stats";

export function parseInventoryTab(value: string | null): InventoryTab {
  return value === "stats" || value === "collection" ? value : "collection";
}
