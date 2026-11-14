// Greenhouse panels: the readable view of what the player can actually control in the station
// greenhouse. Overview first, technical detail on the selected bay or the service panels. Every
// number shown is read from the simulation (src/core/greenhouse.ts); nothing is kept here.
//
// The panels stay live while open: values are patched in place a few times a second, and a tab
// is redrawn only when its structure changes, so buttons do not move under the pointer.
import '../greenhouse.css'
import { CROPS, EVIDENCE_TEXT, PROCESS_TEXT, STAGES, STAGE_TEXT, crop, dli, flowers, type Crop, type CropId } from '../core/crops'
import {
  BAY_PLAN, BEYOND, FACTOR_IDS, FAULT_KINDS, GH, RECIPE_LIMITS, TIERS,
  type Alert, type AlertLevel, type Bay, type BayId, type FactorId, type FaultKind, type Greenhouse, type LoadId, type Reading, type ReadingId, type Recipe, type RepairId, type Symptom,
} from '../core/greenhouse'
import { TERMINALS, bayOf, isBayTerminal } from '../game/deck'
import type { BayStatus, GreenhouseView } from '../game/greenhouseFx'
import { sound } from '../audio'
import { esc, toast } from './dom'
import type { PanelCtx, Tab } from './panels'

const sheet = (id: CropId) => `${import.meta.env.BASE_URL}assets/crop-${id}.svg`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const pct = (f: number) => Math.round(clamp(f, 0, 1) * 100)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const kg = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1))

// ------------------------------------------------------------------ live tabs
type Vals = Record<string, string | number>
type Acts = Record<string, (d: DOMStringMap) => string | null | void>
interface LiveTab { key: () => string; html: () => string; vals: () => Vals; acts: Acts }
let live: { body: HTMLElement; tab: LiveTab; lastKey: string } | null = null
let pointerDown = false
window.addEventListener('pointerdown', () => { pointerDown = true }, true)
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, () => { pointerDown = false }, true)

function patch() {
  if (!live) return
  const v = live.tab.vals()
  live.body.querySelectorAll<HTMLElement>('[data-v]').forEach(e => { const t = String(v[e.dataset.v!] ?? ''); if (e.textContent !== t) e.textContent = t })
  live.body.querySelectorAll<HTMLElement>('[data-w]').forEach(e => { e.style.width = `${v[e.dataset.w!] ?? 0}%` })
  live.body.querySelectorAll<HTMLElement>('[data-c]').forEach(e => {
    const c = String(v[e.dataset.c!] ?? '')
    if (e.dataset.cls === c) return
    if (e.dataset.cls) e.classList.remove(e.dataset.cls)
    if (c) e.classList.add(c)
    e.dataset.cls = c
  })
}
function draw() {
  if (!live) return
  live.lastKey = live.tab.key()
  live.body.innerHTML = live.tab.html()
  patch()
}
function mount(body: HTMLElement, tab: LiveTab) {
  live = { body, tab, lastKey: '' }
  body.onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
    if (!b || !live || (b as HTMLButtonElement).disabled) return
    const err = live.tab.acts[b.dataset.act!]?.(b.dataset)
    if (err) { sound.play('fail'); toast(err, 'warn', 4200) } else sound.play('ui')
    draw()
  }
  draw()
}
/** Brings an open greenhouse panel up to date. The app calls this a few times a second. */
export function refreshGreenhousePanel() {
  if (!live) return
  if (!live.body.isConnected) { live = null; return }
  if (live.tab.key() !== live.lastKey && !pointerDown) draw()
  else patch()
}

// ------------------------------------------------------------------ shared pieces
const DEC: Record<ReadingId, number> = { temp: 1, rh: 0, pressure: 1, o2: 1, co2: 0, ph: 2, ec: 2, rootTemp: 1, tank: 0, battery: 0, reserve: 1 }
const readingRow = (r: Reading) => `<div class="ghr" data-c="rs-${r.id}"><span>${esc(r.label)}</span><b><span data-v="rv-${r.id}"></span> ${esc(r.unit)}</b><i data-v="rt-${r.id}"></i>
  <small>${r.target !== null ? `target ${r.target}` : ''}${r.target !== null && r.band ? ' · ' : ''}${r.band ? `band ${r.band[0]} to ${r.band[1]}` : ''}</small></div>`
function readingVals(gh: Greenhouse, v: Vals) {
  const all = gh.readings()
  for (const r of Object.values(all)) {
    const d = DEC[r.id], flat = Math.abs(r.trend) < 0.6 * 10 ** -d
    v[`rv-${r.id}`] = r.value.toFixed(d)
    v[`rt-${r.id}`] = flat ? '→ steady' : `${r.trend > 0 ? '↗ +' : '↘ −'}${Math.abs(r.trend).toFixed(Math.max(1, d))} / min`
    v[`rs-${r.id}`] = r.status
  }
  return all
}
const rows = (gh: Greenhouse, ids: ReadingId[]) => { const all = gh.readings(); return `<div class="ghrs">${ids.map(id => readingRow(all[id])).join('')}</div>` }

// The top status bar: where the station is in its orbit, and the three stocks that matter.
const statusBar = () => `<div class="ghbar" role="status"><span>Orbit <b data-v="orbit"></b></span><span data-c="sunc"><b data-v="sun"></b> <small data-v="sunnext"></small></span>
  <span data-c="battc">Battery <b data-v="batt"></b></span><span>Water <b data-v="tank"></b></span><span>Food <b data-v="food"></b></span><span data-c="alc"><b data-v="alerts"></b></span></div>`
function statusVals(gh: Greenhouse, v: Vals) {
  const x = gh.exterior, s = gh.summary()
  v.orbit = x.orbit
  v.sun = x.sunlit ? '☀ SUNLIT' : '☾ ECLIPSE'
  v.sunnext = `${x.sunlit ? 'sunset' : 'sunrise'} in ${mmss(x.nextChange)}`
  v.sunc = x.sunlit ? 'ok' : 'dim'
  v.batt = `${Math.round(gh.batteryPct)}%`
  v.battc = gh.batteryPct < 20 ? 'bad' : gh.batteryPct < 40 ? 'warn' : ''
  v.tank = `${Math.round(gh.tankL)} L`
  v.food = `${kg(gh.foodKg)} kg`
  v.alerts = s.alerts ? `⚠ ${s.alerts} alert${s.alerts > 1 ? 's' : ''}` : '✓ no alerts'
  v.alc = s.worst === 'damage' ? 'bad' : s.alerts ? 'warn' : 'ok'
}

const jobsKey = (gh: Greenhouse) => gh.jobs.map(j => j.id).join(',')
const jobsHtml = (gh: Greenhouse) => gh.jobs.length ? `<div class="gh-jobs">${gh.jobs.map(j => `<div class="gh-job"><span>${esc(j.label)}</span><div class="gbar"><i data-w="jw-${j.id}"></i></div><small data-v="jt-${j.id}"></small></div>`).join('')}</div>` : ''
function jobVals(gh: Greenhouse, v: Vals) { for (const j of gh.jobs) { v[`jw-${j.id}`] = pct(1 - j.left / j.total); v[`jt-${j.id}`] = `${Math.ceil(j.left)} s` } }

