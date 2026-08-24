ALTER TABLE "Card" ADD COLUMN "setNumber" INTEGER;
ALTER TABLE "Card" ADD COLUMN "collectorNumber" INTEGER;

UPDATE "Card"
SET
  "setNumber" = NULLIF(regexp_replace("setCode", '\D', '', 'g'), '')::integer,
  "collectorNumber" = NULLIF(substring("cardNumber" from '^([0-9]+)'), '')::integer;

CREATE INDEX "Card_setNumber_idx" ON "Card"("setNumber");
CREATE INDEX "Card_collectorNumber_idx" ON "Card"("collectorNumber");
