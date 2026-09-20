import { defineApp } from "../defineApp";
import { InventoryPanel } from "./InventoryPanel";

export default defineApp({
  id: "app_7068", // keeps the existing saved layout and settings
  port: 7068,
  name: "Item Assistant",

  settings: {
    characterId: null, // null = every character
  },

  panels: {
    inventory: {
      title: "Inventory",
      fixed: true,
      component: InventoryPanel,
    },
  },

  tabs: [{ id: "tab-inventory", label: "Inventory", panels: ["inventory"] }],
});
