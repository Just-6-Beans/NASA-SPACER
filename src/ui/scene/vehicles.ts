// The three launch systems and the pad they stand on, as triangle meshes built in code.
//
// These are OUR OWN MODELS, drawn from general knowledge of the vehicles' shapes. They are an
// artist's impression: proportions are approximate, and they carry no agency or company markings.
// Nothing here is NASA data. Units are metres; y is up; the stack stands on the pad deck at y = 0
// and flies toward +x; the camera looks from +z.
import type { ShipId } from '../../core/data'
import { compose, identity, mix, rad, rotY, smooth, translation, type V3 } from './math'
import { Mesh, bell, mat, ogive, type Mat } from './mesh'

// ---- Finishes: muted, so the lighting does the work ---------------------------------
const WHITE = mat([0.74, 0.75, 0.76], 0.44, 0, 0, 2.4)
const WARM_WHITE = mat([0.7, 0.69, 0.66], 0.56, 0.1, 0, 1.9)
const GREY = mat([0.34, 0.36, 0.38], 0.5, 0.2)
const PALE = mat([0.5, 0.52, 0.54], 0.55)
const BLACK = mat([0.028, 0.03, 0.034], 0.42)
const TILE = mat([0.03, 0.03, 0.035], 0.8)
const DARK = mat([0.07, 0.075, 0.085], 0.36, 0.8)
const STEEL = mat([0.42, 0.44, 0.47], 0.3, 0.9)
const BRONZE = mat([0.43, 0.3, 0.19], 0.36, 0.8, 0, 3.1)
const FOAM = mat([0.44, 0.25, 0.13], 0.94)
const FOAM_RIB = mat([0.36, 0.2, 0.11], 0.94)
const GLASS = mat([0.015, 0.022, 0.035], 0.06, 0.2)
const SOLAR = mat([0.02, 0.035, 0.085], 0.14, 0.4)
const STRUCT = mat([0.17, 0.19, 0.22], 0.62, 0.45)
const STRUCT_LIGHT = mat([0.3, 0.32, 0.35], 0.6, 0.35)
const RUST = mat([0.34, 0.13, 0.07], 0.7, 0.2)
const CONCRETE = mat([0.26, 0.26, 0.25], 0.9)
const LAMP = mat([1, 0.97, 0.9], 0.5, 0, 1)

const tinted = (m: Mat, k: number): Mat => ({ ...m, col: [m.col[0] * k, m.col[1] * k, m.col[2] * k] })
const toward = (m: Mat, to: V3, t: number): Mat => ({ ...m, col: [mix(m.col[0], to[0], t), mix(m.col[1], to[1], t), mix(m.col[2], to[2], t)] })

export interface Engine {
  /** Where the exhaust leaves, in the stack's own coordinates. */
  at: V3
  /** Radius of the exhaust at the nozzle, metres. */
  r: number
  kind: 'kerosene' | 'solid' | 'hydrogen'
  /** Which stages it burns in. */
  stages: (1 | 2)[]
}
export interface VehicleModel {
  /** Top of the stack above the pad deck. */
  height: number
  /** Height the camera aims at and the stack pitches about. */
  centre: number
  /** Radius of a cylinder that roughly encloses the stack: its shadow on the ground. */
  girth: number
  /** What flies on to orbit. */
  core: Mesh
  /** What falls away at staging, and which way each piece peels off (stack coordinates). */
  drops: { mesh: Mesh; away: V3 }[]
  engines: Engine[]
  /** The opening in the launch table: width along x, depth along z. */
  base: [number, number]
  /** Where the service tower stands, and the height of its crew arm. */
  tower: { x: number; z: number; arm: number; reach: number }
}

/** Places what is added next at an angle round the stack (0 = +x, quarter turn = +z) and a distance from its axis. */
const around = (angle: number, radius = 0, y = 0) => compose(rotY(-angle), translation([radius, y, 0]))
/** Darkens the side of a strap-on part that faces the core, where little light reaches. `outward` points from the core to the part. */
const tucked = (outward: [number, number]) => (_p: V3, n: V3) => {
  const l = Math.hypot(outward[0], outward[1]) || 1
  return mix(0.45, 1, smooth(-0.55, 0.35, (n[0] * outward[0] + n[2] * outward[1]) / l))
}

