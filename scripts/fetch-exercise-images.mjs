// Downloads the start/end photos of every catalogue exercise from free-exercise-db
// (public domain, https://github.com/yuhonas/free-exercise-db) into app/public/exercises/<id>/.
// Usage: node scripts/fetch-exercise-images.mjs
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogue = (await import(join(root, 'app/src/data/exercises.json'), { with: { type: 'json' } })).default
const base = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

for (const ex of catalogue) {
  if (!ex.src) continue
  const dir = join(root, 'app/public/exercises', ex.id)
  await mkdir(dir, { recursive: true })
  for (const n of [0, 1]) {
    const out = join(dir, `${n}.jpg`)
    try {
      await access(out)
      continue
    } catch {}
    const res = await fetch(`${base}/${ex.src}/${n}.jpg`)
    if (!res.ok) {
      console.warn(`missing ${ex.src}/${n}.jpg (${res.status})`)
      continue
    }
    await writeFile(out, Buffer.from(await res.arrayBuffer()))
  }
  console.log('ok', ex.id)
}
