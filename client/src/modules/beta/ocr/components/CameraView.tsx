// components/CameraView.tsx
import { useRef, useEffect, useCallback, useState } from "react";
import { useCamera } from "../hooks/useCamera";
import { useFrameAnalysis } from "../hooks/useFrameAnalysis";
import { getRecognizer } from "../services/recognizer";
import { OCR_ZONES } from "../utils/zones";
import { lookupCard } from "../services/cardIndex";
import type { ScanStatus, ScanEntry } from "../services/types";
import ScanOverlay from "./ScanOverlay";

const GUIDE_ASPECT = 2 / 3;
const GUIDE_WIDTH_RATIO = 0.78;
const SCAN_INTERVAL_MS = 600;
const COOLDOWN_AFTER_NO_MATCH_MS = 1500;

interface CameraViewProps {
  setCode: string;
  onResult: (entry: ScanEntry) => void;
  onNoMatch: () => void;
  onError: (msg: string) => void;
  status: ScanStatus;
  onStatusChange: (s: ScanStatus) => void;
  paused: boolean;
}

export default function CameraView({
  setCode,
  onResult,
  onNoMatch,
  onError,
  status,
  onStatusChange,
  paused,
}: CameraViewProps) {
  const { videoRef, stream, error: camError, start } = useCamera();
  const { analyze, reset: resetAnalysis } = useFrameAnalysis();
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognizingRef = useRef(false);
  const [metrics, setMetrics] = useState<{ edgeDensity: number; diffFromLast: number } | null>(null);

  // Store status in ref so the interval callback always reads latest
  const statusRef = useRef(status);
  statusRef.current = status;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Start camera on mount
  useEffect(() => {
    start();
  }, [start]);

  // Frame sampling loop
  useEffect(() => {
    if (!stream || paused) {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      return;
    }

    scanTimerRef.current = setInterval(() => {
      if (cooldownRef.current) return;
      if (recognizingRef.current) return;
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      const canvas = canvasRef.current;

      // Account for video object-fit: cover cropping
      const previewAspect = video.clientWidth / video.clientHeight;
      const videoAspect = vw / vh;
      let visibleW = vw;
      let visibleH = vh;
      let offsetX = 0;
      let offsetY = 0;
      if (videoAspect > previewAspect) {
        visibleW = vh * previewAspect;
        offsetX = (vw - visibleW) / 2;
      } else {
        visibleH = vw / previewAspect;
        offsetY = (vh - visibleH) / 2;
      }

      const guideW = visibleW * GUIDE_WIDTH_RATIO;
      const guideH = guideW / GUIDE_ASPECT;
      const sx = offsetX + (visibleW - guideW) / 2;
      const sy = offsetY + (visibleH - guideH) / 2;

      canvas.width = guideW;
      canvas.height = guideH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, sx, sy, guideW, guideH, 0, 0, guideW, guideH);

      const frameData = ctx.getImageData(0, 0, guideW, guideH);
      const analysis = analyze(frameData);
      setMetrics({ edgeDensity: analysis.edgeDensity, diffFromLast: analysis.diffFromLast });

      const currentStatus = statusRef.current;

      // Only trigger on waiting or no_match phases
      if (
        currentStatus.phase !== "waiting" &&
        currentStatus.phase !== "no_match"
      ) {
        return;
      }

      if (analysis.hasContent) {
        if (analysis.isStable) {
          // Card detected and stable — start OCR
          recognizingRef.current = true;
          onStatusChange({ phase: "recognizing" });
          doRecognize(frameData);
        } else {
          onStatusChange({ phase: "stabilizing" });
        }
      }
    }, SCAN_INTERVAL_MS);

    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [stream, paused]);

  const doRecognize = useCallback(
    async (frameData: ImageData) => {
      try {
        const recognizer = getRecognizer();
        const result = await recognizer.recognize(frameData, OCR_ZONES);

        if (result.confidence < 0.3) {
          onStatusChange({ phase: "no_match" });
          cooldownRef.current = true;
          setTimeout(() => {
            cooldownRef.current = false;
          }, COOLDOWN_AFTER_NO_MATCH_MS);
          onNoMatch();
          recognizingRef.current = false;
          return;
        }

        const card = lookupCard(result, setCode);
        if (!card) {
          onStatusChange({ phase: "no_match" });
          cooldownRef.current = true;
          setTimeout(() => {
            cooldownRef.current = false;
          }, COOLDOWN_AFTER_NO_MATCH_MS);
          onNoMatch();
          recognizingRef.current = false;
          return;
        }

        const entry: ScanEntry = {
          cardId: card.id,
          name: card.name,
          subtitle: card.subtitle,
          imageUrl: card.imageUrl,
          color: card.color,
          inkCost: card.inkCost,
          cardNumber: card.cardNumber,
          setName: card.setName,
          rarity: card.rarity,
          cardType: card.cardType,
          finish: "Normal",
          quantity: 1,
          scannedAt: Date.now(),
        };

        onResult(entry);
      } catch (err: any) {
        onStatusChange({ phase: "error", message: err.message });
        onError(err.message);
      } finally {
        recognizingRef.current = false;
      }
    },
    [setCode, onResult, onNoMatch, onError, onStatusChange]
  );

  if (camError) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-900 rounded-lg text-gray-400 text-sm p-4 text-center">
        {camError}
      </div>
    );
  }

  return (
    <div
      className="relative bg-gray-900 rounded-lg overflow-hidden"
      style={{ aspectRatio: GUIDE_ASPECT }}
    >
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onCanPlay={() => {}}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Guide box overlay */}
      {stream && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`border-2 rounded-lg transition-all duration-300 ${borderForPhase(status.phase)}`}
            style={{
              width: `${GUIDE_WIDTH_RATIO * 100}%`,
              aspectRatio: String(GUIDE_ASPECT),
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            }}
          />
        </div>
      )}

      {/* Status bar */}
      <ScanOverlay status={status} metrics={metrics} />
    </div>
  );
}

function borderForPhase(phase: string): string {
  switch (phase) {
    case "waiting": return "border-gray-500/50";
    case "stabilizing": return "border-amber-400/70";
    case "recognizing": return "border-blue-400/70 animate-pulse";
    case "result": return "border-green-400/70";
    case "duplicate": return "border-yellow-400/70";
    case "no_match": return "border-red-400/70";
    case "error": return "border-red-500/70";
    default: return "border-gray-500/50";
  }
}
