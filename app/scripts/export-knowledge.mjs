// Writes shared/knowledge.json (the built-in lessons, tips and sources) and shared/foods.json for Forza!
// Coach. Run after changing lessons, tips or foods: `npm run export-knowledge` (CI checks that the file is current).
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = await mkdtemp(join(tmpdir(), 'forza-knowledge-'))
const out = join(dir, 'knowledge.mjs')
try {
  execFileSync(join(app, 'node_modules', '.bin', 'rolldown'), ['src/data/knowledge-export.ts', '--format', 'esm', '--file', out], { cwd: app, stdio: 'pipe' })
  const { knowledge, foods } = await import(pathToFileURL(out).href)
  await writeFile(join(app, '..', 'shared', 'knowledge.json'), JSON.stringify(knowledge, null, 1) + '\n')
  await writeFile(join(app, '..', 'shared', 'foods.json'), JSON.stringify(foods) + '\n')
  console.log(`shared/knowledge.json: ${knowledge.lessons.length} lessons, ${knowledge.tips.length} tips, ${knowledge.sources.length} sources; shared/foods.json: ${foods.length} foods`)
} finally {
  await rm(dir, { recursive: true, force: true })
}
