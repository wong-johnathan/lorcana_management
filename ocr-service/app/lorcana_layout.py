"""Lorcana-specific rotation and collector-line extraction."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .engine import OcrEngine, OcrLine

COLLECTOR_PATTERN = re.compile(
    r"([0-9OIL|]{1,4})\s*[/|]\s*([A-Z0-9OIL|]{1,4})"
    r"(?:\s*[•·.\-–—]\s*([A-Z]{2}))?"
    r"(?:\s*[•·.\-–—]\s*([A-Z0-9]{1,4}))?",
    re.IGNORECASE,
)
ROTATIONS = (0, 90, 180, 270)


@dataclass(frozen=True)
class LorcanaRecognition:
    collector_identifier: str | None
    rotation: int
    confidence: float
    raw_text: str
    lines: list[OcrLine]
    engine: str


def _digits(value: str, strip_leading: bool) -> str:
    normalized = value.upper().replace("O", "0").replace("I", "1").replace("L", "1").replace("|", "1")
    if strip_leading and normalized.isdigit():
        return str(int(normalized))
    return normalized


def extract_collector_identifier(text: str) -> str | None:
    match = COLLECTOR_PATTERN.search(text.upper())
    if not match:
        return None

    number = _digits(match.group(1), True)
    denominator_raw = match.group(2).upper()
    denominator = (
        _digits(denominator_raw, True)
        if re.fullmatch(r"[0-9OIL|]+", denominator_raw)
        else denominator_raw
    )
    if not number.isdigit() or not re.fullmatch(r"[A-Z0-9]{1,4}", denominator):
        return None

    parts = [f"{number}/{denominator}"]
    if match.group(3):
        parts.append(match.group(3).upper())
    if match.group(4):
        set_code = match.group(4).upper()
        if re.fullmatch(r"[0-9OIL|]+", set_code):
            set_code = _digits(set_code, False)
        parts.append(set_code)
    return " • ".join(parts)


def _rotation_score(lines: list[OcrLine]) -> tuple[float, str | None]:
    joined = " ".join(line["text"] for line in lines)
    collector = extract_collector_identifier(joined)
    average = sum(line["confidence"] for line in lines) / max(1, len(lines))
    valid_identifier_bonus = 2.0 if collector and collector.count("•") == 2 else 1.0 if collector else 0.0
    return valid_identifier_bonus + average, collector


def recognize_lorcana_card(image: Any, engine: OcrEngine) -> LorcanaRecognition:
    best_rotation = 0
    best_lines: list[OcrLine] = []
    best_identifier: str | None = None
    best_score = -1.0

    for rotation in ROTATIONS:
        lines = engine.recognize(image, rotation)
        score, collector = _rotation_score(lines)
        if score > best_score:
            best_score = score
            best_rotation = rotation
            best_lines = lines
            best_identifier = collector
        if collector and collector.count("•") == 2:
            break

    raw_text = "\n".join(line["text"] for line in best_lines)
    confidence = sum(line["confidence"] for line in best_lines) / max(1, len(best_lines))
    return LorcanaRecognition(
        collector_identifier=best_identifier,
        rotation=best_rotation,
        confidence=confidence,
        raw_text=raw_text,
        lines=best_lines,
        engine=engine.name,
    )
