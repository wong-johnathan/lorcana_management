import cron from "node-cron";
import { createApp } from "./app.js";
import { runPriceSync } from "./routes/sync.js";
import { autoTransferDue } from "./services/marketplaceTransitions.js";

const PORT = process.env.PORT || 3001;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Capture the latest tcgcsv build on startup so container/NAS downtime does not leave a gap.
runPriceSync().catch((err) => console.error("Startup price sync failed", err));

// Refresh Lorcana card prices daily at 21:00 UTC, after tcgcsv.com's own ~20:00 UTC refresh.
cron.schedule("0 21 * * *", () => {
  runPriceSync().catch((err) => console.error("Scheduled price sync failed", err));
});

// REQ-17: auto-complete marketplace transactions that stayed unconfirmed for
// 30 days. Catch-up on startup so a server outage self-heals on boot; then sweep
// hourly. autoTransferDue is idempotent and logs per-item failures internally.
autoTransferDue().catch((err) => console.error("Startup auto-transfer sweep failed", err));

cron.schedule("0 * * * *", () => {
  autoTransferDue().catch((err) => console.error("Scheduled auto-transfer sweep failed", err));
});
