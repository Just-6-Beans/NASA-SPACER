// Checks that a lane branch only changes what its lane owns (CHALLENGE.md section 5), using the
// ownership map in lanes.json. Run by the pre-push hook and by CI; run it yourself any time:
//
//   npm run lane-check                     compare this branch with origin/main
//   node scripts/lane-check.mjs --lane rules --base <ref> --head <ref>
//   node scripts/lane-check.mjs --classify <file>...      print the owner of each file
//
// What it enforces, for a branch named lane/<lane>[-anything]:
//   - another lane's notes file: never (rule 7).
//   - frozen files, human-only files, and new or changed dependencies: only with a line
//     "Human-approved: <who>, <what>" in one of the branch's commit messages.
//   - another lane's file: only if a commit message names the file (rule 6).
//   - own files and shared files: always fine. Files not in lanes.json: a warning.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAP = JSON.parse(readFileSync(new URL('../lanes.json', import.meta.url), 'utf8'))
export const LANES = Object.keys(MAP.lanes)

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function matches(pattern, file) {
  if (pattern.endsWith('/')) return file.startsWith(pattern)
  const star = pattern.indexOf('**/*')
  if (star >= 0) return file.startsWith(pattern.slice(0, star)) && file.endsWith(pattern.slice(star + 4))
  return file === pattern
}
// An exact path beats a folder, and a deeper folder beats a shallower one.
const weight = p => (p.endsWith('/') || p.includes('**') ? 0 : 1000) + p.length

/** { kind: 'lane' | 'frozen' | 'humanOnly' | 'shared' | 'unowned', lane? } for one path. */
export function classify(file) {
  let best = null
  const consider = (pattern, result) => { if (matches(pattern, file) && (!best || weight(pattern) > best.w)) best = { w: weight(pattern), result } }
  for (const [lane, patterns] of Object.entries(MAP.lanes)) for (const p of patterns) consider(p, { kind: 'lane', lane })
  for (const p of MAP.shared.paths) consider(p, { kind: 'shared' })
  // frozen and human-only win over any lane pattern, however specific
  for (const p of MAP.frozen.paths) if (matches(p, file)) return { kind: 'frozen' }
  for (const p of MAP.humanOnly.paths) if (matches(p, file)) return { kind: 'humanOnly' }
  return best ? best.result : { kind: 'unowned' }
}

const isNotes = file => /^notes\/[^/]+\.md$/.test(file)

/** Pure decision, so the tests can call it without a git history. */
export function evaluate({ lane, files, messages, depsChanged = false }) {
  const text = messages.join('\n')
  const approved = /^Human-approved:\s*\S/im.test(text)
  const named = file => text.includes(file) || text.includes(file.split('/').pop())
  const errors = [], warnings = [], crossLane = []
  for (const file of files) {
    const c = classify(file)
    if (c.kind === 'lane' && c.lane === lane) continue
    if (c.kind === 'shared') continue
    if (c.kind === 'lane' && isNotes(file)) errors.push(`${file}: only the ${c.lane} lane writes its notes file. Put your request under "Asks" in notes/${lane}.md.`)
    else if (c.kind === 'frozen' || c.kind === 'humanOnly') {
      if (!approved) errors.push(`${file}: ${c.kind === 'frozen' ? MAP.frozen.why : MAP.humanOnly.why} Add a "Human-approved: <who>, <what>" line to the commit message once a human has said yes.`)
    } else if (c.kind === 'lane') {
      if (named(file)) crossLane.push(`${file} (${c.lane} lane, named in a commit message)`)
      else errors.push(`${file}: belongs to the ${c.lane} lane. A small edit is fine if the commit message names the file (CHALLENGE.md section 5, rule 6); otherwise ask in notes/${lane}.md.`)
    } else warnings.push(`${file}: not in lanes.json. Add it to a lane or to "shared".`)
  }
  if (depsChanged && !approved) errors.push('package.json: dependencies changed. A new dependency needs a human\'s yes: add a "Human-approved: <who>, <what>" line to the commit message.')
  return { errors, warnings, crossLane }
}

function depsChanged(base, head) {
  const read = ref => { try { return JSON.parse(git('show', `${ref}:package.json`)) } catch { return {} } }
  const a = read(base), b = read(head)
  const pick = p => JSON.stringify([p.dependencies ?? {}, p.devDependencies ?? {}])
  return pick(a) !== pick(b)
}

/** lane/rules, lane/experience-station and similar name their lane; anything else has none. */
export function laneOf(branch) {
  const m = /^lane\/([a-z]+)/.exec(branch ?? '')
  return m && LANES.includes(m[1]) ? m[1] : null
}

function main(argv) {
  const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback }
  if (argv[0] === '--classify') {
    for (const f of argv.slice(1)) console.log(`${f}\t${JSON.stringify(classify(f))}`)
    return 0
  }
  if (argv[0] === '--evaluate') { console.log(JSON.stringify(evaluate(JSON.parse(argv[1])))); return 0 }
  if (argv[0] === '--lane-of') { console.log(laneOf(argv[1]) ?? ''); return 0 }
  const head = opt('head', 'HEAD')
  const branch = process.env.GITHUB_HEAD_REF || opt('branch', null) || git('rev-parse', '--abbrev-ref', 'HEAD')
  const lane = opt('lane', process.env.LANE) || laneOf(branch)
  if (!lane) { console.log(`lane-check: "${branch}" is not a lane branch (lane/data, lane/rules, lane/experience), so there is nothing to check.`); return 0 }
  if (!LANES.includes(lane)) { console.error(`lane-check: unknown lane "${lane}". Lanes: ${LANES.join(', ')}.`); return 1 }
  const baseRef = opt('base', 'origin/main')
  let base
  try { base = git('merge-base', baseRef, head) } catch { console.error(`lane-check: cannot find ${baseRef}. Run "git fetch origin" first.`); return 1 }
  const files = git('diff', '--name-only', `${base}..${head}`).split('\n').filter(Boolean)
  const messages = git('log', '--format=%B%x00', `${base}..${head}`).split('\0')
  const r = evaluate({ lane, files, messages, depsChanged: depsChanged(base, head) })
  console.log(`lane-check: ${lane} lane, ${files.length} changed file${files.length === 1 ? '' : 's'} since ${base.slice(0, 7)}.`)
  for (const c of r.crossLane) console.log(`  ok    ${c}`)
  for (const w of r.warnings) console.log(`  warn  ${w}`)
  for (const e of r.errors) console.error(`  STOP  ${e}`)
  if (r.errors.length) { console.error('lane-check: fix the lines marked STOP, then push again.'); return 1 }
  console.log('lane-check: passed.')
  return 0
}

// Run as a script, not when a test imports it. Windows may differ in drive-letter case.
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) process.exit(main(process.argv.slice(2)))
