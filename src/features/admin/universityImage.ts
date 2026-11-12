import { getSupabase } from '../../lib/supabase';

export const UNIVERSITY_ASSETS = 'university_assets';
export type UniversityImageKind = 'logo' | 'cover';

/** What the bucket accepts (0015). SVG is never accepted: it can carry script. */
const STORABLE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
const KEEP_AS_IS_BYTES = 3 * 1024 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

const RULES: Record<UniversityImageKind, { minW: number; minH: number; maxEdge: number; type: 'image/png' | 'image/jpeg'; label: string }> = {
  // Square-ish, shown at 56–72px: 128px is the least that stays sharp on phones.
  logo: { minW: 128, minH: 128, maxEdge: 512, type: 'image/png', label: 'Logo' },
  // Landscape banner on the university page.
  cover: { minW: 800, minH: 300, maxEdge: 1920, type: 'image/jpeg', label: 'Cover photo' },
};

export const IMAGE_HINT: Record<UniversityImageKind, string> = {
  logo: 'Square, at least 128 × 128 px (the emblem, not a wide wordmark). PNG keeps a transparent background.',
  cover: 'Landscape, at least 800 px wide (1600 × 900 looks best).',
};

async function measure(file: File): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    throw new Error('That file can’t be opened as an image. Choose a JPG, PNG or WebP.');
  }
}

/**
 * Checks the picture and makes it fit the bucket: kept as it is when it is a
 * storable type under 3 MB, otherwise scaled down and re-encoded (logos as PNG,
 * covers as JPEG).
 */
export async function prepareUniversityImage(file: File, kind: UniversityImageKind): Promise<{ blob: Blob; type: string; ext: string }> {
  const rule = RULES[kind];
  if (file.type === 'image/svg+xml') throw new Error('SVG files can’t be used. Export the logo as PNG instead.');
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is over 25 MB. Choose a smaller one.');

  const { bitmap, width, height } = await measure(file);
  try {
    if (width < rule.minW || height < rule.minH) {
      throw new Error(`${rule.label} is too small (${width} × ${height} px). Use one at least ${rule.minW} × ${rule.minH} px.`);
    }
    // The card shows logos in a square tile (object-fit: cover), so a wide wordmark would be cut off.
    if (kind === 'logo' && Math.max(width, height) / Math.min(width, height) > 1.25) {
      throw new Error(`The logo should be roughly square; this one is ${width} × ${height} px, so its sides would be cut off. Crop it to a square (the emblem only) and upload again.`);
    }
    if (kind === 'cover' && width < height) {
      throw new Error('The cover photo should be landscape (wider than it is tall).');
    }
    if (STORABLE.includes(file.type) && file.size <= KEEP_AS_IS_BYTES && Math.max(width, height) <= rule.maxEdge * 2) {
      return { blob: file, type: file.type, ext: file.type.split('/')[1].replace('jpeg', 'jpg') };
    }
    const scale = Math.min(1, rule.maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser can’t prepare the image. Try another browser.');
    if (rule.type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, rule.type, 0.86));
    if (!blob) throw new Error('Could not prepare the image. Try another file.');
    return { blob, type: rule.type, ext: rule.type === 'image/png' ? 'png' : 'jpg' };
  } finally {
    bitmap.close();
  }
}

/** Uploads to university_assets (admins only, migration 0020) and returns the public URL. */
export async function uploadUniversityImage(file: File, kind: UniversityImageKind, folder: string): Promise<string> {
  const { blob, type, ext } = await prepareUniversityImage(file, kind);
  const safeFolder = folder.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'new';
  const path = `${safeFolder}/${kind}-upload-${Date.now()}.${ext}`;
  const storage = getSupabase().storage.from(UNIVERSITY_ASSETS);
  const { error } = await storage.upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) {
    if (/row-level security|not authorized|unauthorized|403/i.test(error.message)) {
      throw new Error('Uploading needs migration 0020 (admin uploads). Run it in the SQL Editor, then try again.');
    }
    throw error;
  }
  return storage.getPublicUrl(path).data.publicUrl;
}