const LEVEL: Record<AlertLevel, [string, string]> = {
  warning: ['⚠ WARNING', 'A reading is off. The plants are not affected yet.'],
  degraded: ['▼ DEGRADED', 'Growth is being held back.'],
  damage: ['✖ DAMAGE', 'Plants are losing health.'],
  recovery: ['↻ RECOVERY', 'The cause is fixed. The plants are still recovering.'],
}
const alertsKey = (gh: Greenhouse, only?: (a: Alert) => boolean) => gh.alerts.filter(a => !only || only(a)).map(a => `${a.id}${a.level[0]}${+a.diagnosed}${+a.acknowledged}`).join(',')
function alertCard(gh: Greenhouse, a: Alert) {
  const [name, what] = LEVEL[a.level]
  const busy = gh.jobs.some(j => j.kind === 'diagnose' && j.target === String(a.id))
  return `<div class="gh-alert lv-${a.level} ${a.acknowledged ? 'acked' : ''}"><div class="gh-al-h"><span class="lv">${name}</span><b>${esc(a.title)}</b><small>${esc(what)}</small></div>
    <p>${esc(a.problem)}</p><p class="tr"><i>Trend</i> ${esc(a.trend)}</p><p class="ac"><i>Next</i> ${esc(a.action)}</p>${a.cause ? `<p class="ca"><i>Cause</i> ${esc(a.cause)}</p>` : ''}
    <div class="actions">${a.diagnosed || a.kind === 'crop' || a.kind === 'battery' || a.kind === 'water' ? '' : `<button class="btn small" data-act="diag" data-id="${a.id}" ${busy ? 'disabled' : ''}>${busy ? 'Diagnosing…' : 'Diagnose'}</button>`}
    ${a.acknowledged ? '<span class="donebadge">ACKNOWLEDGED</span>' : `<button class="btn small" data-act="ack" data-id="${a.id}">Acknowledge</button>`}</div></div>`
}
const alertActs = (gh: Greenhouse): Acts => ({ diag: d => gh.diagnose(Number(d.id)), ack: d => gh.acknowledge(Number(d.id)) })

const SYMPTOM_TEXT: Record<Symptom, string> = {
  none: 'Leaves look healthy.',
  wilt: 'Leaves are wilting. That can follow a dry root zone or too much heat: check the flow and the air temperature.',
  yellow: 'Leaves are yellowing. Several nutrient and root problems look the same: check pH, conductivity, the nutrient balance and the root temperature.',
  spots: 'Spots on the leaves. Long, humid air or a contaminated root zone can do this.',
}
const FACTOR_TEXT: Record<FactorId, string> = { temperature: 'Temperature', light: 'Light', water: 'Water', nutrient: 'Nutrients', gas: 'Air (CO2, O2, pressure)' }

/** How a bay is doing, in one word, for the rack lamp and the bay cards. */
export function bayStatus(b: Bay): BayStatus {
  if (!b.unlocked) return 'locked'
  const p = b.planting
  if (!p) return 'empty'
  if (p.stage === 'dead') return 'dead'
  if (p.stress > 60) return 'bad'
  if (p.stage === 'ready') return 'ready'
  if (p.needsPollination || p.spent) return 'care'
  if (p.stress > 35 || p.symptom !== 'none') return 'warn'
  return 'growing'
}
const STATUS_TEXT: Record<BayStatus, string> = { locked: 'Locked', empty: 'Empty', growing: 'Growing', ready: 'Ready to harvest', care: 'Needs a hand', warn: 'Under stress', bad: 'Losing health', dead: 'Dead' }

// ------------------------------------------------------------------ Greenhouse Control
function overviewTab(gh: Greenhouse, remote: boolean): LiveTab {
  const stepper = (k: keyof typeof RECIPE_LIMITS, label: string, unit: string, step: number) => {
    const [lo, hi] = RECIPE_LIMITS[k], val = gh.recipe[k]
    return `<div class="gh-step"><span>${label}</span><button class="btn small" data-act="rec" data-k="${k}" data-d="${-step}" ${val <= lo ? 'disabled' : ''} aria-label="Lower ${label}">−</button><b>${val} ${unit}</b><button class="btn small" data-act="rec" data-k="${k}" data-d="${step}" ${val >= hi ? 'disabled' : ''} aria-label="Raise ${label}">+</button></div>`
  }
  return {
    key: () => `ov|${gh.commissioned}|${gh.exterior.arrayState}|${gh.exterior.radiation}|${JSON.stringify(gh.recipe)}|${gh.tier}|${gh.bays.map(b => `${bayStatus(b)}${b.planting?.crop ?? ''}`).join(',')}|${jobsKey(gh)}`,
    html: () => `${statusBar()}
      ${remote ? '<p class="gh-note">Remote view from Hab Systems, a shielded part of the station. Planting, harvesting and repairs are done in the greenhouse itself.</p>' : ''}
      ${gh.commissioned ? '' : '<div class="feedback">The module is docked and idle. Nothing drifts and nothing fails until the first crop is planted: walk to bay A1, A2 or A3 and plant one. The greenhouse is optional and is scored on its own.</div>'}
      <div class="gh-sec"><h3>Outside the module <small>the station orbit, at 30× like the windows</small></h3>
        <div class="gh-ext">
          <div class="gx"><span>Sunlight on the array</span><b data-v="sunpct"></b><small>REAL: ${GH.solarFluxWm2.toLocaleString('en-US')} W/m² in full sun at Earth's distance</small></div>
          <div class="gx" data-c="arrc"><span>Greenhouse array</span><b data-v="array"></b><small data-v="arraynote"></small></div>
          <div class="gx" data-c="radc"><span>Space weather</span><b data-v="rad"></b><small data-v="radnote"></small></div>
          <div class="gx"><span>Outside pressure</span><b>0 kPa</b><small>Vacuum. A leak only ever goes one way.</small></div>
        </div>
        <div class="actions">${gh.exterior.arrayState === 'string offline' ? `<button class="btn small mint" data-act="array" ${remote ? 'disabled' : ''}>Inspect the array and reset the string</button>` : ''}
          <button class="btn small ${gh.recipe.eclipseDim ? 'mint' : ''}" data-act="dim">Dim lights in eclipse: ${gh.recipe.eclipseDim ? 'on' : 'off'}</button></div>
      </div>
      <div class="gh-sec"><h3>Inside <small>reading · target · trend over the last ten seconds</small></h3>${rows(gh, ['temp', 'rh', 'pressure', 'o2', 'co2'])}</div>
      <div class="gh-sec"><h3>Environmental recipe <small>game presets, yours to change</small></h3>
        <div class="gh-steps">${stepper('tempLitC', 'Air, lights on', '°C', 1)}${stepper('tempDarkC', 'Air, lights off', '°C', 1)}${stepper('rhPct', 'Humidity', '%', 5)}${stepper('co2Ppm', 'CO2', 'ppm', 100)}${stepper('photoperiodH', 'Lights each day', 'h', 1)}</div>
        <p class="gh-note">Daily light = canopy light × lit seconds ÷ 1,000,000. At 250 µmol/m²/s for ${gh.recipe.photoperiodH} h that is <b>${dli(250, gh.recipe.photoperiodH).toFixed(1)} mol/m²/day</b>. Longer days grow more and draw more power.</p>
      </div>
      <div class="gh-sec"><h3>Bays <small>${gh.plantedM2.toFixed(1)} m² planted of ${gh.openM2.toFixed(1)} m² open</small></h3>
        <div class="gh-bays">${gh.bays.map(b => { const st = bayStatus(b), p = b.planting; return `<div class="ghb st-${st}" title="${STATUS_TEXT[st]}"><b>${b.id}</b><span>${p ? esc(crop(p.crop).name) : st === 'locked' ? `Level ${BAY_PLAN[b.id].tier}` : b.kind === 'tier' ? 'Leaf rack' : 'Trellis bay'}</span><small data-v="b-${b.id}"></small><div class="gbar"><i data-w="bw-${b.id}"></i></div></div>` }).join('')}</div>
      </div>${jobsHtml(gh)}`,
    vals: () => {
      const v: Vals = {}, x = gh.exterior
      statusVals(gh, v); readingVals(gh, v); jobVals(gh, v)
      v.sunpct = `${pct(x.sunlight)}%`
      v.array = x.arrayState === 'tracking' ? `Tracking · ${gh.generationKw.toFixed(1)} kW` : x.arrayState === 'feathered' ? 'FEATHERED' : 'STRING OFFLINE'
      v.arraynote = x.arrayState === 'tracking' ? 'Making what the light allows.' : x.arrayState === 'feathered' ? 'Turned edge-on for a visiting vehicle. Shed loads or tie in the station bus until it turns back.' : 'One string did not reconnect. Output stays low until it is inspected.'
      v.arrc = x.arrayState === 'tracking' ? '' : 'warn'
      v.rad = x.radiation === 'quiet' ? 'Quiet' : x.radiation === 'watch' ? '⚠ WATCH' : '☢ PARTICLE STORM'
      v.radnote = x.radiation === 'quiet' ? 'No solar particle event.' : x.radiation === 'watch' ? 'A solar particle event is forecast. Plan to leave the module.' : `Leave the module and work from a shielded node. Dose so far ${gh.doseMsv.toFixed(2)} mSv (game value).`
      v.radc = x.radiation === 'quiet' ? '' : x.radiation === 'watch' ? 'warn' : 'bad'
      for (const b of gh.bays) {
        const p = b.planting, s = gh.secondsToHarvest(b.id)
        v[`b-${b.id}`] = !b.unlocked ? 'Locked' : !p ? 'Empty' : p.stage === 'dead' ? 'Dead: clear it' : p.stage === 'ready' ? 'Ready' : `${STAGE_TEXT[p.stage]}${s !== null && Number.isFinite(s) ? ` · ${Math.ceil(s)} s` : ''}`
        v[`bw-${b.id}`] = p ? pct(p.progress) : 0
      }
      return v
    },
    acts: {
      rec: d => gh.setRecipe({ [d.k as keyof Recipe]: (gh.recipe[d.k as keyof typeof RECIPE_LIMITS]) + Number(d.d) } as Partial<Recipe>),
      dim: () => gh.setRecipe({ eclipseDim: !gh.recipe.eclipseDim }),
      array: () => gh.repair('array'),
    },
  }
}

