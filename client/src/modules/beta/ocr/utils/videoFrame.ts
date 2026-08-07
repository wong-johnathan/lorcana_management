export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function getObjectCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): SourceRect {
  const sourceAspect = sourceWidth / Math.max(sourceHeight, 1);
  const targetAspect = targetWidth / Math.max(targetHeight, 1);

  if (sourceAspect > targetAspect) {
    const sw = sourceHeight * targetAspect;
    return {
      sx: (sourceWidth - sw) / 2,
      sy: 0,
      sw,
      sh: sourceHeight,
    };
  }

  const sh = sourceWidth / Math.max(targetAspect, 0.001);
  return {
    sx: 0,
    sy: (sourceHeight - sh) / 2,
    sw: sourceWidth,
    sh,
  };
}

export function drawVisibleVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  targetWidth: number
): void {
  const displayWidth = video.clientWidth || 3;
  const displayHeight = video.clientHeight || 4;
  const targetHeight = Math.max(1, Math.round((targetWidth * displayHeight) / displayWidth));
  const sourceRect = getObjectCoverSourceRect(
    video.videoWidth,
    video.videoHeight,
    targetWidth,
    targetHeight
  );

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  canvas
    .getContext("2d", { willReadFrequently: true })!
    .drawImage(
      video,
      sourceRect.sx,
      sourceRect.sy,
      sourceRect.sw,
      sourceRect.sh,
      0,
      0,
      targetWidth,
      targetHeight
    );
}
