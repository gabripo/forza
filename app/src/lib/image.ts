/** The error of a photo the browser cannot open (a format it does not read, or too large for the phone's memory). */
export const PHOTO_UNREADABLE = 'photo_unreadable'

/** The photo as an image to draw: read directly, or through an <img> when that fails (some formats, older phones). */
async function decode(file: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bitmap = await createImageBitmap(file)
    return { image: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      if (!img.naturalWidth) throw new Error(PHOTO_UNREADABLE)
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error(PHOTO_UNREADABLE)
    }
  }
}

/**
 * Resizes the photo to max 1024 px JPEG (more for labels with small print): fast to upload, enough detail for the AI.
 * A photo that cannot be opened throws PHOTO_UNREADABLE, for the page to say so.
 */
export async function compressPhoto(file: File, maxSide = 1024): Promise<{ blob: Blob; base64: string; url: string }> {
  const src = await decode(file)
  let blob: Blob | null = null
  try {
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(src.width * scale)
    canvas.height = Math.round(src.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(PHOTO_UNREADABLE)
    ctx.drawImage(src.image, 0, 0, canvas.width, canvas.height)
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  } finally {
    src.done()
  }
  if (!blob) throw new Error(PHOTO_UNREADABLE)
  const jpeg = blob
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = () => reject(new Error(PHOTO_UNREADABLE))
    r.readAsDataURL(jpeg)
  })
  return { blob: jpeg, base64, url: URL.createObjectURL(jpeg) }
}

/** The message for a photo that went wrong: not readable, or the food AI's own answer (limit, not set up, failed). */
export function photoErrorKey(e: unknown): string {
  const code = (e as Error)?.message
  return code === PHOTO_UNREADABLE ? 'camera.unreadable' : code === 'daily_limit_reached' ? 'snap.limit' : code === 'not_configured' ? 'snap.notConfigured' : 'snap.failed'
}
