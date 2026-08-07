import type { CV } from "@techstark/opencv-js";
import { calculateFrameQuality } from "../utils/quality";
import type {
  CardDetection,
  NormalizedPoint,
} from "../utils/captureGate";

let cvPromise: Promise<CV> | null = null;

function getCv(): Promise<CV> {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then(async (module) => {
      const exported = module as unknown as {
        default?: CV | Promise<CV>;
        "module.exports"?: CV | Promise<CV>;
      };
      return Promise.resolve(exported.default ?? exported["module.exports"]!);
    });
  }
  return cvPromise;
}

function orderCorners(points: NormalizedPoint[]): NormalizedPoint[] {
  const topLeft = points.reduce((best, point) =>
    point.x + point.y < best.x + best.y ? point : best
  );
  const bottomRight = points.reduce((best, point) =>
    point.x + point.y > best.x + best.y ? point : best
  );
  const topRight = points.reduce((best, point) =>
    point.y - point.x < best.y - best.x ? point : best
  );
  const bottomLeft = points.reduce((best, point) =>
    point.y - point.x > best.y - best.x ? point : best
  );
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function pixelDistance(
  a: NormalizedPoint,
  b: NormalizedPoint,
  imageWidth: number,
  imageHeight: number
): number {
  return Math.hypot((b.x - a.x) * imageWidth, (b.y - a.y) * imageHeight);
}

export function calculateCardAspect(
  orderedCorners: NormalizedPoint[],
  imageWidth: number,
  imageHeight: number
): number {
  const topWidth = pixelDistance(orderedCorners[0], orderedCorners[1], imageWidth, imageHeight);
  const sideHeight = pixelDistance(orderedCorners[0], orderedCorners[3], imageWidth, imageHeight);
  return topWidth / Math.max(sideHeight, 0.001);
}

export async function detectCard(image: ImageData): Promise<CardDetection> {
  const cv = await getCv();
  const quality = calculateFrameQuality(image);
  const source = cv.matFromImageData(image);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let bestCorners: NormalizedPoint[] = [];
  let bestCoverage = 0;

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 55, 160);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = image.width * image.height;
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const approximation = new cv.Mat();
      try {
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approximation, perimeter * 0.025, true);
        if (approximation.rows !== 4) continue;

        const area = Math.abs(cv.contourArea(approximation));
        const coverage = area / frameArea;
        if (coverage <= bestCoverage || coverage < 0.08 || coverage > 0.96) continue;

        const data = approximation.data32S;
        const points: NormalizedPoint[] = [];
        for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
          points.push({
            x: data[pointIndex * 2] / image.width,
            y: data[pointIndex * 2 + 1] / image.height,
          });
        }
        const ordered = orderCorners(points);
        const aspect = calculateCardAspect(ordered, image.width, image.height);
        const cardLike =
          (aspect >= 0.52 && aspect <= 0.82) ||
          (aspect >= 1.22 && aspect <= 1.92);
        if (!cardLike) continue;

        bestCoverage = coverage;
        bestCorners = ordered;
      } finally {
        approximation.delete();
        contour.delete();
      }
    }
  } finally {
    source.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }

  return {
    found: bestCorners.length === 4,
    corners: bestCorners,
    coverage: bestCoverage,
    ...quality,
  };
}

export async function rectifyCard(
  sourceCanvas: HTMLCanvasElement,
  corners: NormalizedPoint[],
  outputCanvas: HTMLCanvasElement
): Promise<void> {
  const cv = await getCv();
  const ordered = orderCorners(corners);
  const width = 700;
  const height = 1050;
  const source = cv.imread(sourceCanvas);
  const destination = new cv.Mat();
  const transformSource = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x * sourceCanvas.width,
    ordered[0].y * sourceCanvas.height,
    ordered[1].x * sourceCanvas.width,
    ordered[1].y * sourceCanvas.height,
    ordered[2].x * sourceCanvas.width,
    ordered[2].y * sourceCanvas.height,
    ordered[3].x * sourceCanvas.width,
    ordered[3].y * sourceCanvas.height,
  ]);
  const transformDestination = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    width - 1,
    0,
    width - 1,
    height - 1,
    0,
    height - 1,
  ]);
  const transform = cv.getPerspectiveTransform(transformSource, transformDestination);

  try {
    cv.warpPerspective(
      source,
      destination,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );
    outputCanvas.width = width;
    outputCanvas.height = height;
    cv.imshow(outputCanvas, destination);
  } finally {
    source.delete();
    destination.delete();
    transformSource.delete();
    transformDestination.delete();
    transform.delete();
  }
}
