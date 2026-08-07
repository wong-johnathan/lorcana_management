import { useCallback, useEffect, useRef, useState } from "react";
import { inventory as inventoryApi, ocr as ocrApi } from "../../../services/api";
import type { Card, OcrRecognitionResponse } from "../../../types";
import { detectCard, rectifyCard } from "./services/cardDetector";
import {
  evaluateCaptureGate,
  type CaptureGateState,
  type NormalizedPoint,
} from "./utils/captureGate";

type ScannerPhase =
  | "loading"
  | "scanning"
  | "processing"
  | "result"
  | "waiting-removal"
  | "error";

type Finish = "normal" | "foil";

const INITIAL_GATE: CaptureGateState = {
  stableFrames: 0,
  previousCorners: null,
};

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode card image"))),
      "image/jpeg",
      0.9
    );
  });
}

export default function OCRPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const correctedCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gateRef = useRef<CaptureGateState>(INITIAL_GATE);
  const phaseRef = useRef<ScannerPhase>("loading");
  const analyzingRef = useRef(false);
  const captureLockRef = useRef(false);
  const removalFramesRef = useRef(0);

  const [phase, setPhase] = useState<ScannerPhase>("loading");
  const [instruction, setInstruction] = useState("Starting camera…");
  const [result, setResult] = useState<OcrRecognitionResponse | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [finish, setFinish] = useState<Finish>("normal");
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const transition = useCallback((next: ScannerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setInstruction("This browser does not support camera scanning");
      transition("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setInstruction("Fit the whole card in the frame");
      transition("scanning");
    } catch {
      setInstruction("Camera permission is required for automatic scanning");
      transition("error");
    }
  }, [transition]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
    // capturedUrl is intentionally excluded; each URL is revoked on reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  const capture = useCallback(
    async (corners: NormalizedPoint[]) => {
      if (captureLockRef.current || !videoRef.current) return;
      captureLockRef.current = true;
      transition("processing");
      setInstruction("Reading card…");

      try {
        const video = videoRef.current;
        const source = sourceCanvasRef.current!;
        const corrected = correctedCanvasRef.current!;
        source.width = video.videoWidth;
        source.height = video.videoHeight;
        source.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0);
        await rectifyCard(source, corners, corrected);
        const blob = await canvasBlob(corrected);
        if (capturedUrl) URL.revokeObjectURL(capturedUrl);
        setCapturedUrl(URL.createObjectURL(blob));

        const recognition = await ocrApi.recognize(blob);
        setResult(recognition);
        setSelectedCard(
          recognition.decision === "exact" || recognition.decision === "high"
            ? recognition.candidates[0]?.card ?? null
            : null
        );
        transition("result");
        setInstruction(
          recognition.decision === "none"
            ? "No safe match found"
            : recognition.decision === "ambiguous"
              ? "Choose the matching card"
              : "Confirm the match"
        );
      } catch (error) {
        console.error("OCR scan failed", error);
        setInstruction(error instanceof Error ? error.message : "OCR recognition failed");
        transition("error");
      } finally {
        captureLockRef.current = false;
      }
    },
    [capturedUrl, transition]
  );

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const currentPhase = phaseRef.current;
      if (
        analyzingRef.current ||
        (currentPhase !== "scanning" && currentPhase !== "waiting-removal")
      ) {
        return;
      }

      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      analyzingRef.current = true;
      try {
        const width = 480;
        const height = Math.max(270, Math.round((width * video.videoHeight) / video.videoWidth));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(video, 0, 0, width, height);
        const detection = await detectCard(context.getImageData(0, 0, width, height));

        if (currentPhase === "waiting-removal") {
          if (detection.found) {
            removalFramesRef.current = 0;
            setInstruction("Remove card to scan the next one");
          } else {
            removalFramesRef.current += 1;
            if (removalFramesRef.current >= 2) {
              gateRef.current = INITIAL_GATE;
              removalFramesRef.current = 0;
              setInstruction("Fit the whole card in the frame");
              transition("scanning");
            }
          }
          return;
        }

        const gate = evaluateCaptureGate(gateRef.current, detection);
        gateRef.current = gate;
        setInstruction(gate.instruction);
        if (gate.ready) await capture(detection.corners);
      } catch (error) {
        console.error("Card detection failed", error);
        setInstruction("Card detection could not start on this browser");
        transition("error");
      } finally {
        analyzingRef.current = false;
      }
    }, 450);

    return () => window.clearInterval(interval);
  }, [capture, transition]);

  const resetForRemoval = useCallback(() => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setResult(null);
    setSelectedCard(null);
    gateRef.current = INITIAL_GATE;
    removalFramesRef.current = 0;
    setInstruction("Remove card to scan the next one");
    transition("waiting-removal");
  }, [capturedUrl, transition]);

  const rejectResult = async () => {
    if (result) {
      await ocrApi.feedback(result.scanId, "rejected", null).catch(() => undefined);
    }
    resetForRemoval();
  };

  const addSelectedCard = async () => {
    if (!selectedCard || !result || saving) return;
    setSaving(true);
    try {
      await inventoryApi.add(
        selectedCard.id,
        finish === "normal" ? quantity : 0,
        finish === "foil" ? quantity : 0
      );
      const predictedId = result.candidates[0]?.card.id;
      const outcome =
        predictedId === selectedCard.id &&
        (result.decision === "exact" || result.decision === "high")
          ? "confirmed"
          : "corrected";
      await ocrApi.feedback(result.scanId, outcome, selectedCard.id).catch(() => undefined);
      setToast(`Added ${quantity}× ${selectedCard.name}`);
      window.setTimeout(() => setToast(""), 3000);
      resetForRemoval();
    } catch (error) {
      setInstruction(error instanceof Error ? error.message : "Could not add card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Beta OCR Scanner</h1>
          <p className="text-sm text-gray-400">Automatic capture · self-hosted OCR · no LLM</p>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
          BETA
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-gray-700 bg-black aspect-[3/4] max-h-[72vh]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`h-full w-full object-cover ${phase === "result" || phase === "processing" ? "opacity-20" : ""}`}
        />

        {(phase === "scanning" || phase === "waiting-removal" || phase === "loading") && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="h-[82%] aspect-[2/3] max-w-[82%] rounded-2xl border-2 border-amber-400 shadow-[0_0_0_999px_rgba(0,0,0,0.42)]">
              <span className="sr-only">Card alignment guide</span>
            </div>
          </div>
        )}

        {capturedUrl && (phase === "processing" || phase === "result") && (
          <img
            src={capturedUrl}
            alt="Captured Lorcana card"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {phase === "processing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <div className="rounded-xl bg-gray-900/95 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-amber-400" />
              <p className="font-medium">Reading card…</p>
              <p className="mt-1 text-xs text-gray-400">OCR runs on your own server</p>
            </div>
          </div>
        )}
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-center text-sm font-medium ${
          phase === "error"
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-gray-700 bg-gray-900 text-gray-200"
        }`}
      >
        {instruction}
      </div>

      {phase === "error" && (
        <button
          onClick={() => {
            gateRef.current = INITIAL_GATE;
            setInstruction("Fit the whole card in the frame");
            transition("scanning");
          }}
          className="w-full rounded-lg bg-gray-800 px-4 py-3 font-medium hover:bg-gray-700"
        >
          Retry detection
        </button>
      )}

      {phase === "result" && result && (
        <section className="space-y-3 rounded-2xl border border-gray-700 bg-gray-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {result.decision === "ambiguous" ? "Possible matches" : "Recognized card"}
              </h2>
              <p className="text-xs text-gray-400">
                {result.recognized.collectorIdentifier ?? "Collector identifier unreadable"} · {result.processingMs} ms
              </p>
            </div>
            <button onClick={rejectResult} className="text-sm text-gray-400 hover:text-white">
              Skip
            </button>
          </div>

          {result.candidates.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {result.candidates.map((candidate) => (
                <button
                  key={candidate.card.id}
                  onClick={() => setSelectedCard(candidate.card)}
                  className={`overflow-hidden rounded-lg border text-left transition ${
                    selectedCard?.id === candidate.card.id
                      ? "border-amber-400 ring-2 ring-amber-400/30"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                >
                  <img src={candidate.card.imageUrl} alt={candidate.card.name} className="aspect-[2/3] w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{candidate.card.name}</p>
                    <p className="truncate text-[10px] text-gray-500">{candidate.card.cardNumber}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-gray-800 p-4 text-center text-sm text-gray-400">
              No safe database match. Remove the card and try again with less glare.
            </p>
          )}

          {selectedCard && (
            <div className="space-y-3 border-t border-gray-700 pt-3">
              <div>
                <p className="font-semibold">{selectedCard.name}</p>
                <p className="text-sm text-gray-400">{selectedCard.subtitle}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(["normal", "foil"] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setFinish(value)}
                    className={`rounded-lg border px-3 py-2 text-sm capitalize ${
                      finish === value
                        ? "border-amber-400 bg-amber-400/10 text-amber-300"
                        : "border-gray-700 bg-gray-800 text-gray-300"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg bg-gray-800 p-2">
                <span className="pl-2 text-sm text-gray-400">Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="h-9 w-9 rounded-md bg-gray-700 text-xl"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold">{quantity}</span>
                  <button
                    onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                    className="h-9 w-9 rounded-md bg-gray-700 text-xl"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                onClick={addSelectedCard}
                disabled={saving}
                className="w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? "Adding…" : `Add ${quantity} ${finish} to inventory`}
              </button>
            </div>
          )}
        </section>
      )}

      <canvas ref={analysisCanvasRef} className="hidden" />
      <canvas ref={sourceCanvasRef} className="hidden" />
      <canvas ref={correctedCanvasRef} className="hidden" />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
