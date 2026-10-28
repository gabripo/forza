import { toPng } from 'html-to-image'

/** Turns a DOM node into a PNG and shares it (phone share sheet) or downloads it. */
export async function saveNodeAsImage(node: HTMLElement, fileName: string): Promise<void> {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], fileName, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: fileName })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  a.click()
}
