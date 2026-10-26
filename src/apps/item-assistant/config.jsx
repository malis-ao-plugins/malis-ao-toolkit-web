import { defineApp } from "../defineApp";
import { InventoryPanel } from "./InventoryPanel";

export default defineApp({
  id: "app_7068", // keeps the existing saved layout and settings
  port: 7068,
  name: "Item Assistant",

  settings: {
    characterId: null, // null = every character
  },

  // Bumped whenever the plugin commits a change, and once on every connect.
  // The inventory re-fetches on the bump; there is no polling.
  state: { inventoryVersion: 0 },
  transient: ["inventoryVersion"],

  messages: {
    inventoryChanged: () => (s) => ({
      inventoryVersion: (s.inventoryVersion ?? 0) + 1,
    }),
  },

  panels: {
    inventory: {
      title: "Inventory",
      fixed: true,
      fill: true,
      component: InventoryPanel,
    },
  },

  tabs: [{ id: "tab-inventory", label: "Inventory", panels: ["inventory"] }],
});
