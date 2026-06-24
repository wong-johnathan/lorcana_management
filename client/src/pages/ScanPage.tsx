import { useState, useRef, useCallback, useEffect } from "react";
import { cards as cardsApi, inventory as inventoryApi } from "../services/api";
import type { Card, RecognizedCard } from "../types";
import CardDetail from "../components/CardDetail";

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [searching, setSearching] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [toast, setToast] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState<RecognizedCard | null>(null);
  const [recognizeError, setRecognizeError] = useState("");

  const canUseCamera =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");

  const startCamera = useCallback(async () => {
    if (!canUseCamera) {
      setCameraError("Live camera requires HTTPS. Use the photo button below — it opens your phone's camera.");
      return;
    }
    try {
      setCameraError("");
      setVideoReady(false);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      setStream(mediaStream);
    } catch {
      setCameraError("Camera not available. Use the photo button below instead.");
    }
  }, [canUseCamera]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setVideoReady(false);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const recognizeImage = useCallback(async (imageData: string) => {
    setRecognizing(true);
    setRecognized(null);
    setRecognizeError("");
    setSearchResults([]);
    try {
      const result = await cardsApi.recognize(imageData);
      if (result.error && result.matches.length === 0) {
        setRecognizeError(result.error);
      } else {
        setRecognized(result.recognized);
        setSearchResults(result.matches);
        if (result.matches.length > 0) {
          setSelectedCard(result.matches[0]);
        }
      }
    } catch (err) {
      console.error("Recognition error:", err);
      setRecognizeError("Recognition failed. Use manual search below.");
    } finally {
      setRecognizing(false);
    }
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(imageData);
    stopCamera();
    recognizeImage(imageData);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      setCapturedImage(imageData);
      stopCamera();
      recognizeImage(imageData);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const resetScan = () => {
    setCapturedImage(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCard(null);
    setRecognized(null);
    setRecognizeError("");
    setCameraError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (canUseCamera) startCamera();
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      if (!recognized) setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await cardsApi.list({ search: searchQuery, limit: "12" });
        setSearchResults(res.cards);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, recognized]);

  const handleAdd = async (
    cardId: string,
    quantity: number,
    foilQuantity: number
  ) => {
    try {
      const entry = await inventoryApi.add(cardId, quantity, foilQuantity);
      setToast(
        `Added ${quantity + foilQuantity}x ${entry.card.name} to inventory!`
      );
      setTimeout(() => setToast(""), 3000);
      setSelectedCard(null);
      resetScan();
    } catch (err) {
      console.error("Add error:", err);
    }
  };

  return (
    <div className="p-3 space-y-4">
      <h2 className="text-lg font-semibold">Scan Card</h2>

      {!capturedImage && (
        <div className="space-y-3">
          {canUseCamera && (
            <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[4/3]">
              {cameraError ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm p-4 text-center">
                  {cameraError}
                </div>
              ) : stream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <button
                    onClick={startCamera}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-6 py-3 rounded-lg transition-colors"
                  >
                    Start Camera
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {stream && (
              <button
                onClick={capturePhoto}
                disabled={!videoReady}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-3 rounded-lg transition-colors"
              >
                {videoReady ? "Capture Photo" : "Loading camera..."}
              </button>
            )}
            <label className={`flex-1 text-center font-semibold py-3 rounded-lg cursor-pointer transition-colors ${
              !canUseCamera || !stream
                ? "bg-amber-500 hover:bg-amber-600 text-black"
                : "bg-gray-800 hover:bg-gray-700"
            }`}>
              {canUseCamera ? "Upload Photo" : "Take Photo"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>

          {!canUseCamera && (
            <p className="text-xs text-gray-500 text-center">
              Tap the button above to open your camera. Live preview requires HTTPS.
            </p>
          )}
        </div>
      )}

      {capturedImage && (
        <div className="space-y-3">
          <div className="relative">
            <img
              src={capturedImage}
              alt="Captured card"
              className="w-full max-h-64 object-contain rounded-lg bg-gray-900"
            />
            <button
              onClick={resetScan}
              className="absolute top-2 right-2 bg-gray-900/80 hover:bg-gray-800 text-sm px-3 py-1 rounded transition-colors"
            >
              Retake
            </button>
          </div>

          {recognizing && (
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Recognizing card...
            </div>
          )}

          {recognized && !recognizing && (
            <div className="bg-green-900/30 border border-green-700 rounded-md px-3 py-2 text-sm">
              <span className="text-green-400">Detected: </span>
              <span className="font-medium">{recognized.name}</span>
              {recognized.subtitle && (
                <span className="text-gray-400"> — {recognized.subtitle}</span>
              )}
            </div>
          )}

          {recognizeError && !recognizing && (
            <div className="bg-red-900/30 border border-red-700 rounded-md px-3 py-2 text-sm text-red-400">
              {recognizeError}
            </div>
          )}

          <input
            type="text"
            placeholder={recognized ? "Or search manually..." : "Search for the card name..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus={!recognizing}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />

          {searching && (
            <p className="text-gray-500 text-sm">Searching...</p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="w-full flex items-center gap-3 p-2 bg-gray-900 rounded-lg border border-gray-800 hover:border-amber-500 transition-colors text-left"
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-10 h-14 object-cover rounded"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-gray-800 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{card.name}</p>
                    {card.subtitle && (
                      <p className="text-xs text-gray-400 truncate">
                        {card.subtitle}
                      </p>
                    )}
                    <div className="flex gap-1 text-xs text-gray-500">
                      <span>{card.color}</span>
                      <span>·</span>
                      <span>{card.setName}</span>
                      <span>·</span>
                      <span>{card.rarity}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onAdd={handleAdd}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
