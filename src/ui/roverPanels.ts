// Left-hand viewer on the rover screen. Before a rover is chosen it is the "choose your rover"
// page (a real selfie of each, pros and cons, and a look at its parts). After that it has three
// tabs: the map with the rover's camera and photo album, the album, and the "what each part
// does" picture.
import type { Mission } from '../core/mission'
import { ROVERS, type Anchor, type Part, type Photo, type RoverId, type RoverSpec } from '../core/rovers'
import {
  DRIVE_FILMS, PHOTO_BONUS_EACH, PHOTO_BONUS_MAX, PHOTO_RANGE_M, STOP_RANGE_M, dist, photoPlaces, placeNear, region, roverTraits,
  type ActionKind, type Pt,
} from '../core/survey'
import { $, $$, el, esc, reducedMotion } from './dom'
import { MAP_PX, MAX_ZOOM, RAMP, background, mapSvg, newView, pointAt, readout, scaleBar, setZoom, terrain, viewBox, type MapMode, type MapOpts, type MapView } from './mapView'

export type ViewTab = 'map' | 'photos' | 'parts'

export interface ViewerHooks {
  /** The player may tap the map to place points. */
  planning: boolean
  driving: boolean
  /** A drive being played back, if any. */
  anim: MapOpts['anim']
  /** Where the rover is right now (follows the playback). */
  pos: Pt
  addPoint: (p: Pt) => void
  pickSpot: (id: number) => void
  chooseRover: (id: RoverId) => void
  back: () => void
  /** Photo spots the drive being played will pass but has not reached yet: not shown as found until it gets there. */
  pending: number[]
}

export interface ViewerState {
  tab: ViewTab
  part: string | null
  /** Parts to highlight on the picture, and the job they belong to (from a job's "?" button). */
  highlight: string[]
  highlightJob: ActionKind | null
  feedIdx: number
  /** Spot whose details are showing in the side panel. */
  focus: number | null
  live: { status: 'idle' | 'loading' | 'ok' | 'error'; items: LivePhoto[]; error: string }
  /** Before a rover is chosen: the rover whose parts are open, and the one waiting for a "yes". */
  peek: RoverId | null
  pick: RoverId | null
  /** Zoom, position and picture of the map. */
  view: MapView
  /** A drag just moved the map, so the click that ends it must not place a point. */
  dragged: boolean
  /** Where the drive film carries on from (seconds of a video, frame of a GIF), so each drive shows a different part. */
  filmAt: number
}
export const newViewer = (): ViewerState => ({
  tab: 'map', part: null, highlight: [], highlightJob: null, feedIdx: 0, focus: null, live: { status: 'idle', items: [], error: '' },
  peek: null, pick: null, view: newView(), dragged: false, filmAt: 0,
})

interface LivePhoto { url: string; camera: string; sol: number; taken: string; credit: string; title: string }
const JOB_NAME: Record<ActionKind, string> = { drive: 'Drive', photo: 'Photograph', weather: 'Weather', radiation: 'Radiation', drill: 'Drill' }
const src = (file: string) => `${import.meta.env.BASE_URL}${file}`

// ---------------------------------------------------------------- Choose your rover
function rvCardHtml(r: RoverSpec, v: ViewerState) {
  const t = roverTraits(r), s = r.selfie
  const li = (x: { title: string; text: string }) => `<li><b>${esc(x.title)}:</b> ${esc(x.text)}.</li>`
  return `<article class="rvcard ${v.pick === r.id ? 'picking' : ''}">
    <div class="rvpic" style="--fx:${r.selfieFocus[0]}%;--fy:${r.selfieFocus[1]}%"><img src="${src(s.file)}" alt="Real selfie of the ${esc(r.name)} rover on Mars"/><span class="tag">Real selfie · ${esc(s.date.slice(0, 4))}</span></div>
    <div class="rvbody">
      <div class="rvname"><h3>${esc(r.name)}</h3><span class="badge ${t.easier ? 'easy' : 'hard'}">${t.easier ? 'Easier' : 'Harder'}</span></div>
      <p class="rvsub">${esc(region(r.region).name)} · on Mars since ${esc(r.landed.slice(0, 4))}</p>
      <div class="rvstats">${t.stats.map(x => `<div><small>${esc(x.label)}</small><b>${esc(x.value)}</b></div>`).join('')}</div>
      <div class="pc pros"><h4>Good</h4><ul>${t.pros.map(li).join('')}</ul></div>
      <div class="pc cons"><h4>Not so good</h4><ul>${t.cons.map(li).join('')}</ul></div>
      ${v.pick === r.id
        ? `<div class="reason"><b>Take ${esc(r.name)}?</b> It is your rover for the whole mission. You cannot switch later.</div>
           <div class="rvbtns"><button class="btn" data-nopick>No, go back</button><button class="btn primary" data-confirm="${r.id}">Yes, take ${esc(r.name)}</button></div>`
        : `<div class="rvbtns"><button class="btn" data-peek="${r.id}">See its parts</button><button class="btn primary" data-pick="${r.id}">Choose ${esc(r.name)}</button></div>`}
      <p class="cam-credit">Photo: “${esc(s.title)}”, ${esc(s.credit)} · <a href="${esc(s.page)}" target="_blank" rel="noopener">NASA page</a></p>
    </div></article>`
}

