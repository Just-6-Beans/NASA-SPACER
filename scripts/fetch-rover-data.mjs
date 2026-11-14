// Downloads the NASA snapshots used by the rover expedition (Perseverance and Curiosity).
// Run with `npm run data:rovers`. The game only reads the saved files; it never needs these
// services while it runs (the optional "load newest photos" button is the one exception).
//
// Writes:
//   data/nasa/perseverance-area.json       3 km x 3 km around Perseverance: every real stop (position, tilt,
//                                          elevation), a MOLA height grid, and a list of real photos
//   data/nasa/curiosity-area.json          the same around Curiosity
//   data/nasa/<rover>-satellite.json       which real orbital map tiles cover that square, and where it sits in them
//   data/nasa/gale-rems-recent.json        recent Curiosity REMS weather at Gale Crater
//   data/nasa/mola-roughness-regions.json  MOLA slope-corrected roughness at the two regions
//   data/nasa/site-references.json         Curiosity RAD dose, ice-map coverage, drive films, rover pictures
//   public/nasa/<rover>/*.jpg              the raw photos listed in the area files
//   public/nasa/video/*                    two real drive films, made from the rovers' own camera frames
//   public/nasa/map/<rover>/*.png          the orbital map tiles, unchanged from NASA's rover location maps
//   public/nasa/rovers/*.jpg               a real selfie and a NASA artist's concept of each rover
//
// One step at a time: `node scripts/fetch-rover-data.mjs --only=satellite,pictures`
// Steps: areas, satellite, weather, roughness, radiation, films, pictures.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data', 'nasa')
const UA = { 'User-Agent': 'spacer-game-data-snapshot' }
const today = new Date().toISOString().slice(0, 10)

const URLS = {
  rems: 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json',
  mola: 'https://pgda.gsfc.nasa.gov/data/MOLA/MOLA_roughness_slpcor_8ppd.grd',
  molaInfo: 'https://pgda.gsfc.nasa.gov/products/62',
}

async function get(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) } })
    if (res.ok || res.status === 206) return res
    if (attempt >= 3) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    await new Promise(r => setTimeout(r, 1000 * attempt))
  }
}
const json = async url => (await get(url)).json()
const save = async (file, value) => {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 1) + '\n')
  console.log('wrote', file.slice(ROOT.length + 1))
}

// ---------------------------------------------------------------- Rover stops + photos
const ROVERS = {
  perseverance: {
    name: 'Perseverance', location: 'Jezero Crater, Mars',
    waypoints: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
    rawImages: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2',
    gallery: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    isStop: p => /End-of-drive/i.test(p.Note ?? ''),
    navcam: 'NAVCAM_LEFT',
    cameras: [
      { code: 'NAVCAM_LEFT', name: 'Navcam (left)', part: 'navcam' },
      { code: 'MCZ_LEFT', name: 'Mastcam-Z (left)', part: 'mastcamz' },
      { code: 'FRONT_HAZCAM_LEFT_A', name: 'Front Hazcam (left)', part: 'hazcam' },
      { code: 'REAR_HAZCAM_LEFT', name: 'Rear Hazcam (left)', part: 'hazcam' },
    ],
  },
  curiosity: {
    name: 'Curiosity', location: 'Gale Crater, Mars',
    waypoints: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
    rawImages: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=msl&feedtype=json&ver=1.2',
    gallery: 'https://mars.nasa.gov/msl/multimedia/raw-images/',
    isStop: () => true, // Curiosity's file lists one localized position per drive.
    navcam: 'NAV_LEFT_B',
    cameras: [
      { code: 'NAV_LEFT_B', name: 'Navcam (left)', part: 'navcam' },
      { code: 'MAST_LEFT', name: 'Mastcam (left)', part: 'mastcam' },
      { code: 'FHAZ_LEFT_B', name: 'Front Hazcam (left)', part: 'hazcam' },
      { code: 'RHAZ_LEFT_B', name: 'Rear Hazcam (left)', part: 'hazcam' },
    ],
  },
}

