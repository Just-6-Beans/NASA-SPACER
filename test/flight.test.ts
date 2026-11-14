// The launch decision in a co-op room: only the host chooses the launch system and commits the room to it.
// A live two-client test against a real co-op server process on a spare port.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { Client } from '@colyseus/sdk'
import { validShip, type FlightState } from '../src/core/protocol'

const PORT = 25900 + Math.floor(Math.random() * 200)
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test('only a known launch system is a valid launch choice', () => {
  for (const id of ['shuttle', 'falcon9', 'atlasv']) assert.ok(validShip(id), id)
  for (const bad of ['', 'saturn', 'Falcon9', 3, null, undefined, { id: 'falcon9' }]) assert.ok(!validShip(bad), String(bad))
})

test('the host decides the launch system for the room', async () => {
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' })
  try {
    await new Promise<void>((resolve, reject) => {
      proc.stdout.on('data', d => String(d).includes('listening') && resolve())
      proc.on('exit', c => reject(new Error('server exited ' + c)))
      setTimeout(() => reject(new Error('server timeout')), 15000)
    })
    const url = `ws://127.0.0.1:${PORT}`
    const listen = (room: Awaited<ReturnType<Client['joinOrCreate']>>) => {
      const got: [string, any][] = []
      for (const t of ['snapshot', 'flight', 'notice', 'power', 'pose', 'crew', 'gone', 'respawn']) room.onMessage(t, m => got.push([t, m]))
      return got
    }
    const flights = (got: [string, any][]) => got.filter(([t]) => t === 'flight').map(([, m]) => m as FlightState)
    const refusals = (got: [string, any][]) => got.filter(([t, m]) => t === 'notice' && m.kind === 'flight' && !m.ok)

    const a = await new Client(url).joinOrCreate('spacer_power')
    const aGot = listen(a)
    a.send('hello')
    const b = await new Client(url).join('spacer_power')
    const bGot = listen(b)
    b.send('hello')
    await wait(200)
    const snap = (got: [string, any][]) => got.find(([t]) => t === 'snapshot')![1]
    assert.deepEqual(snap(aGot).flight, { host: a.sessionId, ship: null, launched: false, launches: 0 }, 'the first pilot in the room is the host')
    assert.equal(snap(bGot).flight.host, a.sessionId, 'the second pilot is told who hosts')

    // the guest cannot choose or launch
    b.send('ship', 'shuttle')
    b.send('launch', 'shuttle')
    await wait(200)
    assert.equal(refusals(bGot).length, 2, 'both guest requests are refused')
    assert.match(refusals(bGot)[0][1].text, /Only the host/)
    assert.equal(flights(aGot).length, 0, 'nothing changed for the host')

    // the host's choice reaches both pilots; an unknown launch system does not
    a.send('ship', 'falcon9')
    await wait(200)
    assert.deepEqual(flights(bGot).at(-1), { host: a.sessionId, ship: 'falcon9', launched: false, launches: 0 })
    assert.deepEqual(flights(aGot).at(-1), flights(bGot).at(-1))
    a.send('ship', 'saturn')
    await wait(200)
    assert.equal(flights(bGot).at(-1)!.ship, 'falcon9')
    assert.equal(refusals(aGot).length, 1, 'an unknown launch system is refused')

    // the host launches: every pilot is told once, and the count lets a client tell a new launch from an old one
    a.send('launch', 'falcon9')
    await wait(200)
    assert.deepEqual(flights(bGot).at(-1), { host: a.sessionId, ship: 'falcon9', launched: true, launches: 1 })
    // back on the launch field, choosing again reopens the pad
    a.send('ship', 'atlasv')
    await wait(200)
    assert.deepEqual(flights(bGot).at(-1), { host: a.sessionId, ship: 'atlasv', launched: false, launches: 1 })
    a.send('launch', 'atlasv')
    await wait(200)
    assert.equal(flights(bGot).at(-1)!.launches, 2)

    // a pilot who arrives later learns the decision from the snapshot
    await b.leave()
    await wait(150)
    const c = await new Client(url).join('spacer_power')
    const cGot = listen(c)
    c.send('hello')
    await wait(200)
    assert.deepEqual(snap(cGot).flight, { host: a.sessionId, ship: 'atlasv', launched: true, launches: 2 })

    // the host leaves: the pilot who stays becomes host and chooses afresh
    await a.leave()
    await wait(200)
    assert.deepEqual(flights(cGot).at(-1), { host: c.sessionId, ship: null, launched: false, launches: 2 })
    c.send('ship', 'shuttle')
    await wait(200)
    assert.equal(flights(cGot).at(-1)!.ship, 'shuttle')
    assert.equal(refusals(cGot).length, 0)
    await c.leave()
  } finally {
    proc.kill()
  }
})