// ------------------------------------------------------------------ Falcon 9 Block 5 + Crew Dragon
function falcon9(): VehicleModel {
  const R = 1.83
  const drop = new Mesh(), core = new Mesh()
  // first stage: sooty toward the engines, black interstage on top
  drop.lathe([
    { pts: [[0, 0], [R * 0.985, 0]], m: BLACK, flat: true },
    { pts: [[R * 0.985, 0], [R, 0.2], [R, 1.5]], m: BLACK, flat: true },
    { pts: [[R, 1.5], [R, 14], [R, 41.2]], m: WHITE, flat: true },
    { pts: [[R, 41.2], [R, 47.3]], m: BLACK, flat: true },
    { pts: [[R, 47.3], [0, 47.3]], m: BLACK, flat: true },
  ], 36, (_, y, m) => (m === WHITE ? tinted(m, mix(0.66, 1, smooth(1.5, 13, y))) : m))
  for (let k = 0; k < 4; k++) {
    // landing legs, folded up against the tank
    drop.xf = around(rad(45 + k * 90))
    drop.block(
      [[R - 0.05, 0.5, 0.85], [R + 0.62, 0.5, 0.85], [R + 0.62, 0.5, -0.85], [R - 0.05, 0.5, -0.85]],
      [[R - 0.05, 10.8, 0.2], [R + 0.16, 10.8, 0.2], [R + 0.16, 10.8, -0.2], [R - 0.05, 10.8, -0.2]], BLACK)
    // grid fins, stowed flat on the interstage
    drop.xf = around(rad(k * 90))
    drop.box([R, 45.2, -0.68], [R + 0.2, 46.9, 0.68], STEEL)
  }
  drop.xf = around(rad(112))
  drop.box([R - 0.02, 2, -0.16], [R + 0.13, 46.6, 0.16], tinted(WHITE, 0.9)) // cable raceway
  for (let k = 0; k < 9; k++) {
    drop.xf = k === 8 ? identity() : around(rad(k * 45), 1.25)
    drop.lathe([{ pts: bell(0.05, 1.05, 0.2, 0.47), m: DARK }], 12)
  }
  drop.xf = identity()

  // second stage, trunk and capsule
  core.lathe([
    { pts: bell(47.5, 2.0, 0.34, 1.3, 8), m: DARK },
    { pts: [[0.34, 47.5], [R * 0.98, 47.5]], m: DARK, flat: true },
    { pts: [[R * 0.98, 47.5], [R, 47.6], [R, 56.5]], m: WHITE, flat: true },
    { pts: [[R, 56.5], [R, 56.8]], m: GREY, flat: true },
    { pts: [[R, 56.8], [R, 60.5]], m: WHITE, flat: true }, // trunk: solar cells on one half, radiators on the other
    { pts: [[R, 60.5], [R + 0.17, 60.75], [R + 0.17, 61.0]], m: DARK, flat: true },
    { pts: [[R + 0.15, 61.0], [R - 0.2, 62.2], [1.28, 63.3], [1.02, 63.95]], m: WHITE },
    { pts: [[1.02, 63.95], ...ogive(0.98, 64.05, 64.9, 6)], m: tinted(WHITE, 0.92) },
  ], 36, (a, y, m) => (y > 56.85 && y < 60.45 && Math.cos(a - rad(40)) > 0.05 ? SOLAR : m))
  for (let k = 0; k < 4; k++) {
    core.xf = around(rad(45 + k * 90))
    core.box([R - 0.02, 56.9, -0.05], [R + 0.5, 58.5, 0.05], WHITE) // trunk fins
  }
  for (const a of [70, 110]) { core.xf = around(rad(a)); core.box([1.5, 62.25, -0.22], [1.6, 62.8, 0.22], GLASS) } // windows
  core.xf = identity()
  return {
    height: 64.9, centre: 30, girth: 2.3, core, drops: [{ mesh: drop, away: [-0.25, -1, 0] }],
    engines: [{ at: [0, -1, 0], r: 1.55, kind: 'kerosene', stages: [1] }, { at: [0, 45.5, 0], r: 1.3, kind: 'kerosene', stages: [2] }],
    base: [9, 9], tower: { x: -13, z: -9, arm: 62.2, reach: 2.2 },
  }
}