const DRILL: Record<FaultKind, string> = {
  arrayFeather: 'Array feathered', arrayString: 'Array string offline', irrigation: 'Irrigation failure', climate: 'Climate-control failure', humidity: 'High humidity',
  nutrient: 'Nutrient problem', leak: 'Pressure leak', contamination: 'Root contamination', radiation: 'Solar particle event',
}
function alertsTab(gh: Greenhouse): LiveTab {
  return {
    key: () => `al|${alertsKey(gh)}|${jobsKey(gh)}|${gh.log.length}|${gh.commissioned}`,
    html: () => `${statusBar()}
      <div class="gh-sec"><h3>Alerts <small>problem · trend · affected bay · next action</small></h3>
        ${gh.alerts.length ? gh.alerts.map(a => alertCard(gh, a)).join('') : '<div class="feedback ok">No alerts. Every reading is in its band.</div>'}
        <p class="gh-note">Every problem moves through four stages: warning, degraded, damage, recovery. Fixing a pump does not bring back a dead plant, and it does not fix anything else.</p>
      </div>${jobsHtml(gh)}
      <div class="gh-sec"><h3>Module log</h3><div class="logl">${gh.log.slice(-14).reverse().map(e => `<div><span style="color:#5fd8f0">${mmss(e.at)}</span> ${esc(e.text)}</div>`).join('') || '<div>Nothing yet.</div>'}</div></div>
      <details class="gh-drill"><summary>Run a drill</summary><p class="gh-note">Starts a real failure now, for practice or to show the module to someone. It counts like any other.</p>
        <div class="actions">${FAULT_KINDS.map(k => `<button class="btn small" data-act="drill" data-k="${k}" ${gh.commissioned ? '' : 'disabled'}>${DRILL[k]}</button>`).join('')}</div></details>`,
    vals: () => { const v: Vals = {}; statusVals(gh, v); jobVals(gh, v); return v },
    acts: { ...alertActs(gh), drill: d => gh.inject(d.k as FaultKind) },
  }
}

function progressTab(gh: Greenhouse): LiveTab {
  return {
    key: () => { const u = gh.unlockStatus(); return `pr|${gh.tier}|${u.ready}|${u.missing}|${gh.harvestCount}|${gh.inventory.variety.length}|${gh.score().parts.map(p => p.points).join(',')}` },
    html: () => {
      const u = gh.unlockStatus(), sc = gh.score()
      return `${statusBar()}
      <div class="gh-sec"><h3>Greenhouse score <small>its own line, beside the base score</small></h3>
        <div class="gh-score"><b>${sc.total}</b><span>/ 100</span></div>
        <div class="gh-parts">${sc.parts.map(p => `<div class="gh-part"><span>${esc(p.label)}</span><div class="gbar"><i style="width:${pct(p.points / p.max)}%"></i></div><b>${p.points} / ${p.max}</b><small>${esc(p.why)}</small></div>`).join('')}</div>
      </div>
      <div class="gh-sec"><h3>How far the module has come</h3>
        <div class="gh-metrics"><div><span>Food coverage</span><b data-v="cover"></b><small>of one crew member's calories, since the first planting</small></div>
          <div><span>Water recovery</span><b data-v="recov"></b><small>of transpired water condensed and returned</small></div>
          <div><span>Growing area</span><b data-v="area"></b><small>planted, of ${gh.openM2.toFixed(1)} m² open. All eight bays hold 28.8 m².</small></div></div>
        <p class="gh-note">NASA's controlled-environment studies estimated roughly 20 to 25 m² of crops for one person's oxygen and around 50 m² for their calories. Those are research estimates under their study assumptions, not a sizing rule; they are why one module does not feed a crew.</p>
      </div>
      <div class="gh-sec"><h3>Levels</h3>${TIERS.map(t => `<div class="gh-tier ${t.level < gh.tier ? 'done' : t.level === gh.tier ? 'now' : ''}"><b>${t.level}. ${esc(t.name)}</b><span>${esc(t.text)}</span>
          <small>${t.level <= gh.tier ? `Open: ${esc(t.unlocks)}` : `Needs: ${esc(t.needs)} Opens: ${esc(t.unlocks)}`}</small>
          ${u.next?.level === t.level ? `<div class="actions"><button class="btn ${u.ready ? 'primary' : ''}" data-act="unlock" ${u.ready ? '' : 'disabled'}>Unlock level ${t.level}</button>${u.ready ? '' : `<span class="gh-miss">${esc(u.missing)}</span>`}</div>` : ''}</div>`).join('')}
        <p class="gh-note">Beyond one module (where the idea leads; nothing here builds them): ${BEYOND.map(esc).join(' → ')}.</p>
      </div>`
    },
    vals: () => { const v: Vals = {}; statusVals(gh, v); v.cover = `${gh.foodCoveragePct.toFixed(0)}%`; v.recov = gh.transpiredL > 1 ? `${gh.recoveryPct.toFixed(0)}%` : '—'; v.area = `${gh.plantedM2.toFixed(1)} m²`; return v },
    acts: { unlock: () => gh.unlock() },
  }
}

