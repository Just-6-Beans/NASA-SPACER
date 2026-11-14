// Small vector and matrix helpers for the launch scene. Matrices are 4 x 4, column-major, as WebGL
// wants them. Nothing here touches the DOM or WebGL.
export type V3 = [number, number, number]
export type M4 = Float32Array

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
export const smooth = (a: number, b: number, t: number) => { const u = clamp((t - a) / (b - a)); return u * u * (3 - 2 * u) }
export const rad = (deg: number) => (deg * Math.PI) / 180

export const identity = (): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** a x b: applies b first, then a. */
export function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  }
  return o
}
export const translation = (t: V3): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1])
export const scaling = (s: V3): M4 => new Float32Array([s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1])
export function rotX(a: number): M4 { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]) }
export function rotY(a: number): M4 { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]) }
export function rotZ(a: number): M4 { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }
/** Chains transforms left to right as written: compose(a, b, c) applies c first. */
export const compose = (...m: M4[]): M4 => m.reduce((a, b) => mul(a, b))

export const point = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]
/** Rotates a direction. Good for normals as long as the matrix has no uneven scaling. */
export const direction = (m: M4, d: V3): V3 => [
  m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
  m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
  m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
]

/**
 * Perspective projection. `shiftY` slides the picture up the screen (in half-screens) without
 * tilting the camera, which keeps the rocket clear of the phone layout's bottom sheet.
 */
export function perspective(fovY: number, aspect: number, near: number, far: number, shiftY = 0): M4 {
  const f = 1 / Math.tan(fovY / 2)
  const o = new Float32Array(16)
  o[0] = f / aspect
  o[5] = f
  o[9] = -shiftY
  o[10] = (far + near) / (near - far)
  o[11] = -1
  o[14] = (2 * far * near) / (near - far)
  return o
}

export interface Camera { eye: V3; right: V3; up: V3; forward: V3; view: M4 }
/** A camera at `eye` looking at `target`. Returns its axes as well, for the sky and ground shader. */
export function lookAt(eye: V3, target: V3, upHint: V3 = [0, 1, 0]): Camera {
  const forward = norm(sub(target, eye))
  const right = norm(cross(forward, upHint))
  const up = cross(right, forward)
  const view = new Float32Array([
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    -dot(right, eye), -dot(up, eye), dot(forward, eye), 1,
  ])
  return { eye, right, up, forward, view }
}