function choiceHtml(v: ViewerState) {
  return `<div class="choose">
    <div class="choose-h"><div><h2>Choose your rover</h2><p>You get <b>one rover for the whole mission</b>, so choose with care. Both are real NASA rovers, each in its own crater on Mars.</p></div><button class="btn small" data-back>← Station</button></div>
    <div class="rvcards">${(['perseverance', 'curiosity'] as const).map(id => rvCardHtml(ROVERS[id], v)).join('')}</div>
    <details class="about"><summary>ⓘ Where these numbers come from</summary>
      <p><b>Real NASA facts:</b> each rover's weight, battery, nuclear power source, where it is parked today and how tilted it is there, the bumps in its crater seen from orbit, and which instruments it carries.</p>
      <p><b>Worked out by the game from those facts:</b> the power its source makes today, how far it drives on one charge, and how long a recharge takes. The photo spots are places where the real rover took the photos saved in this game.</p></details>
  </div>`
}

function peekHtml(r: RoverSpec, v: ViewerState) {
  return `<div class="choose">
    <div class="choose-h"><div><h2>${esc(r.name)}: what each part does</h2><p>Tap a dot on the rover to learn about that part.</p></div>
      <div class="rvbtns"><button class="btn" data-unpeek>← Both rovers</button><button class="btn primary" data-pick="${r.id}">Choose ${esc(r.name)}</button></div></div>
    ${partsBodyHtml(r, v)}</div>`
}

// ---------------------------------------------------------------- Rover camera
/** Real photos from the `places` photographed stops nearest to a map position. */
export function nearPhotos(rv: RoverSpec, pos: Pt, places: number): Photo[] {
  return [...photoPlaces(rv)].sort((a, b) => dist(a, pos) - dist(b, pos)).slice(0, places).flatMap(p => p.photos)
}

/** The last picture of the most recent drive, kept with the mission so it is still there after a trip to the station. */
const lastFrame = (m: Mission) => (m.drafts.roverCam as { url: string } | undefined)?.url ?? null

type Parked = { kind: 'here' | 'near'; photo: Photo; more: boolean; distM: number } | { kind: 'frame'; url: string }
/**
 * What the camera shows while the rover is parked. Once the rover has driven: always the last
 * picture of its latest drive, even at a real photo spot (that spot's NASA photo is saved in My
 * photos). Before the first drive: the photo NASA's rover took where it starts. Only when there is
 * neither (a film this browser cannot freeze) does it fall back to the nearest real photo.
 */
function parked(m: Mission, rv: RoverSpec, v: ViewerState, pos: Pt): Parked {
  const url = lastFrame(m)
  if (url) return { kind: 'frame', url }
  const here = placeNear(rv, pos)
  if (here) { const list = here.place.photos; return { kind: 'here', photo: list[v.feedIdx % list.length], more: list.length > 1, distM: here.distM } }
  const list = nearPhotos(rv, pos, 1)
  const photo = list[v.feedIdx % list.length]
  return { kind: 'near', photo, more: list.length > 1, distM: dist(photo, pos) }
}

/** Identifies what the camera screen is showing, so it is only redrawn when that changes (a playing film is left alone). */
function feedKey(m: Mission, rv: RoverSpec, v: ViewerState, pos: Pt, driving: boolean) {
  if (driving) return 'film'
  const p = parked(m, rv, v, pos)
  return p.kind === 'frame' ? `frame:${p.url.length}:${p.url.slice(-24)}` : `photo:${p.photo.imageId}`
}

/** The camera picture: a real drive film behind a "signal from Mars" look while driving; parked, a real photo or the last picture of the drive. */
function screenHtml(m: Mission, rv: RoverSpec, v: ViewerState, pos: Pt, driving: boolean) {
  const film = DRIVE_FILMS.find(x => x.rover === rv.id)
  if (driving && film) {
    // A video plays itself. A GIF is decoded and drawn on a canvas by the game, so it can be stopped on a picture.
    const media = film.kind === 'video'
      ? `<video class="media" id="film" src="${src(film.file)}" autoplay muted loop playsinline></video>`
      : `<canvas class="media" id="filmc" width="256" height="256" data-src="${src(film.file)}" role="img" aria-label="${esc(film.title)}"></canvas>`
    return `<div class="fxwrap live">${media}<canvas class="fx-noise" width="160" height="120"></canvas><i class="fx-lines"></i><i class="fx-bar"></i>
      <div class="camhud" aria-hidden="true"><span class="ch-tl"><i class="rec on"></i>ROVER CAM</span><span class="ch-tr">SIGNAL DELAY ${m.signalMin} MIN</span><span class="ch-bl" id="hud-d">0 m</span><span class="ch-br">DAY ${m.sol}</span></div>
      <i class="fx-flash" id="fx-flash"></i></div>`
  }
  const p = parked(m, rv, v, pos)
  if (p.kind === 'frame') return `<div class="fxwrap"><img class="media" src="${p.url}" alt="The last picture from the rover's camera on this drive"/><i class="fx-lines"></i><span class="cam-stamp">Last picture of the drive</span><i class="fx-flash" id="fx-flash"></i></div>`
  return `<div class="fxwrap"><img class="media" src="${src(p.photo.file)}" alt="${esc(p.photo.cameraName)} raw image from ${esc(rv.name)}, sol ${p.photo.sol}"/><i class="fx-flash" id="fx-flash"></i></div>`
}

