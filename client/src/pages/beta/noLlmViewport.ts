export const TCG_CARD_WIDTH = 63;
export const TCG_CARD_HEIGHT = 88;
export const TCG_CARD_RATIO = TCG_CARD_WIDTH / TCG_CARD_HEIGHT;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export function getCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Rect {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return {
      x: (sourceWidth - width) / 2,
      y: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = sourceWidth / targetRatio;
  return {
    x: 0,
    y: (sourceHeight - height) / 2,
    width: sourceWidth,
    height,
  };
}

export function getTcgGuideRect(width: number, height: number, scale = 0.84): Rect {
  const frameRatio = width / height;
  let guideWidth: number;
  let guideHeight: number;

  if (frameRatio > TCG_CARD_RATIO) {
    guideHeight = height * scale;
    guideWidth = guideHeight * TCG_CARD_RATIO;
  } else {
    guideWidth = width * scale;
    guideHeight = guideWidth / TCG_CARD_RATIO;
  }

  return {
    x: (width - guideWidth) / 2,
    y: (height - guideHeight) / 2,
    width: guideWidth,
    height: guideHeight,
  };
}

export function mapPointFromDetectionFrameToVideo(
  point: Point,
  detectionFrameWidth: number,
  detectionFrameHeight: number,
  videoSourceCrop: Rect
): Point {
  return {
    x: videoSourceCrop.x + (point.x / detectionFrameWidth) * videoSourceCrop.width,
    y: videoSourceCrop.y + (point.y / detectionFrameHeight) * videoSourceCrop.height,
  };
}

export function mapPointsFromDetectionFrameToVideo(
  points: Point[],
  detectionFrameWidth: number,
  detectionFrameHeight: number,
  videoSourceCrop: Rect
): Point[] {
  return points.map((point) =>
    mapPointFromDetectionFrameToVideo(point, detectionFrameWidth, detectionFrameHeight, videoSourceCrop)
  );
}
