import type { InventoryTab } from "../../utils/inventoryTabs";

interface InventoryTabsProps {
  activeTab: InventoryTab;
  onTabChange: (tab: InventoryTab) => void;
  collectionLabel?: string;
  statsLabel?: string;
}

export default function InventoryTabs({
  activeTab,
  onTabChange,
  collectionLabel = "Collection",
  statsLabel = "Stats",
}: InventoryTabsProps) {
  const tabClass = (tab: InventoryTab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? "border-amber-400 text-amber-300"
        : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700"
    }`;

  return (
    <div className="px-3 pt-3">
      <div className="flex gap-1 border-b border-gray-800" role="tablist" aria-label="Inventory sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "collection"}
          className={tabClass("collection")}
          onClick={() => onTabChange("collection")}
        >
          {collectionLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "stats"}
          className={tabClass("stats")}
          onClick={() => onTabChange("stats")}
        >
          {statsLabel}
        </button>
      </div>
    </div>
  );
}