// ------------------------------------------------------------------ Atlas V N22 + Starliner
function atlasV(): VehicleModel {
  const R = 1.905, C = 1.525, S = 2.28
  const drop = new Mesh(), core = new Mesh()
  // booster: bronze, paler where the cold tank frosts over; white adapter tapering to the upper stage
  drop.lathe([
    { pts: [[0, 0], [R * 0.98, 0]], m: DARK, flat: true },
    { pts: [[R * 0.98, 0], [R, 0.15], [R, 1.0]], m: DARK, flat: true },
    { pts: [[R, 1.0], [R, 16], [R, 21], [R, 32.5]], m: BRONZE, flat: true },
    { pts: [[R, 32.5], [C, 36.0]], m: WHITE, flat: true },
    { pts: [[C, 36.0], [0, 36.0]], m: DARK, flat: true },
  ], 36, (_, y, m) => (m === BRONZE ? toward(m, [0.56, 0.5, 0.44], 0.5 * smooth(15, 21, y) * (1 - smooth(30.5, 32.5, y))) : m))
  for (const x of [-0.74, 0.74]) { drop.xf = translation([x, 0, 0]); drop.lathe([{ pts: bell(0.05, 1.75, 0.3, 0.72), m: DARK }], 16) }
  drop.xf = around(rad(100))
  drop.box([R - 0.02, 1.5, -0.2], [R + 0.16, 32, 0.2], toward(BRONZE, [0.5, 0.5, 0.5], 0.35)) // feed line fairing
  // two solid boosters, one on each side
  for (const a of [14, 166]) {
    const r = R + 0.79 + 0.1, ax = Math.cos(rad(a)), az = Math.sin(rad(a))
    drop.xf = translation([ax * r, 0, az * r])
    drop.shade = tucked([ax, az])
    drop.lathe([
      { pts: bell(0.55, 1.5, 0.3, 0.62), m: DARK },
      { pts: [[0.3, 0.55], [0.79, 0.55]], m: DARK, flat: true },
      { pts: [[0.79, 0.55], [0.79, 17.6]], m: WHITE, flat: true },
      { pts: ogive(0.79, 17.6, 20.3, 8), m: tinted(WHITE, 0.94) },
    ], 20, (_, y, m) => (m === WHITE && (Math.abs(y - 6.4) < 0.16 || Math.abs(y - 12.2) < 0.16 || y > 17.2) ? tinted(GREY, 1.1) : m))
    drop.shade = () => 1
  }
  drop.xf = identity()

  // two-engine upper stage, the skirt round it, and the capsule
  for (const x of [-0.56, 0.56]) { core.xf = translation([x, 0, 0]); core.lathe([{ pts: bell(35.9, 1.6, 0.17, 0.52), m: DARK }], 14) }
  core.xf = identity()
  core.lathe([
    { pts: [[0.2, 35.9], [C * 0.98, 35.9]], m: DARK, flat: true },
    { pts: [[C * 0.98, 35.9], [C, 36.0], [C, 45.3]], m: WARM_WHITE, flat: true },
    { pts: [[C, 44.6], [S, 44.6]], m: tinted(WHITE, 0.8), flat: true }, // underside of the aeroskirt
    { pts: [[S, 44.6], [S, 46.4]], m: WHITE, flat: true },
    { pts: [[S, 46.4], [S, 47.55], [S, 47.75], [S, 48.9]], m: WHITE, flat: true }, // service module
    { pts: [[S, 48.9], [S + 0.03, 49.05], [S, 49.2]], m: DARK, flat: true },
    { pts: [[S, 49.2], [1.9, 50.2], [1.42, 51.1], [1.02, 51.6]], m: PALE },
    { pts: [[1.02, 51.6], [0.94, 52.0]], m: tinted(PALE, 0.85), flat: true },
    { pts: ogive(0.94, 52.0, 52.4, 5), m: tinted(PALE, 0.9) },
  ], 36, (_, y, m) => (m === WHITE && y > 47.5 && y < 47.8 ? GREY : m))
  for (let k = 0; k < 4; k++) {
    core.xf = around(rad(45 + k * 90))
    core.box([S - 0.03, 46.75, -0.5], [S + 0.24, 48.5, 0.5], tinted(WHITE, 0.82)) // thruster pods
  }
  for (const a of [68, 112]) { core.xf = around(rad(a)); core.box([1.58, 50.55, -0.2], [1.7, 51.0, 0.2], GLASS) }
  core.xf = identity()
  return {
    height: 52.4, centre: 24, girth: 3.4, core, drops: [{ mesh: drop, away: [-0.2, -1, 0] }],
    engines: [
      { at: [0, -1.7, 0], r: 1.1, kind: 'kerosene', stages: [1] },
      ...[14, 166].map((a): Engine => ({ at: [Math.cos(rad(a)) * 2.795, -0.95, Math.sin(rad(a)) * 2.795], r: 0.62, kind: 'solid', stages: [1] })),
      { at: [0, 34.3, 0], r: 0.9, kind: 'hydrogen', stages: [2] },
    ],
    base: [11, 9], tower: { x: -14, z: -9, arm: 50.2, reach: 2.6 },
  }
}