function sourcesTab(): LiveTab {
  const row = (kind: 'real' | 'model', title: string, text: string) => `<div class="src ${kind}"><div><b>${title}</b><span>${text}</span></div><em>${kind === 'real' ? 'NASA research' : 'Our game model'}</em></div>`
  return {
    key: () => 'src',
    html: () => `<p class="lead">The greenhouse is an original game module. NASA's plant research decides what is in it; every number is ours and stays editable.</p><div class="srcs">
      ${row('real', 'Crops grown in space', 'NASA reports lettuces, Chinese cabbage, mustard greens, kale, tomatoes, radishes and chile peppers grown in orbit. The six fresh crops here come from that list.')}
      ${row('real', 'Staple crops studied on the ground', 'NASA has studied wheat, soybeans, potatoes, rice and sweet potatoes in controlled chambers. Potato, dwarf wheat and soybean here come from that work.')}
      ${row('real', 'What a plant chamber can control', "NASA's Advanced Plant Habitat on the ISS controls temperature from 18 to 30 °C, CO2 from 400 to 5,000 ppm and light up to 1,000 µmol/m²/s, with more than 180 sensors. Those are equipment capabilities, not ideal settings.")}
      ${row('real', 'How much growing area a person needs', 'About 20 to 25 m² of crops for one person’s oxygen and around 50 m² for their calories, in NASA’s controlled-environment studies. Approximate, and tied to those studies’ assumptions.')}
      ${row('real', 'Sunlight in orbit', `${GH.solarFluxWm2.toLocaleString('en-US')} W/m² at Earth's distance from the Sun.`)}
      ${row('model', 'Every setting and timer', 'The starter recipe (101 kPa, 21 % oxygen, 22 °C, 60 % humidity, 1,000 ppm CO2, pH 6.0, 1.6 mS/cm, 250 µmol/m²/s for 16 hours), each crop’s temperature and light band, and its days to harvest.')}
      ${row('model', 'Growth as a cooldown', 'One crop day passes each second in good conditions, so a 30-day lettuce is ready in about 30 seconds. Growth is potential × temperature × light × water × nutrient × air. It is not a calibrated crop model.')}
      ${row('model', 'Yields and food values', 'Kilograms per square metre, calories and protein are approximate game values. They are not NASA yields.')}
      ${row('model', 'Power, water and air', 'The 7.2 kW array, the 6 kWh battery, 3 µmol of light per joule, water uptake and recovery, the leak and its reserve. Energy is kW × hours on the station’s 30× clock.')}
      ${row('model', 'Failures and the score', 'How often things fail, how fast plants suffer, repair times, the radiation dose and all seven parts of the score are balancing numbers, not scientific constants.')}
      ${row('model', 'A station, not Mars', 'The source material describes a Mars greenhouse. Here it is berthed to the station: dust storms became the array feathering for a visiting vehicle, and dust on the panels became a string that stays offline.')}
    </div>`,
    vals: () => ({}),
    acts: {},
  }
}

// ------------------------------------------------------------------ Service Bay
const repairBtn = (what: RepairId, label: string, gh: Greenhouse) => { const busy = gh.jobs.some(j => j.kind === 'repair' && j.target === what); return `<button class="btn small" data-act="repair" data-w="${what}" ${busy ? 'disabled' : ''}>${busy ? 'Repairing…' : label}</button>` }
const loopFlow = (gh: Greenhouse, loop: 'A' | 'B') => { const bs = gh.bays.filter(b => b.loop === loop && b.unlocked); return bs.length ? bs.reduce((a, b) => a + b.flow, 0) / bs.length : 0 }

function irrigationTab(gh: Greenhouse): LiveTab {
  const mine = (a: Alert) => a.kind === 'irrigation' || a.kind === 'nutrient' || a.kind === 'water' || a.kind === 'contamination'
  return {
    key: () => `ir|${alertsKey(gh, mine)}|${jobsKey(gh)}|${gh.labTest?.at ?? ''}|${gh.inventory.nutrientStock}|${gh.inventory.sanitizer}|${gh.makeupUsesLeft}|${gh.tier}`,
    html: () => `${statusBar()}${gh.alerts.filter(mine).map(a => alertCard(gh, a)).join('')}
      <div class="gh-sec"><h3>Nutrient loop <small>recirculating hydroponics: tank → racks → back to the tank</small></h3>${rows(gh, ['tank', 'ph', 'ec', 'rootTemp'])}
        <div class="gh-ext"><div class="gx" data-c="fa"><span>Loop A flow (bays A1 to A4)</span><b data-v="flowA"></b></div><div class="gx" data-c="fb"><span>Loop B flow (bays B1 to B4)</span><b data-v="flowB"></b></div>
          <div class="gx"><span>Nutrient stock</span><b>${gh.inventory.nutrientStock.toFixed(2)} units</b></div><div class="gx"><span>Sanitiser</span><b>${gh.inventory.sanitizer} dose${gh.inventory.sanitizer === 1 ? '' : 's'}</b></div></div>
        <div class="actions"><button class="btn small" data-act="mix">Mix a fresh batch · 1 stock</button><button class="btn small" data-act="dose" data-w="nutrient">Dose nutrients · ¼ stock</button>
          <button class="btn small" data-act="dose" data-w="phUp">pH up</button><button class="btn small" data-act="dose" data-w="phDown">pH down</button>
          <button class="btn small" data-act="flush">Flush · costs water</button><button class="btn small" data-act="test">Lab test</button>
          <button class="btn small" data-act="makeup" ${gh.makeupUsesLeft ? '' : 'disabled'}>Top up from the station · ${gh.makeupUsesLeft} left</button></div>
        ${gh.tier >= 4 ? '<p class="gh-note">Level 4: the module doses pH and nutrients by itself while stock lasts. The balance still needs a fresh mix.</p>' : ''}
        <div class="feedback ${gh.labTest ? (gh.labTest.balance > 0.7 ? 'ok' : 'warn') : ''}">${gh.labTest ? `Lab test at ${mmss(gh.labTest.at)}: nutrient balance ${pct(gh.labTest.balance)}%. ${esc(gh.labTest.note)}` : 'No lab test yet. Conductivity only says how much is dissolved, not whether the nutrients are in balance: different salts read the same. A lab test shows the balance.'}</div>
      </div>
      <div class="gh-sec"><h3>Pumps and lines</h3><div class="actions">${repairBtn('pumpA', 'Repair pump A', gh)}${repairBtn('pumpB', 'Repair pump B', gh)}</div>
        <p class="gh-note">A blocked line to one bay is cleared at that bay. Diagnose a flow alert first: repairing a healthy pump only loses time.</p></div>
      <div class="gh-sec"><h3>Where the water is</h3><div class="gh-metrics"><div><span>Transpired by the plants</span><b data-v="transp"></b></div><div><span>Condensed and returned</span><b data-v="recov"></b></div><div><span>Lost</span><b data-v="lost"></b></div></div>
        <p class="gh-note">Water going round the loop is not water used up. What leaves is what the plants keep and what the dehumidifier fails to return.</p></div>${jobsHtml(gh)}`,
    vals: () => {
      const v: Vals = {}
      statusVals(gh, v); readingVals(gh, v); jobVals(gh, v)
      for (const l of ['A', 'B'] as const) { const f = loopFlow(gh, l); v[`flow${l}`] = `${pct(f)}%`; v[l === 'A' ? 'fa' : 'fb'] = f < 0.5 && gh.commissioned ? 'bad' : '' }
      v.transp = `${gh.transpiredL.toFixed(0)} L`; v.recov = `${gh.recoveredL.toFixed(0)} L${gh.transpiredL > 1 ? ` (${gh.recoveryPct.toFixed(0)}%)` : ''}`; v.lost = `${gh.lostL.toFixed(0)} L`
      return v
    },
    acts: { ...alertActs(gh), mix: () => gh.mix(), dose: d => gh.dose(d.w as 'nutrient' | 'phUp' | 'phDown'), flush: () => gh.flush(), test: () => gh.testSolution(), makeup: () => gh.requestMakeup(), repair: d => gh.repair(d.w as RepairId) },
  }
}

function powerTab(gh: Greenhouse): LiveTab {
  const mine = (a: Alert) => a.kind === 'battery' || a.kind === 'arrayFeather' || a.kind === 'arrayString'
  return {
    key: () => `pw|${alertsKey(gh, mine)}|${gh.priority.join(',')}|${gh.loads.map(l => `${+l.on}${+l.shed}`).join('')}|${gh.backupUsesLeft}|${gh.backupLeft > 0}|${gh.recipe.photoperiodH}|${gh.recipe.eclipseDim}|${gh.exterior.arrayState}|${jobsKey(gh)}`,
    html: () => {
      const order = gh.priority.map(id => gh.loads.find(l => l.id === id)!).filter(Boolean)
      return `${statusBar()}${gh.alerts.filter(mine).map(a => alertCard(gh, a)).join('')}
      <div class="gh-sec"><h3>Power <small>generation → bus → battery → loads</small></h3>
        <div class="gh-metrics"><div><span>Generation</span><b data-v="gen"></b><small data-v="gennote"></small></div><div><span>Load</span><b data-v="load"></b><small data-v="net"></small></div>
          <div data-c="battc"><span>Battery</span><b data-v="kwh"></b><small data-v="endur"></small></div></div>
        <p class="gh-note">Energy in kWh = power in kW × hours. The module's clock runs 30× like the windows, so one eclipse is about 35 minutes of battery. A percentage alone cannot say how long it lasts: capacity and the net draw are shown with it.</p>
      </div>
      <div class="gh-sec"><h3>Loads <small>most protected first; an empty battery sheds from the bottom</small></h3>
        <div class="gh-loads">${order.map((l, i) => `<div class="gh-load ${l.shed ? 'shed' : l.on ? '' : 'off'}"><b>${i + 1}. ${esc(l.name)}</b><span data-v="lk-${l.id}"></span><em>${l.essential ? 'ALWAYS ON' : l.shed ? 'SHED' : l.on ? 'ON' : 'OFF'}</em>
          <span class="gh-load-b">${l.essential ? '' : `<button class="btn small" data-act="sw" data-id="${l.id}">${l.on ? 'Switch off' : 'Switch on'}</button>`}<button class="btn small" data-act="mv" data-id="${l.id}" data-d="-1" ${i === 0 || l.essential || order[i - 1].essential ? 'disabled' : ''} aria-label="Protect ${esc(l.name)} more">▲</button><button class="btn small" data-act="mv" data-id="${l.id}" data-d="1" ${i === order.length - 1 || l.essential ? 'disabled' : ''} aria-label="Protect ${esc(l.name)} less">▼</button></span></div>`).join('')}</div>
        <div class="actions"><button class="btn small" data-act="backup" ${gh.backupUsesLeft && gh.backupLeft <= 0 ? '' : 'disabled'}>${gh.backupLeft > 0 ? 'Station bus tied in' : `Tie in the station bus · +${GH.backupKw} kW for ${GH.backupSeconds} s · ${gh.backupUsesLeft} left`}</button>
          ${gh.exterior.arrayState === 'string offline' ? repairBtn('array', 'Inspect the array and reset the string', gh) : ''}</div>
      </div>
      <div class="gh-sec"><h3>Light schedule</h3><div class="gh-steps"><div class="gh-step"><span>Lights each day</span><button class="btn small" data-act="ph" data-d="-1" ${gh.recipe.photoperiodH <= RECIPE_LIMITS.photoperiodH[0] ? 'disabled' : ''}>−</button><b>${gh.recipe.photoperiodH} h on / ${24 - gh.recipe.photoperiodH} h off</b><button class="btn small" data-act="ph" data-d="1" ${gh.recipe.photoperiodH >= RECIPE_LIMITS.photoperiodH[1] ? 'disabled' : ''}>+</button></div></div>
        <div class="actions"><button class="btn small ${gh.recipe.eclipseDim ? 'mint' : ''}" data-act="dim">Dim lights in eclipse: ${gh.recipe.eclipseDim ? 'on' : 'off'}</button></div>
        <p class="gh-note">Crop days pass far faster than an orbit, so the lights draw their daily average: a ${gh.recipe.photoperiodH}-hour day draws ${pct(gh.recipe.photoperiodH / 24)}% of full. Each bay's own light level is set at the bay.</p></div>${jobsHtml(gh)}`
    },
    vals: () => {
      const v: Vals = {}, net = gh.generationKw - gh.loadKw, e = gh.enduranceH
      statusVals(gh, v); jobVals(gh, v)
      v.gen = `${gh.generationKw.toFixed(2)} kW`; v.gennote = `${pct(gh.exterior.sunlight)}% sun · array at ${pct(gh.exterior.arrayHealth)}%${gh.backupLeft > 0 ? ` · station bus ${Math.ceil(gh.backupLeft)} s` : ''}`
      v.load = `${gh.loadKw.toFixed(2)} kW`; v.net = `net ${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(2)} kW`
      v.kwh = `${gh.batteryKwh.toFixed(2)} of ${GH.batteryKwh} kWh · ${Math.round(gh.batteryPct)}%`
      v.endur = e === null ? 'charging' : `${e < 1 ? `${Math.round(e * 60)} min` : `${e.toFixed(1)} h`} of station time at this draw`
      for (const l of gh.loads) v[`lk-${l.id}`] = `${l.kw.toFixed(2)} kW${l.kw === 0 && l.wantKw > 0 ? ` (wants ${l.wantKw.toFixed(2)})` : ''}`
      return v
    },
    acts: { ...alertActs(gh), sw: d => { const l = gh.loads.find(q => q.id === d.id)!; return gh.setLoadOn(l.id, !l.on) }, mv: d => gh.movePriority(d.id as LoadId, Number(d.d) as -1 | 1), backup: () => gh.useBackup(), repair: d => gh.repair(d.w as RepairId), ph: d => gh.setRecipe({ photoperiodH: gh.recipe.photoperiodH + Number(d.d) }), dim: () => gh.setRecipe({ eclipseDim: !gh.recipe.eclipseDim }) },
  }
}

