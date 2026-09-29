import express from "express";
import { PrismaClient } from "@prisma/client";
import { cardImageExists, cardImagePublicUrl, makeCardImageObjectKey, uploadCardImage } from "../services/objectStorage.js";

const prisma = new PrismaClient();

export const cardImagesRouter = express.Router();

function cacheHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "public, max-age=86400");
}

function imageContentType(response: Response): string {
  return response.headers.get("content-type") || "image/jpeg";
}

async function fetchSourceImage(sourceUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Image source returned ${response.status}`);
  const contentType = imageContentType(response);
  if (!contentType.startsWith("image/")) throw new Error(`Image source returned non-image content type: ${contentType}`);
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}

cardImagesRouter.get("/:cardId", async (req, res) => {
  const { cardId } = req.params as { cardId: string };

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      imageUrl: true,
      imageObjectKey: true,
      imageContentType: true,
    },
  });

  if (!card) return res.status(404).json({ error: "Card not found" });
  if (!card.imageUrl) return res.status(404).json({ error: "Card image not available" });

  cacheHeaders(res);

  const expectedObjectKey = makeCardImageObjectKey(card.id, card.imageUrl, card.imageContentType);
  if (card.imageObjectKey === expectedObjectKey && await cardImageExists(card.imageObjectKey)) {
    return res.redirect(302, cardImagePublicUrl(card.imageObjectKey));
  }

  try {
    const source = await fetchSourceImage(card.imageUrl);
    const uploaded = await uploadCardImage({
      cardId: card.id,
      sourceUrl: card.imageUrl,
      buffer: source.buffer,
      contentType: source.contentType,
    });

    await prisma.card.update({
      where: { id: card.id },
      data: {
        imageObjectKey: uploaded.objectKey,
        imageCachedAt: new Date(),
        imageContentType: uploaded.contentType,
      },
    });

    return res.redirect(302, uploaded.publicUrl);
  } catch (error) {
    console.warn("Card image cache miss fallback:", error);
    return res.redirect(302, card.imageUrl);
  }
});
