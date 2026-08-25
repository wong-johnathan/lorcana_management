import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { cardsRouter } from "./routes/cards.js";
import { inventoryRouter } from "./routes/inventory.js";
import { syncRouter } from "./routes/sync.js";
import { settingsRouter } from "./routes/settings.js";
import { publicRouter } from "./routes/public.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "100mb" }));

  app.use("/api/auth", authRouter);
  app.use("/api/cards", cardsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/sync", syncRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/public", publicRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