async function imagesFor(rover, sol, camera) {
  const q = `&num=50&page=0&order=sol+desc&search=${camera}&condition_2=${sol}:sol:gte&condition_3=${sol}:sol:lte`
  const j = await json(rover.rawImages + q)
  return (j.images ?? []).filter(i => i.sol === sol && i.camera?.instrument === camera)
}

const area = i => {
  const m = /\((\d+),(\d+)\)/.exec(i.extended?.dimension ?? '')
  return m ? Number(m[1]) * Number(m[2]) : 0
}

/** Map size in metres: a square centred on the rover's newest position. */
const MAP_M = 3000
/** Metres per degree on NASA's Mars sphere (radius 3,396,190 m), as used by the rover maps. */
const M_PER_DEG = (2 * Math.PI * 3396190) / 360
const MEGDR = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128'

/** MOLA 128 pixel/degree heights (about 463 m per cell) around a point, read by byte range from the PDS tile. */
async function molaHeights(lat0, lon0) {
  const top = lat0 >= 44 ? 88 : lat0 >= 0 ? 44 : lat0 >= -44 ? 0 : -44
  const west = Math.floor(lon0 / 90) * 90
  const tile = `megt${String(Math.abs(top)).padStart(2, '0')}${top > 0 ? 'n' : top === 0 ? 'n' : 's'}${String(west).padStart(3, '0')}hb.img`
  const COLS = 11520, PPD = 128
  const cellM = M_PER_DEG / PPD
  const n = Math.ceil(MAP_M / 2 / (cellM * Math.cos((lat0 * Math.PI) / 180))) + 2
  const row0 = Math.floor((top - lat0) * PPD), col0 = Math.floor((lon0 - west) * PPD)
  const rows = []
  for (let r = row0 - n; r <= row0 + n; r++) {
    const at = (r * COLS + (col0 - n)) * 2
    const b = new Uint8Array(await (await get(`${MEGDR}/${tile}`, { headers: { Range: `bytes=${at}-${at + (2 * n + 1) * 2 - 1}` } })).arrayBuffer())
    const dv = new DataView(b.buffer)
    rows.push({ lat: top - (r + 0.5) / PPD, h: Array.from({ length: 2 * n + 1 }, (_, i) => dv.getInt16(i * 2)) })
  }
  rows.reverse() // south to north, so y increases with the row index
  const lons = Array.from({ length: 2 * n + 1 }, (_, i) => west + (col0 - n + i + 0.5) / PPD)
  return {
    source: `${MEGDR}/${tile}`,
    provider: 'NASA PDS Geosciences Node: Mars Global Surveyor MOLA gridded topography (MEGDR), 128 pixels per degree',
    note: 'Median height in cells about 463 m across. Between laser tracks the values are interpolated, so this shows the broad shape of the ground, not rocks or small slopes.',
    cellM: Math.round(cellM * 10) / 10,
    x: lons.map(l => Math.round((l - lon0) * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180))),
    y: rows.map(r => Math.round((r.lat - lat0) * M_PER_DEG)),
    heights: rows.map(r => r.h),
  }
}