function capHtml(m: Mission, rv: RoverSpec, v: ViewerState, pos: Pt, driving: boolean) {
  const film = DRIVE_FILMS.find(x => x.rover === rv.id)
  if (driving && film) return `<p class="cam-cap">${esc(film.note)}</p>
    <p class="cam-credit">A real drive, not your exact path. The fuzz and the labels are added by the game · ${esc(film.credit)} · <a href="${esc(film.page)}" target="_blank" rel="noopener">NASA page</a></p>`
  const p = parked(m, rv, v, pos)
  if (p.kind === 'frame') return `<p class="cam-cap">The last picture from the drive. ${placeNear(rv, pos) ? `The real ${esc(rv.name)}'s photo of this spot is saved in My photos.` : `The real ${esc(rv.name)} took no photo within ${PHOTO_RANGE_M} m of this spot, so the camera keeps what it saw last.`}</p>
    <p class="cam-credit">A picture from the real drive film, which was not filmed at this spot${film ? ` · ${esc(film.credit)}` : ''}</p>`
  const d = Math.round(p.distM)
  return `<p class="cam-cap">${d < 20 ? `${esc(rv.name)} took this right here` : `${esc(rv.name)} took this ${d} m from here`}, on sol ${p.photo.sol}, with its ${esc(p.photo.cameraName.replace(/ \(left\)/i, ''))}.${p.kind === 'near' ? ' It is the nearest real photo: this browser could not keep the last picture of the drive.' : ''}</p>
    <p class="cam-credit">${esc(p.photo.credit)} · raw, unprocessed</p>
    ${p.more ? '<button class="btn small" data-feednext>Next photo ›</button>' : ''}`
}

function tagHtml(m: Mission, rv: RoverSpec, v: ViewerState, pos: Pt, driving: boolean) {
  if (driving) return '<span class="tag live"><i></i>Real drive film</span>'
  return parked(m, rv, v, pos).kind === 'frame' ? '<span class="tag still">Last picture</span>' : '<span class="tag">Real photo</span>'
}

/** Photo places to show as found: the album, minus those the drive being played has not reached yet. */
const shownPhotos = (m: Mission, h: ViewerHooks) => m.photos.filter(id => !h.pending.includes(id))

/** The strip of real photos saved so far. The rover saves them by itself; there is nothing to press. */
function albumStripHtml(m: Mission, rv: RoverSpec, h: ViewerHooks) {
  const places = photoPlaces(rv)
  const found = shownPhotos(m, h).map(id => places.find(p => p.id === id)!)
  const bonus = Math.min(PHOTO_BONUS_MAX, found.length * PHOTO_BONUS_EACH)
  return `<div class="album-h"><b>My photos</b><span>${found.length} of ${places.length} spots${bonus ? ` · <em>+${bonus} score${bonus >= PHOTO_BONUS_MAX ? ' (max)' : ''}</em>` : ''}</span></div>
    <div class="album">${found.map(pl => `<button class="thumb" data-album="${pl.id}" aria-label="Open your photo from sol ${pl.sol}" title="Open this photo"><img src="${src(pl.photos[0].file)}" alt=""/></button>`).join('')}${found.length < places.length ? '<span class="thumb empty" title="More photo spots are waiting on the map">?</span>' : ''}</div>
    <p class="album-tip">The rover saves a real NASA photo by itself when it drives through the ring of a camera mark or parks inside one. Each spot adds +${PHOTO_BONUS_EACH} to your score.</p>`
}

/** A white flash on the camera screen when a photo is saved. */
let flashTimer = 0
export function flash(root: HTMLElement) {
  const f = $('#fx-flash', root)
  if (!f) return
  f.classList.remove('go')
  void f.offsetWidth
  f.classList.add('go')
  // Take the class off again by timer, so the screen can never stay white if the animation does not run.
  clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => f.classList.remove('go'), 480)
}

// A GIF drive film, decoded once into its pictures so the game can play it and stop on any of them.
interface GifDecoder { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }; decode(o: { frameIndex: number }): Promise<{ image: CanvasImageSource & { close(): void } }> }
const gifCache = new Map<string, Promise<ImageBitmap[] | null>>()
function gifFrames(url: string): Promise<ImageBitmap[] | null> {
  let p = gifCache.get(url)
  if (!p) {
    p = (async () => {
      const Decoder = (globalThis as unknown as { ImageDecoder?: new (init: { data: ReadableStream<Uint8Array>; type: string }) => GifDecoder }).ImageDecoder
      if (!Decoder) return null
      try {
        const res = await fetch(url)
        if (!res.ok || !res.body) return null
        const dec = new Decoder({ data: res.body, type: 'image/gif' })
        await dec.tracks.ready
        const n = dec.tracks.selectedTrack?.frameCount ?? 0
        const out: ImageBitmap[] = []
        for (let i = 0; i < n; i++) { const { image } = await dec.decode({ frameIndex: i }); out.push(await createImageBitmap(image)); image.close() }
        return out
      } catch { return null }
    })()
    gifCache.set(url, p)
  }
  return p
}

/** The picture the drive film is showing right now, as a JPEG the game can keep. Null if it cannot be read. */
export function captureFrame(root: HTMLElement): string | null {
  try {
    const video = $<HTMLVideoElement>('#film', root)
    const gif = $<HTMLCanvasElement>('#filmc', root)
    const c = document.createElement('canvas')
    if (video && video.videoWidth && video.readyState >= 2) {
      c.width = 640
      c.height = Math.round((640 * video.videoHeight) / video.videoWidth)
      c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
    } else if (gif && gif.dataset.ready === '1') {
      c.width = gif.width * 2
      c.height = gif.height * 2
      c.getContext('2d')!.drawImage(gif, 0, 0, c.width, c.height)
    } else return null
    return c.toDataURL('image/jpeg', 0.82)
  } catch { return null }
}

// The "signal from Mars" look: moving grain over the film, with a short stronger burst now and then.
let fxTimer = 0
function startFx(screen: HTMLElement) {
  clearInterval(fxTimer)
  const c = $<HTMLCanvasElement>('canvas.fx-noise', screen)
  if (!c) return
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  const img = ctx.createImageData(W, H)
  let burstUntil = 0, nextBurst = performance.now() + 1500 + Math.random() * 2500
  const draw = () => {
    if (!c.isConnected) { clearInterval(fxTimer); return }
    const now = performance.now()
    if (now > nextBurst) { burstUntil = now + 140 + Math.random() * 240; nextBurst = now + 2200 + Math.random() * 4500 }
    const burst = now < burstUntil
    screen.classList.toggle('burst', burst)
    const band = burst ? Math.floor(Math.random() * H) : -99
    const d = img.data
    for (let y = 0; y < H; y++) {
      const tear = Math.abs(y - band) < 8
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        d[o] = d[o + 1] = d[o + 2] = Math.random() * 255
        d[o + 3] = tear ? 160 : burst ? 70 : 18 + Math.random() * 22
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  draw()
  if (!reducedMotion()) fxTimer = window.setInterval(draw, 66)
}

// ---------------------------------------------------------------- Map
const mapHint = (h: ViewerHooks) => h.driving ? 'The rover is driving. It saves a real photo by itself when it passes a camera mark.' : h.planning ? 'Tap the map to place points for the rover' : 'Tap a lettered spot to see its result'

function mapUiHtml(rv: RoverSpec, view: MapView) {
  const sb = scaleBar(rv, view)
  const t = view.mode === 'height' ? terrain(rv) : null
  return `<div class="mu-n" aria-hidden="true"><i></i>N</div>
    <div class="mu-scale"><i style="width:${sb.percent.toFixed(2)}%"></i><span>${sb.metres >= 1000 ? `${sb.metres / 1000} km` : `${sb.metres} m`}</span></div>
    ${t ? `<div class="mu-note"><span>${t.min} m</span><i style="background:linear-gradient(90deg,${RAMP.map(c => `rgb(${c.join(',')})`).join(',')})"></i><span>${t.max} m high</span></div>` : ''}`
}

const mapOpts = (m: Mission, rv: RoverSpec, v: ViewerState, h: ViewerHooks): MapOpts => ({
  planning: h.planning, anim: h.anim, reports: m.reports(), focus: v.focus, view: v.view, found: shownPhotos(m, h),
  inRange: m.base ? null : placeNear(rv, h.pos)?.place.id ?? null,
})

/** Moves the picture and the drawing on top of it to match the zoom and position. */
export function applyView(root: HTMLElement, view: MapView) {
  const vb = viewBox(view)
  const layer = $('#maplayer', root)
  if (layer) layer.style.transform = `scale(${view.k}) translate(${(-(vb.x / MAP_PX) * 100).toFixed(4)}%, ${(-(vb.y / MAP_PX) * 100).toFixed(4)}%)`
  root.querySelector('svg.expmap')?.setAttribute('viewBox', `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.size.toFixed(2)} ${vb.size.toFixed(2)}`)
  $('#mapview', root)?.classList.toggle('zoomed', view.k > 1)
}

/** Updates the parts of the map that sit outside the drawing: scale bar, zoom slider and its label. */
function syncMapUi(root: HTMLElement, rv: RoverSpec, v: ViewerState) {
  const ui = $('#mapui', root)
  if (ui) ui.innerHTML = mapUiHtml(rv, v.view)
  const z = $<HTMLInputElement>('#zoom', root)
  if (z && Number(z.value) !== v.view.k) z.value = String(v.view.k)
  const zl = $('#zlabel', root)
  if (zl) zl.textContent = `${v.view.k % 1 ? v.view.k.toFixed(1) : v.view.k}×`
  const mc = $('#mapcredit', root)
  if (mc) mc.textContent = `${v.view.k > 1 ? 'Hold the right mouse button and drag to move the map · ' : ''}${v.view.mode === 'sat' ? `Real photo from orbit · ${rv.satellite.credit}` : 'Heights from the MOLA laser altimeter · NASA'}`
  $$('[data-mode]', root).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === v.view.mode)))
  applyView(root, v.view)
}

function mapHtml(m: Mission, rv: RoverSpec, v: ViewerState, h: ViewerHooks) {
  const sat = rv.satellite
  return `<div class="maptop"><div class="maphint" id="maphint">${mapHint(h)}</div>
      <div class="mapbar">
        <div class="modesw" role="group" aria-label="Map picture"><button class="msw" data-mode="sat" aria-pressed="true">Real photo</button><button class="msw" data-mode="height" aria-pressed="false">Heights</button></div>
        <div class="zoomctl"><span>Zoom</span><button class="zb" data-zoom="-0.5" aria-label="Zoom out">−</button><input type="range" id="zoom" min="1" max="${MAX_ZOOM}" step="0.1" value="${v.view.k}" aria-label="Map zoom"/><button class="zb" data-zoom="0.5" aria-label="Zoom in">+</button><b id="zlabel">1×</b></div>
      </div></div>
    <div class="mapgrid">
      <div class="mapbox">
        <div class="mapview" id="mapview">
          <div class="maplayer" id="maplayer"></div>
          <div id="mapsvg">${mapSvg(m, rv, mapOpts(m, rv, v, h))}</div>
          <div class="mapui" id="mapui"></div>
        </div>
        <p class="mapcredit" id="mapcredit"></p>
        <div class="readout" id="readout">Move the pointer over the map to read the real height and slope.</div>
        <div class="legend">
          <span><i class="dot" style="background:#ff6a2b"></i>your rover</span>
          <span><i class="dot" style="background:#fff"></i>where the real ${esc(rv.name)} parked</span>
          <span><i class="cam-ic"></i>real photo spot (saved when the rover drives through its ring)</span>
          <span><i class="dot" style="background:#5ff2c5"></i>good</span><span><i class="dot" style="background:#ffb347"></i>risky</span><span><i class="dot" style="background:#ff5a4a"></i>bad</span><span><i class="dot" style="background:#b8c4cf"></i>not checked</span>
        </div>
        <details class="about"><summary>ⓘ About this map</summary>
          <p>A ${rv.area.sizeM / 1000} km square centred on where ${esc(rv.name)} really was on sol ${rv.area.centre.sol}.</p>
          <p><b>Real photo:</b> pictures of the ground taken from orbit by NASA's Mars Reconnaissance Orbiter, the same ones behind NASA's own “Where is ${esc(rv.name)}?” map. One dot on the screen is about ${sat.metresPerPixel} m of ground at full zoom.</p>
          <p><b>Heights:</b> from NASA's MOLA laser altimeter, in squares about 460 m wide. Lighter is higher and each line is 20 m. It shows the broad shape of the land, not rocks or small slopes. The game uses these heights to work out how much battery a climb costs.</p>
          <p>The white dots are the ${rv.area.stops.length} places the real rover parked. Within ${STOP_RANGE_M} m of one, a spot uses the tilt NASA measured there. The camera marks are ${photoPlaces(rv).length} places where it took the photos saved in this game.</p>
          <p class="cam-credit">${esc(sat.provider)}, saved ${esc(sat.retrieved)} · <a href="${esc(sat.page)}" target="_blank" rel="noopener">NASA's map</a><br/>${esc(rv.area.mola.provider)}<br/>${esc(rv.area.provider)}, saved ${esc(rv.area.retrieved)}.</p></details>
      </div>
      <div id="feed" class="cam">
        <div class="cam-h"><b>Rover camera</b><span id="feed-tag">${tagHtml(m, rv, v, h.pos, h.driving)}</span></div>
        <div class="cam-screen" id="feed-screen" data-key="${feedKey(m, rv, v, h.pos, h.driving)}">${screenHtml(m, rv, v, h.pos, h.driving)}</div>
        <div id="feed-cap">${capHtml(m, rv, v, h.pos, h.driving)}</div>
        <div id="feed-album">${albumStripHtml(m, rv, h)}</div>
      </div>
    </div>`
}

// ---------------------------------------------------------------- Photo album
function photosHtml(m: Mission, rv: RoverSpec, v: ViewerState) {
  const live = v.live
  const places = photoPlaces(rv)
  const found = m.photos.map(id => places.find(p => p.id === id)!)
  const missing = places.length - found.length
  return `<div class="vhead"><b>My photo album</b><p>Real photos from the spots your rover passed or parked at. It saves them by itself: <b>${found.length} of ${places.length}</b> found${m.photoBonus ? `, <b>+${m.photoBonus}</b> to your score` : ''}. Each spot adds +${PHOTO_BONUS_EACH}, up to +${PHOTO_BONUS_MAX}. They are raw: not cleaned up or colour-corrected.</p></div>
    <div class="photo-grid">${found.flatMap(pl => pl.photos.map(p => `<figure class="photo"><button class="pbtn" data-album="${pl.id}" data-photo="${esc(p.imageId)}" aria-label="Open this photo"><img src="${src(p.file)}" alt="${esc(p.cameraName)} raw image, ${esc(rv.name)} sol ${p.sol}" loading="lazy"/></button>
      <figcaption><b>${esc(p.cameraName)}</b> · sol ${p.sol} · ${esc(p.takenUtc.slice(0, 10))}<br/><span>${esc(p.credit)}</span></figcaption></figure>`)).join('')}
      ${Array.from({ length: Math.min(missing, found.length ? 2 : 4) }, () => '<figure class="photo locked"><div class="lockbox"><span>?</span><b>Not found yet</b><small>Drive through a camera ring on the map</small></div></figure>').join('')}</div>
    ${missing ? `<p class="cam-credit">${missing} photo spot${missing > 1 ? 's are' : ' is'} still waiting on the map.</p>` : '<p class="cam-credit">You found every photo spot on this map!</p>'}
    <p class="cam-credit">${esc(rv.area.provider)}, saved ${esc(rv.area.retrieved)}. <a href="${esc(rv.area.gallery)}" target="_blank" rel="noopener">NASA's raw image gallery</a></p>
    <div class="vhead" style="margin-top:22px"><b>Newest from NASA</b><p>Load the most recent photos straight from NASA (needs internet). They are for looking, not for score. The rest of the game works offline.</p></div>
    <button class="btn" id="live" ${live.status === 'loading' ? 'disabled' : ''}>${live.status === 'loading' ? 'Loading…' : live.status === 'ok' ? 'Reload newest photos' : 'Load newest photos'}</button>
    ${live.status === 'error' ? `<div class="feedback bad">${esc(live.error)}</div>` : ''}
    ${live.items.length ? `<div class="photo-grid">${live.items.map(p => `<figure class="photo"><a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(p.title)}" loading="lazy"/></a><figcaption><b>${esc(p.camera)}</b> · sol ${p.sol} · ${esc(p.taken.slice(0, 10))}<br/><span>${esc(p.credit)}</span></figcaption></figure>`).join('')}</div>` : ''}`
}

