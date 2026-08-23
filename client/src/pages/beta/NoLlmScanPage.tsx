import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
import { cards as cardsApi, inventory as inventoryApi } from "../../services/api";
import type { NoLlmCardMatch } from "../../types";
import { getRectangleShapeAspect, isCardShapeAspect, scoreCardCandidate } from "./noLlmDetection";
import {
  chooseBestOrientation,
  formatManualOrientation,
  rotateManualOrientation,
  toggleManualFlipX,
  toggleManualFlipY,
  type ManualOrientation,
  type OrientationCandidate,
} from "./noLlmOrientation";
import {
  DEFAULT_OCR_ZONES,
  OCR_ZONE_META,
  isPointInOcrZone,
  moveOcrZone,
  normalizeOcrZones,
  resizeOcrZone,
  type OcrZone,
  type OcrZoneKey,
  type OcrZoneMap,
} from "./noLlmZones";
import {
  getCoverSourceRect,
  getTcgGuideRect,
  mapPointsFromDetectionFrameToVideo,
  TCG_CARD_HEIGHT,
  TCG_CARD_RATIO,
  TCG_CARD_WIDTH,
} from "./noLlmViewport";

type CvModule = any;

type Point = { x: number; y: number };

type Detection = {
  points: Point[];
  aspectRatio: number;
  fillRatio: number;
  areaRatio: number;
  edgeDensity: number;
  centerOffset: number;
  score: number;
};

type Metrics = {
  found: boolean;
  stableFrames: number;
  aspectRatio: number | null;
  fillRatio: number | null;
  areaRatio: number | null;
  edgeDensity: number | null;
  centerOffset: number | null;
  score: number | null;
  status: string;
};

type OcrState = {
  status: "idle" | "loading" | "orienting" | "reading" | "matching" | "matched" | "no_match" | "error";
  message: string;
  rawText: Record<string, string>;
  matches: NoLlmCardMatch[];
  error: string;
};

type ZoneDragState = {
  key: OcrZoneKey;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  startZone: OcrZone;
};

const DETECTION_INTERVAL_MS = 260;
const STABLE_FRAME_TARGET = 3;
const MIN_AREA_RATIO = 0.015;
const MAX_AREA_RATIO = 0.92;
const SCAN_FRAME_WIDTH = 672;
const SCAN_FRAME_HEIGHT = Math.round(SCAN_FRAME_WIDTH / TCG_CARD_RATIO);
const OCR_CROP_WIDTH = 1260;
const OCR_CROP_HEIGHT = Math.round(OCR_CROP_WIDTH / TCG_CARD_RATIO);

let cvPromise: Promise<CvModule> | null = null;
type OcrWorker = Awaited<ReturnType<typeof createWorker>>;
let ocrWorkerPromise: Promise<OcrWorker> | null = null;

const OCR_ZONE_STORAGE_KEY = "lorcana-no-llm-ocr-zones:v1";
const INK_COLOR_OPTIONS = ["", "Amber", "Amethyst", "Emerald", "Ruby", "Sapphire", "Steel"];

const IDENTIFIER_WHITELIST = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/•·.-|! ";
const TEXT_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -'.,•:";

function loadOpenCv(): Promise<CvModule> {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then((module) => {
      const exported = module as unknown as {
        default?: CvModule | Promise<CvModule>;
        "module.exports"?: CvModule | Promise<CvModule>;
      };
      return Promise.resolve(exported.default ?? exported["module.exports"] ?? module);
    });
  }
  return cvPromise;
}

function getOcrWorker(): Promise<OcrWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng");
  }
  return ocrWorkerPromise;
}

function cleanOcrText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cropZoneToDataUrl(
  sourceCanvas: HTMLCanvasElement,
  zone: { x: number; y: number; w: number; h: number },
  scale = 3
): string {
  const sx = Math.round(sourceCanvas.width * zone.x);
  const sy = Math.round(sourceCanvas.height * zone.y);
  const sw = Math.round(sourceCanvas.width * zone.w);
  const sh = Math.round(sourceCanvas.height * zone.h);
  const output = document.createElement("canvas");
  output.width = Math.max(1, sw * scale);
  output.height = Math.max(1, sh * scale);

  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) return sourceCanvas.toDataURL("image/png");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, output.width, output.height);

  const imageData = ctx.getImageData(0, 0, output.width, output.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);

  return output.toDataURL("image/png");
}

async function recognizeZone(
  worker: OcrWorker,
  sourceCanvas: HTMLCanvasElement,
  zone: { x: number; y: number; w: number; h: number },
  whitelist: string
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: whitelist,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const image = cropZoneToDataUrl(sourceCanvas, zone);
  const result = await worker.recognize(image);
  return cleanOcrText(result.data.text);
}