async function roverArea(id) {
  const rover = ROVERS[id]
  const wp = await json(rover.waypoints)
  const all = wp.features.map(f => f.properties).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.tilt) && Number.isFinite(p.elev_geoid))
  const c = all[all.length - 1]
  const k = Math.cos((c.lat * Math.PI) / 180)
  const local = p => ({ x: Math.round((p.lon - c.lon) * M_PER_DEG * k * 10) / 10, y: Math.round((p.lat - c.lat) * M_PER_DEG * 10) / 10 })
  const inMap = p => { const q = local(p); return Math.abs(q.x) <= MAP_M / 2 && Math.abs(q.y) <= MAP_M / 2 }
  const stops = all.filter(inMap).map(p => ({ ...local(p), sol: p.sol, tiltDeg: Math.round(p.tilt * 100) / 100, elevationM: Math.round(p.elev_geoid * 10) / 10 }))

  // Photos: spread about 16 photographed stops across the map (farthest-point sampling), newest first.
  const ends = all.filter(inMap).filter(rover.isStop)
  const bySol = new Map(ends.map(p => [p.sol, p])) // one position per sol: the last one that sol
  const cand = [...bySol.values()].reverse()
  const dir = join(ROOT, 'public', 'nasa', id)
  await mkdir(dir, { recursive: true })
  const photos = []
  const chosen = []
  const want = [rover.cameras[0], rover.cameras[2]] // Navcam and front Hazcam
  while (chosen.length < 16 && cand.length) {
    // The candidate farthest from every stop already chosen (the newest stop goes first).
    let best = 0, bestD = -1
    cand.forEach((p, i) => {
      const q = local(p)
      const d = chosen.length ? Math.min(...chosen.map(s => Math.hypot(s.x - q.x, s.y - q.y))) : 1e9 - i
      if (d > bestD) { bestD = d; best = i }
    })
    const [p] = cand.splice(best, 1)
    if (chosen.length && bestD < 60) break
    const got = []
    for (const cam of want) {
      const list = (await imagesFor(rover, p.sol, cam.code)).filter(i => String(i.sample_type).toLowerCase() === 'full')
      if (!list.length) continue
      const img = [...list].sort((a, b) => area(b) - area(a))[0]
      const file = `${img.imageid}.jpg`
      await writeFile(join(dir, file), Buffer.from(await (await get(img.image_files.medium)).arrayBuffer()))
      got.push({ ...local(p), sol: img.sol, camera: cam.code, cameraName: cam.name, part: cam.part, takenUtc: img.date_taken_utc, credit: img.credit, imageId: img.imageid, file: `nasa/${id}/${file}`, source: img.image_files.medium })
    }
    if (got.length) { chosen.push(local(p)); photos.push(...got) }
  }
  console.log(`${rover.name}: ${stops.length} stops, ${photos.length} photos from ${chosen.length} places`)

  await save(join(DATA, `${id}-area.json`), {
    rover: rover.name,
    source: [rover.waypoints, rover.rawImages],
    provider: `NASA/JPL-Caltech: ${rover.name} localized waypoints (MMGIS) and raw images`,
    location: rover.location,
    retrieved: today,
    gallery: rover.gallery,
    sizeM: MAP_M,
    method: 'Every localized rover position inside a 3 km square centred on the newest one. x is metres east and y metres north of the centre. Tilt is the rover attitude NASA recorded there.',
    units: { elevationM: 'm relative to the Mars geoid', tiltDeg: 'degrees from level' },
    credit: 'Raw images: NASA/JPL-Caltech and partners (see each photo for its exact credit line). Raw images are unprocessed and not science-calibrated.',
    centre: { lat: c.lat, lon: c.lon, sol: c.sol, elevationM: Math.round(c.elev_geoid * 10) / 10, tiltDeg: Math.round(c.tilt * 100) / 100, odometerM: Math.round(c.dist_total_m) },
    stops,
    photos,
    mola: await molaHeights(c.lat, c.lon),
  })
  return c
}