/** A big view of the album photos, opened from a thumbnail. */
function openAlbum(m: Mission, rv: RoverSpec, placeId: number, imageId?: string) {
  const places = photoPlaces(rv)
  const list = m.photos.flatMap(id => places.find(p => p.id === id)!.photos)
  if (!list.length) return
  const first = places.find(p => p.id === placeId)?.photos[0]
  let i = Math.max(0, list.findIndex(p => p.imageId === (imageId ?? first?.imageId)))
  document.querySelector('.lightbox')?.remove()
  const box = el('<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo album"><div class="lb-inner"></div></div>')
  const draw = () => {
    const p = list[i]
    $('.lb-inner', box).innerHTML = `<button class="lb-x" data-x aria-label="Close">×</button>
      <img src="${src(p.file)}" alt="${esc(p.cameraName)} raw image, ${esc(rv.name)} sol ${p.sol}"/>
      <div class="lb-cap"><b>${esc(p.cameraName)} · sol ${p.sol}</b><span>Taken by the real ${esc(rv.name)} on ${esc(p.takenUtc.slice(0, 10))}. Raw and unprocessed. ${esc(p.credit)}</span><a href="${esc(p.source)}" target="_blank" rel="noopener">NASA's original</a></div>
      ${list.length > 1 ? `<div class="lb-nav"><button class="btn" data-prev>‹ Back</button><span>${i + 1} of ${list.length}</span><button class="btn" data-next>Next ›</button></div>` : ''}`
  }
  const step = (d: number) => { i = (i + d + list.length) % list.length; draw() }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1) }
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey) }
  box.onclick = e => {
    const t = e.target as Element
    if (t === box || t.closest('[data-x]')) close()
    else if (t.closest('[data-prev]')) step(-1)
    else if (t.closest('[data-next]')) step(1)
  }
  document.addEventListener('keydown', onKey)
  draw()
  document.body.append(box)
  $<HTMLButtonElement>('.lb-x', box).focus()
}

