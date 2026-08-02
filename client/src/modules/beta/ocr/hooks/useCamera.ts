// hooks/useCamera.ts
import { useState, useRef, useCallback, useEffect } from "react";

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  ready: boolean;
  error: string;
  start: () => Promise<void>;
  stop: () => void;
  refocus: () => Promise<void>;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setError("");
    setReady(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = ms;
      setStream(ms);
    } catch {
      setError("Camera not available.");
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setReady(false);
  }, []);

  const refocus = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // Pulse auto-focus then lock to prevent hunting
      await track.applyConstraints({ advanced: [{ focusMode: "auto" }] as any });
      // After 1.5s, switch to manual to lock
      setTimeout(() => {
        track.applyConstraints({ advanced: [{ focusMode: "manual" }] as any })
          .catch(() => {}); // manual not supported everywhere — ignore
      }, 1500);
    } catch {
      // focusMode not supported — browser default is fine
    }
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, stream, ready, error, start, stop, refocus };
}
