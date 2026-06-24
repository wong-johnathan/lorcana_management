import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { cardsRouter } from "./routes/cards.js";
import { inventoryRouter } from "./routes/inventory.js";
import { syncRouter } from "./routes/sync.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "100mb" }));

app.use("/api/auth", authRouter);
app.use("/api/cards", cardsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sync", syncRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
