// The launch field in three dimensions: a floodlit rocket on its pad at dusk, the climb, and the
// view from orbit, drawn with raw WebGL2 (no library), in the same spirit as the title's Mars.
//
// Everything here is an artist's impression: our own models of the three launch systems
// (scene/vehicles.ts) under a procedural sky and coast (scene/shaders.ts). None of it is NASA
// imagery or data, and the launch field says so.
//
// One canvas and one GL context live for the whole session and are re-attached each time the
// launch field is shown. Without WebGL2 the launch field keeps a plain gradient backdrop.
import { SHIPS, type ShipId } from '../core/data'
import { add, clamp, compose, cross, direction, lookAt, mix, mix3, mul, norm, perspective, point, rad, rotZ, scale, scaling, smooth, sub, translation, type M4, type V3 } from './scene/math'
import type { Mesh } from './scene/mesh'
import { FRAG_BACK, FRAG_FX, FRAG_MESH, VERT_FULL, VERT_FX, VERT_MESH } from './scene/shaders'
import { DECK, padModel, vehicleModel, type PadModel, type VehicleModel } from './scene/vehicles'

/** What the rocket is doing once it has left the pad. Distances are in metres at the scale the eye sees. */
export interface FlightView {
  /** Height of the stack's base above the pad deck, and how far east it has travelled. */
  alt: number
  range: number
  /** Tilt from vertical toward the east, radians. */
  pitch: number
  /** Engine output, 0 to 1. */
  thrust: number
  stage: 1 | 2
  /** Seconds since the first stage fell away, or -1 before that. */
  sinceStaging: number
  /** Air density, 1 at the pad and 0 in space: how much smoke and how tight the flame. */
  air: number
  /** Buffeting, 0 to 1. */
  shake: number
}
export interface SceneState {
  /** Seconds. */
  time: number
  ship: ShipId
  /** Pad lights down, 0 to 1: used to change rockets in the dark. */
  dim: number
  /** The arrival from orbit: 1 at the top, 0 on the pad. */
  descent: number
  /** 0 the pad camera, 1 the camera that follows the climb. */
  chase: number
  /** Pointer position, -1 to 1 each way, for a little parallax. */
  ptr: [number, number]
  /** Slides the picture up the window, in half-windows, to clear a bottom sheet. */
  shiftY: number
  /** Engines lit while still held down, 0 to 1. */
  ignite: number
  flight: FlightView | null
  /** After orbit is reached, 0 to 1: the camera eases back. */
  orbit: number
  /** Seconds since the stack broke up, or -1. */
  boom: number
}
export interface LaunchScene {
  canvas: HTMLCanvasElement
  /** Builds a ship's meshes ahead of the moment they are first drawn. */
  prepare(ship: ShipId): void
  draw(s: SceneState): void
  /** Frames a second lately, and pixels drawn per CSS pixel. */
  stats(): { fps: number; scale: number }
}

// ---- Fixed directions: the sun sits just under the western horizon; two lamp banks and the afterglow light the pad
const SUN: V3 = norm([-0.36, -0.055, -0.93])
const LAMP_A: V3 = norm([-0.86, 0.3, 0.42]), LAMP_B: V3 = norm([0.9, 0.16, 0.4]), RIM: V3 = norm([0.55, 0.18, -0.82])
const DAY_KEY: V3 = norm([-0.84, 0.24, 0.48]), DAY_FILL: V3 = norm([0.3, 0.9, 0.3]), EARTH_SHINE: V3 = norm([0.1, -0.95, 0.3])

interface Gpu { vao: WebGLVertexArrayObject; count: number; type: number }
interface Built { model: VehicleModel; pad: PadModel; core: Gpu; drops: Gpu[]; padMesh: Gpu }
interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; seed: number; hot: number; a: number }

const FX_FLOATS = 11 // position 3, uv 2, colour 4, kind 2
const MAX_QUADS = 620
const MAX_PUFFS = 240

let shared: LaunchScene | null | undefined

