"""OCR engine boundary. The rest of the service is engine-agnostic."""

from __future__ import annotations

from typing import Protocol, TypedDict

from PIL import Image


class OcrLine(TypedDict):
    text: str
    confidence: float
    box: list[list[float]]


class OcrEngine(Protocol):
    name: str

    def recognize(self, image: Image.Image, rotation: int) -> list[OcrLine]: ...


class RapidOcrEngine:
    name = "rapidocr-onnxruntime-1.4.4"

    def __init__(self) -> None:
        from rapidocr_onnxruntime import RapidOCR

        self._engine = RapidOCR()

    def recognize(self, image: Image.Image, rotation: int) -> list[OcrLine]:
        import numpy as np

        rotated = image.rotate(-rotation, expand=True) if rotation else image
        result, _elapsed = self._engine(np.asarray(rotated.convert("RGB")))
        if not result:
            return []

        lines: list[OcrLine] = []
        for box, text, confidence in result:
            lines.append(
                {
                    "text": str(text).strip(),
                    "confidence": float(confidence),
                    "box": [[float(point[0]), float(point[1])] for point in box],
                }
            )
        return lines