const LIVE_FEED: Record<string, { url: string; cams: string }> = {
  perseverance: { url: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=12&page=0&order=sol+desc', cams: '|NAVCAM_LEFT|MCZ_LEFT|FRONT_HAZCAM_LEFT_A|REAR_HAZCAM_LEFT' },
  curiosity: { url: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json&ver=1.2&num=12&page=0&order=sol+desc', cams: '|NAV_LEFT_B|MAST_LEFT|FHAZ_LEFT_B|RHAZ_LEFT_B' },
}

async function loadLive(rv: RoverSpec): Promise<LivePhoto[]> {
  const f = LIVE_FEED[rv.id]
  const res = await fetch(`${f.url}&search=${encodeURIComponent(f.cams)}`)
  if (!res.ok) throw new Error(`NASA feed answered ${res.status}`)
  const j = await res.json() as { images?: { image_files?: { medium?: string }; camera?: { instrument?: string }; sol?: number; date_taken_utc?: string; credit?: string; title?: string }[] }
  return (j.images ?? []).filter(i => i.image_files?.medium).map(i => ({
    url: i.image_files!.medium!, camera: i.camera?.instrument ?? 'camera', sol: i.sol ?? 0, taken: i.date_taken_utc ?? '', credit: i.credit ?? 'NASA/JPL-Caltech', title: i.title ?? `${rv.name} raw image`,
  }))
}

// ---------------------------------------------------------------- What each part does: NASA's picture with dots to tap
function partsPicHtml(rv: RoverSpec, v: ViewerState) {
  const pic = rv.partsPicture
  // Only part of NASA's picture is shown, so the rover fills the frame; the dots move with it.
  const [x0, y0, x1, y1] = rv.partsCrop
  const cw = x1 - x0, ch = y1 - y0
  const byAnchor = new Map<string, Part[]>()
  for (const p of rv.parts) byAnchor.set(p.anchor, [...(byAnchor.get(p.anchor) ?? []), p])
  const hot = [...byAnchor.entries()].map(([a, parts]) => {
    const at = rv.anchors[a as Anchor]
    if (!at) return ''
    const sel = parts.some(p => p.id === v.part)
    const lit = parts.some(p => v.highlight.includes(p.id))
    const names = parts.map(p => p.name).join(', ')
    return `<button class="hot ${sel ? 'sel' : ''} ${lit ? 'lit' : ''}" data-part="${parts[0].id}" style="left:${(((at[0] - x0) / cw) * 100).toFixed(2)}%;top:${(((at[1] - y0) / ch) * 100).toFixed(2)}%" aria-label="${esc(names)}" title="${esc(names)}"><i class="ring"></i><i class="dot">${parts.length > 1 ? parts.length : ''}</i></button>`
  }).join('')
  return `<figure class="partspic"><div class="pp-frame" style="aspect-ratio:${(pic.width * cw).toFixed(0)}/${(pic.height * ch).toFixed(0)}"><img src="${src(pic.file)}" alt="NASA artist's concept of the ${esc(rv.name)} rover on Mars" style="width:${(10000 / cw).toFixed(2)}%;height:${(10000 / ch).toFixed(2)}%;left:${((-x0 / cw) * 100).toFixed(2)}%;top:${((-y0 / ch) * 100).toFixed(2)}%"/>${hot}<span class="pp-tag">NASA 3D picture · not a photo</span></div>
    <figcaption class="cam-credit">“${esc(pic.title)}” (${esc(pic.date.slice(0, 4))}), ${esc(pic.credit)} · <a href="${esc(pic.page)}" target="_blank" rel="noopener">NASA page</a><br/>${esc(pic.note)} The dots were placed by us and show roughly where each part is.</figcaption></figure>`
}

function partsBodyHtml(rv: RoverSpec, v: ViewerState) {
  const job = v.highlightJob
  // The picture and the list of parts on the left; what the picked part does stays beside them.
  return `<div class="partsgrid">
    <div class="parts-main">${partsPicHtml(rv, v)}
      <div class="legend parts-legend">
        <span><i class="dot" style="background:var(--cyan)"></i>a part</span>
        <span><i class="dot" style="background:var(--mint)"></i>the part you picked</span>
        ${job ? `<span><i class="dot" style="background:var(--gold)"></i>used for <b>${JOB_NAME[job]}</b></span><button class="btn small" id="clearlit">Clear</button>` : ''}
        <span><i class="dot num">2</i>several parts share a dot</span>
      </div>
      <div class="partlist">${rv.parts.map(p => `<button class="pchip ${p.id === v.part ? 'on' : ''} ${v.highlight.includes(p.id) ? 'lit' : ''}" data-part="${p.id}">${esc(p.name)}</button>`).join('')}</div>
    </div>
    <aside class="parts-info" aria-live="polite">${partCardHtml(rv, v)}</aside>
  </div>`
}

function partsHtml(rv: RoverSpec, v: ViewerState) {
  return `<div class="vhead"><b>What each part does · ${esc(rv.name)}</b><p>Tap a dot on the rover to learn about that part.</p></div>${partsBodyHtml(rv, v)}`
}

export function partCardHtml(rv: RoverSpec, v: ViewerState) {
  const part = rv.parts.find(p => p.id === v.part) ?? null
  const siblings = part ? rv.parts.filter(p => p.anchor === part.anchor) : []
  const used = (p: Part) => p.usedBy.length ? p.usedBy.map(a => JOB_NAME[a]).join(', ') : 'Not used by a rover job'
  return `${part ? `<div class="partcard">
      ${siblings.length > 1 ? `<div class="chip-tabs">${siblings.map(p => `<button class="chip-tab" data-part="${p.id}" aria-pressed="${p.id === part.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      <h4>${esc(part.name)}</h4><div class="where">${esc(part.where)}</div>
      <p>${esc(part.what)}</p>
      <ul>${part.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="used">In this game: <b>${esc(used(part))}</b></div>
      <a href="${esc(part.url)}" target="_blank" rel="noopener">Source: NASA page</a></div>`
      : '<div class="partcard empty">Tap a dot on the rover to see what that part does.</div>'}`
}

// ---------------------------------------------------------------- Viewer shell
export function renderViewer(root: HTMLElement, m: Mission, v: ViewerState, rerender: () => void, h: ViewerHooks) {
  const rv = m.rover
  const redrawFeed = () => {
    const screen = $('#feed-screen', root)
    if (!screen || !rv) return
    const key = feedKey(m, rv, v, h.pos, h.driving)
    if (screen.dataset.key !== key) {
      const old = $<HTMLVideoElement>('#film', screen)
      if (old) v.filmAt = old.currentTime
      screen.dataset.key = key
      screen.innerHTML = screenHtml(m, rv, v, h.pos, h.driving)
      $('#feed-tag', root).innerHTML = tagHtml(m, rv, v, h.pos, h.driving)
      $('#feed-cap', root).innerHTML = capHtml(m, rv, v, h.pos, h.driving)
      startFilm(screen, v)
    }
    $('#feed-album', root).innerHTML = albumStripHtml(m, rv, h)
  }
  // One delegated handler: the map is redrawn often, so per-element listeners would be lost.
  const onPick = (t: Element, e: { clientX: number; clientY: number }) => {
    if (t.closest('[data-back]')) { h.back(); return true }
    const pick = t.closest('[data-pick]')
    if (pick) { v.pick = pick.getAttribute('data-pick') as RoverId; v.peek = null; v.part = null; rerender(); return true }
    if (t.closest('[data-nopick]')) { v.pick = null; rerender(); return true }
    const yes = t.closest('[data-confirm]')
    if (yes) { h.chooseRover(yes.getAttribute('data-confirm') as RoverId); return true }
    const peek = t.closest('[data-peek]')
    if (peek) { v.peek = peek.getAttribute('data-peek') as RoverId; v.pick = null; v.part = null; v.highlight = []; v.highlightJob = null; root.scrollTop = 0; rerender(); return true }
    if (t.closest('[data-unpeek]')) { v.peek = null; v.part = null; rerender(); return true }
    const thumb = t.closest('[data-album]')
    if (thumb && rv) { openAlbum(m, rv, Number(thumb.getAttribute('data-album')), thumb.getAttribute('data-photo') ?? undefined); return true }
    const mode = t.closest('[data-mode]')
    if (mode) { v.view.mode = mode.getAttribute('data-mode') as MapMode; rerender(); return true }
    const zb = t.closest('[data-zoom]')
    if (zb) { setZoom(v.view, v.view.k + Number(zb.getAttribute('data-zoom'))); rerender(); return true }
    if (t.closest('[data-feednext]') && rv) { v.feedIdx++; redrawFeed(); return true }
    if (t.closest('#clearlit')) { v.highlight = []; v.highlightJob = null; rerender(); return true }
    const part = t.closest('[data-part]')
    if (part) { v.part = part.getAttribute('data-part'); rerender(); return true }
    const map = t.closest('#mapview')
    if (map && rv) {
      const spot = t.closest('[data-spot]')
      if (h.planning) h.addPoint(pointAt(map, e, rv, v.view))
      else if (spot) h.pickSpot(Number(spot.getAttribute('data-spot')))
      return true
    }
    return false
  }
  root.onclick = e => { if (v.dragged) return; onPick(e.target as Element, e) }
  root.onkeydown = e => { if (e.key === 'Enter' && (e.target as Element).closest('[data-spot]')) { const b = (e.target as Element).getBoundingClientRect(); if (onPick(e.target as Element, { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 })) e.preventDefault() } }
  root.onmousemove = e => {
    const map = (e.target as Element).closest('#mapview')
    const out = $('#readout', root)
    if (map && out && rv) out.textContent = `${readout(rv, pointAt(map, e, rv, v.view))}`
  }
  root.oninput = e => {
    const t = e.target as HTMLInputElement
    if (t.id === 'zoom') { setZoom(v.view, Number(t.value)); rerender() }
  }
  if (!rv) {
    // The first thing in the rover room: choose one rover, or look at a rover's parts first.
    const view = `choose:${v.peek ?? ''}`
    const keep = root.dataset.view === view ? root.scrollTop : 0
    root.dataset.view = view
    root.innerHTML = v.peek ? peekHtml(ROVERS[v.peek], v) : choiceHtml(v)
    root.scrollTop = keep
    return
  }
  // On the map tab, redraw only what changed (the drawing on the map, the camera if it shows something new) so a playing film keeps playing.
  const view = `${rv.id}:${v.tab}:${v.view.mode}`
  if (v.tab === 'map' && root.dataset.view === view && $('#mapsvg', root)) {
    $('#mapsvg', root).innerHTML = mapSvg(m, rv, mapOpts(m, rv, v, h))
    $('#maphint', root).textContent = mapHint(h)
    syncMapUi(root, rv, v)
    redrawFeed()
    return
  }
  root.dataset.view = view
  const tabs: [ViewTab, string][] = [['map', 'Map'], ['photos', 'My photos'], ['parts', 'Rover parts']]
  root.innerHTML = `<div class="vtabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" class="tab" data-vtab="${id}" aria-selected="${v.tab === id}">${label}</button>`).join('')}</div>
    <div class="vbody">${v.tab === 'map' ? mapHtml(m, rv, v, h) : v.tab === 'photos' ? photosHtml(m, rv, v) : partsHtml(rv, v)}</div>`
  $$('[data-vtab]', root).forEach(b => b.addEventListener('click', () => { v.tab = b.dataset.vtab as ViewTab; rerender() }))
  if (v.tab === 'map') {
    $('#maplayer', root).append(background(rv, v.view.mode))
    syncMapUi(root, rv, v)
    bindDrag(root, v)
    startFilm($('#feed-screen', root), v)
  }
  $('#live', root)?.addEventListener('click', async () => {
    v.live = { status: 'loading', items: v.live.items, error: '' }
    rerender()
    try { v.live = { status: 'ok', items: await loadLive(rv), error: '' } }
    catch (e) { v.live = { status: 'error', items: [], error: `Could not reach NASA's raw image feed (${(e as Error).message || 'offline'}). Your album still works.` } }
    rerender()
  })
}