function airTab(gh: Greenhouse): LiveTab {
  const mine = (a: Alert) => a.kind === 'climate' || a.kind === 'humidity' || a.kind === 'leak' || a.kind === 'radiation'
  return {
    key: () => `air|${alertsKey(gh, mine)}|${jobsKey(gh)}|${gh.compartmentClosed}`,
    html: () => { const leak = gh.alerts.find(a => a.kind === 'leak'); return `${statusBar()}${gh.alerts.filter(mine).map(a => alertCard(gh, a)).join('')}
      <div class="gh-sec"><h3>Air <small>circulation → humidity removal → gas control → growing bays</small></h3>${rows(gh, ['temp', 'rh', 'co2', 'o2'])}
        <div class="actions">${repairBtn('thermal', 'Repair the thermal unit', gh)}${repairBtn('dehumidifier', 'Repair the dehumidifier', gh)}</div>
        <p class="gh-note">Lights and equipment heat the air even though it is cold outside, and vacuum carries no heat away. With the thermal unit down, dimming or switching off lights buys time. Plants make oxygen in the light and use some day and night: net oxygen to the cabin so far <b data-v="o2made"></b> (game value).</p></div>
      <div class="gh-sec"><h3>Hull and pressure <small>a leak drains the reserve first, then the room, slowly</small></h3>${rows(gh, ['pressure', 'reserve'])}
        <div class="actions">${leak && !leak.diagnosed ? `<button class="btn small" data-act="diag" data-id="${leak.id}" ${gh.jobs.some(j => j.kind === 'diagnose' && j.target === String(leak.id)) ? 'disabled' : ''}>Locate the leak</button>` : ''}
          <button class="btn small ${gh.compartmentClosed ? 'mint' : ''}" data-act="close">${gh.compartmentClosed ? 'Open the compartment' : 'Close the leaking compartment'}</button>${repairBtn('seal', 'Repair the seal', gh)}</div>
        <p class="gh-note">Locate it, close that compartment to stop the loss, repair the seal, then open it again. Opening costs a little reserve to bring the compartment back to pressure.</p></div>${jobsHtml(gh)}` },
    vals: () => { const v: Vals = {}; statusVals(gh, v); readingVals(gh, v); jobVals(gh, v); v.o2made = `${gh.o2MadeKg.toFixed(2)} kg`; return v },
    acts: { ...alertActs(gh), repair: d => gh.repair(d.w as RepairId), close: () => gh.closeCompartment(!gh.compartmentClosed) },
  }
}

