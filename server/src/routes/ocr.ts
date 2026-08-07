import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  authenticateToken,
  type AuthRequest,
} from "../middleware/auth.js";
import { matchCards } from "../services/cardMatcher.js";
import { requestOcr, OcrServiceError } from "../services/ocrClient.js";
import { extractOcrEvidence } from "../services/ocrEvidence.js";

const prisma = new PrismaClient();
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error("UNSUPPORTED_IMAGE_TYPE"));
      return;
    }
    callback(null, true);
  },
});

function uploadCardImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Image exceeds 6 MB" });
      return;
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_IMAGE_TYPE") {
      res.status(415).json({ error: "JPEG, PNG, or WebP image required" });
      return;
    }
    res.status(400).json({ error: "Invalid image upload" });
  });
}

export const ocrRouter = Router();

ocrRouter.post(
  "/recognize",
  authenticateToken,
  uploadCardImage,
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "Image is required" });
      return;
    }

    try {
      const ocr = await requestOcr(req.file.buffer, req.file.mimetype);
      const cards = await prisma.card.findMany({ include: { prices: true } });
      const evidence = extractOcrEvidence(ocr.recognized, cards);
      const match = matchCards(evidence, cards);
      const top = match.candidates[0];
      const candidateTelemetry = match.candidates.map((candidate) => ({
        cardId: candidate.card.id,
        score: candidate.score,
        confidence: candidate.confidence,
        reasons: candidate.reasons,
      }));

      const scan = await prisma.cardScanEvent.create({
        data: {
          userId: req.user!.userId,
          engine: ocr.engine,
          decision: match.decision,
          confidence: top?.confidence ?? 0,
          recognizedJson: ocr.recognized as unknown as Prisma.InputJsonValue,
          candidateJson: candidateTelemetry as Prisma.InputJsonValue,
          predictedCardId:
            match.decision === "exact" || match.decision === "high"
              ? top?.card.id
              : null,
          processingMs: ocr.processingMs,
        },
      });

      res.json({
        scanId: scan.id,
        decision: match.decision,
        quality: ocr.quality,
        recognized: ocr.recognized,
        candidates: match.candidates,
        engine: ocr.engine,
        confidence: ocr.confidence,
        processingMs: ocr.processingMs,
      });
    } catch (error) {
      if (error instanceof OcrServiceError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      console.error("OCR recognition error:", error);
      res.status(500).json({ error: "OCR recognition failed" });
    }
  }
);

ocrRouter.patch(
  "/scans/:scanId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    const { outcome, selectedCardId } = req.body as {
      outcome?: string;
      selectedCardId?: string | null;
    };
    if (!outcome || !["confirmed", "corrected", "rejected"].includes(outcome)) {
      res.status(400).json({ error: "Invalid scan outcome" });
      return;
    }

    const scanId = Array.isArray(req.params.scanId)
      ? req.params.scanId[0]
      : req.params.scanId;
    if (!scanId) {
      res.status(400).json({ error: "Scan ID is required" });
      return;
    }

    const scan = await prisma.cardScanEvent.findFirst({
      where: { id: scanId, userId: req.user!.userId },
    });
    if (!scan) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }

    if (selectedCardId) {
      const selectedCard = await prisma.card.findUnique({
        where: { id: selectedCardId },
        select: { id: true },
      });
      if (!selectedCard) {
        res.status(400).json({ error: "Selected card not found" });
        return;
      }
    }

    const updated = await prisma.cardScanEvent.update({
      where: { id: scan.id },
      data: { outcome, selectedCardId: selectedCardId ?? null },
    });
    res.json(updated);
  }
);