function formatCardLine(match: NoLlmCardMatch): string {
  const card = match.card;
  const subtitle = card.subtitle ? ` — ${card.subtitle}` : "";
  return `${card.name}${subtitle}`;
}

function transformCanvas(
  sourceCanvas: HTMLCanvasElement,
  degrees: 0 | 90 | 180 | 270,
  flipX: boolean,
  flipY = false
): HTMLCanvasElement {
  const output = document.createElement("canvas");
  const sideways = degrees === 90 || degrees === 270;
  output.width = sideways ? sourceCanvas.height : sourceCanvas.width;
  output.height = sideways ? sourceCanvas.width : sourceCanvas.height;

  const ctx = output.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.translate(output.width / 2, output.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return output;
}

function copyCanvas(sourceCanvas: HTMLCanvasElement, destinationCanvas: HTMLCanvasElement) {
  destinationCanvas.width = sourceCanvas.width;
  destinationCanvas.height = sourceCanvas.height;
  const ctx = destinationCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, destinationCanvas.width, destinationCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderPoints(points: Point[]): Point[] {
  const sorted = [...points];
  const bySum = [...sorted].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...sorted].sort((a, b) => a.x - a.y - (b.x - b.y));

  return [
    bySum[0], // top-left
    byDiff[0], // top-right
    bySum[bySum.length - 1], // bottom-right
    byDiff[byDiff.length - 1], // bottom-left
  ];
}

function getRectPoints(cv: CvModule, rect: any): Point[] {
  if (cv.RotatedRect?.points) {
    return cv.RotatedRect.points(rect).map((p: Point) => ({ x: p.x, y: p.y }));
  }

  const angle = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width = rect.size.width;
  const height = rect.size.height;
  const cx = rect.center.x;
  const cy = rect.center.y;
  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  return corners.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

function detectRoundedCard(cv: CvModule, imageData: ImageData): Detection | null {
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const equalized = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const darkMask = new cv.Mat();
  const darkClosed = new cv.Mat();
  const hierarchy = new cv.Mat();
  const edgeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9));
  const darkKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11, 11));

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.equalizeHist(gray, equalized);
    cv.GaussianBlur(equalized, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 24, 88);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, edgeKernel);
    cv.dilate(closed, closed, edgeKernel);

    // Fallback channel for real phone captures: Lorcana's black card frame is often more reliable
    // than the weak outer edge against a gray/table background.
    cv.threshold(gray, darkMask, 85, 255, cv.THRESH_BINARY_INV);
    cv.morphologyEx(darkMask, darkClosed, cv.MORPH_CLOSE, darkKernel);
    cv.dilate(darkClosed, darkClosed, darkKernel);

    const frameArea = imageData.width * imageData.height;
    const edgeDensity = cv.countNonZero(edges) / frameArea;
    let best: Detection | null = null;

    const evaluateMask = (mask: any, mode: number, sourceWeight: number) => {
      const contours = new cv.MatVector();
      try {
        cv.findContours(mask, contours, hierarchy, mode, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); i += 1) {
          const contour = contours.get(i);
          try {
            const contourArea = cv.contourArea(contour);
            const rect = cv.minAreaRect(contour);
            const orderedPoints = orderPoints(getRectPoints(cv, rect));
            const topWidth = distance(orderedPoints[0], orderedPoints[1]);
            const bottomWidth = distance(orderedPoints[3], orderedPoints[2]);
            const leftHeight = distance(orderedPoints[0], orderedPoints[3]);
            const rightHeight = distance(orderedPoints[1], orderedPoints[2]);
            const visibleWidth = Math.max((topWidth + bottomWidth) / 2, 1);
            const visibleHeight = Math.max((leftHeight + rightHeight) / 2, 1);
            const aspectRatio = getRectangleShapeAspect(visibleWidth, visibleHeight);
            const rectWidth = Math.max(rect.size.width, 1);
            const rectHeight = Math.max(rect.size.height, 1);
            const rectArea = rectWidth * rectHeight;
            const areaRatio = rectArea / frameArea;
            const fillRatio = contourArea / rectArea;

            if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;
            // Accept rotated cards too: minAreaRect may return a sideways TCG-like rectangle
            // when the user holds the card/label at 90°. Orientation is normalized later by OCR.
            if (!isCardShapeAspect(aspectRatio)) continue;
            if (fillRatio < 0.18 || fillRatio > 1.15) continue;

            const centerDistance = Math.hypot(
              rect.center.x - imageData.width / 2,
              rect.center.y - imageData.height / 2
            );
            const maxCenterDistance = Math.hypot(imageData.width / 2, imageData.height / 2);
            const centerOffset = centerDistance / maxCenterDistance;

            const score = scoreCardCandidate({
              aspectRatio,
              fillRatio,
              areaRatio,
              centerOffset,
              sourceWeight,
            });
            if (score <= 0) continue;

            if (!best || score > best.score) {
              best = {
                points: orderedPoints,
                aspectRatio,
                fillRatio,
                areaRatio,
                edgeDensity,
                centerOffset,
                score,
              };
            }
          } finally {
            contour.delete();
          }
        }
      } finally {
        contours.delete();
      }
    };

    // RETR_LIST sees nested/internal card-frame contours. RETR_EXTERNAL alone missed real captures
    // where the outer card edge blended into the background.
    evaluateMask(closed, cv.RETR_LIST, 1);
    evaluateMask(darkClosed, cv.RETR_EXTERNAL, 0.96);

    return best;
  } finally {
    src.delete();
    gray.delete();
    equalized.delete();
    blur.delete();
    edges.delete();
    closed.delete();
    darkMask.delete();
    darkClosed.delete();
    hierarchy.delete();
    edgeKernel.delete();
    darkKernel.delete();
  }
}

