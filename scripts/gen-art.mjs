// Generates every original SVG asset bundled with SPACER into public/assets/.
// Run: npm run art. Output is committed so the game needs no tooling at runtime.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

const OUT = new URL('../public/assets/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const geo = JSON.parse(readFileSync(new URL('../src/art/geo.json', import.meta.url), 'utf8'))
const save = (name, w, h, body, defs = '') => writeFileSync(new URL(name, OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>\n`)

// Deterministic PRNG so the art is reproducible.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const r1 = n => Math.round(n * 10) / 10

const SUITS = {
  ember: ['#c8582a', '#8a3618', '#ec8a55'],
  aurora: ['#2bb4c9', '#17738a', '#7fe0ee'],
  sage: ['#5f9b55', '#3a6534', '#9ccc8b'],
  violet: ['#8456c4', '#553286', '#b897e6'],
}
const IVORY = '#ece4d2', IVORY_D = '#bfb49c', CHAR = '#24272c', CHAR_L = '#3a3f46', ORANGE = '#e0702a', MINT = '#6ef2c6', CYAN = '#5fd8f0'

// ---------------------------------------------------------------- Stars & Earth
function stars(w, h, n, maxR = 1.4) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const r = rnd() ** 3 * maxR + 0.3
    const o = 0.35 + rnd() * 0.65
    const tint = rnd() < 0.15 ? '#ffd9b0' : rnd() < 0.2 ? '#bcd8ff' : '#ffffff'
    s += `<circle cx="${r1(rnd() * w)}" cy="${r1(rnd() * h)}" r="${r1(r)}" fill="${tint}" opacity="${r1(o)}"/>`
  }
  return s
}

function earthSvg() {
  const W = 2400, H = 1200
  const defs = `
  <radialGradient id="space" cx="50%" cy="100%" r="90%"><stop offset="0" stop-color="#16243f"/><stop offset=".55" stop-color="#0a1020"/><stop offset="1" stop-color="#03050b"/></radialGradient>
  <radialGradient id="ocean" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#3f8fd0"/><stop offset=".45" stop-color="#1c5f9e"/><stop offset=".8" stop-color="#0d3460"/><stop offset="1" stop-color="#071a33"/></radialGradient>
  <radialGradient id="night" cx="85%" cy="40%" r="60%"><stop offset="0" stop-color="#02060f" stop-opacity=".92"/><stop offset=".6" stop-color="#02060f" stop-opacity=".5"/><stop offset="1" stop-color="#02060f" stop-opacity="0"/></radialGradient>
  <linearGradient id="atmo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ad8ff" stop-opacity="0"/><stop offset=".5" stop-color="#7cc6ff" stop-opacity=".85"/><stop offset="1" stop-color="#2f7fd6" stop-opacity="0"/></linearGradient>
  <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="blur20"><feGaussianBlur stdDeviation="22"/></filter>
  <clipPath id="globe"><circle cx="1200" cy="3050" r="2200"/></clipPath>`
  let land = ''
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * W, cy = 850 + rnd() * 400, rx = 60 + rnd() * 260, ry = 20 + rnd() * 70
    land += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${rnd() < .5 ? '#5d7f45' : '#9b8a5a'}" opacity=".75" transform="rotate(${r1(rnd() * 30 - 15)} ${r1(cx)} ${r1(cy)})"/>`
  }
  let clouds = ''
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * W, cy = 840 + rnd() * 380, rx = 30 + rnd() * 170, ry = 6 + rnd() * 22
    clouds += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="#fff" opacity="${r1(.35 + rnd() * .5)}"/>`
  }
  const body = `<rect width="${W}" height="${H}" fill="url(#space)"/>${stars(W, 800, 420, 1.8)}
  <circle cx="1200" cy="3050" r="2235" fill="#5fb8ff" opacity=".35" filter="url(#blur20)"/>
  <g clip-path="url(#globe)"><rect x="0" y="700" width="${W}" height="600" fill="url(#ocean)"/>
  <g filter="url(#blur3)">${land}</g><g filter="url(#blur3)">${clouds}</g>
  <rect x="0" y="700" width="${W}" height="600" fill="url(#night)"/></g>
  <circle cx="1200" cy="3050" r="2203" fill="none" stroke="#bfe6ff" stroke-width="5" opacity=".9" filter="url(#blur3)"/>
  <circle cx="1200" cy="3050" r="2212" fill="none" stroke="#5fb0ff" stroke-width="18" opacity=".5" filter="url(#blur8)"/>
  <ellipse cx="420" cy="860" rx="380" ry="40" fill="#fff6dc" opacity=".25" filter="url(#blur20)"/>`
  save('earth.svg', W, H, body, defs)
}

// ---------------------------------------------------------------- Ships
// The spacecraft docked at node A, seen through its window: the Shuttle orbiter from above, and
// the Crew Dragon and Starliner capsules from the side. Our own drawings of real spacecraft, with
// no agency or company markings. Each carries a name plate; stationFx.ts knows where it sits.
function shipSvg(id) {
  const W = 900, H = 420
  const defs = `
  <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset=".5" stop-color="${IVORY}"/><stop offset="1" stop-color="#9c937f"/></linearGradient>
  <linearGradient id="hullS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9b1a0"/><stop offset=".5" stop-color="#f4eee0"/><stop offset="1" stop-color="#cfc7b4"/></linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5059"/><stop offset="1" stop-color="#1b1e23"/></linearGradient>
  <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4047"/><stop offset="1" stop-color="#15171b"/></linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b77d"/><stop offset=".5" stop-color="#b9864b"/><stop offset="1" stop-color="#6e4b26"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe3e8"/><stop offset=".5" stop-color="#a3abb5"/><stop offset="1" stop-color="#5d646d"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff3ff"/><stop offset=".5" stop-color="#2a7f9c"/><stop offset="1" stop-color="#0d2833"/></linearGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e3354"/><stop offset=".5" stop-color="#2f5b8f"/><stop offset="1" stop-color="#1e3354"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".55"/></filter>`
  const cells = (x, y, w, h, cols, rows = 2) => {
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#panel)" stroke="#9fb6d1" stroke-width="2"/>`
    for (let i = 1; i < cols; i++) g += `<line x1="${x + (w / cols) * i}" y1="${y}" x2="${x + (w / cols) * i}" y2="${y + h}" stroke="#9fb6d1" stroke-width="1" opacity=".6"/>`
    for (let j = 1; j < rows; j++) g += `<line x1="${x}" y1="${y + (h / rows) * j}" x2="${x + w}" y2="${y + (h / rows) * j}" stroke="#9fb6d1" stroke-width="1" opacity=".6"/>`
    return g
  }
  const plate = (cx, w, name) => `<rect x="${cx - w / 2}" y="193" width="${w}" height="34" rx="6" fill="url(#metal)"/>
    <text x="${cx}" y="217" text-anchor="middle" font-family="Arial Narrow,Arial" font-weight="700" font-size="20" fill="#2b1a0b">${name}</text>`
  let body = ''
  if (id === 'shuttle') {
    // the orbiter in plan: double-delta wings, payload bay doors along the back, three main engines
    const wing = flip => `<g${flip ? ' transform="translate(0 420) scale(1 -1)"' : ''}>
      <path d="M640 170 L500 150 L330 52 L222 40 L206 170 Z" fill="url(#hull)"/>
      <path d="M640 170 L500 150 L330 52 L222 40" fill="none" stroke="#7d848d" stroke-width="7" stroke-linejoin="round"/>
      <path d="M222 44 L300 60 L296 168 L208 168 Z" fill="#d8d0bc" stroke="#a69c86" stroke-width="2"/>
      <line x1="252" y1="50" x2="250" y2="168" stroke="#a69c86" stroke-width="2"/></g>`
    body = `<g filter="url(#sh)">
    ${wing(false)}${wing(true)}
    <path d="M150 190 L112 180 L112 204 L150 204 Z M150 216 L112 216 L112 240 L150 230 Z M158 200 L104 198 L104 222 L158 220 Z" fill="url(#dark)"/>
    <rect x="150" y="150" width="124" height="34" rx="17" fill="#ddd5c2" stroke="#a69c86" stroke-width="2"/><rect x="150" y="236" width="124" height="34" rx="17" fill="#ddd5c2" stroke="#a69c86" stroke-width="2"/>
    <path d="M168 168 L640 168 Q770 172 826 210 Q770 248 640 252 L168 252 Q150 252 150 236 L150 184 Q150 168 168 168 Z" fill="url(#hull)"/>
    <path d="M770 188 Q812 198 826 210 Q812 222 770 232 Q790 210 770 188 Z" fill="url(#tile)"/>
    <rect x="290" y="176" width="336" height="68" rx="5" fill="#f1ebdc" stroke="#a69c86" stroke-width="2.5"/>
    <line x1="290" y1="210" x2="626" y2="210" stroke="#8c8576" stroke-width="2.5"/>
    ${[0, 1, 2, 3, 4].map(i => `<line x1="${346 + i * 56}" y1="176" x2="${346 + i * 56}" y2="244" stroke="#b9b09a" stroke-width="1.5"/>`).join('')}
    <rect x="172" y="206" width="112" height="8" rx="3" fill="url(#dark)"/>
    <path d="M668 186 L716 190 Q742 200 748 210 Q742 220 716 230 L668 234 Q684 210 668 186 Z" fill="url(#tile)"/>
    <path d="M690 192 L714 195 Q730 202 734 208 L690 207 Z M690 228 L714 225 Q730 218 734 212 L690 213 Z" fill="url(#glass)"/>
    <rect x="636" y="194" width="20" height="32" rx="4" fill="${ORANGE}" opacity=".85"/>
    ${plate(400, 132, 'ORBITER')}
    <circle cx="560" cy="210" r="7" fill="${MINT}"/></g>`
  } else if (id === 'falcon9') {
    // Crew Dragon from the side: a gumdrop capsule on a trunk that is half solar cells, with four fins
    body = `<g filter="url(#sh)">
    <path d="M250 118 L196 92 L196 132 L250 150 Z M250 302 L196 328 L196 288 L250 270 Z" fill="url(#dark)"/>
    <rect x="240" y="116" width="236" height="188" rx="8" fill="url(#hull)"/>
    ${cells(250, 122, 216, 62, 9, 2)}
    <rect x="240" y="286" width="236" height="10" fill="${CHAR_L}"/>
    <line x1="240" y1="238" x2="476" y2="238" stroke="#b9b09a" stroke-width="2"/>
    <path d="M476 108 L500 108 Q640 128 700 178 Q716 194 716 210 Q716 226 700 242 Q640 292 500 312 L476 312 Z" fill="url(#hull)"/>
    <path d="M476 108 L500 108 L500 312 L476 312 Z" fill="url(#tile)"/>
    <path d="M520 132 Q570 140 604 160 L590 196 L520 196 Z" fill="url(#dark)" opacity=".85"/><path d="M520 288 Q570 280 604 260 L590 224 L520 224 Z" fill="url(#dark)" opacity=".85"/>
    <rect x="534" y="150" width="34" height="26" rx="8" fill="url(#glass)"/><rect x="534" y="244" width="34" height="26" rx="8" fill="url(#glass)"/>
    <circle cx="612" cy="210" r="9" fill="#15171b"/><circle cx="640" cy="196" r="5" fill="#15171b"/><circle cx="640" cy="224" r="5" fill="#15171b"/>
    <path d="M700 178 Q716 194 716 210 Q716 226 700 242 L724 236 L724 184 Z" fill="url(#steel)"/>
    <path d="M704 172 Q760 140 790 150 Q768 168 724 184 Z" fill="url(#hullS)" stroke="#a69c86" stroke-width="2"/>
    ${plate(352, 124, 'DRAGON')}
    <circle cx="452" cy="262" r="7" fill="${MINT}"/></g>`
  } else {
    // Starliner from the side: a blunt cone on a wide service module with thruster pods and four abort engines
    body = `<g filter="url(#sh)">
    ${[128, 176, 224, 272].map(y => `<path d="M236 ${y} L204 ${y - 8} L204 ${y + 28} L236 ${y + 20} Z" fill="url(#dark)"/>`).join('')}
    <rect x="232" y="104" width="240" height="212" rx="8" fill="url(#hullS)"/>
    <rect x="232" y="104" width="240" height="212" rx="8" fill="url(#hull)" opacity=".55"/>
    <rect x="232" y="118" width="240" height="14" fill="url(#steel)"/><rect x="232" y="288" width="240" height="14" fill="url(#steel)"/>
    <rect x="300" y="86" width="96" height="24" rx="5" fill="url(#steel)" stroke="#5d646d" stroke-width="2"/><rect x="300" y="310" width="96" height="24" rx="5" fill="url(#steel)" stroke="#5d646d" stroke-width="2"/>
    ${[318, 348, 378].map(x => `<circle cx="${x}" cy="98" r="5" fill="#15171b"/><circle cx="${x}" cy="322" r="5" fill="#15171b"/>`).join('')}
    <line x1="232" y1="160" x2="472" y2="160" stroke="#b9b09a" stroke-width="2"/><line x1="232" y1="260" x2="472" y2="260" stroke="#b9b09a" stroke-width="2"/>
    <rect x="468" y="100" width="16" height="220" rx="3" fill="url(#tile)"/>
    <path d="M484 100 L692 166 L692 254 L484 320 Z" fill="url(#steel)"/>
    <path d="M484 100 L692 166 L692 254 L484 320 Z" fill="url(#hull)" opacity=".35"/>
    <path d="M484 150 L692 196 L692 224 L484 270 Z" fill="#3d5f86" opacity=".5"/>
    <rect x="540" y="146" width="36" height="26" rx="8" fill="url(#glass)" transform="rotate(17 558 159)"/>
    <rect x="540" y="248" width="36" height="26" rx="8" fill="url(#glass)" transform="rotate(-17 558 261)"/>
    <rect x="692" y="170" width="26" height="80" rx="4" fill="url(#metal)"/><rect x="718" y="182" width="12" height="56" rx="3" fill="url(#dark)"/>
    ${plate(352, 140, 'STARLINER')}
    <circle cx="450" cy="210" r="7" fill="${MINT}"/></g>`
  }
  save(`ship-${id}.svg`, W, H, body, defs)
}

// ---------------------------------------------------------------- Cockpit & exterior
function cockpitSvg() {
  const W = 1600, H = 900
  const defs = `<linearGradient id="dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f46"/><stop offset="1" stop-color="#121418"/></linearGradient>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1d21"/><stop offset=".5" stop-color="#3a3f46"/><stop offset="1" stop-color="#1b1d21"/></linearGradient>
  <filter id="gl"><feGaussianBlur stdDeviation="3"/></filter>`
  const body = `
  <path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M260 120 L1340 120 L1480 560 L120 560 Z" fill="url(#frame)"/>
  <path d="M800 120 L790 560 L810 560 Z" fill="#2b2f36"/>
  <path d="M0 560 L1600 560 L1600 900 L0 900 Z" fill="url(#dash)"/>
  <path d="M120 560 L1480 560 L1500 600 L100 600 Z" fill="#4e4a43"/>
  ${[0, 1, 2].map(i => `<rect x="${330 + i * 330}" y="630" width="270" height="150" rx="10" fill="#0b1c1c" stroke="#5a5d63" stroke-width="3"/>`).join('')}
  <path d="M350 740 L400 700 L450 715 L500 670 L560 660" stroke="${MINT}" stroke-width="3" fill="none"/>
  <circle cx="795" cy="705" r="50" fill="none" stroke="${CYAN}" stroke-width="2"/><path d="M745 705 h100 M795 655 v100" stroke="${CYAN}" stroke-width="1" opacity=".6"/>
  ${[...Array(10)].map((_, i) => `<rect x="${1010 + (i % 5) * 46}" y="${650 + Math.floor(i / 5) * 60}" width="30" height="30" rx="4" fill="${i % 3 ? '#2b2f36' : ORANGE}" stroke="#6b6250"/>`).join('')}
  <rect x="770" y="580" width="60" height="10" rx="4" fill="${ORANGE}" filter="url(#gl)"/>`
  save('cockpit.svg', W, H, body, defs)
}


// ---------------------------------------------------------------- High-detail station, crew, rover, Mars, sites
import * as HQ from './art-hq.mjs'

function suitSheets() {
  const phases = [0, 1, 0.35, -1, -0.35]
  for (const [id, pal] of Object.entries(SUITS)) {
    const defs = HQ.commonDefs + HQ.astronautDefs(id, pal)
    let body = ''
    ;['down', 'up', 'side'].forEach((dir, row) => phases.forEach((ph, col) => {
      body += `<g transform="translate(${col * 64} ${row * 96})">${HQ.astronaut(id, dir, ph)}</g>`
    }))
    save(`suit-${id}.svg`, 320, 288, body, defs)
    const prev = `<ellipse cx="80" cy="198" rx="50" ry="9" fill="#000" opacity=".35"/><g transform="translate(16 12) scale(2)">${HQ.astronaut(id, 'down', 0)}</g>`
    save(`preview-${id}.svg`, 160, 210, prev, defs)
  }
}

// The station: the walkable deck, its freestanding props, the view of it from outside, and the
// relay antenna seen through a window.
function station() {
  const d = HQ.deckSvg(geo)
  save('deck.svg', d.W, d.H, d.body, d.defs)
  for (const [k, p] of Object.entries(HQ.props(geo))) {
    save(`prop-${k}.svg`, p.w, p.h, `<g transform="translate(${-p.ox} ${-p.oy})">${p.body}</g>`, HQ.stationDefs)
  }
  const e = HQ.exteriorSvg({ ORANGE, IVORY })
  save('station-exterior.svg', e.W, e.H, e.body, e.defs)
  for (const [k, p] of Object.entries(HQ.relaySvg())) save(`ext-${k}.svg`, p.w, p.h, p.body, HQ.commonDefs)
}

earthSvg()
;['shuttle', 'falcon9', 'atlasv'].forEach(shipSvg)
suitSheets()
station()
cockpitSvg()
{ const m = HQ.marsSvg(geo); save('mars-sector.svg', m.W, m.H, m.body, m.defs) }
{ const r = HQ.roverSvg(); save('rover.svg', r.w, r.h, r.body, HQ.commonDefs) }
for (const id of ['shelf', 'hollow', 'plain']) { const s = HQ.siteSvg(id); save(`site-${id}.svg`, s.W, s.H, s.body, s.defs) }

console.log('SPACER art generated in public/assets/')
