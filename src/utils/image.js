/**
 * F4: profile pictures are shrunk in the browser instead of being rejected
 * when they are large.
 */

export const AVATAR_MAX_SIDE = 256;

/** Width/height that fit inside max×max, keeping the aspect ratio (never enlarges). */
export function fitWithin(width, height, max = AVATAR_MAX_SIDE) {
  if (!width || !height) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file could not be read as an image.')); };
    img.src = url;
  });
}

/**
 * Resize an image file to at most 256×256 and return it as a data URL
 * (WebP where the browser supports it, JPEG otherwise).
 */
export async function shrinkImage(file, max = AVATAR_MAX_SIDE) {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, WebP or GIF).');
  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // JPEG has no transparency: paint white behind transparent PNGs
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}