function detectionsAreStable(a: Detection | null, b: Detection | null): boolean {
  if (!a || !b) return false;

  const avgMove =
    a.points.reduce((sum, point, index) => sum + distance(point, b.points[index]), 0) / a.points.length;
  const avgSide =
    (distance(a.points[0], a.points[1]) +
      distance(a.points[1], a.points[2]) +
      distance(a.points[2], a.points[3]) +
      distance(a.points[3], a.points[0])) /
    4;

  return avgMove / Math.max(avgSide, 1) < 0.035 && Math.abs(a.aspectRatio - b.aspectRatio) < 0.06;
}

function drawDetectionOverlay(
  canvas: HTMLCanvasElement,
  detection: Detection | null,
  sourceWidth: number,
  sourceHeight: number
) {
  const rect = canvas.parentElement?.getBoundingClientRect();
  if (!rect) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const guide = getTcgGuideRect(rect.width, rect.height, 0.84);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(guide.x, guide.y, guide.width, guide.height);
  ctx.setLineDash([]);

  if (!detection) return;

  const scaleX = rect.width / sourceWidth;
  const scaleY = rect.height / sourceHeight;
  ctx.strokeStyle = "#22c55e";
  ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  detection.points.forEach((point, index) => {
    const x = point.x * scaleX;
    const y = point.y * scaleY;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function warpCardToCanvas(
  cv: CvModule,
  imageData: ImageData,
  points: Point[],
  outputCanvas: HTMLCanvasElement
) {
  const [tl, tr, br, bl] = orderPoints(points);
  const topWidth = distance(tl, tr);
  const bottomWidth = distance(bl, br);
  const leftHeight = distance(tl, bl);
  const rightHeight = distance(tr, br);
  const sourceWidth = Math.max(topWidth, bottomWidth);
  const sourceHeight = Math.max(leftHeight, rightHeight);
  const portrait = sourceHeight >= sourceWidth;
  const targetWidth = portrait ? OCR_CROP_WIDTH : OCR_CROP_HEIGHT;
  const targetHeight = portrait ? OCR_CROP_HEIGHT : OCR_CROP_WIDTH;

  const src = cv.matFromImageData(imageData);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    br.x,
    br.y,
    bl.x,
    bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    targetWidth - 1,
    0,
    targetWidth - 1,
    targetHeight - 1,
    0,
    targetHeight - 1,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);

  try {
    cv.warpPerspective(
      src,
      dst,
      transform,
      new cv.Size(targetWidth, targetHeight),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );
    cv.imshow(outputCanvas, dst);
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    transform.delete();
  }
}

export default function NoLlmScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoneOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoneDragRef = useRef<ZoneDragState | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<CvModule | null>(null);
  const previousDetectionRef = useRef<Detection | null>(null);
  const stableFramesRef = useRef(0);
  const capturedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [loadingCv, setLoadingCv] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<Metrics>({
    found: false,
    stableFrames: 0,
    aspectRatio: null,
    fillRatio: null,
    areaRatio: null,
    edgeDensity: null,
    centerOffset: null,
    score: null,
    status: "Loading OpenCV...",
  });
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>({
    status: "idle",
    message: "Capture a card to adjust orientation before OCR.",
    rawText: {},
    matches: [],
    error: "",
  });
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [manualOrientation, setManualOrientation] = useState<ManualOrientation>({
    degrees: 0,
    flipX: false,
    flipY: false,
  });
  const [ocrZones, setOcrZones] = useState<OcrZoneMap>(() => {
    if (typeof window === "undefined") return DEFAULT_OCR_ZONES;
    try {
      return normalizeOcrZones(JSON.parse(window.localStorage.getItem(OCR_ZONE_STORAGE_KEY) || "null"));
    } catch {
      return DEFAULT_OCR_ZONES;
    }
  });
  const [selectedOcrZone, setSelectedOcrZone] = useState<OcrZoneKey>("title");
  const [inkColorHint, setInkColorHint] = useState("");

  useEffect(() => {
    let cancelled = false;

    loadOpenCv()
      .then((cv) => {
        if (cancelled) return;
        cvRef.current = cv;
        setLoadingCv(false);
        setMetrics((current) => ({ ...current, status: "Starting camera..." }));
      })
      .catch((err) => {
        console.error("Failed to load OpenCV", err);
        if (!cancelled) {
          setLoadingCv(false);
          setError("Failed to load OpenCV.js. Refresh and try again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loadingCv || error) return;

    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera API unavailable. Use HTTPS or localhost.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });

        const [videoTrack] = stream.getVideoTracks();
        const capabilities = videoTrack?.getCapabilities?.() as
          | (MediaTrackCapabilities & { focusMode?: string[]; exposureMode?: string[] })
          | undefined;
        const advanced: Array<Record<string, string>> = [];
        if (capabilities?.focusMode?.includes("continuous")) advanced.push({ focusMode: "continuous" });
        if (capabilities?.exposureMode?.includes("continuous")) advanced.push({ exposureMode: "continuous" });
        if (advanced.length > 0) {
          await videoTrack.applyConstraints({ advanced } as MediaTrackConstraints).catch((err) => {
            console.warn("Could not apply continuous camera constraints", err);
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraReady(true);
          setMetrics((current) => ({ ...current, status: "Looking for card..." }));
        }
      } catch (err) {
        console.error("Camera start failed", err);
        setError("Could not start camera. Allow camera permissions and use HTTPS.");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [error, loadingCv]);

  const recognizeCapturedCard = useCallback(async (canvas: HTMLCanvasElement, orientation: ManualOrientation) => {
    setInventoryMessage("");
    setOcrState({
      status: "loading",
      message: "Loading browser OCR worker...",
      rawText: { orientation: formatManualOrientation(orientation) },
      matches: [],
      error: "",
    });

    try {
      const worker = await getOcrWorker();

      setOcrState((current) => ({
        ...current,
        status: "reading",
        message: "Reading OCR zones using your confirmed orientation...",
      }));
      const identifier = await recognizeZone(worker, canvas, ocrZones.identifier, IDENTIFIER_WHITELIST);
      const title = await recognizeZone(worker, canvas, ocrZones.title, TEXT_WHITELIST);
      const typeLine = await recognizeZone(worker, canvas, ocrZones.typeLine, TEXT_WHITELIST);
      const inkCost = await recognizeZone(worker, canvas, ocrZones.inkCost, "0123456789OoQIl|! ");
      const rawText = {
        orientation: formatManualOrientation(orientation),
        identifier,
        title,
        typeLine,
        inkCost,
        inkColor: inkColorHint,
      };

      setOcrState({ status: "matching", message: "Matching OCR text against card database...", rawText, matches: [], error: "" });
      const result = await cardsApi.matchNoLlm({
        fullIdentifier: identifier,
        name: title,
        typeLine,
        inkCost,
        color: inkColorHint,
        rawText,
      });

      const hasMatch = result.matches.length > 0;
      setOcrState({
        status: hasMatch ? "matched" : "no_match",
        message: hasMatch ? "Best database match found." : "No confident database match found.",
        rawText: { ...rawText, ...result.recognized.rawText },
        matches: result.matches,
        error: hasMatch ? "" : "Try better lighting, adjust orientation, or tap Scan again.",
      });
    } catch (err) {
      console.error("No-LLM OCR/match failed", err);
      setOcrState({
        status: "error",
        message: "OCR or matching failed.",
        rawText: { orientation: formatManualOrientation(orientation) },
        matches: [],
        error: err instanceof Error ? err.message : "Unknown OCR error",
      });
    }
  }, [inkColorHint, ocrZones]);

  const applyManualCanvasTransform = useCallback(
    (nextOrientation: ManualOrientation, degrees: 0 | 90 | 180 | 270, flipX: boolean, flipY = false) => {
      const canvas = cropCanvasRef.current;
      if (!canvas || !capturedAt) return;
      const transformed = transformCanvas(canvas, degrees, flipX, flipY);
      copyCanvas(transformed, canvas);
      setManualOrientation(nextOrientation);
      setInventoryMessage("");
      setOcrState({
        status: "idle",
        message: "Adjust rotation/flip until the card text is readable, then run OCR.",
        rawText: { orientation: formatManualOrientation(nextOrientation) },
        matches: [],
        error: "",
      });
    },
    [capturedAt]
  );

  const rotateCapturedCrop = useCallback(
    (delta: 90 | -90) => {
      const nextOrientation = rotateManualOrientation(manualOrientation, delta);
      applyManualCanvasTransform(nextOrientation, delta === 90 ? 90 : 270, false);
    },
    [applyManualCanvasTransform, manualOrientation]
  );

  const flipCapturedCropX = useCallback(() => {
    const nextOrientation = toggleManualFlipX(manualOrientation);
    applyManualCanvasTransform(nextOrientation, 0, true);
  }, [applyManualCanvasTransform, manualOrientation]);

  const flipCapturedCropY = useCallback(() => {
    const nextOrientation = toggleManualFlipY(manualOrientation);
    applyManualCanvasTransform(nextOrientation, 0, false, true);
  }, [applyManualCanvasTransform, manualOrientation]);

  const runManualOcr = useCallback(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !capturedAt) return;
    void recognizeCapturedCard(canvas, manualOrientation);
  }, [capturedAt, manualOrientation, recognizeCapturedCard]);

  const addMatchToInventory = useCallback(async (match: NoLlmCardMatch, normalDelta: number, foilDelta: number) => {
    setInventoryMessage(`Adding ${formatCardLine(match)}...`);
    try {
      await inventoryApi.add(match.card.id, normalDelta, foilDelta);
      setInventoryMessage(`Added ${normalDelta ? "+1 normal" : "+1 foil"}: ${formatCardLine(match)}`);
    } catch (err) {
      console.error("No-LLM inventory add failed", err);
      setInventoryMessage(err instanceof Error ? err.message : "Failed to add card to inventory");
    }
  }, []);

  const resetCapture = useCallback(() => {
    capturedRef.current = false;
    stableFramesRef.current = 0;
    previousDetectionRef.current = null;
    setCapturedAt(null);
    setScannerActive(true);
    setManualOrientation({ degrees: 0, flipX: false, flipY: false });
    setOcrState({ status: "idle", message: "Capture a card to adjust orientation before OCR.", rawText: {}, matches: [], error: "" });
    setInventoryMessage("");
    const canvas = cropCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMetrics((current) => ({ ...current, stableFrames: 0, status: "Looking for card..." }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OCR_ZONE_STORAGE_KEY, JSON.stringify(ocrZones));
  }, [ocrZones]);

  const drawOcrZoneOverlay = useCallback(() => {
    const overlay = zoneOverlayCanvasRef.current;
    const cropCanvas = cropCanvasRef.current;
    if (!overlay || !cropCanvas || !capturedAt) return;

    const rect = cropCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(rect.width * dpr);
    overlay.height = Math.round(rect.height * dpr);
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.font = "12px system-ui, sans-serif";
    ctx.lineWidth = 2;

    (Object.keys(ocrZones) as OcrZoneKey[]).forEach((key) => {
      const zone = ocrZones[key];
      const x = zone.x * rect.width;
      const y = zone.y * rect.height;
      const w = zone.w * rect.width;
      const h = zone.h * rect.height;
      const selected = key === selectedOcrZone;
      ctx.strokeStyle = selected ? "#22c55e" : "rgba(251, 191, 36, 0.82)";
      ctx.fillStyle = selected ? "rgba(34, 197, 94, 0.16)" : "rgba(251, 191, 36, 0.10)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = selected ? "rgba(20, 83, 45, 0.92)" : "rgba(120, 53, 15, 0.92)";
      const label = OCR_ZONE_META[key].shortLabel;
      const labelWidth = ctx.measureText(label).width + 10;
      ctx.fillRect(x, Math.max(0, y - 18), labelWidth, 18);
      ctx.fillStyle = "white";
      ctx.fillText(label, x + 5, Math.max(12, y - 5));
      if (selected) {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(x + w - 10, y + h - 10, 10, 10);
      }
    });
  }, [capturedAt, ocrZones, selectedOcrZone]);

  useEffect(() => {
    drawOcrZoneOverlay();
    window.addEventListener("resize", drawOcrZoneOverlay);
    return () => window.removeEventListener("resize", drawOcrZoneOverlay);
  }, [drawOcrZoneOverlay, manualOrientation]);

  function pointOnZoneOverlay(event: React.PointerEvent<HTMLCanvasElement>) {
    const overlay = zoneOverlayCanvasRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(rect.width, 1),
      y: (event.clientY - rect.top) / Math.max(rect.height, 1),
    };
  }

  const handleZonePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!capturedAt) return;
    const point = pointOnZoneOverlay(event);
    if (!point) return;

    const hitKey = (["inkCost", "identifier", "typeLine", "title"] as OcrZoneKey[]).find((key) =>
      isPointInOcrZone(ocrZones[key], point.x, point.y)
    );
    if (!hitKey) return;

    const zone = ocrZones[hitKey];
    const nearResizeCorner = point.x > zone.x + zone.w - 0.04 && point.y > zone.y + zone.h - 0.04;
    setSelectedOcrZone(hitKey);
    zoneDragRef.current = {
      key: hitKey,
      mode: nearResizeCorner ? "resize" : "move",
      startX: point.x,
      startY: point.y,
      startZone: zone,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [capturedAt, ocrZones]);

  const handleZonePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = zoneDragRef.current;
    const point = pointOnZoneOverlay(event);
    if (!drag || !point) return;

    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    setOcrZones((current) => ({
      ...current,
      [drag.key]: drag.mode === "move" ? moveOcrZone(drag.startZone, dx, dy) : resizeOcrZone(drag.startZone, dx, dy),
    }));
  }, []);

  const handleZonePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    zoneDragRef.current = null;
  }, []);

  const resetOcrZones = useCallback(() => {
    setOcrZones(DEFAULT_OCR_ZONES);
    setSelectedOcrZone("title");
  }, []);

  useEffect(() => {
    if (!cameraReady || !scannerActive || error) return;

    const interval = window.setInterval(() => {
      const cv = cvRef.current;
      const video = videoRef.current;
      const frameCanvas = frameCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const cropCanvas = cropCanvasRef.current;

      if (!cv || !video || !frameCanvas || !overlayCanvas || !cropCanvas) return;
      if (!video.videoWidth || !video.videoHeight) return;

      frameCanvas.width = SCAN_FRAME_WIDTH;
      frameCanvas.height = SCAN_FRAME_HEIGHT;
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!frameCtx) return;

      const sourceCrop = getCoverSourceRect(
        video.videoWidth,
        video.videoHeight,
        frameCanvas.width,
        frameCanvas.height
      );
      frameCtx.drawImage(
        video,
        sourceCrop.x,
        sourceCrop.y,
        sourceCrop.width,
        sourceCrop.height,
        0,
        0,
        frameCanvas.width,
        frameCanvas.height
      );
      const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
      const detection = detectRoundedCard(cv, imageData);
      drawDetectionOverlay(overlayCanvas, detection, frameCanvas.width, frameCanvas.height);

      const wasStable = detectionsAreStable(previousDetectionRef.current, detection);
      stableFramesRef.current = detection ? (wasStable ? stableFramesRef.current + 1 : 1) : 0;
      previousDetectionRef.current = detection;

      if (!detection) {
        setMetrics({
          found: false,
          stableFrames: 0,
          aspectRatio: null,
          fillRatio: null,
          areaRatio: null,
          edgeDensity: null,
          centerOffset: null,
          score: null,
          status: "Looking for card...",
        });
        return;
      }

      const ready = stableFramesRef.current >= STABLE_FRAME_TARGET;
      setMetrics({
        found: true,
        stableFrames: stableFramesRef.current,
        aspectRatio: detection.aspectRatio,
        fillRatio: detection.fillRatio,
        areaRatio: detection.areaRatio,
        edgeDensity: detection.edgeDensity,
        centerOffset: detection.centerOffset,
        score: detection.score,
        status: ready ? "Card stable — captured" : "Hold steady...",
      });

      if (ready && !capturedRef.current) {
        capturedRef.current = true;

        const highResCanvas = document.createElement("canvas");
        highResCanvas.width = video.videoWidth;
        highResCanvas.height = video.videoHeight;
        const highResCtx = highResCanvas.getContext("2d", { willReadFrequently: true });
        if (!highResCtx) return;
        highResCtx.drawImage(video, 0, 0, highResCanvas.width, highResCanvas.height);
        const highResImageData = highResCtx.getImageData(0, 0, highResCanvas.width, highResCanvas.height);
        const highResPoints = mapPointsFromDetectionFrameToVideo(
          detection.points,
          frameCanvas.width,
          frameCanvas.height,
          sourceCrop
        );

        warpCardToCanvas(cv, highResImageData, highResPoints, cropCanvas);
        const initialOrientation: ManualOrientation = { degrees: 0, flipX: false, flipY: false };
        setManualOrientation(initialOrientation);
        setCapturedAt(new Date().toLocaleTimeString());
        setScannerActive(false);
        setOcrState({
          status: "idle",
          message: "Adjust rotation/flip until the card text is readable, then run OCR.",
          rawText: { orientation: formatManualOrientation(initialOrientation) },
          matches: [],
          error: "",
        });
      }
    }, DETECTION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [cameraReady, error, recognizeCapturedCard, scannerActive]);

  const formatPercent = (value: number | null) => (value == null ? "—" : `${(value * 100).toFixed(1)}%`);
  const formatNumber = (value: number | null) => (value == null ? "—" : value.toFixed(2));
  const bestMatch = ocrState.matches[0];
  const ocrBusy = ["loading", "orienting", "reading", "matching"].includes(ocrState.status);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-400">Beta</p>
            <h1 className="text-3xl font-bold">No-LLM Scanner</h1>
            <p className="text-gray-400 max-w-2xl mt-2">
              Browser OpenCV + OCR proof-of-concept. It detects Lorcana cards as rounded rectangles,
              auto-captures after stable frames, reads identifying text zones, then matches against your card DB.
              No Gemini or LLM calls.
            </p>
          </div>
          <button
            onClick={resetCapture}
            className="px-4 py-2 rounded-lg bg-amber-500 text-gray-950 font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
            disabled={!cameraReady || loadingCv}
          >
            Reset scanner
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-700 bg-red-950/40 p-4 text-red-200">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <section className="space-y-3">
            <div
              className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-2xl"
              style={{ aspectRatio: `${TCG_CARD_WIDTH} / ${TCG_CARD_HEIGHT}` }}
            >
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full bg-black object-cover"
                playsInline
                muted
                autoPlay
              />
              <canvas ref={overlayCanvasRef} className="absolute inset-0 pointer-events-none" />
              <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-sm text-gray-100 border border-white/10">
                {loadingCv ? "Loading OpenCV..." : metrics.status}
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Detection follows the MTG cropper pattern: Canny → external contours → card-shaped candidate →
              <span className="text-gray-300"> minAreaRect fallback</span> for rounded/weak corners → perspective warp.
            </p>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
              <h2 className="font-semibold text-lg mb-3">Detection metrics</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Found</dt>
                  <dd className={metrics.found ? "text-green-400 font-semibold" : "text-gray-300"}>
                    {metrics.found ? "yes" : "no"}
                  </dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Stable frames</dt>
                  <dd className="text-gray-100 font-semibold">
                    {metrics.stableFrames}/{STABLE_FRAME_TARGET}
                  </dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Aspect</dt>
                  <dd className="text-gray-100 font-semibold">{formatNumber(metrics.aspectRatio)}</dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Fill</dt>
                  <dd className="text-gray-100 font-semibold">{formatPercent(metrics.fillRatio)}</dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Area</dt>
                  <dd className="text-gray-100 font-semibold">{formatPercent(metrics.areaRatio)}</dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Edges</dt>
                  <dd className="text-gray-100 font-semibold">{formatPercent(metrics.edgeDensity)}</dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Center offset</dt>
                  <dd className="text-gray-100 font-semibold">{formatPercent(metrics.centerOffset)}</dd>
                </div>
                <div className="rounded-lg bg-gray-950 p-3">
                  <dt className="text-gray-500">Score</dt>
                  <dd className="text-gray-100 font-semibold">{formatPercent(metrics.score)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg">Captured crop</h2>
                {capturedAt && <span className="text-xs text-green-400">Captured {capturedAt}</span>}
              </div>
              <div className="relative rounded-xl bg-black border border-gray-800 overflow-hidden min-h-[260px] flex items-center justify-center">
                <div className="relative inline-flex max-w-full items-center justify-center">
                  <canvas ref={cropCanvasRef} className="max-h-[520px] max-w-full" />
                  {capturedAt && (
                    <canvas
                      ref={zoneOverlayCanvasRef}
                      className="absolute inset-0 touch-none cursor-move"
                      onPointerDown={handleZonePointerDown}
                      onPointerMove={handleZonePointerMove}
                      onPointerUp={handleZonePointerUp}
                      onPointerCancel={handleZonePointerUp}
                    />
                  )}
                </div>
                {!capturedAt && <p className="absolute text-sm text-gray-600">Hold a card in frame</p>}
              </div>
              {capturedAt && (
                <div className="mt-3 rounded-xl border border-amber-700/30 bg-amber-950/20 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-amber-200 font-semibold">Manual orientation</span>
                    <span className="text-xs text-gray-300">{formatManualOrientation(manualOrientation)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => rotateCapturedCrop(-90)}
                      disabled={ocrBusy}
                      className="rounded-lg border border-gray-700 px-3 py-2 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ↶ Rotate left
                    </button>
                    <button
                      type="button"
                      onClick={() => rotateCapturedCrop(90)}
                      disabled={ocrBusy}
                      className="rounded-lg border border-gray-700 px-3 py-2 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ↷ Rotate right
                    </button>
                    <button
                      type="button"
                      onClick={flipCapturedCropX}
                      disabled={ocrBusy}
                      className="rounded-lg border border-gray-700 px-3 py-2 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ⇆ Flip H
                    </button>
                    <button
                      type="button"
                      onClick={flipCapturedCropY}
                      disabled={ocrBusy}
                      className="rounded-lg border border-gray-700 px-3 py-2 font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                    >
                      ⇅ Flip V
                    </button>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-amber-100">OCR zones</div>
                        <p className="text-xs text-gray-400">Tap a box, then drag to move; drag the green corner to resize.</p>
                      </div>
                      <button
                        type="button"
                        onClick={resetOcrZones}
                        disabled={ocrBusy}
                        className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-40"
                      >
                        Reset zones
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {(Object.keys(OCR_ZONE_META) as OcrZoneKey[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedOcrZone(key)}
                          disabled={ocrBusy}
                          className={`rounded-lg border px-2 py-2 text-left ${
                            selectedOcrZone === key
                              ? "border-green-500 bg-green-500/15 text-green-100"
                              : "border-gray-700 bg-gray-900 text-gray-300"
                          } disabled:opacity-40`}
                        >
                          <span className="font-semibold">{OCR_ZONE_META[key].label}</span>
                          <span className="mt-1 block text-[11px] text-gray-500">{OCR_ZONE_META[key].help}</span>
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs text-gray-400">
                      Ink color hint
                      <select
                        value={inkColorHint}
                        onChange={(event) => setInkColorHint(event.target.value)}
                        disabled={ocrBusy}
                        className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 disabled:opacity-40"
                      >
                        {INK_COLOR_OPTIONS.map((color) => (
                          <option key={color || "none"} value={color}>{color || "No color hint"}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={runManualOcr}
                    disabled={ocrBusy}
                    className="w-full rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-green-400 disabled:opacity-40"
                  >
                    Looks correct — run OCR
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Adjust the crop until the text is upright/readable, then run OCR. All displayed card facts come from the database after match.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg">OCR + DB match</h2>
                  <p className="text-sm text-gray-400">Reads only lookup evidence; name/type/lore/set come from Prisma.</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    ocrState.status === "matched"
                      ? "bg-green-500/15 text-green-300 border border-green-500/30"
                      : ocrState.status === "error" || ocrState.status === "no_match"
                        ? "bg-red-500/15 text-red-300 border border-red-500/30"
                        : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {ocrState.status}
                </span>
              </div>

              <div className="rounded-xl bg-gray-950 border border-gray-800 p-3 text-sm">
                <div className="text-gray-300">{ocrState.message}</div>
                {ocrState.error && <div className="mt-2 text-red-300">{ocrState.error}</div>}
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Orientation</dt>
                    <dd className="text-gray-200 break-all">
                      {ocrState.rawText.orientation || "—"}
                      {ocrState.rawText.orientationScore ? ` · score ${ocrState.rawText.orientationScore}` : ""}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Identifier</dt>
                    <dd className="text-gray-200 break-all">{ocrState.rawText.identifier || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Name zone</dt>
                    <dd className="text-gray-200 break-all">{ocrState.rawText.title || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Type zone</dt>
                    <dd className="text-gray-200 break-all">{ocrState.rawText.typeLine || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Ink cost</dt>
                    <dd className="text-gray-200 break-all">{ocrState.rawText.inkCost || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 text-gray-500">Ink color</dt>
                    <dd className="text-gray-200 break-all">{ocrState.rawText.inkColor || "—"}</dd>
                  </div>
                </dl>
              </div>

              {bestMatch && (
                <div className="rounded-xl border border-green-700/40 bg-green-950/20 p-3 space-y-3">
                  <div className="flex gap-3">
                    {bestMatch.card.imageUrl && (
                      <img
                        src={bestMatch.card.imageUrl}
                        alt={formatCardLine(bestMatch)}
                        className="h-32 w-24 rounded-lg object-cover border border-gray-700 bg-black"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-green-300 font-semibold">Best match · score {bestMatch.score}</div>
                      <h3 className="font-semibold text-white leading-tight mt-1">{formatCardLine(bestMatch)}</h3>
                      <p className="text-sm text-gray-300 mt-1">
                        {bestMatch.card.cardType} · {bestMatch.card.types.join(" · ") || "No subtype"}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {bestMatch.card.setName} ({bestMatch.card.setCode}) · {bestMatch.card.rarity}
                      </p>
                      <p className="text-sm text-gray-400">
                        Lore {bestMatch.card.lore} · Ink {bestMatch.card.inkCost} · #{bestMatch.card.cardNumber}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void addMatchToInventory(bestMatch, 1, 0)}
                      className="rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-green-400"
                    >
                      +1 Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => void addMatchToInventory(bestMatch, 0, 1)}
                      className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      +1 Foil
                    </button>
                    <button
                      type="button"
                      onClick={resetCapture}
                      className="rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                    >
                      Wrong card / scan again
                    </button>
                  </div>
                  {inventoryMessage && <div className="text-sm text-amber-200">{inventoryMessage}</div>}
                  <div className="text-xs text-gray-500">
                    Reasons: {bestMatch.reasons.join(", ") || "score-based fallback"}
                  </div>
                </div>
              )}

              {!bestMatch && ocrState.matches.length === 0 && ocrState.status === "no_match" && (
                <button
                  type="button"
                  onClick={resetCapture}
                  className="w-full rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                >
                  Scan again
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>

      <canvas ref={frameCanvasRef} className="hidden" />
    </div>
  );
}