// ---------------------------------------------------------------- Curiosity REMS (Gale Crater)
async function rems() {
  const j = await json(URLS.rems)
  const num = v => (v === '--' || v === '' || v == null ? null : Number(v))
  const rows = j.soles
    .map(s => ({ sol: Number(s.sol), earthDate: s.terrestrial_date, ls: num(s.ls), minAirTemp: num(s.min_temp), maxAirTemp: num(s.max_temp), minGroundTemp: num(s.min_gts_temp), maxGroundTemp: num(s.max_gts_temp), pressure: num(s.pressure), uvIndex: s.local_uv_irradiance_index === '--' ? null : s.local_uv_irradiance_index, sunrise: s.sunrise, sunset: s.sunset }))
    .filter(r => r.minAirTemp !== null && r.maxAirTemp !== null && /^\d\d:\d\d$/.test(r.sunrise) && /^\d\d:\d\d$/.test(r.sunset))
    .sort((a, b) => a.sol - b.sol)
    .slice(-10)
  await save(join(DATA, 'gale-rems-recent.json'), {
    source: URLS.rems,
    provider: 'NASA/JPL-Caltech and Centro de Astrobiologia (CSIC-INTA), Curiosity REMS outreach feed',
    location: 'Gale Crater, Mars (Curiosity rover)',
    retrieved: today,
    note: 'Outreach product, not calibrated science data. The 10 newest sols with temperature, sunrise and sunset.',
    units: { airTemp: 'degC', groundTemp: 'degC', pressure: 'Pa', ls: 'solar longitude, degrees', sunrise: 'local Mars time', sunset: 'local Mars time' },
    records: rows,
  })
  return rows
}

// ---------------------------------------------------------------- Real drive films (NASA Photojournal)
// Films made from the rovers' own camera frames during a real drive. They play while the rover drives.
const PHOTOJOURNAL = 'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia'
const FILMS = [
  { rover: 'perseverance', id: 'PIA24743', ext: 'mp4', kind: 'video', file: 'perseverance-drive.mp4', note: "Filmed by Perseverance's own navigation camera on 1 July 2021 (sol 130), one picture about every 5 m of driving." },
  { rover: 'curiosity', id: 'PIA17938', ext: 'gif', kind: 'gif', file: 'curiosity-drive.gif', note: 'Filmed by Curiosity looking backwards as it drove over the Dingo Gap dune in February 2014.' },
]
async function driveFilms() {
  const dir = join(ROOT, 'public', 'nasa', 'video')
  await mkdir(dir, { recursive: true })
  const out = []
  for (const f of FILMS) {
    const lc = f.id.toLowerCase()
    const source = `${PHOTOJOURNAL}/${lc.slice(0, 5)}/${lc}/${f.id}.${f.ext}`
    const meta = (await json(`https://images-api.nasa.gov/search?nasa_id=${f.id}`)).collection.items[0].data[0]
    const bytes = Buffer.from(await (await get(source, { headers: { 'User-Agent': 'Mozilla/5.0 (spacer-game-data-snapshot)' } })).arrayBuffer())
    await writeFile(join(dir, f.file), bytes)
    console.log(`drive film ${f.file}: ${(bytes.length / 1048576).toFixed(1)} MB`)
    out.push({ rover: f.rover, file: `nasa/video/${f.file}`, kind: f.kind, id: f.id, title: meta.title, date: (meta.date_created ?? '').slice(0, 10), credit: 'NASA/JPL-Caltech', page: `https://images.nasa.gov/details/${f.id}`, source, note: f.note })
  }
  return out
}

// ---------------------------------------------------------------- Satellite map (tiles of NASA's rover location maps)
// The colour basemaps behind NASA's "Where is the rover?" maps: Mars Reconnaissance Orbiter HiRISE
// images, cut into 256-pixel web-map tiles. The tiles are saved unchanged; the game joins them.
const BASEMAPS = {
  perseverance: {
    layer: 'M20_HiRISE_RGB_CTX_mosaic_25cm_v7_Merge_LERC_clip',
    url: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/M20_HiRISE_RGB_CTX_mosaic_25cm_v7_Merge_LERC_clip/{z}/{x}/{y}.png',
    page: 'https://science.nasa.gov/mission/mars-2020-perseverance/location-map/',
    credit: 'NASA/JPL-Caltech/University of Arizona',
  },
  curiosity: {
    layer: 'MSL_Gale_HiRISE-LRGB_78quads',
    url: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/MSL_Gale_HiRISE-LRGB_78quads/{z}/{x}/{y}.png',
    page: 'https://science.nasa.gov/mission/msl-curiosity/location-map/',
    credit: 'NASA/JPL-Caltech/University of Arizona',
  },
}
/** Web-map zoom level: 16 gives about 1.2 m per pixel here, 110 tiles per rover. */
const SAT_ZOOM = 16
const TILE_PX = 256
const mercX = (lon, z) => ((lon + 180) / 360) * 2 ** z
const mercY = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z }

