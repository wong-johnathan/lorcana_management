import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { cardsRouter } from "./routes/cards.js";
import { cardImagesRouter } from "./routes/cardImages.js";
import { inventoryRouter } from "./routes/inventory.js";
import { syncRouter } from "./routes/sync.js";
import { settingsRouter } from "./routes/settings.js";
import { publicRouter } from "./routes/public.js";
import { profileRouter } from "./routes/profile.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { marketplaceAdminRouter } from "./routes/marketplaceAdmin.js";
import { LOCAL_UPLOAD_ROOT } from "./services/objectStorage.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100mb" }));
  app.use("/api/profile-images", express.static(LOCAL_UPLOAD_ROOT));

  app.use("/api/auth", authRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/card-images", cardImagesRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/public", publicRouter);
  // Operator endpoints (design §7) mount at /api/marketplace/admin and are
  // registered BEFORE the main marketplace router so `/admin/...` resolves
  // before B3's dynamic `:id` routes (e.g. /listings/:id, /users/:userId/...).
  app.use("/api/marketplace/admin", marketplaceAdminRouter);
  app.use("/api/marketplace", marketplaceRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
