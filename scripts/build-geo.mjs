// Builds the station part of src/art/geo.json: the layout the art generator and the game both
// read, so a console, its collision box and its terminal can only move together.
// Run: npm run geo, then npm run art. The Mars part of the file is kept as it is.
//
// The station is laid out like the ISS seen in plan: a backbone of four modules (Node 3, Node 1,
// the US Lab, Node 2) with the Cupola and the docking port above it and the greenhouse and the
// comms module below it. It is a game layout, not a scale drawing of the real station.
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/art/geo.json', import.meta.url)
const old = JSON.parse(readFileSync(FILE, 'utf8'))

const W = 2100, H = 1800
const SW = 32 // side wall thickness
const FW = 28 // front wall thickness
const TW = 100 // width of a vertical hatch tunnel
const BLEED = 14 // how far a module's picture reaches past its hull, for the rim light
const DOOR = [800, 1000] // y range of the hatches along the backbone

// ------------------------------------------------------------------ modules
const modules = [
  { id: 'cupola', name: 'Cupola', label: 'CUPOLA', x: 100, y: 120, w: 320, h: 360, wallH: 170, tint: '#5fd8f0', bus: '' },
  { id: 'dock', name: 'Docking Port', label: 'DOCKING PORT', x: 1660, y: 120, w: 320, h: 360, wallH: 170, tint: '#ff8f45', bus: '' },
  { id: 'node3', name: 'Node 3', label: 'NODE 3 · LIFE SUPPORT', x: 60, y: 520, w: 400, h: 600, wallH: 200, tint: '#6ef2c6', bus: 'life' },
  { id: 'node1', name: 'Node 1', label: 'NODE 1 · POWER', x: 500, y: 520, w: 400, h: 600, wallH: 200, tint: '#e9b22c', bus: '' },
  { id: 'lab', name: 'US Lab', label: 'US LAB · MISSION OPS', x: 940, y: 520, w: 640, h: 600, wallH: 200, tint: '#c9a2ff', bus: 'research' },
  { id: 'node2', name: 'Node 2', label: 'NODE 2 · CREW', x: 1620, y: 520, w: 400, h: 600, wallH: 200, tint: '#8fb4ff', bus: '' },
  { id: 'greenhouse', name: 'Greenhouse', label: 'GREENHOUSE', x: 500, y: 1160, w: 1080, h: 600, wallH: 210, tint: '#7fe36a', bus: '' },
  { id: 'comms', name: 'Comms Module', label: 'COMMS · MARS RELAY', x: 1640, y: 1160, w: 400, h: 460, wallH: 200, tint: '#5fd8f0', bus: 'comms' },
]
for (const m of modules) m.floor = [m.x + SW, m.y + m.wallH, m.w - 2 * SW, m.h - m.wallH - FW]
const mod = id => modules.find(m => m.id === id)

// Hatches join backbone neighbours left to right; tunnels join a module to the one below it.
const hatches = [{ id: 'n3-n1', a: 'node3', b: 'node1' }, { id: 'n1-lab', a: 'node1', b: 'lab' }, { id: 'lab-n2', a: 'lab', b: 'node2' }]
const tunnels = [{ id: 'cupola', a: 'cupola', b: 'node3', x: 260 }, { id: 'dock', a: 'dock', b: 'node2', x: 1820 }, { id: 'greenhouse', a: 'node1', b: 'greenhouse', x: 700 }, { id: 'comms', a: 'node2', b: 'comms', x: 1730 }]

const links = [
  ...hatches.map(h => { const a = mod(h.a), b = mod(h.b); const x = a.x + a.w - SW, w = b.x + SW - x, top = a.y + a.wallH - 46; return { id: h.id, kind: 'hatch', a: h.a, b: h.b, rect: [x, DOOR[0], w, DOOR[1] - DOOR[0]], art: [x - 8, top - 8, w + 16, DOOR[1] - top + 16] } }),
  ...tunnels.map(t => { const a = mod(t.a), b = mod(t.b); const y0 = a.y + a.h - FW, y1 = b.y + b.wallH; return { id: t.id, kind: 'tunnel', a: t.a, b: t.b, rect: [t.x - TW / 2, y0, TW, y1 - y0], art: [t.x - TW / 2 - 30, y0 - 4, TW + 60, y1 - y0 + 8] } }),
]

