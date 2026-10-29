/** Resizes the photo to max 1024 px JPEG (more for labels with small print): fast to upload, enough detail for the AI. */
export async function compressPhoto(file: File, maxSide = 1024): Promise<{ blob: Blob; base64: string; url: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.82))
  const base64 = await new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.readAsDataURL(blob)
  })
  return { blob, base64, url: URL.createObjectURL(blob) }
}