/**
 * Starts a newly shown drive film and the fuzz over it. The film carries on from where the last
 * drive stopped. A video plays itself; a GIF is drawn picture by picture, so it can be frozen.
 */
let filmTimer = 0
function startFilm(screen: HTMLElement, v: ViewerState) {
  startFx(screen)
  clearInterval(filmTimer)
  const film = $<HTMLVideoElement>('#film', screen)
  if (film) {
    film.playbackRate = 0.8
    film.addEventListener('loadedmetadata', () => { if (film.duration) film.currentTime = v.filmAt % film.duration }, { once: true })
    return
  }
  const c = $<HTMLCanvasElement>('#filmc', screen)
  if (!c) return
  const url = c.dataset.src!
  void gifFrames(url).then(frames => {
    if (!c.isConnected) return
    if (!frames?.length) {
      // This browser cannot take the film apart: show it as the plain moving picture it is.
      const img = document.createElement('img')
      img.className = 'media'
      img.src = url
      img.alt = c.getAttribute('aria-label') ?? ''
      c.replaceWith(img)
      return
    }
    c.width = frames[0].width
    c.height = frames[0].height
    const ctx = c.getContext('2d')!
    let i = Math.floor(v.filmAt) % frames.length
    const draw = () => {
      if (!c.isConnected) { clearInterval(filmTimer); return }
      ctx.drawImage(frames[i % frames.length], 0, 0)
      c.dataset.ready = '1'
      v.filmAt = i
      i++
    }
    draw()
    filmTimer = window.setInterval(draw, 450)
  })
}