// ------------------------------------------------------------------ collision
const solids = []
const add = (id, x, y, w, h) => { if (w > 0 && h > 0) solids.push({ id, rect: [x, y, w, h] }) }
/** A wall along x with openings cut out of it. */
function wallX(id, x, y, w, h, gaps) {
  let cur = x, n = 0
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { add(`${id}${n++}`, cur, y, g0 - cur, h); cur = g1 }
  add(`${id}${n}`, cur, y, x + w - cur, h)
}
function wallY(id, x, y, w, h, gaps) {
  let cur = y, n = 0
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { add(`${id}${n++}`, x, cur, w, g0 - cur); cur = g1 }
  add(`${id}${n}`, x, cur, w, y + h - cur)
}
for (const m of modules) {
  const open = list => list.map(t => [t.x - TW / 2, t.x + TW / 2])
  wallX(`${m.id}-back`, m.x, m.y, m.w, m.wallH, open(tunnels.filter(t => t.b === m.id)))
  wallX(`${m.id}-front`, m.x, m.y + m.h - FW, m.w, FW, open(tunnels.filter(t => t.a === m.id)))
  wallY(`${m.id}-left`, m.x, m.y + m.wallH, SW, m.h - m.wallH - FW, hatches.some(h => h.b === m.id) ? [DOOR] : [])
  wallY(`${m.id}-right`, m.x + m.w - SW, m.y + m.wallH, SW, m.h - m.wallH - FW, hatches.some(h => h.a === m.id) ? [DOOR] : [])
}
// the space between two modules is closed everywhere except the passage itself
for (const h of hatches) {
  const a = mod(h.a), b = mod(h.b), gx = a.x + a.w, gw = b.x - gx
  add(`gap-${h.id}-up`, gx, a.y, gw, DOOR[0] - a.y)
  add(`gap-${h.id}-down`, gx, DOOR[1], gw, a.y + a.h - DOOR[1])
}
for (const t of tunnels) {
  const a = mod(t.a), b = mod(t.b), gy = a.y + a.h, gh = b.y - gy
  add(`gap-${t.id}-left`, t.x - TW / 2 - 60, gy, 60, gh)
  add(`gap-${t.id}-right`, t.x + TW / 2, gy, 60, gh)
}

// consoles and furniture (a terminal's solid carries the terminal's id)
add('core', 532, 702, 78, 38)
add('power', 610, 702, 180, 56)
add('hab', 92, 918, 230, 72)
add('ops', 1150, 768, 136, 52)
add('calibration', 982, 918, 230, 72)
add('payload', 1300, 930, 212, 70)
add('comms', 1810, 1342, 180, 56)
add('gh-prep', 540, 1352, 104, 56)
add('gh-control', 575, 1560, 120, 50)
add('gh-service', 1392, 1352, 150, 56)
add('gh-tanks', 1440, 1560, 108, 80)

