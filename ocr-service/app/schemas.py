from pydantic import BaseModel, Field


class QualityMetrics(BaseModel):
    sharpness: float
    glare: float
    cardCoverage: float = 1.0
    rotation: int


class RecognizedFields(BaseModel):
    collectorIdentifier: str | None = None
    name: str | None = None
    subtitle: str | None = None
    inkCost: int | None = None
    cardType: str | None = None
    rawText: str


class OcrLineResponse(BaseModel):
    text: str
    confidence: float
    box: list[list[float]] = Field(default_factory=list)


class OcrResponse(BaseModel):
    recognized: RecognizedFields
    quality: QualityMetrics
    lines: list[OcrLineResponse]
    engine: str
    confidence: float
    processingMs: int