// ------------------------------------------------------------------ Seed Bank & Galley
const harvestText = (c: Crop) => c.harvest.kind === 'cut' ? `cut leaves up to ${c.harvest.max} times` : c.harvest.kind === 'pick' ? `pick ripe fruit up to ${c.harvest.max} times` : 'whole plant, once'
function cropCard(gh: Greenhouse, c: Crop, action: string) {
  const open = c.tier <= gh.tier
  return `<div class="gh-crop ${open ? '' : 'locked'}"><div class="gh-thumb" style="background-image:url(${sheet(c.id)})"></div><div><h4>${esc(c.name)} <small>${c.bay === 'tier' ? 'leaf rack' : 'trellis bay'}</small></h4>
    <p>${esc(c.look)} ${esc(c.role)}</p>
    <div class="stats">${c.tempC[0]} to ${c.tempC[1]} °C · ${c.ppfd[0]} to ${c.ppfd[1]} µmol/m²/s · ${c.timerDays} crop days (about ${Math.round(c.timerDays * GH.secondsPerCropDay)} s) · ${harvestText(c)}${c.processing.length ? ` · then ${c.processing.map(p => PROCESS_TEXT[p].toLowerCase()).join(', ')}` : ''}</div>
    <div class="gh-ev ${c.evidence}">${c.evidence === 'space' ? 'REAL' : 'REAL'} · ${esc(EVIDENCE_TEXT[c.evidence])} · the numbers are our model</div>${open ? action : `<div class="why">Opens at level ${c.tier}.</div>`}</div></div>`
}
function seedsTab(gh: Greenhouse): LiveTab {
  return {
    key: () => `sd|${JSON.stringify(gh.inventory.seeds)}|${gh.tier}|${jobsKey(gh)}`,
    html: () => `${statusBar()}<p class="lead">One seed packet plants one bay. Harvesting food does not make seed: keep a planting for seed at its bay, or ask the next cargo run.</p>
      <div class="gh-crops">${CROPS.map(c => cropCard(gh, c, `<div class="actions"><span class="donebadge">${gh.inventory.seeds[c.id]} packet${gh.inventory.seeds[c.id] === 1 ? '' : 's'}</span><button class="btn small" data-act="resupply" data-c="${c.id}" ${gh.jobs.some(j => j.kind === 'resupply') ? 'disabled' : ''}>Ask the cargo run for seed</button></div>`)).join('')}</div>${jobsHtml(gh)}`,
    vals: () => { const v: Vals = {}; statusVals(gh, v); jobVals(gh, v); return v },
    acts: { resupply: d => gh.resupply(d.c as CropId) },
  }
}
function foodTab(gh: Greenhouse): LiveTab {
  const inv = () => gh.inventory
  return {
    key: () => `fd|${CROPS.map(c => `${inv().food[c.id].toFixed(1)}/${inv().raw[c.id].toFixed(1)}`).join(',')}|${inv().residueKg.toFixed(1)}|${gh.tier}|${jobsKey(gh)}|${inv().variety.length}`,
    html: () => {
      const stored = CROPS.filter(c => inv().food[c.id] > 0), raw = CROPS.filter(c => inv().raw[c.id] > 0)
      return `${statusBar()}
      <div class="gh-sec"><h3>Stored food <small>kilograms, calories and crew-days are different things</small></h3>
        <div class="gh-metrics"><div><span>Ready to eat</span><b>${kg(gh.foodKg)} kg</b><small>${stored.map(c => `${esc(c.name)} ${kg(inv().food[c.id])} kg`).join(' · ') || 'nothing yet'}</small></div>
          <div><span>Calories</span><b>${Math.round(inv().kcal).toLocaleString('en-US')} kcal</b><small>${gh.crewDays.toFixed(1)} crew-days at ${GH.crewDayKcal.toLocaleString('en-US')} kcal a day (game value)</small></div>
          <div><span>Protein</span><b>${Math.round(inv().proteinG)} g</b><small>mostly from soybean and wheat</small></div>
          <div><span>Fresh variety</span><b>${inv().variety.length} of 6</b><small>${inv().variety.map(id => esc(crop(id).name)).join(', ') || 'none yet'}</small></div></div>
        <p class="gh-note">Fresh crops add variety. They do not replace a staple diet: a full rack of lettuce is less than one person's calories for a day.</p></div>
      <div class="gh-sec"><h3>Food processor <small>staples are not food until they are processed</small></h3>
        ${gh.tier < 3 ? '<div class="feedback">The processor arrives with level 3, together with potato, wheat and soybean.</div>' : raw.length ? raw.map(c => `<div class="gh-raw"><b>${esc(c.name)}</b><span>${kg(inv().raw[c.id])} kg harvested · ${c.processing.map(p => PROCESS_TEXT[p]).join(' → ')}</span><button class="btn small" data-act="process" data-c="${c.id}" ${gh.jobs.some(j => j.kind === 'process') ? 'disabled' : ''}>Process</button></div>`).join('') : '<div class="feedback">Nothing is waiting. Harvest potato, wheat or soybean and it comes here first.</div>'}</div>
      <div class="gh-sec"><h3>Crop residue <small>residue → controlled processing → nutrients, with losses</small></h3>
        <div class="gh-raw"><b>${kg(inv().residueKg)} kg</b><span>${gh.tier >= 4 ? 'The recycler turns 2 kg into half a unit of nutrient stock. Raw waste never goes straight onto food crops.' : 'The residue recycler arrives with level 4.'}</span><button class="btn small" data-act="recycle" ${gh.tier >= 4 && inv().residueKg >= 2 && !gh.jobs.some(j => j.kind === 'recycle') ? '' : 'disabled'}>Recycle</button></div></div>${jobsHtml(gh)}`
    },
    vals: () => { const v: Vals = {}; statusVals(gh, v); jobVals(gh, v); return v },
    acts: { process: d => gh.process(d.c as CropId), recycle: () => gh.recycle() },
  }
}

// ------------------------------------------------------------------ a bay
const S = 2 // inspection view scale
const spriteStyle = (id: CropId, col: number, row: number) => `background-image:url(${sheet(id)});background-size:${576 * S}px ${480 * S}px;background-position:${-col * 72 * S}px ${-row * 120 * S}px;width:${72 * S}px;height:${120 * S}px`
const SYM_ROW: Record<Symptom, number> = { none: 0, wilt: 1, yellow: 2, spots: 3 }