// ------------------------------------------------------------------ greenhouse bays
// Two rack bands of four bays. Band A stands against the back wall, band B is an island row in
// front of it, with a walkway before each. Bay kinds mirror BAY_PLAN in src/core/greenhouse.ts.
const BAY_W = 133, BAY_H = 136, PITCH = 145, BAY_X0 = 796
const KINDS = { A1: 'tier', A2: 'tier', A3: 'tall', A4: 'tall', B1: 'tier', B2: 'tier', B3: 'tall', B4: 'tall' }
const gh = mod('greenhouse')
const floorTop = gh.y + gh.wallH // 1370
const bays = []
for (const band of ['A', 'B']) for (let i = 0; i < 4; i++) {
  const id = `${band}${i + 1}`, kind = KINDS[id], x = BAY_X0 + PITCH * i
  const base = band === 'A' ? floorTop + 56 : floorTop + 256 // where the rack meets the floor
  const top = base - BAY_H
  const n = kind === 'tier' ? 4 : 3
  bays.push({
    id, loop: band, kind, box: [x, top, BAY_W, BAY_H],
    // the substrate line of each shelf, top shelf first
    shelves: kind === 'tier' ? [top + 58, top + 116] : [top + 112],
    slots: Array.from({ length: n }, (_, k) => Math.round(x + (BAY_W * (k + 0.5)) / n)),
    leds: kind === 'tier' ? [[x + 8, top + 9, BAY_W - 16], [x + 8, top + 69, BAY_W - 16]] : [[x + 8, top + 9, BAY_W - 16]],
    lamp: [x + BAY_W - 13, top + 129],
    tag: [x + 10, top + 133],
  })
  if (band === 'A') add(`bay-${id}`, x, floorTop, BAY_W, 56)
  else add(`bay-${id}`, x, top, BAY_W, BAY_H)
}

// ------------------------------------------------------------------ terminals
const T = (id, name, x, y, callout, reach) => ({ id, name, at: [x, y], callout, ...(reach ? { reach } : {}) })
const terminals = [
  T('ops', 'Mission Ops', 1218, 840, 668),
  T('payload', 'Payload', 1406, 1024, 844),
  T('power', 'Power Grid', 700, 782, 602),
  T('comms', 'Rover Comms', 1900, 1422, 1242),
  T('calibration', 'Calibration', 1097, 1018, 842),
  T('hab', 'Hab Systems', 212, 1018, 834),
  T('gh-control', 'Greenhouse Control', 635, 1634, 1492),
  T('gh-prep', 'Seed Bank & Galley', 592, 1432, 1262),
  T('gh-service', 'Service Bay', 1467, 1432, 1262),
  ...bays.map(b => T(`bay-${b.id}`, `Bay ${b.id}`, b.box[0] + Math.round(BAY_W / 2), b.loop === 'A' ? floorTop + 82 : floorTop + 282, b.box[1] - 16, 60)),
]

// ------------------------------------------------------------------ props (drawn as sprites, sorted against the crew by depth)
const props = [
  { id: 'ops', at: [1134, 748], size: [168, 84], depth: 820 },
  { id: 'payload', at: [1288, 860], size: [236, 150], depth: 1000 },
  { id: 'hab', at: [92, 838], size: [240, 162], depth: 990 },
  { id: 'lab', at: [972, 838], size: [240, 162], depth: 990 },
  { id: 'gh-control', at: [565, 1496], size: [140, 120], depth: 1610 },
  { id: 'gh-tanks', at: [1432, 1492], size: [124, 154], depth: 1640 },
  // the lower jamb of each backbone hatch: the crew pass behind its raised top face
  ...links.filter(l => l.kind === 'hatch').map(l => ({ id: `stub-${l.id}`, at: [l.rect[0], DOOR[1] - 46], size: [l.rect[2], mod(l.a).y + mod(l.a).h - FW - DOOR[1] + 46], depth: DOOR[1] })),
  // the front sill of each module, drawn over the crew's feet
  ...modules.map(m => ({ id: `sill-${m.id}`, at: [m.x, m.y + m.h - 46], size: [m.w, 46], depth: m.y + m.h })),
]

// ------------------------------------------------------------------ windows (cut out of the wall art)
const windows = [
  { module: 'cupola', kind: 'cupola', rect: [150, 148, 220, 114] },
  { module: 'dock', kind: 'pane', rect: [1738, 142, 164, 100] },
  { module: 'node3', kind: 'port', rect: [118, 562, 64, 64] },
  { module: 'node3', kind: 'port', rect: [338, 562, 64, 64] },
  { module: 'node1', kind: 'port', rect: [806, 566, 54, 54] },
  { module: 'lab', kind: 'pane', rect: [1104, 548, 228, 116] },
  { module: 'node2', kind: 'port', rect: [1672, 562, 64, 64] },
  { module: 'node2', kind: 'port', rect: [1904, 562, 64, 64] },
  { module: 'comms', kind: 'pane', rect: [1808, 1180, 176, 46] },
  { module: 'greenhouse', kind: 'port', rect: [1406, 1184, 50, 50] },
  { module: 'greenhouse', kind: 'port', rect: [1478, 1184, 50, 50] },
]

