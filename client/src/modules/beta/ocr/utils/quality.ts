export interface FrameQuality {
  sharpness: number;
  glare: number;
}

export function calculateFrameQuality(image: ImageData): FrameQuality {
  const { data, width, height } = image;
  if (width < 3 || height < 3) return { sharpness: 0, glare: 0 };

  const gray = new Float32Array(width * height);
  let glarePixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    gray[index] = red * 0.299 + green * 0.587 + blue * 0.114;
    if (red >= 248 && green >= 248 && blue >= 248) glarePixels += 1;
  }

  let laplacian = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = gray[y * width + x];
      const response = Math.abs(
        center * 4 -
          gray[y * width + x - 1] -
          gray[y * width + x + 1] -
          gray[(y - 1) * width + x] -
          gray[(y + 1) * width + x]
      );
      laplacian += response / 1020;
      samples += 1;
    }
  }

  return {
    sharpness: Math.min(1, laplacian / Math.max(1, samples)),
    glare: glarePixels / (width * height),
  };
}
