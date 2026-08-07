"""FastAPI entry point for the private OCR sidecar."""

from __future__ import annotations

import io
import time
from functools import lru_cache

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .engine import OcrEngine, RapidOcrEngine
from .lorcana_layout import recognize_lorcana_card
from .schemas import OcrLineResponse, OcrResponse, QualityMetrics, RecognizedFields

MAX_IMAGE_BYTES = 6 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="Lorcana OCR", version="0.1.0")


@lru_cache(maxsize=1)
def get_engine() -> OcrEngine:
    return RapidOcrEngine()


def image_quality(image: Image.Image, rotation: int) -> QualityMetrics:
    gray = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
    laplacian_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharpness = min(1.0, laplacian_variance / 500.0)
    glare = float(np.count_nonzero(gray >= 248) / gray.size)
    return QualityMetrics(sharpness=sharpness, glare=glare, rotation=rotation)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/recognize/lorcana", response_model=OcrResponse)
async def recognize(image: UploadFile = File(...)) -> OcrResponse:
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image type")

    payload = await image.read(MAX_IMAGE_BYTES + 1)
    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 6 MB")

    try:
        card_image = Image.open(io.BytesIO(payload)).convert("RGB")
        card_image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image") from None

    started = time.perf_counter()
    result = recognize_lorcana_card(card_image, get_engine())
    processing_ms = round((time.perf_counter() - started) * 1000)

    return OcrResponse(
        recognized=RecognizedFields(
            collectorIdentifier=result.collector_identifier,
            rawText=result.raw_text,
        ),
        quality=image_quality(card_image, result.rotation),
        lines=result.lines,
        engine=result.engine,
        confidence=result.confidence,
        processingMs=processing_ms,
    )
