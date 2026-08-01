// utils/preprocess.ts

/**
 * Extract and preprocess an OCR zone from source image data.
 * Steps: crop zone → upscale 2x → grayscale → binary threshold → contrast boost.
 * Returns a base64 data URL suitable for Tesseract.js.
 */
export async function extractZoneForOcr(
  sourceImage: ImageData,
  zoneX: number,
  zoneY: number,
  zoneW: number,
  zoneH: number,
  upscale: number = 2
): Promise<string> {
  const srcW = sourceImage.width;
  const srcH = sourceImage.height;

  const sx = Math.round(zoneX * srcW);
  const sy = Math.round(zoneY * srcH);
  const sw = Math.round(zoneW * srcW);
  const sh = Math.round(zoneH * srcH);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = sw * upscale;
  canvas.height = sh * upscale;

  // Extract zone via ImageBitmap
  const bitmap = await createImageBitmap(sourceImage, sx, sy, sw, sh);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Get pixels and apply binary threshold
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const val = gray > 128 ? 255 : 0;
    pixels[i] = val;
    pixels[i + 1] = val;
    pixels[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);

  // Contrast boost (unsharp mask effect)
  ctx.filter = "contrast(1.5)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  return canvas.toDataURL("image/png");
}
