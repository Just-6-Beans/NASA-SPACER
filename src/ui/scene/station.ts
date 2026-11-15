// The space station as the spacecraft sees it while closing on it, for the docking film.
//
// OUR OWN MODEL, in the same finishes as the launch systems (scene/vehicles.ts): an artist's
// impression of a station of the International Space Station's kind (pressurised modules in a
// row, a long truss across them, eight solar wings, radiators). Proportions are approximate, it
// carries no markings, and none of it is NASA data or imagery.
//
// The docking frame: metres; the centre of the docking ring is the origin; +y runs from the ring
// into the station, along the line the spacecraft closes on; +x is toward the Earth; +z is the
// side the film's outside camera stands on. Weld rings follow y, so the modules in the main row
// get theirs from the shader. Nothing here touches the DOM or WebGL.
import { compose, cross, identity, norm, rotX, rotY, rotZ, translation, type M4, type V3 } from './math'
import { Mesh, mat, type Mat } from './mesh'
import { FINISH, tinted } from './vehicles'

const { WHITE, WARM_WHITE, GREY, PALE, BLACK, DARK, STEEL, STRUCT, STRUCT_LIGHT } = FINISH
/** A finish without weld rings: for parts that do not lie along the main row. */
const plain = (m: Mat): Mat => ({ ...m, seam: 0 })
const SKIN = mat([0.66, 0.66, 0.64], 0.62, 0.05, 0, 1.3) // insulation blankets, a seam every 1.3 m
const CELLS = mat([0.02, 0.035, 0.085], 0.14, 0.4, 0, 0.55) // solar cells in strings
const GOLD = mat([0.4, 0.26, 0.09], 0.42, 0.55) // the back of a solar blanket
const INSIDE = mat([0.9, 0.74, 0.5], 0.7, 0, 0.16) // the tunnel behind the hatch, lit from within
const ROOM = mat([1, 0.86, 0.62], 0.6, 0, 1) // the lit room at the end of it
const PANE = mat([1, 0.8, 0.5], 0.2, 0, 0.3) // the hatch window, with the light behind it

/** Where the hatch sits behind the docking ring, and the edge it swings on. */
const HATCH_Y = 0.34, HINGE_X = 0.6
/** The hatch's place when it is `open` (0 shut, 1 swung into the tunnel), in the docking frame. */
export const hatchSwing = (open: number): M4 => compose(translation([HINGE_X, HATCH_Y, 0]), rotZ(-open * 1.75), translation([-HINGE_X, -HATCH_Y, 0]))

export interface StationModel {
  mesh: Mesh
  /** The hatch behind the docking ring, on its own so that it can swing open. */
  hatch: Mesh
  /** Small lamps: where, colour, size in metres, blinks a second (0 for steady). */
  lamps: { at: V3; col: V3; size: number; rate: number }[]
}

/** Places what is added next at an angle round the main row and a distance from its axis: +x of the part points outward. */
const around = (angle: number, radius = 0, y = 0) => compose(rotY(-angle), translation([radius, y, 0]))
/** The same numbers on every device. */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

/** A pressurised module along the y axis of whatever frame is set, from y0 to y1: coned ends, a skin, a band at each third, a few fittings. */
function module(m: Mesh, y0: number, y1: number, r: number, skin: Mat, seed: number, neck = 1.2) {
  const cone = 0.5, third = (y1 - y0 - 2 * cone) / 3
  m.lathe([
    { pts: [[neck, y0], [r, y0 + cone]], m: GREY, flat: true },
    { pts: [[r, y0 + cone], [r, y1 - cone]], m: skin, flat: true },
    { pts: [[r, y1 - cone], [neck, y1]], m: GREY, flat: true },
    ...[1, 2].map(i => ({ pts: [[r + 0.045, y0 + cone + third * i - 0.08], [r + 0.045, y0 + cone + third * i + 0.08]] as [number, number][], m: plain(GREY), flat: true })),
  ], 32)
  const rnd = rng(seed), base = m.xf
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, y = y0 + cone + 0.4 + rnd() * (y1 - y0 - 2 * cone - 0.8), w = 0.25 + rnd() * 0.5, h = 0.2 + rnd() * 0.7
    m.xf = compose(base, around(a, r, y))
    m.box([-0.02, -h / 2, -w / 2], [0.07 + rnd() * 0.16, h / 2, w / 2], plain(rnd() < 0.5 ? tinted(PALE, 0.9) : rnd() < 0.5 ? STRUCT_LIGHT : tinted(WHITE, 0.8)))
  }
  m.xf = base
}

