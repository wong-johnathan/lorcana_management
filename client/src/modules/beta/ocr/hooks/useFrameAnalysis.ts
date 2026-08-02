// hooks/useFrameAnalysis.ts
import { useRef, useCallback } from "react";

interface FrameAnalysisResult {
  hasContent: boolean;
  isStable: boolean;
  edgeDensity: number;
  diffFromLast: number;
  variance: number;
}

const EDGE_THRESHOLD = 0.02;
const VARIANCE_THRESHOLD = 40;
const STABILITY_THRESHOLD = 0.15;
const EDGE_GRAY_DIFF = 18;

export function useFrameAnalysis() {
  const lastFrameRef = useRef<ImageData | null>(null);

  const analyze = useCallback((frameData: ImageData): FrameAnalysisResult => {
    const { data, width, height } = frameData;
    const totalPixels = width * height;

    // Edge density: count pixels where horizontal neighbor differs significantly
    let edgeCount = 0;
    let sum = 0;
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const nextIdx = (y * width + x + 1) * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const nextGray = (data[nextIdx] + data[nextIdx + 1] + data[nextIdx + 2]) / 3;
        sum += gray;
        if (Math.abs(gray - nextGray) > EDGE_GRAY_DIFF) edgeCount++;
      }
    }
    const edgeDensity = edgeCount / totalPixels;

    // Variance: high variance = there's texture (even if blurry)
    const mean = sum / (totalPixels || 1);
    let varSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      varSum += (gray - mean) ** 2;
    }
    const variance = Math.sqrt(varSum / (totalPixels || 1));

    // Stability: compare with last frame (sample every 4th pixel)
    let diffFromLast = 1;
    if (lastFrameRef.current) {
      const last = lastFrameRef.current.data;
      let diffCount = 0;
      for (let i = 0; i < data.length; i += 16) {
        const diff =
          Math.abs(data[i] - last[i]) +
          Math.abs(data[i + 1] - last[i + 1]) +
          Math.abs(data[i + 2] - last[i + 2]);
        if (diff > EDGE_GRAY_DIFF) diffCount++;
      }
      diffFromLast = diffCount / (totalPixels / 4);
    }

    // Store current frame
    lastFrameRef.current = new ImageData(
      new Uint8ClampedArray(data),
      width,
      height
    );

    return {
      hasContent: edgeDensity > EDGE_THRESHOLD || variance > VARIANCE_THRESHOLD,
      isStable: diffFromLast < STABILITY_THRESHOLD,
      edgeDensity,
      diffFromLast,
      variance,
    };
  }, []);

  const reset = useCallback(() => {
    lastFrameRef.current = null;
  }, []);

  return { analyze, reset };
}
