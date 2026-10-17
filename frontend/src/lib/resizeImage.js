// Phone panoramas can be 16,000+ px wide, which is bigger than many GPUs can
// load as a texture. Shrink them in the browser before uploading.
const MAX_WIDTH = 8192;
const MAX_PIXELS = 16_000_000; // Safari refuses to draw canvases bigger than ~16.7M pixels

// maxWidth: smaller for photos of notes, which Gemini reads just as well at 2400 px.
export async function resizeForUpload(file, maxWidth = MAX_WIDTH) {
  const bitmap = await createImageBitmap(file); // also applies EXIF rotation
  const { width, height } = bitmap;
  const scale = Math.min(1, maxWidth / width, Math.sqrt(MAX_PIXELS / (width * height)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg', 0.9));
}