/** A square lattice girder along z. */
function truss(m: Mesh, x: number, y: number, z0: number, z1: number, half: number, bay: number) {
  const corners: [number, number][] = [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]]
  for (const [cx, cy] of corners) m.beam([cx, cy, z0], [cx, cy, z1], 0.2, STRUCT_LIGHT)
  const n = Math.round((z1 - z0) / bay), at = (i: number) => z0 + ((z1 - z0) * i) / n
  for (let i = 0; i <= n; i++) for (let k = 0; k < 4; k++) {
    const [ax, ay] = corners[k], [bx, by] = corners[(k + 1) % 4]
    m.beam([ax, ay, at(i)], [bx, by, at(i)], 0.14, STRUCT_LIGHT)
    if (i < n) m.beam(i % 2 ? [ax, ay, at(i)] : [bx, by, at(i)], i % 2 ? [bx, by, at(i + 1)] : [ax, ay, at(i + 1)], 0.1, STRUCT)
  }
}

/** A thin panel seen from both sides. `along` and `across` are its two edges from `at`; `n` is half its thickness, toward the side that gets `front`. */
function panel(m: Mesh, at: V3, along: V3, across: V3, n: V3, front: Mat, back: Mat) {
  const p = (a: number, c: number, lift: number): V3 => [at[0] + along[0] * a + across[0] * c + n[0] * lift, at[1] + along[1] * a + across[1] * c + n[1] * lift, at[2] + along[2] * a + across[2] * c + n[2] * lift]
  const quad = [p(0, 0, 1), p(0, 1, 1), p(1, 1, 1), p(1, 0, 1)]
  // wound so that the first face looks the way n points, whichever way round the edges were given
  const faces = cross(across, along)
  const same = faces[0] * n[0] + faces[1] * n[1] + faces[2] * n[2] > 0
  m.face(same ? quad : [...quad].reverse(), front)
  const under = [p(0, 0, -1), p(1, 0, -1), p(1, 1, -1), p(0, 1, -1)]
  m.face(same ? under : [...under].reverse(), back)
}

/** One solar wing: a mast from `root` along `dir`, and a blanket of cells either side of it facing `n`. */
function wing(m: Mesh, root: V3, dir: V3, n: V3, length: number, seed: number) {
  const w = norm(cross(dir, n)), rnd = rng(seed)
  const at = (a: number, c: number): V3 => [root[0] + dir[0] * a + w[0] * c, root[1] + dir[1] * a + w[1] * c, root[2] + dir[2] * a + w[2] * c]
  m.beam(at(0, 0), at(1.7, 0), 0.9, plain(GREY))
  m.beam(at(1.7, 0), at(length + 0.4, 0), 0.24, STRUCT_LIGHT)
  for (const a of [1.75, length + 0.3]) m.beam(at(a, -5.3), at(a, 5.3), 0.12, STRUCT_LIGHT)
  const N = 16, each = (length - 2) / N, lift: V3 = [n[0] * 0.03, n[1] * 0.03, n[2] * 0.03]
  for (const side of [-1, 1]) for (let i = 0; i < N; i++) {
    const a0 = 2 + i * each + 0.07, c0 = side * 0.45
    panel(m, at(a0, c0), [dir[0] * (each - 0.14), dir[1] * (each - 0.14), dir[2] * (each - 0.14)], [w[0] * side * 4.8, w[1] * side * 4.8, w[2] * side * 4.8], lift, tinted(CELLS, 0.75 + 0.5 * rnd()), GOLD)
  }
}