async function satellite(id, c) {
  const b = BASEMAPS[id], z = SAT_ZOOM
  const dLat = MAP_M / 2 / M_PER_DEG, dLon = dLat / Math.cos((c.lat * Math.PI) / 180)
  // Fractional tile coordinates of the square's edges (y grows towards the south).
  const x0 = mercX(c.lon - dLon, z), x1 = mercX(c.lon + dLon, z)
  const y0 = mercY(c.lat + dLat, z), y1 = mercY(c.lat - dLat, z)
  const col0 = Math.floor(x0), col1 = Math.floor(x1), row0 = Math.floor(y0), row1 = Math.floor(y1)
  const dir = join(ROOT, 'public', 'nasa', 'map', id)
  await mkdir(dir, { recursive: true })
  const jobs = []
  for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) jobs.push({ row, col })
  let bytes = 0
  const missing = []
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async ({ row, col }) => {
      // NASA's tiles count rows from the south (TMS), so the row number is flipped in the address.
      const url = b.url.replace('{z}', z).replace('{x}', col).replace('{y}', 2 ** z - 1 - row)
      try {
        const buf = Buffer.from(await (await get(url)).arrayBuffer())
        bytes += buf.length
        await writeFile(join(dir, `${col - col0}_${row - row0}.png`), buf)
      } catch { missing.push(`${col - col0}_${row - row0}`) }
    }))
  }
  console.log(`${ROVERS[id].name} satellite map: ${jobs.length - missing.length} tiles, ${(bytes / 1048576).toFixed(1)} MB${missing.length ? `, ${missing.length} missing` : ''}`)
  const r2 = n => Math.round(n * 100) / 100
  await save(join(DATA, `${id}-satellite.json`), {
    rover: ROVERS[id].name,
    source: b.url,
    layer: b.layer,
    provider: `NASA/JPL-Caltech: colour basemap of NASA's ${ROVERS[id].name} location map (Mars Reconnaissance Orbiter HiRISE images, University of Arizona)`,
    credit: b.credit,
    page: b.page,
    retrieved: today,
    note: 'Real pictures of the ground taken from orbit, saved as the unchanged 256-pixel map tiles NASA serves. Tile "col_row" counts from the top-left tile of the block. The game square is the part of the block given in "square".',
    centre: { lat: c.lat, lon: c.lon, sol: c.sol },
    sizeM: MAP_M,
    zoom: z,
    tilePx: TILE_PX,
    cols: col1 - col0 + 1,
    rows: row1 - row0 + 1,
    firstTile: { x: col0, y: 2 ** z - 1 - row0 },
    files: `nasa/map/${id}/{col}_{row}.png`,
    missing,
    square: { left: r2((x0 - col0) * TILE_PX), top: r2((y0 - row0) * TILE_PX), width: r2((x1 - x0) * TILE_PX), height: r2((y1 - y0) * TILE_PX) },
    metresPerPixel: r2(MAP_M / ((x1 - x0) * TILE_PX)),
  })
}

