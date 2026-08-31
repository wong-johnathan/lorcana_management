import cron from "node-cron";
import { createApp } from "./app.js";
import { runPriceSync } from "./routes/sync.js";
import { attachMarketplaceRealtime } from "./services/marketplaceRealtime.js";

const PORT = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
attachMarketplaceRealtime(server);

// Refresh Lorcana card prices daily at 21:00 UTC, after tcgcsv.com's own ~20:00 UTC refresh.
cron.schedule("0 21 * * *", () => {
  runPriceSync().catch((err) => console.error("Scheduled price sync failed", err));
});