// ------------------------------------------------------------------ Space Shuttle
function shuttle(): VehicleModel {
  const core = new Mesh()
  const T = 4.2 // external tank radius
  // external tank: rounded base, barrel, ribbed intertank, pointed oxygen tank
  const dome: [number, number][] = []
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * (Math.PI / 2); dome.push([T * Math.sin(t), 13.2 - 4 * Math.cos(t)]) }
  core.lathe([
    { pts: dome, m: FOAM },
    { pts: [[T, 13.2], [T, 38.6]], m: FOAM, flat: true },
    { pts: [[T, 38.6], [T, 45.5]], m: FOAM_RIB, flat: true },
    { pts: ogive(T, 45.5, 54.9, 14, 0.62), m: FOAM },
    { pts: [[0.62, 54.9], [0.3, 55.6]], m: GREY, flat: true },
    { pts: [[0.12, 55.6], [0.05, 56.1], [0, 56.1]], m: DARK, flat: true },
  ], 44, (a, y, m) => (m === FOAM_RIB ? tinted(m, 0.9 + 0.14 * Math.round(0.5 + 0.5 * Math.sin(a * 54))) : m === FOAM ? tinted(m, 0.94 + 0.06 * Math.sin(y * 1.7)) : m))

  // orbiter: nose up, belly against the tank, on the side facing the camera
  const Y = 9.0, Z = 7.3 // where the orbiter's tail end and centre line sit in the stack
  const stations: [number, number, number, number][] = [ // distance from the tail, half-width, top, belly (belly as a positive depth)
    [0, 3.3, 2.5, 2.3], [5.4, 3.2, 2.75, 2.3], [6.2, 2.75, 2.9, 2.3], [15, 2.75, 2.9, 2.3], [24, 2.75, 2.9, 2.3],
    [26.4, 2.7, 3.0, 2.25], [27.3, 2.6, 2.95, 2.2], [28.2, 2.45, 2.7, 2.1], [29.6, 2.05, 2.1, 1.8], [31, 1.45, 1.35, 1.25], [32.2, 0.75, 0.62, 0.62], [32.8, 0.12, 0.1, 0.1],
  ]
  const K = 28
  const rings = stations.map(([oy, w, top, belly]) => Array.from({ length: K }, (_, j): V3 => {
    const a = (j / K) * Math.PI * 2, u = Math.cos(a), v = -Math.sin(a)
    const box = v > 0 ? 2.6 : 4.2 // the upper half is rounder, the belly flatter
    const curve = (t: number) => Math.sign(t) * Math.abs(t) ** (2 / box)
    return [w * curve(u), Y + oy, Z + (v > 0 ? top : belly) * curve(v)]
  }))
  core.loft(rings, (i, at, n) => {
    const oy = stations[i][0]
    if (n[2] < -0.3) return TILE // heat-shield tiles on the belly and chin
    if (oy > 31.4) return GREY // nose cap
    const up = at > 0.5 ? 1 - Math.abs(at - 0.75) * 4 : 0 // 1 on the centre line of the upper side
    if (oy > 26.9 && oy < 28.4 && up > 0.35 && up < 0.82) return GLASS // flight-deck windows
    return WHITE
  }, DARK)
  // wings: double delta, black underneath
  const thick = (ox: number) => mix(1.05, 0.22, (Math.abs(ox) - 2.6) / 9.3)
  const wing = (pts: [number, number][], side: 1 | -1) => {
    const outline = (side === 1 ? pts : [...pts].reverse()).map(([ox, oy]): [number, number, number, number] => [ox * side, oy, -2.3, -2.3 + thick(ox)])
    core.plate(outline, (u, v, w) => [u, Y + v, Z + w], WHITE, TILE, tinted(GREY, 0.7))
  }
  for (const side of [1, -1] as const) {
    wing([[2.6, 0.6], [11.9, 1.6], [11.9, 3.6], [4.6, 15], [2.6, 15]], side)
    wing([[2.6, 15], [4.6, 15], [2.6, 24.2]], side)
  }
  // vertical tail
  core.plate([[0.4, 2.5, -0.32, 0.32], [7.8, 2.7, -0.32, 0.32], [1.7, 10.6, -0.1, 0.1], [-0.3, 10.6, -0.1, 0.1]],
    (u, v, w) => [w, Y + u, Z + v], WHITE, WHITE, tinted(GREY, 0.6))
  // manoeuvring-engine pods either side of the tail, and the three main engines
  for (const x of [-2.0, 2.0]) {
    core.xf = translation([x, Y + 0.1, Z + 2.5])
    core.lathe([{ pts: [[0, 0], [0.85, 0.25], [1.15, 2.0], [1.08, 4.0], [0.55, 5.5], [0, 5.9]], m: WHITE }], 16)
  }
  for (const [x, z] of [[0, 1.4], [-1.5, -0.7], [1.5, -0.7]]) { core.xf = translation([x, 0, Z + z]); core.lathe([{ pts: bell(Y + 0.1, 3.0, 0.42, 1.15, 8), m: DARK }], 18) }
  core.xf = identity()

  // solid rocket boosters: flared skirt, joints, pointed nose
  const srb = (x: number) => {
    const m = new Mesh()
    m.xf = translation([x, 0, -0.4])
    m.shade = tucked([Math.sign(x), 0])
    m.lathe([
      { pts: bell(1.7, 2.3, 0.75, 1.75, 8), m: DARK },
      { pts: [[0.75, 1.7], [2.6, 0.05]], m: DARK, flat: true },
      { pts: [[2.6, 0], [2.6, 0.25], [1.86, 2.9]], m: WHITE, flat: true },
      { pts: [[1.86, 2.9], [1.86, 38.6]], m: WHITE, flat: true },
      { pts: [[1.86, 38.6], [1.0, 43.0]], m: WHITE, flat: true },
      { pts: ogive(1.0, 43.0, 45.5, 8), m: tinted(WHITE, 0.9) },
    ], 28, (_, y, mm) => (mm === WHITE && [11.3, 19.8, 28.3, 36.6].some(j => Math.abs(y - j) < 0.2) ? tinted(GREY, 0.8) : mm))
    return m
  }
  return {
    height: 56.1, centre: 27, girth: 7.6, core,
    drops: [{ mesh: srb(-6.35), away: [-1, -0.55, 0] }, { mesh: srb(6.35), away: [1, -0.55, 0] }],
    engines: [
      { at: [-6.35, -0.6, -0.4], r: 1.75, kind: 'solid', stages: [1] }, { at: [6.35, -0.6, -0.4], r: 1.75, kind: 'solid', stages: [1] },
      { at: [0, Y - 2.9, Z + 0.1], r: 1.7, kind: 'hydrogen', stages: [1, 2] },
    ],
    base: [22, 22], tower: { x: -19, z: -10, arm: 44.5, reach: 5.2 },
  }
}