// ---------------------------------------------------------------- Rover pictures (NASA Image and Video Library)
// A real selfie of each rover for the "choose your rover" screen, and a NASA artist's concept of
// each (a computer picture that shows every part clearly) for the parts guide.
const PICTURES = [
  { rover: 'perseverance', use: 'selfie', id: 'PIA26344', size: 'medium', file: 'perseverance-selfie.jpg', kind: 'Real photo', note: 'A real selfie: 62 pictures taken by the camera on the end of the arm on 23 July 2024 (sol 1218), joined together. The arm is not in the picture because it is holding the camera.' },
  { rover: 'perseverance', use: 'parts', id: 'PIA22105', size: 'large', file: 'perseverance-parts.jpg', kind: "NASA artist's concept", note: "A computer picture NASA made before launch, when the rover was still called Mars 2020. It is not a photo, but it shows every part clearly." },
  { rover: 'curiosity', use: 'selfie', id: 'PIA24543', size: 'medium', file: 'curiosity-selfie.jpg', kind: 'Real photo', note: 'A real selfie in front of Mont Mercou: 60 pictures taken by the camera on the end of the arm on 26 March 2021 (sol 3070), joined with 11 from the mast camera.' },
  { rover: 'curiosity', use: 'parts', id: 'PIA14760', size: 'orig', file: 'curiosity-parts.jpg', kind: "NASA artist's concept", note: 'A computer picture NASA made before launch. It is not a photo, but it shows every part clearly. The red line shows where the ChemCam laser is aimed.' },
]
/** Width and height from a JPEG's frame header. */
function jpegSize(buf) {
  let o = 2
  while (o < buf.length) {
    if (buf[o] !== 0xff) { o++; continue }
    const m = buf[o + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) }
    o += 2 + buf.readUInt16BE(o + 2)
  }
  return { width: 0, height: 0 }
}
async function pictures() {
  const dir = join(ROOT, 'public', 'nasa', 'rovers')
  await mkdir(dir, { recursive: true })
  const out = []
  for (const p of PICTURES) {
    const meta = (await json(`https://images-api.nasa.gov/search?nasa_id=${p.id}`)).collection.items[0].data[0]
    const assets = (await json(`https://images-api.nasa.gov/asset/${p.id}`)).collection.items.map(i => i.href)
    const href = assets.find(h => h.endsWith(`~${p.size}.jpg`)) ?? assets.find(h => h.endsWith('~orig.jpg'))
    if (!href) throw new Error(`No JPEG for ${p.id}`)
    const bytes = Buffer.from(await (await get(encodeURI(href))).arrayBuffer())
    await writeFile(join(dir, p.file), bytes)
    const size = jpegSize(bytes)
    console.log(`picture ${p.file}: ${size.width} x ${size.height}, ${(bytes.length / 1048576).toFixed(2)} MB`)
    out.push({ rover: p.rover, use: p.use, kind: p.kind, file: `nasa/rovers/${p.file}`, id: p.id, title: meta.title, date: (meta.date_created ?? '').slice(0, 10), credit: meta.secondary_creator ?? 'NASA/JPL-Caltech', page: `https://images.nasa.gov/details/${p.id}`, source: encodeURI(href), ...size, note: p.note })
  }
  return out
}

// ---------------------------------------------------------------- MOLA roughness (NetCDF classic, read by byte range)
function parseNetcdfHeader(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (String.fromCharCode(buf[0], buf[1], buf[2]) !== 'CDF' || buf[3] !== 1) throw new Error('Not a NetCDF classic file')
  let o = 4
  const u32 = () => { const x = v.getUint32(o); o += 4; return x }
  const name = () => { const n = u32(); const s = new TextDecoder().decode(buf.subarray(o, o + n)); o += Math.ceil(n / 4) * 4; return s }
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 }
  const values = (type, n) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const at = o + i * SIZE[type]
      out.push(type === 3 ? v.getInt16(at) : type === 4 ? v.getInt32(at) : type === 5 ? v.getFloat32(at) : type === 6 ? v.getFloat64(at) : buf[at])
    }
    o += Math.ceil((n * SIZE[type]) / 4) * 4
    return type === 2 ? String.fromCharCode(...out).replace(/\0+$/, '') : out
  }
  const attrs = () => {
    const tag = u32(), n = u32(), a = {}
    if (tag === 0 && n === 0) return a
    for (let i = 0; i < n; i++) { const k = name(); const t = u32(); a[k] = values(t, u32()) }
    return a
  }
  u32() // numrecs
  const dims = []
  { const tag = u32(), n = u32(); if (tag || n) for (let i = 0; i < n; i++) dims.push({ name: name(), len: u32() }) }
  const global = attrs()
  const vars = {}
  { const tag = u32(), n = u32(); if (tag || n) for (let i = 0; i < n; i++) {
    const nm = name(); const nd = u32(); const ids = []; for (let k = 0; k < nd; k++) ids.push(u32())
    const at = attrs(); const type = u32(); const vsize = u32(); const begin = u32()
    vars[nm] = { dims: ids.map(d => dims[d]), attrs: at, type, vsize, begin }
  } }
  return { dims, global, vars, headerEnd: o, view: v }
}