/** When zoomed in, dragging moves the map: with the right mouse button, or with the left button or a finger. A drag does not place a point. */
function bindDrag(root: HTMLElement, v: ViewerState) {
  const mv = $('#mapview', root)
  let drag: { id: number; x: number; y: number; cx: number; cy: number; moved: boolean } | null = null
  // The right button is for dragging here, so its menu stays closed over the map.
  mv.oncontextmenu = e => e.preventDefault()
  mv.onpointerdown = e => {
    if (v.view.k <= 1 || (e.button !== 0 && e.button !== 2)) return
    const vb = viewBox(v.view)
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: vb.x + vb.size / 2, cy: vb.y + vb.size / 2, moved: false }
  }
  mv.onpointermove = e => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return
      drag.moved = true
      try { mv.setPointerCapture(drag.id) } catch { /* the pointer is already gone: the drag still works while it stays over the map */ }
      mv.classList.add('dragging')
    }
    const b = mv.getBoundingClientRect(), size = MAP_PX / v.view.k
    v.view.cx = drag.cx - (dx / b.width) * size
    v.view.cy = drag.cy - (dy / b.height) * size
    const vb = viewBox(v.view)
    v.view.cx = vb.x + vb.size / 2
    v.view.cy = vb.y + vb.size / 2
    applyView(root, v.view)
  }
  const end = () => {
    if (drag?.moved) { v.dragged = true; setTimeout(() => { v.dragged = false }, 0); mv.classList.remove('dragging') }
    drag = null
  }
  mv.onpointerup = end
  mv.onpointercancel = end
}

/** Show the parts a rover job uses on the picture. */
export function showActionParts(v: ViewerState, rv: RoverSpec, a: ActionKind) {
  v.tab = 'parts'
  v.highlightJob = a
  v.highlight = rv.parts.filter(p => p.usedBy.includes(a)).map(p => p.id)
  v.part = v.highlight[0] ?? null
}