// ------------------------------------------------------------------ The rover's rockets (cargo, no crew)
// The same artist's impressions, for the rocket that carries the rover (src/ui/rocketPick.ts).

/** A solid booster strapped to a core of radius R at an angle round it, with its exhaust. */
function strapOn(drop: Mesh, R: number, angleDeg: number): Engine {
  const r = R + 0.79 + 0.1, ax = Math.cos(rad(angleDeg)), az = Math.sin(rad(angleDeg))
  drop.xf = translation([ax * r, 0, az * r])
  drop.shade = tucked([ax, az])
  drop.lathe([
    { pts: bell(0.55, 1.5, 0.3, 0.62), m: DARK },
    { pts: [[0.3, 0.55], [0.79, 0.55]], m: DARK, flat: true },
    { pts: [[0.79, 0.55], [0.79, 17.6]], m: WHITE, flat: true },
    { pts: ogive(0.79, 17.6, 20.3, 8), m: tinted(WHITE, 0.94) },
  ], 20, (_, y, m) => (m === WHITE && (Math.abs(y - 6.4) < 0.16 || Math.abs(y - 12.2) < 0.16 || y > 17.2) ? tinted(GREY, 1.1) : m))
  drop.shade = () => 1
  drop.xf = identity()
  return { at: [ax * r, -0.95, az * r], r: 0.62, kind: 'solid', stages: [1] }
}

/** Atlas V 541: the bronze booster, four solid boosters, and a five-metre nose cone over the upper stage and the spacecraft. */
function atlas541(): VehicleModel {
  const R = 1.905, F = 2.7
  const drop = new Mesh(), core = new Mesh()
  drop.lathe([
    { pts: [[0, 0], [R * 0.98, 0]], m: DARK, flat: true },
    { pts: [[R * 0.98, 0], [R, 0.15], [R, 1.0]], m: DARK, flat: true },
    { pts: [[R, 1.0], [R, 16], [R, 21], [R, 32.5]], m: BRONZE, flat: true },
    { pts: [[R, 32.5], [0, 32.5]], m: DARK, flat: true },
  ], 36, (_, y, m) => (m === BRONZE ? toward(m, [0.56, 0.5, 0.44], 0.5 * smooth(15, 21, y) * (1 - smooth(30.5, 32.5, y))) : m))
  for (const x of [-0.74, 0.74]) { drop.xf = translation([x, 0, 0]); drop.lathe([{ pts: bell(0.05, 1.75, 0.3, 0.72), m: DARK }], 16) }
  drop.xf = around(rad(100))
  drop.box([R - 0.02, 1.5, -0.2], [R + 0.16, 32, 0.2], toward(BRONZE, [0.5, 0.5, 0.5], 0.35)) // feed line fairing
  drop.xf = identity()
  const solids = [32, 148, 212, 328].map(a => strapOn(drop, R, a))

  // upper-stage engine, the boat tail that widens to the nose cone, and the nose cone itself
  core.lathe([{ pts: bell(32.7, 1.7, 0.2, 0.74), m: DARK }], 16)
  core.lathe([
    { pts: [[0.2, 32.7], [R, 32.7]], m: DARK, flat: true },
    { pts: [[R, 32.7], [R, 33.4]], m: tinted(GREY, 1.2), flat: true },
    { pts: [[R, 33.4], [F, 36.2]], m: WHITE, flat: true },
    { pts: [[F, 36.2], [F, 36.6]], m: tinted(GREY, 1.25), flat: true },
    { pts: [[F, 36.6], [F, 49.8]], m: WHITE, flat: true },
    { pts: ogive(F, 49.8, 58.2, 14, 0.22), m: WHITE },
    { pts: [[0.22, 58.2], [0, 58.4]], m: GREY, flat: true },
  ], 40)
  return {
    height: 58.4, centre: 27, girth: 3.7, core, drops: [{ mesh: drop, away: [-0.2, -1, 0] }],
    engines: [{ at: [0, -1.7, 0], r: 1.1, kind: 'kerosene', stages: [1] }, ...solids, { at: [0, 31.0, 0], r: 0.9, kind: 'hydrogen', stages: [2] }],
    base: [12, 12], tower: { x: -15, z: -9, arm: 43, reach: 3.2 },
  }
}