function bayTab(gh: Greenhouse, id: BayId, done: () => void): LiveTab {
  const bay = () => gh.bay(id)
  const mine = (a: Alert) => a.bay === id
  return {
    key: () => { const b = bay(), p = b.planting; return `bay|${id}|${b.unlocked}|${p ? `${p.crop}${p.stage}${p.symptom}${+p.spent}${+p.forSeed}${+p.needsPollination}${+p.pollinated}${p.harvests}${p.limiting}` : 'none'}|${b.isolated}|${b.lightsOn}|${b.ppfd}|${JSON.stringify(gh.inventory.seeds)}|${gh.tier}|${alertsKey(gh, mine)}|${jobsKey(gh)}|${b.contamination > 0.05}` },
    html: () => {
      const b = bay(), p = b.planting, plan = BAY_PLAN[id]
      const head = `${statusBar()}${gh.alerts.filter(mine).map(a => alertCard(gh, a)).join('')}`
      if (!b.unlocked) return `${head}<div class="feedback">This ${b.kind === 'tier' ? 'leaf rack' : 'trellis bay'} opens at level ${plan.tier}: ${esc(TIERS[plan.tier - 1].name)}. ${esc(TIERS[plan.tier - 1].needs)} Unlock levels at Greenhouse Control.</div>`
      if (!p) {
        const fits = CROPS.filter(c => c.bay === b.kind)
        return `${head}<p class="lead">An empty ${b.kind === 'tier' ? 'leaf rack: two shelves under their own LED bars' : 'trellis bay: one tall shelf over an opaque root chamber with a harvest drawer'}, ${b.areaM2} m², on loop ${b.loop}. Choose what to plant. One seed packet plants the bay.</p>
          <div class="gh-crops">${fits.map(c => cropCard(gh, c, `<div class="actions"><button class="btn primary small" data-act="plant" data-c="${c.id}" ${gh.inventory.seeds[c.id] > 0 ? '' : 'disabled'}>Plant ${esc(c.name)}</button><span class="donebadge">${gh.inventory.seeds[c.id]} packet${gh.inventory.seeds[c.id] === 1 ? '' : 's'}</span></div>`)).join('')}</div>`
      }
      const c = crop(p.crop), col = STAGES.indexOf(p.stage), row = p.stage === 'seed' || p.stage === 'dead' ? 0 : SYM_ROW[p.symptom]
      const dead = p.stage === 'dead', ready = p.stage === 'ready'
      const acts: string[] = []
      if (dead || p.spent) acts.push(`<button class="btn primary" data-act="clear">Clear the bay</button>`)
      else {
        if (ready && p.forSeed) acts.push(`<button class="btn primary" data-act="harvest">Collect the seed</button>`)
        else if (ready && c.harvest.kind === 'cut') acts.push(`<button class="btn primary" data-act="harvest" data-m="cut">Cut the outer leaves</button><button class="btn" data-act="harvest" data-m="whole">Take the whole plant</button>`)
        else if (ready && c.harvest.kind === 'pick') acts.push(`<button class="btn primary" data-act="harvest" data-m="pick">Pick the ripe fruit</button>`)
        else if (ready) acts.push(`<button class="btn primary" data-act="harvest" data-m="whole">${p.crop === 'potato' ? 'Pull the harvest drawer' : 'Harvest'}</button>`)
        if (p.needsPollination) acts.push(`<button class="btn mint" data-act="pollinate">${c.pollination === 'vibrate' ? 'Vibrate the flowers' : 'Help the flowers'}</button>`)
        acts.push(`<button class="btn small ${p.forSeed ? 'mint' : ''}" data-act="seed">Keep for seed: ${p.forSeed ? 'yes' : 'no'}</button>`)
      }
      acts.push(`<button class="btn small ${b.isolated ? 'mint' : ''}" data-act="isolate">Isolation valve: ${b.isolated ? 'closed' : 'open'}</button>`)
      if (b.flow < 0.5 && !b.isolated) acts.push(`<button class="btn small" data-act="line" ${gh.jobs.some(j => j.kind === 'clearLine' && j.target === id) ? 'disabled' : ''}>Clear the supply line</button>`)
      if (b.contamination > 0.05) acts.push(`<button class="btn small" data-act="treat" ${gh.jobs.some(j => j.kind === 'treat' && j.target === id) ? 'disabled' : ''}>Treat the root zone · 1 sanitiser</button>`)
      return `${head}<div class="gh-bay">
        <div class="gh-insp"><div class="gh-sprite" style="${spriteStyle(p.crop, col, row)}" role="img" aria-label="${esc(c.name)}, ${STAGE_TEXT[p.stage].toLowerCase()}"></div><small>Inspection view. Roots show below the line.</small></div>
        <div class="gh-info"><h3>${esc(c.name)} <small>${esc(EVIDENCE_TEXT[c.evidence])}</small></h3>
          <div class="kv"><span>Stage</span><b>${STAGE_TEXT[p.stage]}${p.forSeed && p.stage === 'reproductive' && !flowers(c) ? ' (bolting to seed)' : ''}${p.spent ? ' · spent' : ''}</b><span>Age</span><b data-v="age"></b><span>Next harvest</span><b data-v="next"></b>
            <span>Planted</span><b>${b.areaM2} m² · ${GH.plants[b.kind]} plants · loop ${b.loop}</b><span>Harvests taken</span><b>${p.harvests}${c.harvest.max > 1 ? ` of ${c.harvest.max}` : ''}</b></div>
          <div class="gh-meter"><span>To harvest</span><div class="gbar"><i data-w="prog"></i></div></div>
          <div class="gh-meter" data-c="hc"><span>Health</span><div class="gbar"><i data-w="health"></i></div><b data-v="healthn"></b></div>
          <div class="gh-meter" data-c="sc"><span>Stress</span><div class="gbar stress"><i data-w="stress"></i></div><b data-v="stressn"></b></div>
          <p class="gh-clue">${esc(SYMPTOM_TEXT[p.symptom])}${p.needsPollination ? ' Flowers are open and waiting: without help only part of the fruit will set.' : ''}</p>
        </div></div>
        <div class="gh-sec"><h3>What growth depends on <small>growth = the five multiplied together</small></h3>
          <div class="gh-factors">${FACTOR_IDS.map(f => `<div class="gh-meter" data-c="fc-${f}"><span>${FACTOR_TEXT[f]}</span><div class="gbar"><i data-w="f-${f}"></i></div><b data-v="fn-${f}"></b></div>`).join('')}</div>
          <div class="kv"><span>Root-zone water</span><b data-v="moist"></b><span>Irrigation flow</span><b data-v="flow"></b><span>Root contamination</span><b data-v="cont"></b><span>Leaf disease</span><b data-v="dis"></b>
            <span>Light at the canopy</span><b><button class="btn small" data-act="light" data-d="-50" ${b.ppfd <= 50 ? 'disabled' : ''} aria-label="Less light">−</button> ${b.ppfd} µmol/m²/s <button class="btn small" data-act="light" data-d="50" ${b.ppfd >= 1000 ? 'disabled' : ''} aria-label="More light">+</button> <button class="btn small ${b.lightsOn ? 'mint' : ''}" data-act="lights">${b.lightsOn ? 'on' : 'off'}</button></b>
            <span>Daily light</span><b>${gh.dliOf(id).toFixed(1)} mol/m²/day · this crop wants ${dli(c.ppfd[0], 16).toFixed(0)} to ${dli(c.ppfd[1], 16).toFixed(0)}</b>
            <span>This crop's bands</span><b>${c.tempC[0]} to ${c.tempC[1]} °C · conductivity ${c.ec[0]} to ${c.ec[1]} mS/cm</b></div></div>
        <div class="actions">${acts.join('')}</div>${jobsHtml(gh)}`
    },
    vals: () => {
      const v: Vals = {}, b = bay(), p = b.planting
      statusVals(gh, v); jobVals(gh, v)
      if (!p) return v
      const c = crop(p.crop), s = gh.secondsToHarvest(id)
      v.age = `${p.ageDays.toFixed(0)} crop days`
      v.next = p.stage === 'dead' ? 'none' : p.spent ? 'none: the plant is spent' : p.stage === 'ready' ? 'ready now' : s === null || !Number.isFinite(s) ? 'growth has stopped' : `in about ${Math.ceil(s)} s (${p.daysLeft.toFixed(0)} crop days)`
      v.prog = pct(p.progress); v.health = Math.round(p.health); v.healthn = `${Math.round(p.health)}`; v.stress = Math.round(p.stress); v.stressn = `${Math.round(p.stress)}`
      v.hc = p.health < 40 ? 'bad' : p.health < 75 ? 'warn' : ''; v.sc = p.stress > 60 ? 'bad' : p.stress > 35 ? 'warn' : ''
      for (const f of FACTOR_IDS) { v[`f-${f}`] = pct(p.factors[f]); v[`fn-${f}`] = `${pct(p.factors[f])}%`; v[`fc-${f}`] = p.limiting === f ? (p.factors[f] < 0.5 ? 'bad' : 'warn') : '' }
      v.moist = `${pct(b.moisture)}%`; v.flow = b.isolated ? 'valve closed' : `${pct(b.flow)}%`; v.cont = `${pct(b.contamination)}%`; v.dis = `${pct(b.disease)}%`
      void c
      return v
    },
    acts: {
      ...alertActs(gh),
      plant: d => gh.plant(id, d.c as CropId),
      harvest: d => { const err = gh.harvest(id, d.m as 'cut' | 'pick' | 'whole' | undefined); if (!err) { sound.play('success'); done() } return err },
      clear: () => gh.clear(id), pollinate: () => gh.pollinate(id), seed: () => gh.setForSeed(id, !bay().planting?.forSeed),
      isolate: () => gh.isolate(id, !bay().isolated), line: () => gh.clearLine(id), treat: () => gh.treat(id),
      light: d => gh.setLight(id, bay().ppfd + Number(d.d)), lights: () => gh.setLightsOn(id, !bay().lightsOn),
    },
  }
}