let built: StationModel | null = null
export function stationModel(): StationModel {
  if (built) return built
  const m = new Mesh(), hatch = new Mesh()
  const lamps: StationModel['lamps'] = []

  // ---- the docking ring and the adapter cone behind it; the tunnel, seen once the hatch swings away
  m.lathe([
    { pts: [[0.62, HATCH_Y + 0.02], [0.62, 0]], m: DARK, flat: true },
    { pts: [[0.62, 0], [0.78, 0]], m: STEEL, flat: true },
    { pts: [[0.78, 0], [0.78, 0.3]], m: STEEL, flat: true },
    { pts: [[0.78, 0.3], [1.02, 0.3]], m: plain(GREY), flat: true },
    { pts: [[1.02, 0.3], [1.02, 0.48]], m: plain(GREY), flat: true },
    { pts: [[1.02, 0.48], [1.32, 2.3]], m: plain(BLACK), flat: true },
    { pts: [[0.62, 2.7], [0.62, HATCH_Y + 0.02]], m: INSIDE, flat: true },
    { pts: [[0, 2.7], [0.62, 2.7]], m: ROOM, flat: true },
  ], 32)
  for (let k = 0; k < 12; k++) {
    // the ring's latches, and a grab rail on the cone between every other pair
    m.xf = around((k / 12) * Math.PI * 2, 0.88, 0.3)
    m.box([-0.05, -0.05, -0.035], [0.05, 0.02, 0.035], plain(tinted(STEEL, 0.6)))
    if (k % 2) continue
    m.xf = compose(around((k / 12) * Math.PI * 2 + 0.26, 1.1, 0.75), rotZ(-0.16))
    m.beam([0.09, 0, 0], [0.09, 1.1, 0], 0.035, plain(STRUCT_LIGHT))
    for (const y of [0, 1.1]) m.beam([0, y, 0], [0.09, y, 0], 0.03, plain(STRUCT_LIGHT))
  }
  m.xf = identity()
  for (const z of [-0.92, 0.92]) lamps.push({ at: [0, 0.27, z], col: [0.8, 0.9, 1], size: 0.035, rate: 0 })

  hatch.lathe([
    { pts: [[0.17, HATCH_Y], [0.52, HATCH_Y]], m: plain(PALE), flat: true },
    { pts: [[0.52, HATCH_Y - 0.03], [0.615, HATCH_Y - 0.03]], m: plain(STEEL), flat: true },
    { pts: [[0.52, HATCH_Y], [0.52, HATCH_Y - 0.03]], m: plain(STEEL), flat: true },
    { pts: [[0, HATCH_Y - 0.01], [0.13, HATCH_Y - 0.01]], m: PANE, flat: true },
    { pts: [[0.13, HATCH_Y - 0.025], [0.17, HATCH_Y - 0.025]], m: plain(STEEL), flat: true },
    { pts: [[0.615, HATCH_Y + 0.05], [0, HATCH_Y + 0.05]], m: plain(GREY), flat: true },
  ], 32)
  for (let k = 0; k < 6; k++) { hatch.xf = rotY((k / 6) * Math.PI * 2); hatch.box([0.34, HATCH_Y - 0.04, -0.045], [0.46, HATCH_Y, 0.045], plain(GREY)) }
  hatch.xf = identity()

  // ---- the main row: two nodes, the laboratory between them, two service modules beyond
  module(m, 2.3, 9.3, 2.15, SKIN, 11, 1.32)
  module(m, 9.4, 18.0, 2.1, SKIN, 23)
  module(m, 18.1, 23.8, 2.2, SKIN, 37)
  module(m, 23.9, 36.4, 2.05, { ...PALE, seam: 1.6 }, 41)
  module(m, 36.5, 40.0, 1.5, { ...WARM_WHITE, seam: 1.1 }, 53, 1.1)
  module(m, 40.0, 49.6, 2.05, { ...PALE, seam: 1.6 }, 59, 1.4)
  m.lathe([{ pts: [[1.2, 49.6], [0, 49.6]], m: DARK, flat: true }], 24)

  // ---- modules out to the sides of the first node, a store on top of the far one, a platform at its end
  m.xf = compose(translation([0, 5.8, 0]), rotX(Math.PI / 2))
  module(m, 2.0, 8.9, 2.05, plain(SKIN), 67)
  m.lathe([{ pts: [[1.2, 8.9], [0, 8.9]], m: plain(GREY), flat: true }], 24)
  m.xf = compose(translation([0, 5.8, 0]), rotX(-Math.PI / 2))
  module(m, 2.0, 13.2, 2.1, plain(SKIN), 71)
  m.lathe([{ pts: [[1.2, 13.2], [0, 13.2]], m: plain(GREY), flat: true }], 24)
  m.xf = compose(translation([0, 5.8, -8.4]), rotZ(Math.PI / 2))
  module(m, 1.9, 6.0, 1.6, plain(WARM_WHITE), 79)
  m.lathe([{ pts: [[1.2, 6.0], [0, 6.0]], m: plain(GREY), flat: true }], 24)
  m.xf = identity()
  m.box([-0.5, 3.4, -18.6], [0.2, 8.2, -13.6], plain(STRUCT_LIGHT))
  for (const [y, z, h] of [[3.9, -17.6, 0.9], [5.6, -15.2, 1.3], [7.1, -17.2, 0.7]]) m.box([-0.5 - h, y - 0.6, z - 0.7], [-0.5, y + 0.6, z + 0.7], plain(tinted(WHITE, 0.85)))
  // an airlock on the second node, toward the camera, and a ship berthed under the first
  m.xf = compose(translation([0, 21, 0]), rotX(Math.PI / 2))
  module(m, 2.05, 6.4, 1.55, plain(SKIN), 83)
  m.lathe([{ pts: [[1.2, 6.4], [0, 6.4]], m: plain(GREY), flat: true }], 24)
  m.xf = compose(translation([0, 5.8, 0]), rotZ(-Math.PI / 2))
  m.lathe([
    { pts: [[1.0, 2.0], [1.55, 2.6]], m: plain(GREY), flat: true },
    { pts: [[1.55, 2.6], [1.55, 6.6]], m: plain(WARM_WHITE), flat: true },
    { pts: [[1.55, 6.6], [1.2, 7.3]], m: plain(DARK), flat: true },
    { pts: [[1.2, 7.3], [0, 7.3]], m: plain(DARK), flat: true },
  ], 28)
  m.xf = identity()
  for (const side of [-1, 1]) panel(m, [5.2, 4.9, side * 1.6], [0, 1.8, 0], [0, 0, side * 4.6], [-0.04, 0, 0], CELLS, GOLD)

  // ---- the truss across the laboratory, away from the Earth, and what stands on it
  const TX = -5.0, TY = 13.7
  truss(m, TX, TY, -54, 54, 1.7, 4)
  // its middle is closed in: panels of a few shades, with boxes of equipment on the side the spacecraft sees
  for (let i = 0; i < 5; i++) {
    const z0 = -5.5 + i * 2.2, deep = i % 2 ? 1.75 : 1.95
    m.box([TX - deep, TY - deep, z0 + 0.04], [TX + deep, TY + deep, z0 + 2.16], plain(tinted(WARM_WHITE, i % 2 ? 0.62 : 0.78)))
    m.box([TX - 1.1 + (i % 3) * 0.5, TY - deep - 0.3, z0 + 0.5], [TX + 0.2 + (i % 3) * 0.5, TY - deep, z0 + 1.7], plain(i % 2 ? STRUCT_LIGHT : tinted(WHITE, 0.7)))
  }
  for (const z of [-2.6, 2.6]) for (const y of [-2.6, 2.6]) m.beam([-1.9, TY + y, z * 0.5], [TX + 1.7, TY + y * 0.6, z], 0.22, STRUCT_LIGHT)
  const rnd = rng(97)
  for (let i = 0; i < 18; i++) {
    const z = (rnd() * 2 - 1) * 46, up = rnd() < 0.5 ? -1 : 1, w = 0.8 + rnd() * 1.6, h = 0.4 + rnd() * 1.1
    if (Math.abs(z) < 7) continue
    m.box([TX + (up < 0 ? -1.7 - h : 1.7), TY - 1.0, z - w / 2], [TX + (up < 0 ? -1.7 : 1.7 + h), TY + 0.9, z + w / 2], plain(rnd() < 0.6 ? tinted(WHITE, 0.82) : STRUCT_LIGHT))
  }
  // eight solar wings in four pairs, turned to the sun; the cells face the arriving spacecraft
  const face = norm([0, -0.8, 0.6])
  let seed = 5
  for (const z of [-48, -33, 33, 48]) for (const up of [-1, 1]) wing(m, [TX + up * 1.9, TY, z], [up, 0, 0], face, 33, seed += 13)
  // radiators folding out behind the truss, edge on to the sun
  for (const z of [-11.5, 11.5]) {
    m.beam([TX, TY + 1.7, z], [TX, TY + 3.0, z], 0.5, plain(GREY))
    for (let i = 0; i < 6; i++) panel(m, [TX + (i % 2 ? 0.16 : -0.16), TY + 3.0 + i * 2.25, z - 1.7], [0, 2.15, 0], [0, 0, 3.4], [-0.03, 0, 0], plain(tinted(WHITE, 1.05)), plain(tinted(WHITE, 0.9)))
  }
  // small wings on the far service modules
  for (const [y, len] of [[30, 9.5], [45, 13]]) for (const side of [-1, 1]) {
    m.beam([0, y, side * 2.0], [0, y, side * 3.2], 0.2, STRUCT_LIGHT)
    panel(m, [0, y - 1.6, side * 3.2], [0, 3.2, 0], [0, 0, side * len], [-0.03, 0, 0], CELLS, GOLD)
  }
  // a dish on a mast, and the lamps
  m.beam([TX - 1.7, TY, 9], [TX - 6.5, TY, 9], 0.16, STRUCT_LIGHT)
  m.xf = compose(translation([TX - 6.5, TY, 9]), rotZ(Math.PI / 2 + 0.5))
  m.lathe([{ pts: [[0, 0], [0.5, 0.08], [0.95, 0.32], [1.2, 0.62]], m: plain(tinted(WHITE, 0.9)) }, { pts: [[1.2, 0.62], [0.95, 0.36], [0.5, 0.12], [0, 0.04]], m: plain(GREY) }], 20)
  m.xf = identity()
  lamps.push({ at: [TX, TY, 54.3], col: [1, 0.2, 0.12], size: 0.3, rate: 0.8 }, { at: [TX, TY, -54.3], col: [0.2, 1, 0.4], size: 0.3, rate: 0.8 },
    { at: [-2.25, 20.5, 0], col: [1, 0.95, 0.85], size: 0.16, rate: 0 }, { at: [0, 49.9, 0], col: [1, 0.95, 0.85], size: 0.2, rate: 0.5 })
  return built = { mesh: m, hatch, lamps }
}