/** Falcon 9 flown without recovery: no landing legs, no grid fins, and a nose cone in place of the capsule. */
function falcon9Cargo(): VehicleModel {
  const R = 1.83, F = 2.6
  const drop = new Mesh(), core = new Mesh()
  drop.lathe([
    { pts: [[0, 0], [R * 0.985, 0]], m: BLACK, flat: true },
    { pts: [[R * 0.985, 0], [R, 0.2], [R, 1.5]], m: BLACK, flat: true },
    { pts: [[R, 1.5], [R, 14], [R, 41.2]], m: WHITE, flat: true },
    { pts: [[R, 41.2], [R, 47.3]], m: BLACK, flat: true },
    { pts: [[R, 47.3], [0, 47.3]], m: BLACK, flat: true },
  ], 36, (_, y, m) => (m === WHITE ? tinted(m, mix(0.66, 1, smooth(1.5, 13, y))) : m))
  drop.xf = around(rad(112))
  drop.box([R - 0.02, 2, -0.16], [R + 0.13, 46.6, 0.16], tinted(WHITE, 0.9)) // cable raceway
  for (let k = 0; k < 9; k++) {
    drop.xf = k === 8 ? identity() : around(rad(k * 45), 1.25)
    drop.lathe([{ pts: bell(0.05, 1.05, 0.2, 0.47), m: DARK }], 12)
  }
  drop.xf = identity()
  core.lathe([
    { pts: bell(47.5, 2.0, 0.34, 1.3, 8), m: DARK },
    { pts: [[0.34, 47.5], [R * 0.98, 47.5]], m: DARK, flat: true },
    { pts: [[R * 0.98, 47.5], [R, 47.6], [R, 56.6]], m: WHITE, flat: true },
    { pts: [[R, 56.6], [R, 56.9]], m: GREY, flat: true },
    { pts: [[R, 56.9], [F, 58.6]], m: WHITE, flat: true },
    { pts: [[F, 58.6], [F, 64.2]], m: WHITE, flat: true },
    { pts: ogive(F, 64.2, 69.9, 12, 0.28), m: WHITE },
    { pts: [[0.28, 69.9], [0, 70.1]], m: GREY, flat: true },
  ], 36)
  return {
    height: 70.1, centre: 32, girth: 2.7, core, drops: [{ mesh: drop, away: [-0.25, -1, 0] }],
    engines: [{ at: [0, -1, 0], r: 1.55, kind: 'kerosene', stages: [1] }, { at: [0, 45.5, 0], r: 1.3, kind: 'kerosene', stages: [2] }],
    base: [9, 9], tower: { x: -13, z: -9, arm: 58, reach: 3.0 },
  }
}

/** Saturn V: three stages in black and white, five engines, four fins, and an escape tower on top. */
function saturnV(): VehicleModel {
  const R = 5.03, R3 = 3.3, RS = 1.95
  const drop = new Mesh(), core = new Mesh()
  /** The roll pattern: sections marked ROLL are black and white by turns round the stack; the rest are one colour. */
  const ROLL: Mat = { ...WHITE }
  const roll = (a: number, _y: number, m: Mat) => (m !== ROLL ? m : Math.floor((a / (Math.PI * 2)) * 8 + 0.5) % 2 === 0 ? BLACK : WHITE)
  drop.lathe([
    { pts: [[0, 0], [R * 0.98, 0]], m: DARK, flat: true },
    { pts: [[R * 0.98, 0], [R, 0.3]], m: DARK, flat: true },
    { pts: [[R, 0.3], [R, 13]], m: ROLL, flat: true },
    { pts: [[R, 13], [R, 25.2]], m: WHITE, flat: true },
    { pts: [[R, 25.2], [R, 28.4]], m: BLACK, flat: true },
    { pts: [[R, 28.4], [R, 37.5]], m: WHITE, flat: true },
    { pts: [[R, 37.5], [R, 42]], m: ROLL, flat: true },
    { pts: [[R, 42], [0, 42]], m: DARK, flat: true },
  ], 48, roll)
  for (let k = 0; k < 4; k++) {
    // engine fairings low on the first stage, each with a fin
    drop.xf = around(rad(45 + k * 90))
    drop.block(
      [[R - 0.2, 0.2, 1.9], [R + 1.15, 0.2, 1.5], [R + 1.15, 0.2, -1.5], [R - 0.2, 0.2, -1.9]],
      [[R - 0.2, 8.4, 0.5], [R + 0.05, 8.4, 0.35], [R + 0.05, 8.4, -0.35], [R - 0.2, 8.4, -0.5]], tinted(WHITE, 0.9))
    drop.block(
      [[R + 0.9, 0.3, 0.14], [R + 3.5, 0.3, 0.1], [R + 3.5, 0.3, -0.1], [R + 0.9, 0.3, -0.14]],
      [[R + 0.4, 4.6, 0.14], [R + 1.5, 4.6, 0.1], [R + 1.5, 4.6, -0.1], [R + 0.4, 4.6, -0.14]], BLACK)
  }
  for (let k = 0; k < 5; k++) {
    drop.xf = k === 4 ? identity() : around(rad(45 + k * 90), 3.55)
    drop.lathe([{ pts: bell(0.1, 4.6, 0.75, 1.82, 8), m: DARK }], 18)
  }
  drop.xf = identity()

  // second and third stages, the spacecraft and the escape tower
  for (let k = 0; k < 5; k++) {
    core.xf = k === 4 ? identity() : around(rad(k * 90), 2.6)
    core.lathe([{ pts: bell(42.4, 2.6, 0.4, 1.0), m: DARK }], 14)
  }
  core.xf = identity()
  core.lathe([
    { pts: [[0.4, 42.4], [R, 42.4]], m: DARK, flat: true },
    { pts: [[R, 42.4], [R, 47.6]], m: ROLL, flat: true },
    { pts: [[R, 47.6], [R, 65.6]], m: WHITE, flat: true },
    { pts: [[R, 65.6], [R, 67.0]], m: BLACK, flat: true },
    { pts: [[R, 67.0], [R3, 72.7]], m: ROLL, flat: true },
    { pts: [[R3, 72.7], [R3, 84.7]], m: WHITE, flat: true },
    { pts: [[R3, 84.7], [R3, 85.6]], m: BLACK, flat: true },
    { pts: [[R3, 85.6], [RS, 94.1]], m: WHITE, flat: true },
    { pts: [[RS, 94.1], [RS, 98.0]], m: STEEL, flat: true },
    { pts: [[RS, 98.0], [0.6, 101.3]], m: PALE, flat: true },
    { pts: [[0.6, 101.3], [0.16, 101.6]], m: PALE, flat: true },
    { pts: [[0.16, 101.6], [0.16, 106.4]], m: STRUCT_LIGHT, flat: true },
    { pts: [[0.16, 106.4], [0.36, 106.9], [0.36, 109.6]], m: WHITE, flat: true },
    { pts: ogive(0.36, 109.6, 110.6, 6), m: GREY },
  ], 48, roll)
  return {
    height: 110.6, centre: 50, girth: 6.4, core, drops: [{ mesh: drop, away: [-0.2, -1, 0] }],
    engines: [{ at: [0, -4.6, 0], r: 4.4, kind: 'kerosene', stages: [1] }, { at: [0, 39.6, 0], r: 2.8, kind: 'hydrogen', stages: [2] }],
    base: [19, 19], tower: { x: -25, z: -12, arm: 97, reach: 3.2 },
  }
}

