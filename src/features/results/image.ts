/** Longest edge sent to the scanner: enough to read a slip's small print, small enough to upload on mobile data. */
const MAX_EDGE = 1800;
const QUALITY = 0.85;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('This photo format can’t be opened here. Take the photo again, or choose a JPG or PNG.');
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the photo.'));
    r.readAsDataURL(blob);
  });
}

/** Any camera/gallery photo → an upright JPEG, at most MAX_EDGE px, as a Blob and a base64 data URL. */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('Choose a photo of your result slip (JPG, PNG or HEIC).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That photo is over 25 MB. Try a smaller one.');
  const img = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the photo.');
    ctx.fillStyle = '#fff'; // transparent PNGs → white, not black, in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('Your browser could not process the photo.');
    return { blob, dataUrl: await toDataUrl(blob) };
  } finally {
    img.close();
  }
}
