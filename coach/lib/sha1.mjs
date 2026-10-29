// SHA-1 in plain JavaScript, so the Build With Science converter runs the same in Node (Coach), in Deno
// (the server) and in the phone's WebView (the Forza! Health helper). Only used for stable ids, not security.

/** SHA-1 digest of the bytes. */
export function sha1(bytes) {
  const words = new Uint32Array(((bytes.length + 8) >> 6) * 16 + 16)
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8)
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8)
  const bits = bytes.length * 8
  words[words.length - 1] = bits >>> 0
  words[words.length - 2] = Math.floor(bits / 2 ** 32)
  let [a, b, c, d, e] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Uint32Array(80)
  const rol = (x, n) => (x << n) | (x >>> (32 - n))
  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[block + t] : rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1)
    let [A, B, C, D, E] = [a, b, c, d, e]
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (B & C) | (~B & D) : t < 40 ? B ^ C ^ D : t < 60 ? (B & C) | (B & D) | (C & D) : B ^ C ^ D
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const tmp = (rol(A, 5) + f + E + k + w[t]) >>> 0
      E = D
      D = C
      C = rol(B, 30) >>> 0
      B = A
      A = tmp
    }
    a = (a + A) >>> 0
    b = (b + B) >>> 0
    c = (c + C) >>> 0
    d = (d + D) >>> 0
    e = (e + E) >>> 0
  }
  const out = new Uint8Array(20)
  ;[a, b, c, d, e].forEach((v, i) => {
    out[i * 4] = v >>> 24
    out[i * 4 + 1] = (v >>> 16) & 0xff
    out[i * 4 + 2] = (v >>> 8) & 0xff
    out[i * 4 + 3] = v & 0xff
  })
  return out
}