function readVar(file, header, nm) {
  const va = header.vars[nm]
  const size = { 3: 2, 4: 4, 5: 4, 6: 8 }[va.type]
  const n = va.dims.reduce((a, d) => a * d.len, 1)
  const dv = new DataView(file.buffer, file.byteOffset + va.begin, n * size)
  return Array.from({ length: n }, (_, i) => va.type === 6 ? dv.getFloat64(i * 8) : va.type === 5 ? dv.getFloat32(i * 4) : va.type === 4 ? dv.getInt32(i * 4) : dv.getInt16(i * 2))
}

/** The raw grid (about 16.6 MB) is cached outside the repository and never committed. */
async function molaFile() {
  const cache = join(tmpdir(), 'spacer-nasa-cache', 'MOLA_roughness_slpcor_8ppd.grd')
  try { return new Uint8Array(await readFile(cache)) } catch { /* not cached yet */ }
  console.log('downloading MOLA roughness grid (about 16.6 MB) to', cache)
  const bytes = new Uint8Array(await (await get(URLS.mola)).arrayBuffer())
  await mkdir(dirname(cache), { recursive: true })
  await writeFile(cache, bytes)
  return bytes
}

async function molaAt(places) {
  const file = await molaFile()
  const h = parseNetcdfHeader(file)
  const [x0, x1] = readVar(file, h, 'x_range')
  const [y0, y1] = readVar(file, h, 'y_range')
  const [nx, ny] = readVar(file, h, 'dimension')
  const [dx, dy] = readVar(file, h, 'spacing')
  const z = h.vars.z
  const size = { 3: 2, 4: 4, 5: 4, 6: 8 }[z.type]
  const scale = z.attrs.scale_factor?.[0] ?? 1
  const offset = z.attrs.add_offset?.[0] ?? 0
  // GMT pixel registration: nx cells exactly span the range (2880 x 0.125 deg = 360 deg).
  const pixelReg = (z.attrs.node_offset?.[0] ?? 0) === 1 || Math.round((x1 - x0) / dx) === nx
  const zv = new DataView(file.buffer, file.byteOffset)
  const cell = (row, col) => {
    const at = z.begin + (row * nx + col) * size
    const raw = z.type === 5 ? zv.getFloat32(at) : z.type === 6 ? zv.getFloat64(at) : z.type === 4 ? zv.getInt32(at) : zv.getInt16(at)
    return Number.isFinite(raw) ? raw * scale + offset : null
  }
  const out = []
  for (const p of places) {
    const lon = ((p.lon % 360) + 360) % 360
    const col0 = Math.round((lon - x0) / dx - (pixelReg ? 0.5 : 0))
    const row0 = Math.round((y1 - p.lat) / dy - (pixelReg ? 0.5 : 0))
    const vals = []
    for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) {
      const row = row0 + r, col = (col0 + c + nx) % nx
      if (row < 0 || row >= ny) continue
      const v = cell(row, col)
      if (v !== null && !Number.isNaN(v)) vals.push(v)
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    out.push({ ...p, roughnessM: Math.round(mean * 100) / 100, cells: vals.length })
  }
  await save(join(DATA, 'mola-roughness-regions.json'), {
    source: URLS.mola,
    info: URLS.molaInfo,
    provider: 'NASA Goddard PGDA, Mars Orbiter Laser Altimeter (MOLA) slope-corrected pulse-width roughness (Neumann et al. 2003)',
    retrieved: today,
    grid: { lonRange: [x0, x1], latRange: [y0, y1], spacingDeg: [dx, dy], size: [nx, ny] },
    note: 'Terrain RMS roughness at the scale of a MOLA laser footprint, averaged over the 3 x 3 grid cells (about 22 km) around each place. It compares regions; it cannot see individual rocks or rover-scale slopes.',
    units: { roughnessM: 'm (RMS)' },
    places: out,
  })
  return out
}