/** Everything that can stand on the pad: the three crew launch systems and the three rockets for the rover. */
export type StackId = ShipId | 'atlas541' | 'falcon9x' | 'saturnv'
const BUILD: Record<StackId, () => VehicleModel> = { falcon9, atlasv: atlasV, shuttle, atlas541, falcon9x: falcon9Cargo, saturnv: saturnV }
const cache = new Map<StackId, VehicleModel>()
export function vehicleModel(id: StackId): VehicleModel {
  let v = cache.get(id)
  if (!v) cache.set(id, v = BUILD[id]())
  return v
}

// ------------------------------------------------------------------ The pad
/** How far the ground lies below the pad deck the stack stands on. */
export const DECK = 7
export interface PadModel {
  mesh: Mesh
  /** Flood lamps (aimed at the stack) and red beacons, for the glows and light shafts. */
  lamps: V3[]
  beacons: V3[]
}

/** The launch table, the service tower with its crew arm, and the masts round the pad, sized to one vehicle. */
export function padModel(v: VehicleModel): PadModel {
  const m = new Mesh()
  const G = -DECK
  const [bw, bd] = v.base
  const lamps: V3[] = [], beacons: V3[] = []

  // launch table: a frame round the flame opening, on four legs
  const w = bw / 2 + 4.5, d = bd / 2 + 4.5
  m.box([-w, -2.2, bd / 2], [w, 0, d], STRUCT)
  m.box([-w, -2.2, -d], [w, 0, -bd / 2], STRUCT)
  m.box([-w, -2.2, -bd / 2], [-bw / 2, 0, bd / 2], STRUCT)
  m.box([bw / 2, -2.2, -bd / 2], [w, 0, bd / 2], STRUCT)
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) m.box([x * w - 1.3, G, z * d - 1.3], [x * w + 1.3, -2.2, z * d + 1.3], tinted(STRUCT, 0.85))
  m.box([-w - 0.2, -0.25, d - 0.5], [w + 0.2, 0.06, d], tinted(RUST, 1.2)) // a painted edge
  // handrails round the deck, and the deluge pipes that run up to it
  const rail = (a: V3, b: V3) => {
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 3.2))
    for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t; m.beam([x, 0, z], [x, 1.15, z], 0.07, STRUCT_LIGHT) }
    for (const y of [0.6, 1.15]) m.beam([a[0], y, a[2]], [b[0], y, b[2]], 0.06, STRUCT_LIGHT)
  }
  rail([-w, 0, d], [w, 0, d]); rail([w, 0, d], [w, 0, -d]); rail([w, 0, -d], [-w, 0, -d]); rail([-w, 0, -d], [-w, 0, d])
  for (const sx of [-1, 1]) {
    m.beam([sx * (w + 2.6), G, d * 0.55], [sx * (w + 2.6), -0.6, d * 0.55], 0.42, tinted(RUST, 0.62))
    m.beam([sx * (w + 2.6), -0.6, d * 0.55], [sx * (bw / 2 + 1.2), 0.7, d * 0.2], 0.3, tinted(RUST, 0.62))
    m.box([sx * (w + 5.2) - 1.6, G, -d * 0.4 - 1.6], [sx * (w + 5.2) + 1.6, G + 3.4, -d * 0.4 + 1.6], tinted(STRUCT, 0.8)) // an equipment hut
  }
  // concrete hard-stand under it
  m.box([-w - 9, G, -d - 9], [w + 9, G + 0.5, d + 9], CONCRETE)

  // service tower: a square lattice with a crew arm at hatch height
  const { x: tx, z: tz, arm, reach } = v.tower
  const half = 3.4, top = Math.max(v.height * 0.96, arm + 7)
  const corners: [number, number][] = [[tx - half, tz - half], [tx + half, tz - half], [tx + half, tz + half], [tx - half, tz + half]]
  for (const [x, z] of corners) m.beam([x, G, z], [x, top, z], 0.55, STRUCT_LIGHT)
  for (let y = G + 5.5, level = 0; y <= top + 0.1; y += 5.5, level++) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4]
      m.beam([x0, y, z0], [x1, y, z1], 0.3, STRUCT_LIGHT)
      if (y + 5.5 <= top + 0.1) m.beam(level % 2 ? [x0, y, z0] : [x1, y, z1], level % 2 ? [x1, y + 5.5, z1] : [x0, y + 5.5, z0], 0.2, STRUCT)
    }
    if (level % 2 === 0) m.box([tx - half + 0.3, y - 0.12, tz - half + 0.3], [tx + half - 0.3, y + 0.06, tz + half - 0.3], tinted(STRUCT, 0.7)) // deck
  }
  m.beam([tx, top, tz], [tx, top + 16, tz], 0.5, STRUCT_LIGHT, 0.12) // lightning rod
  beacons.push([tx, top + 16.4, tz])
  // crew arm: from the tower to just short of the hatch
  const armEnd: V3 = [-reach - 1.2, arm, tz * 0.25]
  m.beam([tx + half, arm, tz + half * 0.4], armEnd, 1.5, STRUCT_LIGHT)
  m.box([armEnd[0] - 1.3, arm - 1.4, armEnd[2] - 1.5], [armEnd[0] + 1.3, arm + 1.5, armEnd[2] + 1.5], tinted(WHITE, 0.7)) // the white room
  m.beam([tx + half, arm + 6.5, tz + half * 0.4], [armEnd[0] - 0.6, arm + 1.4, armEnd[2]], 0.22, STRUCT)

  // lightning masts round the pad, each with a beacon
  const far = Math.max(62, bw * 2.4)
  for (const [x, z] of [[-far, -far * 0.8], [far * 1.05, -far * 0.75], [far * 1.7, far * 0.1], [-far * 1.6, far * 0.2]] as [number, number][]) {
    const h = v.height + 46
    m.beam([x, G, z], [x, G + h, z], 1.25, STRUCT, 0.25)
    for (const dx of [-1, 1]) m.beam([x + dx * 7, G, z + 4], [x, G + h * 0.34, z], 0.22, STRUCT)
    beacons.push([x, G + h + 0.5, z])
  }
  // flood lamp towers, aimed at the stack
  for (const [x, z] of [[-far * 1.25, far * 0.12], [far * 1.3, far * 0.1], [-far * 0.7, -far * 1.05], [far * 0.75, -far * 1.0]] as [number, number][]) {
    const h = 20
    m.beam([x, G, z], [x, G + h, z], 0.7, STRUCT, 0.4)
    // a lamp bank turned toward the stack
    const turn = Math.atan2(-x, -z)
    m.xf = compose(translation([x, G + h, z]), rotY(turn))
    m.box([-2.4, 0, -0.35], [2.4, 2.0, 0.35], STRUCT)
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 2; j++) m.box([i * 1.5 - 0.55, 0.2 + j * 0.9, 0.36], [i * 1.5 + 0.55, 0.85 + j * 0.9, 0.42], LAMP)
    m.xf = identity()
    lamps.push([x + Math.sin(turn) * 0.5, G + h + 1.0, z + Math.cos(turn) * 0.5])
  }
  // water tower for the sound-suppression deluge
  const wt: V3 = [far * 2.1, G, -far * 2.6]
  m.xf = translation(wt)
  const tank: [number, number][] = []
  for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI; tank.push([7.5 * Math.sin(t), 66 - 6 * Math.cos(t)]) }
  m.lathe([{ pts: [[1.5, 0], [1.3, 60]], m: tinted(WHITE, 0.4), flat: true }, { pts: tank, m: tinted(WHITE, 0.45) }], 24)
  m.xf = identity()
  beacons.push([wt[0], wt[1] + 72.6, wt[2]])
  // propellant sphere and low buildings in the distance
  m.xf = translation([-far * 1.9, G, -far * 1.5])
  const ball: [number, number][] = []
  for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI; ball.push([10 * Math.sin(t), 14 - 10 * Math.cos(t)]) }
  m.lathe([{ pts: ball, m: tinted(WHITE, 0.38) }], 24)
  for (let k = 0; k < 6; k++) m.beam([Math.cos(k) * 7, 0, Math.sin(k) * 7], [Math.cos(k) * 7, 9, Math.sin(k) * 7], 0.7, STRUCT)
  m.xf = identity()
  m.box([-far * 4.6, G, -far * 3.4], [-far * 3.2, G + 26, -far * 2.6], tinted(CONCRETE, 0.7))
  m.box([far * 2.6, G, -far * 4.2], [far * 3.5, G + 38, -far * 3.5], tinted(CONCRETE, 0.6))
  m.box([far * 3.5, G, -far * 4.0], [far * 4.3, G + 14, -far * 3.5], tinted(CONCRETE, 0.55))
  return { mesh: m, lamps, beacons }
}
