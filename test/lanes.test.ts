// The lane ownership map (lanes.json) and the checker the pre-push hook and CI run.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const run = (...args: string[]) => execFileSync(process.execPath, ['scripts/lane-check.mjs', ...args], { encoding: 'utf8' })
const owners = (files: string[]) => Object.fromEntries(run('--classify', ...files).trim().split('\n').map(l => { const [f, j] = l.split('\t'); return [f, JSON.parse(j)] }))
const evaluate = (input: object) => JSON.parse(run('--evaluate', JSON.stringify(input)))

test('every tracked file has an owner in lanes.json', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n')
  const unowned = Object.entries(owners(files)).filter(([, c]) => c.kind === 'unowned').map(([f]) => f)
  assert.deepEqual(unowned, [], 'add these to a lane or to "shared" in lanes.json')
})

test('ownership follows CHALLENGE.md section 5', () => {
  const o = owners(['src/core/rover.ts', 'src/core/protocol.ts', 'src/data/opsDates.ts', 'src/ui/ops.ts', 'src/rover.css', 'scripts/art-hq.mjs', 'scripts/build-ops-dates.mjs', 'server/index.ts', 'CHALLENGE.md', 'README.md', 'notes/rules.md'])
  assert.deepEqual(o['src/core/rover.ts'], { kind: 'lane', lane: 'rules' })
  assert.deepEqual(o['src/core/protocol.ts'], { kind: 'frozen' }, 'frozen beats the rules lane folder')
  assert.deepEqual(o['src/data/opsDates.ts'], { kind: 'lane', lane: 'data' })
  assert.deepEqual(o['src/ui/ops.ts'], { kind: 'lane', lane: 'experience' })
  assert.deepEqual(o['src/rover.css'], { kind: 'lane', lane: 'experience' }, 'all CSS is experience')
  assert.deepEqual(o['scripts/art-hq.mjs'], { kind: 'lane', lane: 'experience' })
  assert.deepEqual(o['scripts/build-ops-dates.mjs'], { kind: 'lane', lane: 'data' })
  assert.deepEqual(o['server/index.ts'], { kind: 'frozen' })
  assert.deepEqual(o['CHALLENGE.md'], { kind: 'humanOnly' })
  assert.deepEqual(o['README.md'], { kind: 'shared' })
  assert.deepEqual(o['notes/rules.md'], { kind: 'lane', lane: 'rules' })
})

test('the checker stops what the working rules forbid, and allows what they allow', () => {
  const ok = (r: { errors: string[] }) => r.errors.length === 0
  // own files and shared files
  assert.ok(ok(evaluate({ lane: 'rules', files: ['src/core/rover.ts', 'test/mission.test.ts', 'README.md'], messages: ['Rover: retune'] })))
  // another lane's file: only when a commit message names it
  assert.ok(!ok(evaluate({ lane: 'rules', files: ['src/ui/report.ts'], messages: ['Rover: retune'] })))
  assert.ok(ok(evaluate({ lane: 'rules', files: ['src/ui/report.ts'], messages: ['Rover: retune\n\nAlso edits report.ts to show the causes box.'] })))
  // another lane's notes: never, even when named
  assert.ok(!ok(evaluate({ lane: 'rules', files: ['notes/experience.md'], messages: ['edit notes/experience.md'] })))
  // frozen, human-only and dependency changes: only with a human's yes
  for (const files of [['server/index.ts'], ['CHALLENGE.md'], ['package-lock.json']]) {
    assert.ok(!ok(evaluate({ lane: 'experience', files, messages: ['x'] })), files[0])
    assert.ok(ok(evaluate({ lane: 'experience', files, messages: ['x\n\nHuman-approved: Sam, fixes a co-op crash'] })), files[0])
  }
  assert.ok(!ok(evaluate({ lane: 'data', files: ['package.json'], messages: ['add parser'], depsChanged: true })))
  assert.ok(ok(evaluate({ lane: 'data', files: ['package.json'], messages: ['add data script'], depsChanged: false })))
})

test('branches name their lane', () => {
  const lane = (b: string) => run('--lane-of', b)
  assert.equal(lane('lane/rules').trim(), 'rules')
  assert.equal(lane('lane/experience-station').trim(), 'experience')
  assert.equal(lane('main').trim(), '')
})