// ------------------------------------------------------------------ what the panels and the app ask for
const tab = (id: string, label: string, make: () => LiveTab): Tab => ({ id, label, render: body => mount(body, make()) })
export const isGreenhouseTerminal = (id: string) => id.startsWith('gh-') || isBayTerminal(id)

/** Title and place line for a greenhouse terminal's panel. */
export function greenhouseMeta(id: string): [string, string] {
  if (isBayTerminal(id)) { const b = bayOf(id), plan = BAY_PLAN[b]; return [`Bay ${b}`, `Greenhouse · Rack band ${plan.loop} · ${plan.kind === 'tier' ? 'Leaf rack' : 'Trellis bay'}`] }
  const name = TERMINALS.find(t => t.id === id)?.name ?? 'Greenhouse'
  return [name, id === 'gh-control' ? 'Greenhouse · Clean prep area' : id === 'gh-service' ? 'Greenhouse · Pumps, power and air' : 'Greenhouse · Seeds and food']
}

/** The tabs behind each greenhouse terminal. `ctx.refresh` is called when a harvest may have finished the task. */
export function greenhouseTabs(id: string, ctx: PanelCtx): Tab[] {
  const gh = ctx.m.greenhouse
  if (isBayTerminal(id)) { const b = bayOf(id); return [tab('bay', `Bay ${b}`, () => bayTab(gh, b, ctx.refresh))] }
  if (id === 'gh-service') return [tab('irrigation', 'Irrigation', () => irrigationTab(gh)), tab('power', 'Power', () => powerTab(gh)), tab('air', 'Air & hull', () => airTab(gh))]
  if (id === 'gh-prep') return [tab('seeds', 'Seed bank', () => seedsTab(gh)), tab('food', 'Food & galley', () => foodTab(gh))]
  return [tab('overview', 'Overview', () => overviewTab(gh, false)), tab('alerts', 'Alerts', () => alertsTab(gh)), tab('progress', 'Score & levels', () => progressTab(gh)), tab('sources', 'Real & model', () => sourcesTab())]
}
/** The greenhouse seen from Hab Systems: the place to work from during a particle event. */
export const greenhouseRemoteTabs = (ctx: PanelCtx): Tab[] => [tab('gh-remote', 'Greenhouse (remote)', () => overviewTab(ctx.m.greenhouse, true)), tab('gh-alerts', 'Greenhouse alerts', () => alertsTab(ctx.m.greenhouse))]

/** Greenhouse state in the shape the deck draws: plants, lights, lamps, array wings. */
export function greenhouseView(gh: Greenhouse): GreenhouseView {
  const s = gh.summary(), flow = (l: 'A' | 'B') => { const bs = gh.bays.filter(b => b.loop === l && b.planting); return bs.length ? bs.reduce((a, b) => a + b.flow, 0) / bs.length : gh.commissioned ? 1 : 0 }
  const air = gh.loads.find(l => l.id === 'air')
  return {
    bays: gh.bays.map(b => ({ id: b.id, status: bayStatus(b), crop: b.planting?.crop ?? null, stage: b.planting?.stage ?? 'seed', symptom: b.planting?.symptom ?? 'none', progress: b.planting?.progress ?? 0, lit: b.planting ? b.lit : 0, tier: BAY_PLAN[b.id].tier })),
    alarm: s.worst,
    arrayState: gh.exterior.arrayState,
    sunlit: gh.exterior.sunlit,
    flow: { A: flow('A'), B: flow('B') },
    airflow: !!air && air.kw > 0,
    condensation: gh.rhPct > 85,
    batteryPct: gh.batteryPct,
    tankPct: (gh.tankL / GH.tankCapacityL) * 100,
    screen: [`${gh.tempC.toFixed(1)}°C  ${Math.round(gh.rhPct)}% RH`, s.alerts ? `${s.alerts} ALERT${s.alerts > 1 ? 'S' : ''} · CO2 ${Math.round(gh.co2Ppm)}` : `CO2 ${Math.round(gh.co2Ppm)} PPM · ${gh.pressureKpa.toFixed(0)} KPA`],
    radiation: gh.exterior.radiation === 'storm',
  }
}

/** One line for the HUD chip, and how loud it should be. */
export function greenhouseChip(gh: Greenhouse): { text: string; cls: '' | 'ok' | 'warn' | 'bad' } {
  if (!gh.commissioned) return { text: 'Greenhouse · optional · not started', cls: '' }
  const s = gh.summary(), parts = [`${s.planted} growing`]
  if (s.ready) parts.push(`${s.ready} ready`)
  if (s.pollinate) parts.push(`${s.pollinate} to pollinate`)
  if (s.alerts) parts.push(`⚠ ${s.alerts} alert${s.alerts > 1 ? 's' : ''}`)
  return { text: `Greenhouse · ${parts.join(' · ')} · score ${gh.score().total}`, cls: s.worst === 'damage' ? 'bad' : s.alerts ? 'warn' : 'ok' }
}

/** For the task drawer: how far the optional greenhouse task has got. */
export const greenhouseProgress = (gh: Greenhouse) => !gh.attempted ? 'not started' : gh.complete ? `${gh.harvestCount} harvest${gh.harvestCount === 1 ? '' : 's'} stored · score ${gh.score().total}/100 · level ${gh.tier}` : 'planted, no harvest yet'