/** The session's launch scene, or null where WebGL2 is missing. */
export function launchScene(): LaunchScene | null {
  if (shared === undefined) {
    try { shared = build() } catch (e) { console.warn(`SPACER launch field: 3D scene disabled (${(e as Error).message}).`); shared = null }
  }
  return shared
}
/** Compiles the shaders and builds the meshes while the title is on screen, so the launch field opens without a hitch. */
export function warmLaunchScene() {
  const s = launchScene()
  if (!s) return
  SHIPS.forEach((ship, i) => setTimeout(() => s.prepare(ship.id), 400 + i * 350))
}

function build(): LaunchScene | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'lf-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  const got = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' })
  if (!got) return null
  const gl: WebGL2RenderingContext = got
  let dead = false
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = true; shared = null; canvas.remove() })

  // ---- programs
  const program = (vs: string, fs: string) => {
    const p = gl.createProgram()!
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`)
      gl.attachShader(p, sh)
    }
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`)
    const u: Record<string, WebGLUniformLocation | null> = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i)!.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name) }
    return { p, u }
  }
  const back = program(VERT_FULL, FRAG_BACK), meshP = program(VERT_MESH, FRAG_MESH), fx = program(VERT_FX, FRAG_FX)

  // ---- a tiling noise texture, seeded so every device draws the same coast and cloud
  const noise = (() => {
    const N = 256, data = new Uint8Array(N * N * 4)
    let seed = 0x2f6e2b1
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 }
    for (let ch = 0; ch < 4; ch++) {
      const field = new Float32Array(N * N)
      for (let oct = 0, cells = 4, amp = 0.5; oct < 6; oct++, cells *= 2, amp *= 0.5) {
        const lat = new Float32Array(cells * cells).map(rnd)
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const fx_ = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx_), y0 = Math.floor(fy)
          const tx = fx_ - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
          const at = (i: number, j: number) => lat[((j + cells) % cells) * cells + ((i + cells) % cells)]
          field[y * N + x] += amp * mix(mix(at(x0, y0), at(x0 + 1, y0), sx), mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy)
        }
      }
      for (let i = 0; i < N * N; i++) data[i * 4 + ch] = clamp((field[i] - 0.02) / 0.96) * 255
    }
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return t
  })()

  // ---- buffers
  const fullVao = gl.createVertexArray()!
  gl.bindVertexArray(fullVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const upload = (m: Mesh): Gpu => {
    const { geo, look, index, count } = m.pack()
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, look, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 8, 0)
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 8, 4)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW)
    return { vao, count, type: index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT }
  }
  const builds = new Map<ShipId, Built>()
  const built = (id: ShipId): Built => {
    let b = builds.get(id)
    if (!b) {
      const model = vehicleModel(id), pad = padModel(model)
      builds.set(id, b = { model, pad, core: upload(model.core), drops: model.drops.map(d => upload(d.mesh)), padMesh: upload(pad.mesh) })
      gl.bindVertexArray(null)
    }
    return b
  }

  const fxData = new Float32Array(MAX_QUADS * 6 * FX_FLOATS)
  const fxVao = gl.createVertexArray()!
  const fxBuf = gl.createBuffer()!
  gl.bindVertexArray(fxVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf)
  gl.bufferData(gl.ARRAY_BUFFER, fxData.byteLength, gl.DYNAMIC_DRAW)
  const stride = FX_FLOATS * 4
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12)
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20)
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36)
  gl.bindVertexArray(null)

  // ---- quads for the effects pass, rebuilt every frame
  let quads = 0
  const quad = (a: V3, b: V3, c: V3, d: V3, col: [number, number, number, number], kind: number, seed = 0) => {
    if (quads >= MAX_QUADS) return
    // a, b at v = 0 (left, right); d, c at v = 1
    const corners: [V3, number, number][] = [[a, 0, 0], [b, 1, 0], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 0, 1]]
    let o = quads++ * 6 * FX_FLOATS
    for (const [p, u, v] of corners) {
      fxData[o++] = p[0]; fxData[o++] = p[1]; fxData[o++] = p[2]; fxData[o++] = u; fxData[o++] = v
      fxData[o++] = col[0]; fxData[o++] = col[1]; fxData[o++] = col[2]; fxData[o++] = col[3]; fxData[o++] = kind; fxData[o++] = seed
    }
  }
  /** A square that faces the camera. */
  const sprite = (at: V3, size: number, right: V3, up: V3, col: [number, number, number, number], kind: number, seed = 0) => {
    const r = scale(right, size), u = scale(up, size)
    quad(sub(sub(at, r), u), sub(add(at, r), u), add(add(at, r), u), add(sub(at, r), u), col, kind, seed)
  }
  /** A strip from `from` to `to`, turned to face the camera, w0 wide at the start and w1 at the end. */
  const ribbon = (from: V3, to: V3, w0: number, w1: number, eye: V3, col: [number, number, number, number], kind: number, seed = 0) => {
    const axis = norm(sub(to, from))
    const side = norm(cross(axis, sub(eye, from)))
    quad(sub(from, scale(side, w0)), add(from, scale(side, w0)), add(to, scale(side, w1)), sub(to, scale(side, w1)), col, kind, seed)
  }

  // ---- smoke: positions are kept in the launch frame (east, up, south from the pad), so a trail stays where it was laid
  const puffs: Puff[] = []
  const puff = (p: Puff) => { if (puffs.length >= MAX_PUFFS) puffs.shift(); puffs.push(p) }
  let lastTime = -1, emitPad = 0, emitTrail = 0, emitVent = 0, emitMist = 0, blown = false

  // ---- lights out to the horizon: the crawler road, the yards round the far buildings, a town beyond
  // (placed once from a fixed seed, so the field looks the same on every device)
  const farLights: { at: V3; col: [number, number, number]; size: number; rate: number }[] = []
  {
    let seed = 0x51f3a7
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const warm: [number, number, number] = [1, 0.72, 0.4], cool: [number, number, number] = [0.72, 0.85, 1], white: [number, number, number] = [1, 0.95, 0.85]
    for (let i = 0; i < 13; i++) for (const z of [-17, 17]) farLights.push({ at: [-70 - i * 95, -DECK + 6, z], col: warm, size: 1.5 + i * 0.16, rate: 0 })
    for (let i = 0; i < 34; i++) {
      const a = -Math.PI * (0.08 + 0.84 * rnd()), dist = 700 + 5200 * rnd() ** 1.6
      farLights.push({ at: [Math.cos(a) * dist, -DECK + 4 + 26 * rnd() ** 3, Math.sin(a) * dist], col: rnd() < 0.5 ? warm : rnd() < 0.6 ? cool : white, size: 1.2 + dist * 0.0021, rate: rnd() < 0.3 ? 2 + 5 * rnd() : 0 })
    }
  }

  // ---- frame statistics and resolution
  let pxScale = Math.min(window.devicePixelRatio || 1, 2), slow = 0, frames = 0, fps = 60, lastFrame = 0

  function draw(s: SceneState) {
    if (dead) return
    const now = performance.now()
    if (lastFrame) {
      const ms = now - lastFrame
      if (ms < 250) {
        fps = fps * 0.94 + (1000 / ms) * 0.06
        if (++frames > 40) {
          slow = slow * 0.95 + (ms > 34 ? 0.05 : 0)
          if (slow > 0.5 && pxScale > 0.6) { pxScale = Math.max(0.6, pxScale * 0.78); slow = 0; frames = 0 }
        }
      }
    }
    lastFrame = now
    const cw = canvas.clientWidth, ch = canvas.clientHeight
    if (!cw || !ch) return
    const bw = Math.max(1, Math.round(cw * pxScale)), bh = Math.max(1, Math.round(ch * pxScale))
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh }
    const dt = lastTime < 0 ? 0 : clamp(s.time - lastTime, 0, 0.1)
    lastTime = s.time

    const b = built(s.ship), v = b.model
    const f = s.flight
    const alt = f?.alt ?? 0, range = f?.range ?? 0, air = f?.air ?? 1
    const aspect = bw / bh
    const narrow = aspect < 1

    // ---- camera: the pad view, the chase view, and the long fall from orbit, blended
    const H = v.height
    const padTarget: V3 = [0, v.centre * 0.96, 0]
    const az = 0.2 + 0.26 * Math.sin(s.time * 0.105) + s.ptr[0] * 0.12
    const padDist = H * (narrow ? 3.8 : 2.3)
    const padEyeY = -DECK + 2.4 + H * 0.05 - s.ptr[1] * H * 0.05
    const padEye: V3 = [Math.sin(az) * padDist, padEyeY, Math.cos(az) * padDist]
    const dipS = Math.sqrt(Math.max(0, 1 - (6371000 / (6371000 + alt + 1)) ** 2))
    const chaseDist = H * mix(narrow ? 4.0 : 2.9, narrow ? 4.8 : 3.4, smooth(0, 30000, alt)) * mix(1, 1.35, s.orbit)
    const lookDown = mix(-0.07, 0.24, smooth(0.01, 0.3, dipS)) + 0.04 * s.orbit
    const chaseTarget: V3 = [0, v.centre, 0]
    const chaseEye: V3 = [-0.2 * chaseDist, v.centre + chaseDist * Math.tan(lookDown), chaseDist]
    let eye = mix3(padEye, chaseEye, smooth(0, 1, s.chase)), target = mix3(padTarget, chaseTarget, smooth(0, 1, s.chase))
    let fov = rad(mix(narrow ? 40 : 31, narrow ? 44 : 35, s.chase))
    if (s.descent > 0) {
      // back out along a rising line from the pad: level at the pad, 20 degrees above it from orbit, where the limb crosses the middle of the frame
      const k = s.descent
      const dir0 = norm(sub(padEye, padTarget))
      const flat = norm([dir0[0], 0, dir0[2]])
      const elev = mix(Math.asin(dir0[1]), 0.36, smooth(0, 1, k))
      const dir: V3 = [flat[0] * Math.cos(elev), Math.sin(elev), flat[2] * Math.cos(elev)]
      const dist = padDist * Math.exp(k * Math.log(900000 / padDist))
      eye = add(padTarget, scale(dir, dist))
      target = padTarget
    }
    const shake = f ? f.shake : s.ignite * 0.35
    if (shake > 0) {
      const j = (n: number) => Math.sin(s.time * (61 + n * 17) + n * 2.1) * Math.sin(s.time * (37 + n * 11))
      target = add(target, [j(1) * shake * 0.6, j(2) * shake * 0.6, 0])
    }
    const cam = lookAt(eye, target)
    const eyeDist = Math.hypot(...sub(eye, target))
    const near = Math.max(1.5, eyeDist * 0.01), far = eyeDist * 3 + 9000
    const proj = perspective(fov, aspect, near, far, s.shiftY)
    const viewProj = mul(proj, cam.view)
    const eyeH = eye[1] + DECK + alt

    // ---- lights: lamps on the pad, the sun once the rocket has climbed into it
    const lit = 1 - s.dim
    const flood = lit * (1 - smooth(80, 700, alt)) * (1 - smooth(0.25, 0.9, s.descent) * 0.5)
    const sunK = smooth(1500, 16000, alt)
    const lightDir = [norm(mix3(LAMP_A, DAY_KEY, sunK)), norm(mix3(LAMP_B, DAY_FILL, sunK)), norm(mix3(RIM, EARTH_SHINE, sunK))]
    const lightCol: V3[] = [
      add(add(scale([1.0, 0.96, 0.88], 2.75 * flood), scale([1.0, 0.9, 0.76], 1.9 * sunK)), scale([0.62, 0.72, 0.95], 0.5 * lit * (1 - flood) * (1 - sunK))),
      add(scale([1.0, 0.74, 0.5], 0.11 * flood), scale([0.35, 0.5, 0.8], 0.2 * sunK)),
      add(scale([0.36, 0.52, 1.0], 1.25 * lit * (1 - sunK)), scale([0.3, 0.45, 0.75], 0.26 * sunK * (1 - air))),
    ]
    const ambSky: V3 = scale([0.010, 0.016, 0.03], 0.5 + 0.5 * lit)
    const ambGround: V3 = add(scale([0.022, 0.02, 0.017], flood), [0.003, 0.004, 0.006])
    const exposure = 1.2 * (1 - 0.82 * s.dim)

    // ---- where the stack is
    const pitch = f?.pitch ?? 0
    const model = compose(translation([0, v.centre, 0]), rotZ(-pitch), translation([0, -v.centre, 0]))
    const stage = f?.stage ?? 1
    const thrust = f ? f.thrust : s.ignite
    const firing = v.engines.filter(e => e.stages.includes(stage))
    // the engine light the ground and the hull see: the brightest burning engine
    const fireAt = firing.length ? point(model, firing[0].at) : [0, 0, 0] as V3
    const fireK = thrust * (firing.some(e => e.kind === 'solid') ? 1.25 : firing.some(e => e.kind === 'kerosene') ? 0.9 : 0.4)

    gl.viewport(0, 0, bw, bh)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // ---- 1. sky and ground
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false)
    gl.useProgram(back.p)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noise)
    gl.uniform1i(back.u.uNoise, 0)
    gl.uniform2f(back.u.uRes, bw, bh)
    gl.uniform1f(back.u.uTime, s.time)
    gl.uniform1f(back.u.uPx, pxScale)
    gl.uniform3fv(back.u.uCamR, cam.right); gl.uniform3fv(back.u.uCamU, cam.up); gl.uniform3fv(back.u.uCamF, cam.forward)
    gl.uniform2f(back.u.uLens, Math.tan(fov / 2), aspect)
    gl.uniform1f(back.u.uShiftY, s.shiftY)
    gl.uniform1f(back.u.uEyeH, eyeH)
    gl.uniform2f(back.u.uEyeXZ, eye[0] + range, eye[2])
    gl.uniform3fv(back.u.uSun, SUN)
    gl.uniform1f(back.u.uFlood, lit * (1 - smooth(20000, 120000, eyeH)))
    gl.uniform3fv(back.u.uLightA, LAMP_A); gl.uniform3fv(back.u.uLightB, LAMP_B)
    gl.uniform4f(back.u.uStack, DECK + H, v.girth, DECK, 1 - smooth(0, 160, alt))
    gl.uniform4f(back.u.uFire, range + fireAt[0], fireAt[1] + DECK + alt, fireAt[2], fireK * (1 - smooth(300, 2500, alt)))
    gl.uniform1f(back.u.uExposure, exposure)
    gl.uniform1f(back.u.uPixel, (2 * Math.tan(fov / 2)) / bh)
    gl.bindVertexArray(fullVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // ---- 2. pad and rocket
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.CULL_FACE)
    gl.useProgram(meshP.p)
    gl.uniformMatrix4fv(meshP.u.uViewProj, false, viewProj)
    gl.uniform3fv(meshP.u.uEye, eye)
    gl.uniform1f(meshP.u.uEyeH, eyeH)
    gl.uniform3fv(meshP.u.uSun, SUN)
    gl.uniform3fv(meshP.u.uLightDir, lightDir.flat())
    gl.uniform3fv(meshP.u.uLightCol, lightCol.flat())
    gl.uniform3fv(meshP.u.uAmbSky, ambSky); gl.uniform3fv(meshP.u.uAmbGround, ambGround)
    gl.uniform4f(meshP.u.uFire, fireAt[0], fireAt[1], fireAt[2], fireK)
    gl.uniform3f(meshP.u.uFogCol, 0.03, 0.045, 0.07)
    gl.uniform1f(meshP.u.uFog, 0.00045 * air)
    gl.uniform1f(meshP.u.uExposure, exposure)
    gl.uniform1f(meshP.u.uTime, s.time % 64)
    gl.uniform2f(meshP.u.uLampFade, H * 1.25, flood)
    gl.uniform2f(meshP.u.uPadXZ, -range, 0)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noise)
    gl.uniform1i(meshP.u.uNoise, 0)
    const drawMesh = (g: Gpu, m: M4) => { gl.uniformMatrix4fv(meshP.u.uModel, false, m); gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, g.count, g.type, 0) }
    const padAt = translation([-range, -alt, 0])
    const gone = s.boom > 0.1
    // the hard-stand is wet: the pad and the stack, upside down in it
    const groundY = -DECK - alt
    const sheen = 0.62 * lit * (1 - smooth(120, 700, alt)) * (1 - smooth(0.1, 0.5, s.descent))
    if (sheen > 0.01) {
      const flip = compose(translation([0, groundY, 0]), scaling([1, -1, 1]), translation([0, -groundY, 0]))
      gl.uniform2f(meshP.u.uMirror, sheen, groundY)
      gl.uniform3fv(meshP.u.uLightDir, lightDir.flatMap(d => [d[0], -d[1], d[2]]))
      gl.frontFace(gl.CW); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      drawMesh(b.padMesh, mul(flip, padAt))
      if (!gone) { drawMesh(b.core, mul(flip, model)); if ((f?.sinceStaging ?? -1) < 0) b.drops.forEach(g => drawMesh(g, mul(flip, model))) }
      gl.frontFace(gl.CCW); gl.disable(gl.BLEND); gl.clear(gl.DEPTH_BUFFER_BIT)
      gl.uniform3fv(meshP.u.uLightDir, lightDir.flat())
    }
    gl.uniform2f(meshP.u.uMirror, 0, groundY)
    if (alt < 4000 && s.descent < 0.86) drawMesh(b.padMesh, padAt)
    if (s.descent < 0.8 && !gone) {
      drawMesh(b.core, model)
      const since = f?.sinceStaging ?? -1
      b.drops.forEach((g, i) => {
        if (since < 0) return drawMesh(g, model)
        if (since > 9) return
        // the spent stage falls behind and tumbles slowly
        const away = v.drops[i].away
        const slide = scale(norm(away), 5 * since + 9 * since * since)
        drawMesh(g, compose(model, translation(slide), translation([0, v.centre * 0.6, 0]), rotZ(since * 0.22 * (away[0] >= 0 ? -1 : 1)), translation([0, -v.centre * 0.6, 0])))
      })
    }

    // ---- 3. flames, glows and smoke
    quads = 0
    const axis = norm(direction(model, [0, 1, 0]))
    // the stack breaking up: one burst of smoke, thrown outward
    if (s.boom >= 0 && !blown) {
      blown = true
      for (let i = 0; i < 54; i++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 2, sp = 14 + Math.random() * 70
        puff({ x: range + (Math.random() - 0.5) * 8, y: alt + v.centre + (Math.random() - 0.5) * v.height * 0.6, z: (Math.random() - 0.5) * 8, vx: Math.cos(a) * sp, vy: e * sp * 0.6, vz: Math.sin(a) * sp * 0.5, age: 0, life: 3.4 + Math.random() * 3, size: 7 + Math.random() * 10, grow: 9 + Math.random() * 10, seed: Math.random(), hot: 1.4, a: 0.75 })
      }
    }
    if (s.boom < 0) blown = false
    // smoke first, so light adds on top of it
    if (dt > 0) {
      const solid = firing.some(e => e.kind === 'solid')
      if (thrust > 0.05 && alt < 260) {
        // exhaust rolling out both ways along the flame trench
        emitPad += dt * 46 * thrust
        while (emitPad > 1) {
          emitPad--
          const side = Math.random() < 0.5 ? -1 : 1, sp = 16 + Math.random() * 34
          puff({ x: range + side * 4, y: -DECK + 1.5 - alt * 0 + Math.random() * 2, z: (Math.random() - 0.5) * 10, vx: side * sp, vy: 1.5 + Math.random() * 5, vz: (Math.random() - 0.5) * 9, age: 0, life: 5 + Math.random() * 4, size: 5 + Math.random() * 5, grow: 5 + Math.random() * 5, seed: Math.random(), hot: 1, a: 0.5 })
        }
      }
      if (f && thrust > 0.05 && air > 0.02 && alt > 25) {
        emitTrail += dt * (solid ? 34 : 20)
        while (emitTrail > 1) {
          emitTrail--
          const e = firing[Math.floor(Math.random() * firing.length)], at = point(model, e.at)
          puff({ x: range + at[0] - axis[0] * 14, y: alt + at[1] - axis[1] * 14, z: at[2], vx: -axis[0] * 12 + (Math.random() - 0.5) * 4, vy: -axis[1] * 12 + (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4, age: 0, life: 2.6 + Math.random() * 1.8, size: e.r * 2.2, grow: 7 + Math.random() * 5, seed: Math.random(), hot: 0.6, a: (solid ? 0.5 : 0.3) * Math.sqrt(air) })
        }
      }
      if (alt < 3 && s.descent < 0.2 && lit > 0.5 && !gone) {
        // cold propellant boiling off: thin white vapour sliding down the side of the stack
        emitVent += dt * (thrust > 0.05 ? 2 : 7)
        while (emitVent > 1) {
          emitVent--
          const up = v.height * (Math.random() < 0.6 ? 0.52 + Math.random() * 0.08 : 0.74 + Math.random() * 0.06)
          puff({ x: v.girth * 0.55, y: up, z: v.girth * 0.3, vx: 2.2 + Math.random() * 2.2, vy: -1.6 - Math.random() * 1.4, vz: 0.4 + Math.random(), age: 0, life: 2.2 + Math.random() * 1.6, size: 0.9 + Math.random() * 0.7, grow: 1.5 + Math.random() * 1.2, seed: Math.random(), hot: 0, a: 0.34 })
        }
        emitMist += dt * 1.6
        while (emitMist > 1) {
          emitMist--
          const a = Math.random() * Math.PI * 2, r = 34 + Math.random() * 90
          puff({ x: Math.cos(a) * r, y: -DECK + 1.5 + Math.random() * 3, z: Math.sin(a) * r * 0.7, vx: 1.2 + Math.random() * 1.6, vy: 0.05, vz: 0.3, age: 0, life: 9 + Math.random() * 7, size: 14 + Math.random() * 16, grow: 1.4, seed: Math.random(), hot: 0, a: 0.055 })
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]
        p.age += dt
        if (p.age > p.life) { puffs.splice(i, 1); continue }
        const drag = Math.exp(-dt * 0.55)
        p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + dt * 0.9
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
        p.size += p.grow * dt
      }
    }
    for (const p of puffs) {
      const k = p.age / p.life
      const fade = Math.min(1, p.age * 2.2) * (1 - k) ** 1.2
      const glowK = p.hot * Math.exp(-p.age * 1.1) * Math.max(thrust, s.boom >= 0 ? 1 : 0)
      const tone = 0.16 + 0.5 * flood + 0.55 * sunK
      const col: [number, number, number, number] = [tone * 0.92 + glowK * 1.5, tone * 0.96 + glowK * 0.72, tone * 1.02 + glowK * 0.26, p.a * fade]
      sprite([p.x - range, p.y - alt, p.z], p.size, cam.right, cam.up, col, 2, p.seed)
    }
    // lamp glows and shafts, beacons
    if (alt < 4000 && s.descent < 0.86) {
      const blink = 0.5 + 0.5 * Math.sin(s.time * 3.1)
      for (const l of b.pad.lamps) {
        const at = add(l, [-range, -alt, 0])
        const facing = l[2] < 0 ? 1 : 0.16 // lamps beyond the stack face the camera; the near ones show their backs
        sprite(at, 9, cam.right, cam.up, [0.8, 0.88, 1, 0.5 * lit * facing], 0)
        sprite(at, 2.0, cam.right, cam.up, [1, 1, 1, 1.0 * lit * facing], 0)
        if (alt < 60) {
          const under: V3 = [at[0], 2 * (-DECK - alt) - at[1], at[2]]
          const r = scale(cam.right, 3.2), u: V3 = [0, 13, 0]
          quad(sub(sub(under, r), u), sub(add(under, r), u), add(add(under, r), u), add(sub(under, r), u), [0.8, 0.88, 1, 0.22 * lit * facing], 0)
        }
        const aim: V3 = [-range, v.centre * 1.15 - alt, 0]
        const beyond = add(at, scale(sub(aim, at), 2.2))
        ribbon(at, beyond, 1.4, 22, eye, [0.72, 0.82, 1, 0.055 * flood], 3)
        ribbon(at, aim, 0.9, 6, eye, [0.85, 0.92, 1, 0.05 * flood], 3)
      }
      for (const l of farLights) {
        const tw = l.rate ? 0.75 + 0.25 * Math.sin(s.time * l.rate + l.at[0]) : 1
        sprite(add(l.at, [-range, -alt, 0]), l.size * 2.6, cam.right, cam.up, [l.col[0], l.col[1], l.col[2], 0.55 * tw * (0.35 + 0.65 * lit)], 0)
        sprite(add(l.at, [-range, -alt, 0]), l.size * 0.8, cam.right, cam.up, [1, 0.97, 0.92, 0.9 * tw * (0.35 + 0.65 * lit)], 0)
      }
      for (const bc of b.pad.beacons) sprite(add(bc, [-range, -alt, 0]), 4.2, cam.right, cam.up, [1, 0.16, 0.1, (0.25 + 0.75 * blink) * (0.4 + 0.6 * lit)], 0)
    }
    if (s.boom >= 0) {
      const t = s.boom, at: V3 = [0, v.centre, 0]
      sprite(at, (50 + 420 * t) * Math.exp(-t * 0.9), cam.right, cam.up, [1, 0.72, 0.36, 1.5 * Math.exp(-t * 2.2)], 0)
      sprite(at, 90 * Math.exp(-t * 5), cam.right, cam.up, [1, 0.97, 0.9, 2.2 * Math.exp(-t * 6)], 0)
    }
    // exhaust
    if (thrust > 0.01 && !gone) {
      const wide = 1 - air
      for (const e of firing) {
        const at = point(model, e.at)
        const kero = e.kind === 'kerosene', sol = e.kind === 'solid'
        const col: [number, number, number, number] = sol ? [1, 0.8, 0.5, 1] : kero ? [1, 0.58, 0.24, 0.95] : [0.5, 0.68, 1, 0.5]
        const flick = 0.92 + 0.08 * Math.sin(s.time * 47 + e.at[0])
        const length = e.r * (sol ? 15 : kero ? 11 : 8) * thrust * flick * mix(1, 1.7, wide)
        const w0 = e.r * 1.05, w1 = e.r * mix(sol ? 2.2 : 1.7, 7, wide)
        col[3] *= mix(1, 0.4, wide) * Math.min(1, thrust * 1.6)
        ribbon(at, sub(at, scale(axis, length)), w0, w1, eye, col, 1, e.at[0] * 0.13 + 0.2)
        sprite(sub(at, scale(axis, e.r * 0.6)), e.r * mix(5.5, 9, wide), cam.right, cam.up, [col[0], col[1] * 0.9, col[2] * 0.8, 0.55 * thrust * mix(1, 0.35, wide)], 0)
      }
    }
    if (quads) {
      gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(fx.p)
      gl.uniformMatrix4fv(fx.u.uViewProj, false, viewProj)
      gl.uniform1f(fx.u.uTime, s.time % 512)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noise)
      gl.uniform1i(fx.u.uNoise, 0)
      gl.bindVertexArray(fxVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, fxData.subarray(0, quads * 6 * FX_FLOATS))
      gl.drawArrays(gl.TRIANGLES, 0, quads * 6)
      gl.disable(gl.BLEND); gl.depthMask(true)
    }
    gl.bindVertexArray(null)
  }

  return {
    canvas,
    prepare: id => { if (!dead) built(id) },
    draw,
    stats: () => ({ fps, scale: pxScale }),
  }
}