// ---------------------------------------------------------------- Curiosity RAD (RadLab), mean absorbed dose rate
async function radiation() {
  const from = '2024-05-01', to = '2024-06-04' // RadLab's MSL-RAD-Surface records end on 2024-06-03.
  const url = `https://visualization.osdr.nasa.gov/radlab/api/?instrument_id=MSL-RAD-Surface&timestamp>=${from}&timestamp<${to}&absorbed_dose_rate&format=json`
  const j = await json(url)
  const col = j.columns.indexOf('absorbed_dose_rate')
  const v = j.data.map(r => r[col]).filter(x => typeof x === 'number')
  const uGyH = v.reduce((a, b) => a + b, 0) / v.length
  return {
    label: `Curiosity RAD, Gale Crater, ${from} to 2024-06-03`,
    source: url,
    info: 'https://visualization.osdr.nasa.gov/radlab/gui/data-api/',
    provider: 'NASA OSDR RadLab, Curiosity Radiation Assessment Detector (instrument MSL-RAD-Surface)',
    retrieved: today,
    readings: v.length,
    meanMicroGyPerHour: Math.round(uGyH * 1000) / 1000,
    mGyPerSol: Math.round(uGyH * 24.6597) / 1000,
    note: `Mean of ${v.length} absorbed-dose readings (about one every 17 min) over the last month RadLab holds. Measured at Gale Crater only; used for every site.`,
  }
}

// ---------------------------------------------------------------- run
// `--only=a,b` runs just those steps and keeps everything else as saved.
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean) ?? null
const want = step => !only || only.includes(step)
const saved = async file => { try { return JSON.parse(await readFile(join(DATA, file), 'utf8')) } catch { return null } }
const centre = async id => {
  const a = await saved(`${id}-area.json`)
  if (!a) throw new Error(`data/nasa/${id}-area.json is missing: run the "areas" step first`)
  return a.centre
}

const p = want('areas') ? await roverArea('perseverance') : await centre('perseverance')
const c = want('areas') ? await roverArea('curiosity') : await centre('curiosity')
if (want('satellite')) {
  await satellite('perseverance', p)
  await satellite('curiosity', c)
}
if (want('weather')) await rems()
if (want('roughness')) await molaAt([
  { id: 'jezero', name: 'Jezero Crater', where: `Perseverance, sol ${p.sol}`, lat: p.lat, lon: p.lon },
  { id: 'gale', name: 'Gale Crater', where: `Curiosity, sol ${c.sol}`, lat: c.lat, lon: c.lon },
])
if (['radiation', 'films', 'pictures'].some(want)) {
  const old = (await saved('site-references.json')) ?? {}
  await save(join(DATA, 'site-references.json'), {
    note: 'Hand-checked references used by the base-site bars. Each entry names its source.',
    retrieved: today,
    radiation: want('radiation') ? await radiation() : old.radiation,
    ice: {
      label: 'NASA SWIM subsurface ice map',
      swim: 'https://science.nasa.gov/photojournal/swim-map-shows-subsurface-water-ice-on-mars',
      note: 'The SWIM map covers roughly the equator to 60° N between about 172° E and 299° E, so neither Jezero nor Gale is on it. No ice score is given.',
    },
    driveFilms: want('films') ? await driveFilms() : old.driveFilms,
    pictures: want('pictures') ? await pictures() : old.pictures,
  })
}
