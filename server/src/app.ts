import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { cardsRouter } from "./routes/cards.js";
import { inventoryRouter } from "./routes/inventory.js";
import { syncRouter } from "./routes/sync.js";
import { settingsRouter } from "./routes/settings.js";
import { publicRouter } from "./routes/public.js";
import { profileRouter } from "./routes/profile.js";
import { extrasForSaleRouter } from "./routes/extrasForSale.js";
import { LOCAL_UPLOAD_ROOT } from "./services/objectStorage.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100mb" }));
  app.use("/api/profile-images", express.static(LOCAL_UPLOAD_ROOT));

  app.use("/api/auth", authRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/extras-for-sale", extrasForSaleRouter);
  app.use("/api/public", publicRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
