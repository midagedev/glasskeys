#!/usr/bin/env node
/*
 * Resolves every vector's `source.file` and `source.tests` against the repos
 * they name.
 *
 * The README says provenance is enforced; without this, what was enforced was
 * only that `source.repo` is non-empty. A paraphrased test name — "compose-end
 * with empty text" for a test actually called "compositionend with empty data
 * emits nothing (dismissed candidate)" — reads like a citation and cannot be
 * followed, which is the thing provenance exists to prevent.
 *
 * The consuming repos are not checked out in this repo's CI, so a missing repo
 * is reported and skipped rather than failed — loudly, with the count, so an
 * empty run cannot pass for a complete one. `--strict` turns that into a
 * failure for a machine that does have them.
 *
 * Repo roots: $GLASSKEYS_REPO_<UPPER_SNAKE_NAME>, else a sibling directory.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vectorsDir = join(root, 'vectors')
const strict = process.argv.includes('--strict')

function repoRoot(name) {
  const env = process.env[`GLASSKEYS_REPO_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`]
  if (env) return env
  return resolve(root, '..', name)
}

const problems = []
const unresolved = new Map()
let checked = 0
let composed = 0

for (const entry of readdirSync(vectorsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  for (const file of readdirSync(join(vectorsDir, entry.name))) {
    if (!file.endsWith('.json')) continue
    const v = JSON.parse(readFileSync(join(vectorsDir, entry.name, file), 'utf8'))
    const where = `${v.suite}/${v.id}`
    const source = v.source ?? {}
    if (!source.repo) {
      problems.push(`${where}: source.repo is empty`)
      continue
    }
    if (!source.file) {
      problems.push(`${where}: source.file is missing, so nothing can be resolved`)
      continue
    }
    const base = repoRoot(source.repo)
    if (!existsSync(base)) {
      unresolved.set(source.repo, (unresolved.get(source.repo) ?? 0) + 1)
      continue
    }
    const path = join(base, source.file)
    if (!existsSync(path)) {
      problems.push(`${where}: source.file does not exist: ${source.file} (in ${source.repo})`)
      continue
    }
    const body = readFileSync(path, 'utf8')
    if (source.composed) {
      composed += 1
    } else {
      for (const name of source.tests ?? []) {
        if (!body.includes(name)) {
          problems.push(`${where}: test name not found in ${source.file}: ${JSON.stringify(name)}`)
        }
      }
    }
    checked += 1
  }
}

console.log(`provenance: ${checked} vectors resolved (${composed} composed)`)
for (const [repo, count] of [...unresolved].sort()) {
  console.log(`provenance: ${count} vectors unresolved — repo "${repo}" not on this machine (${repoRoot(repo)})`)
}
for (const problem of problems) console.error(`provenance: ${problem}`)

if (problems.length) process.exit(1)
if (strict && unresolved.size) {
  console.error('provenance: --strict and some repos were missing')
  process.exit(1)
}
