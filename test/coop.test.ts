// Live two-client test against a real co-op server process on a spare port.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { Client } from '@colyseus/sdk'

const PORT = 25670 + Math.floor(Math.random() * 200)
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('two clients share poses and power, with validation', async () => {
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' })
  try {
    await new Promise<void>((resolve, reject) => {
      proc.stdout.on('data', d => String(d).includes('listening') && resolve())
      proc.on('exit', c => reject(new Error('server exited ' + c)))
      setTimeout(() => reject(new Error('server timeout')), 15000)
    })
    const url = `ws://127.0.0.1:${PORT}`
    const a = await new Client(url).joinOrCreate('spacer_power')
    const aMsgs: any[] = []
    for (const t of ['snapshot', 'pose', 'power', 'notice', 'gone', 'crew']) a.onMessage(t, m => aMsgs.push([t, m]))
    a.send('hello')
    const b = await new Client(url).join('spacer_power')
    const bMsgs: any[] = []
    for (const t of ['snapshot', 'pose', 'power', 'notice', 'gone', 'crew', 'respawn']) b.onMessage(t, m => bMsgs.push([t, m]))
    b.send('hello')
    await wait(150)
    assert.ok(bMsgs.some(([t, m]) => t === 'snapshot' && m.you === b.sessionId && m.power.comms === 3), 'snapshot after hello')
    assert.equal(a.roomId, b.roomId)
    const pose = { x: 580, y: 582, facing: 'down', left: false, moving: false, jog: false, name: 'Ada', suit: 'ember' }
    a.send('pose', pose)
    await wait(150)
    b.send('pose', { ...pose, name: 'Bo', suit: 'aurora' })
    await wait(150)
    assert.ok(bMsgs.some(([t]) => t === 'respawn'), 'overlapping spawn is moved apart')
    a.send('pose', { ...pose, x: 700, moving: true })
    b.send('pose', { ...pose, x: Infinity }) // rejected
    await wait(200)
    const seen = bMsgs.filter(([t]) => t === 'pose').map(([, m]) => m)
    assert.ok(seen.some(m => m.x === 700 && m.id === a.sessionId && m.name === 'Ada'))
    assert.ok(!aMsgs.some(([t, m]) => t === 'pose' && !Number.isFinite(m.x)))
    // power: valid change with right revision broadcasts; stale revision rejected
    a.send('allocate', { power: { life: 3, comms: 4, research: 2 }, revision: 0 })
    await wait(150)
    assert.ok(bMsgs.some(([t, m]) => t === 'power' && m.power.comms === 4 && m.revision === 1))
    b.send('allocate', { power: { life: 3, comms: 5, research: 2 }, revision: 0 })
    b.send('allocate', { power: { life: 9, comms: 5, research: 2 }, revision: 1 })
    await wait(150)
    assert.equal(bMsgs.filter(([t, m]) => t === 'notice' && !m.ok && m.kind === 'allocate').length, 2)
    b.send('transmit-check', 1)
    await wait(150)
    assert.ok(bMsgs.some(([t, m]) => t === 'notice' && m.kind === 'transmit' && m.ok))
    // life support at 2 units: refused for a pilot without oxygen tanks, allowed for one who carried them up
    a.send('allocate', { power: { life: 2, comms: 5, research: 3 }, revision: 1 })
    await wait(150)
    const transmits = () => bMsgs.filter(([t, m]) => t === 'notice' && m.kind === 'transmit').map(([, m]) => m)
    b.send('transmit-check', 2)
    await wait(150)
    assert.match(transmits().at(-1).text, /Life support needs at least 30% of the station's power/)
    b.send('transmit-check', { revision: 2, lifeNeed: 2 })
    await wait(150)
    assert.equal(transmits().at(-1).ok, true)
    b.send('transmit-check', { revision: 2, lifeNeed: 0 }) // out of range: the usual minimum applies
    await wait(150)
    assert.equal(transmits().at(-1).ok, false)
    a.send('away')
    await wait(150)
    assert.ok(bMsgs.some(([t, m]) => t === 'gone' && m === a.sessionId))
    await b.leave()
    await wait(150)
    assert.ok(aMsgs.some(([t, m]) => t === 'gone' && m === b.sessionId))
    await a.leave()
  } finally {
    proc.kill()
  }
})
