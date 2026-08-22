import { useCallback, useEffect, useRef, useState } from "react";

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

const TARGET_CARD_ASPECT = 1.4;
const DETECTION_INTERVAL_MS = 260;
const STABLE_FRAME_TARGET = 3;
const MIN_AREA_RATIO = 0.08;
const MAX_AREA_RATIO = 0.92;

let cvPromise: Promise<CvModule> | null = null;

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

function similarityScore(value: number, target: number, tolerance: number): number {
  return Math.max(0, 1 - Math.abs(value - target) / tolerance);
}

function detectRoundedCard(cv: CvModule, imageData: ImageData): Detection | null {
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 40, 120);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.dilate(closed, closed, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = imageData.width * imageData.height;
    const edgeDensity = cv.countNonZero(edges) / frameArea;
    let best: Detection | null = null;

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      try {
        const contourArea = cv.contourArea(contour);
        const rect = cv.minAreaRect(contour);
        const rectWidth = Math.max(rect.size.width, 1);
        const rectHeight = Math.max(rect.size.height, 1);
        const longSide = Math.max(rectWidth, rectHeight);
        const shortSide = Math.min(rectWidth, rectHeight);
        const aspectRatio = longSide / shortSide;
        const rectArea = rectWidth * rectHeight;
        const areaRatio = rectArea / frameArea;
        const fillRatio = contourArea / rectArea;

        if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;
        if (aspectRatio < 1.18 || aspectRatio > 1.78) continue;
        if (fillRatio < 0.45 || fillRatio > 1.08) continue;

        const centerDistance = Math.hypot(
          rect.center.x - imageData.width / 2,
          rect.center.y - imageData.height / 2
        );
        const maxCenterDistance = Math.hypot(imageData.width / 2, imageData.height / 2);
        const centerOffset = centerDistance / maxCenterDistance;

        const aspectScore = similarityScore(aspectRatio, TARGET_CARD_ASPECT, 0.38);
        const fillScore = similarityScore(fillRatio, 0.82, 0.36);
        const areaScore = Math.min(1, areaRatio / 0.48);
        const centerScore = Math.max(0, 1 - centerOffset);
        const score = areaScore * 0.35 + aspectScore * 0.3 + fillScore * 0.22 + centerScore * 0.13;

        if (!best || score > best.score) {
          best = {
            points: orderPoints(getRectPoints(cv, rect)),
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

    return best;
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    closed.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
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
  video: HTMLVideoElement
) {
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(rect.width * 0.08, rect.height * 0.08, rect.width * 0.84, rect.height * 0.84);
  ctx.setLineDash([]);

  if (!detection) return;

  const scaleX = rect.width / video.videoWidth;
  const scaleY = rect.height / video.videoHeight;
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
  const targetWidth = portrait ? 672 : 936;
  const targetHeight = portrait ? 936 : 672;

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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

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

  const resetCapture = useCallback(() => {
    capturedRef.current = false;
    stableFramesRef.current = 0;
    previousDetectionRef.current = null;
    setCapturedAt(null);
    setScannerActive(true);
    const canvas = cropCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMetrics((current) => ({ ...current, stableFrames: 0, status: "Looking for card..." }));
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

      frameCanvas.width = video.videoWidth;
      frameCanvas.height = video.videoHeight;
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!frameCtx) return;

      frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
      const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
      const detection = detectRoundedCard(cv, imageData);
      drawDetectionOverlay(overlayCanvas, detection, video);

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
        warpCardToCanvas(cv, imageData, detection.points, cropCanvas);
        setCapturedAt(new Date().toLocaleTimeString());
        setScannerActive(false);
      }
    }, DETECTION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [cameraReady, error, scannerActive]);

  const formatPercent = (value: number | null) => (value == null ? "—" : `${(value * 100).toFixed(1)}%`);
  const formatNumber = (value: number | null) => (value == null ? "—" : value.toFixed(2));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-400">Beta</p>
            <h1 className="text-3xl font-bold">No-LLM Scanner</h1>
            <p className="text-gray-400 max-w-2xl mt-2">
              Browser-only OpenCV proof-of-concept. It detects Lorcana cards as rounded rectangles,
              auto-captures after stable frames, and perspective-corrects the crop. No Gemini or LLM calls.
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
            <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-2xl">
              <video
                ref={videoRef}
                className="w-full bg-black"
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
                <canvas ref={cropCanvasRef} className="max-h-[520px] max-w-full" />
                {!capturedAt && <p className="absolute text-sm text-gray-600">Hold a card in frame</p>}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                OCR and inventory matching are intentionally not wired yet; this beta first proves reliable card detection/cropping on real phones.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <canvas ref={frameCanvasRef} className="hidden" />
    </div>
  );
}
