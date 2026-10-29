// Barcode and QR code reading from the camera.
// Android Chrome has a built-in BarcodeDetector; elsewhere (iPhone, desktop Firefox) we load a
// WebAssembly decoder on demand. Its .wasm file is served by the app itself (no third-party CDN).
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

export type ScanFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'qr_code'

export interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>
}

interface NativeDetectorClass {
  new (opts: { formats: string[] }): Detector
  getSupportedFormats(): Promise<string[]>
}

export const FOOD_FORMATS: ScanFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export async function createDetector(formats: ScanFormat[]): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (formats.every((f) => supported.includes(f))) return new Native({ formats })
    } catch {
      // fall through to the WebAssembly decoder
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats })
}

/** EAN/UPC check digit: catches most misreads and typos in manually typed codes. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}