// ------------------------------------------------------------------ power buses in the floor
const conduits = {
  life: [[640, 764], [640, 882], [200, 882], [200, 912]],
  comms: [[760, 764], [760, 900], [1730, 900], [1730, 1420], [1900, 1420], [1900, 1404]],
  research: [[700, 764], [700, 882], [1097, 882], [1097, 912]],
}

// ------------------------------------------------------------------ where the game draws live values
const live = {
  powerScreen: [652, 634, 100, 58],
  coreTube: [552, 588, 32, 112],
  commsScreen: [1828, 1274, 104, 58],
  scope: [1958, 1298, 19],
  beacon: [1996, 1268],
  holo: [1218, 714, 27],
  emitter: [1218, 778],
  rover: [1330, 863],
  battScreen: [1310, 982, 46, 14],
  habWater: [122, 966],
  habMed: [302, 966],
  labStatus: [1182, 966],
  relayLabel: [1813, 1184],
  exteriorLabel: [1112, 654],
  relayHub: [1936, 1224],
  shipWindow: [1738, 142, 164, 100],
  ghScreen: [583, 1512, 104, 46],
  ghServiceScreen: [1404, 1294, 62, 42],
  ghBeacon: [772, 1204],
  // each loop's supply line on the floor: from the service bay to the first rack
  ghFlow: { A: [[1386, 1434], [816, 1434]], B: [[1398, 1638], [816, 1638]] },
}

const exterior = {
  // the Earth fills the lower left of the view; the upper right is open space
  earth: { cx: -500, cy: 2300, r: 2300 },
  // the station truss above the lab, with radiators and array wings (decoration)
  truss: { art: [460, 50, 1190, 470], mast: [1260, 300], beam: [470, 60, 1170, 22], wings: [[490, 96, 110, 360], [620, 96, 110, 360], [1400, 96, 110, 360], [1530, 96, 110, 360]], radiators: [[800, 96, 150, 250], [1070, 96, 150, 250]] },
  // the greenhouse's own array and radiator, beside the module so the crew can see them
  ghArray: { art: [74, 1308, 432, 394], hub: [500, 1320], boom: [80, 1314, 420, 12], wings: [[96, 1230, 360, 70], [96, 1340, 360, 70]] },
  ghRadiator: [250, 1500, 210, 190],
}

const deck = {
  width: W, height: H, wall: SW, front: FW, bleed: BLEED, doorway: DOOR, tunnelWidth: TW,
  spawn: [1820, 400],
  modules, links, windows, solids, terminals, props, conduits, live,
  greenhouse: { bays, bayWidth: BAY_W, bayHeight: BAY_H },
  exterior,
}

// ------------------------------------------------------------------ write it, one short thing per line
const one = v => Array.isArray(v) ? `[${v.map(one).join(', ')}]` : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${one(x)}`).join(', ')} }` : JSON.stringify(v)
function fmt(v, ind = '') {
  const line = one(v)
  if (line.length <= 150 || typeof v !== 'object' || v === null) return line
  const inner = ind + '  '
  if (Array.isArray(v)) return `[\n${v.map(x => inner + fmt(x, inner)).join(',\n')}\n${ind}]`
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner)}`).join(',\n')}\n${ind}}`
}
writeFileSync(FILE, fmt({ deck, mars: old.mars }) + '\n')
console.log(`geo.json: ${modules.length} modules, ${links.length} links, ${solids.length} solids, ${terminals.length} terminals, ${props.length} props`)
