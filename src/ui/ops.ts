// Mission Ops table: the mission brief, a live read-out of how the current design is shaping
// the mission, and where every number in the game comes from. It only displays what the rules
// in src/core and the data in src/data return; it adds no rule of its own.
import { CARGO_REWARD, INSTRUMENTS, POWER_TOTAL, byId, type InstrumentId } from '../core/data'
import { WATER_BONUS, type Mission } from '../core/mission'
import { fastRelay, researchFilter, unassigned } from '../core/power'
import { ROVERS, mmrtgNowW, type RoverSpec } from '../core/rovers'
import {
  BASE_LOAD_W, GOOD_SCORE, MAX_BASE_TILT, PHOTO_BONUS_EACH, PHOTO_BONUS_MAX, RADIATION, RESERVE_FRACTION, ROUGHNESS_SOURCE, WEATHER_SOURCE, costPct, driveWhPerM,
  fullRechargeSols, photoPlaces, rangeM, rechargeW, region, spendPct, testWh,
} from '../core/survey'
import { BACKUP_SOLS, SUCCESS_NO_MARGIN, SUCCESS_WITH_MARGIN } from '../core/delivery'
import { RESCUE_LIMIT_SOLS } from '../core/rescue'
import { SOURCES, formatDate, lightTimeSource } from '../data/opsDates'
import { ROVER_TASK_DATA, SAMPLE_FACTS, SPACECRAFT, roverRocketFacts, roverTaskDataLine } from '../data/roverTasks'
import { $, esc } from './dom'
import type { PanelCtx, Tab } from './panels'
import { NEED } from './stationHud'

export function opsTabs(ctx: PanelCtx): Tab[] {
  return [
    { id: 'brief', label: 'Mission brief', render: b => briefTab(b, ctx) },
    { id: 'status', label: 'Mission status', render: b => statusTab(b, ctx) },
    { id: 'sources', label: 'Data sources', render: b => sourcesTab(b, ctx) },
  ]
}

const REAL = '<span class="tag real">NASA data</span>'
const MODEL = '<span class="tag model">Our model</span>'
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
const tens = (n: number) => (Math.round(n / 10) * 10).toLocaleString('en-US')

// ------------------------------------------------------------------ Brief
function briefTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship, d = m.ops
  body.innerHTML = `<div class="sim">Simulated scenario · the rover, its ground, the weather and the signal delay are NASA data</div>
    <div class="brief-goal"><h3>Your mission</h3>
      <p>You are docked 408 km above Earth, commanding a real NASA rover on Mars. Drive it across its real surroundings, test the ground, and decide <b>where the crew's base goes</b> before the mission's ${m.missionSols} Mars days run out.</p></div>
    <div class="brief-cols">
      <div class="brief-box"><h3>You decide</h3><ol>
        <li><b>Payload.</b> Which instrument scans the rocks at the sample sites.</li>
        <li><b>Power.</b> How the station's ${POWER_TOTAL} units are split.</li>
        <li><b>Rover and rocket.</b> Perseverance or Curiosity, and the rocket that carries it to Mars.</li>
        <li><b>Drives.</b> Where it goes, how risky the path is, and when it recharges.</li>
        <li><b>Rescue and samples.</b> How to free a stuck rover, and which three rocks to keep.</li>
        <li><b>Base site.</b> Which spot to build on, or whether to stay in orbit.</li></ol></div>
      <div class="brief-box"><h3>Your limits with ${esc(ship.name)}</h3><div class="kv">
        <span>Budget after the launch</span><b>${ship.budget} cr</b>
        <span>Payload mass</span><b>${ship.payloadKg} kg</b>
        <span>Rover battery</span><b>arrives at ${ship.battery}%, safe mode at NASA's ${Math.round(RESERVE_FRACTION * 100)}% line</b>
        <span>Station power</span><b>${POWER_TOTAL} units</b>
        <span>Signal delay</span><b>${fmt(m.signalMin)} min each way on ${d.label}</b>
        <span>Time</span><b>${m.missionSols} Mars days</b></div></div>
    </div>
    <div class="brief-box"><h3>What counts as success</h3>
      <p>A <b>base built on a good place</b> with the <b>habitat commissioned</b>. A good place is level ground (${MAX_BASE_TILT}° or less) with a site score of ${GOOD_SCORE} or more out of 100. The score is the average of six checks: level ground, smooth terrain, sunlight, warmth, low radiation and rock samples (three tubes filled at the sample sites). A check nobody measured counts as 0. Real photo spots the rover passes add up to +${PHOTO_BONUS_MAX}. The habitat also needs a crew medical clearance from Hab Systems.</p>
      <p>You can build on any spot the rover stopped at, good or bad, and the report says why it scored as it did. Staying in orbit keeps the crew safe. It is a valid call, but the mission is not complete.</p></div>
    <div class="prov">
      <div>${REAL}<b>The rover and its ground.</b> Where each rover is parked, the tilt it measured at every stop, its photos, its battery and power source, and the picture of the ground from orbit. NASA/JPL-Caltech.</div>
      <div>${REAL}<b>Weather and radiation.</b> Curiosity's REMS and RAD instruments at Gale Crater.</div>
      <div>${REAL}<b>Signal delay.</b> The Earth to Mars light time on ${d.label}. ${esc(SOURCES.lightTime.name)}.</div>
      <div>${REAL}<b>The rover's rocket and the rock samples.</b> Which rocket flew each rover and what NASA paid, and five samples Perseverance really sealed. ${esc(roverTaskDataLine())}.</div>
      <div>${MODEL}Everything else: what each test costs, recharge times, the ${m.missionSols}-day limit, the scores, the relay hand-off, budgets, station power, rocket success rates, getting stuck and the value of each rock.</div>
    </div>
    <div class="actions"><button class="btn primary" id="begin">Begin mission</button><button class="btn" id="tostatus">See mission status</button></div>`
  $('#begin', body).addEventListener('click', () => ctx.close())
  $('#tostatus', body).addEventListener('click', () => document.querySelector<HTMLButtonElement>('.tab[data-id=status]')?.click())
}

// ------------------------------------------------------------------ Status
type Tone = 'good' | 'warn' | 'bad' | 'info'
const why = (tone: Tone, where: string, cause: string, effect: string) =>
  `<div class="why ${tone}"><span class="where">${esc(where)}</span><div><b>${cause}</b>${effect.startsWith('<') ? effect : `<span>${effect}</span>`}</div></div>`
const bar = (label: string, value: string, pct: number, tone: Tone, mark?: number) =>
  `<div class="rbar ${tone}"><div class="rbar-top"><span>${label}</span><b>${value}</b></div><div class="rbar-track"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark === undefined ? '' : `<u style="left:${Math.max(0, Math.min(100, mark))}%"></u>`}</div></div>`

function statusTab(body: HTMLElement, ctx: PanelCtx) {
  const m = ctx.m, ship = m.ship, p = m.power, d = m.ops
  const instId = m.instrument ?? m.instrumentDraft
  const inst = instId ? byId(INSTRUMENTS, instId) : null
  const rv = m.rover
  const need = { ...NEED, life: m.lifeNeed }
  const total = ship.budget - m.launchSpent + (m.completed.has('cargo') ? CARGO_REWARD : 0)
  const free = unassigned(p)
  const pct = rv ? spendPct(rv, m.batteryWh) : ship.battery
  const B = m.base

  const bars = [
    bar('Supply budget', `${m.funds} of ${total} cr`, (m.funds / total) * 100, 'info'),
    bar('Payload mass', `${inst?.massKg ?? 0} of ${ship.payloadKg} kg`, ((inst?.massKg ?? 0) / ship.payloadKg) * 100, 'info'),
    bar('Station power', `${POWER_TOTAL - free} of ${POWER_TOTAL} routed`, ((POWER_TOTAL - free) / POWER_TOTAL) * 100, p.life >= need.life && p.comms >= need.comms ? 'good' : 'bad'),
    rv ? bar('Rover battery', `${pct}%${m.charging ? ', charging' : ''}`, pct, m.stranded ? 'bad' : pct <= 15 ? 'warn' : 'good') : bar('Rover battery', `arrives at ${ship.battery}%`, ship.battery, 'info'),
    bar('Mars days', rv ? `${f1(m.solsLeft)} of ${m.missionSols} left` : `${m.missionSols} to use`, (m.solsLeft / m.missionSols) * 100, m.timeUp ? 'bad' : m.solsLeft <= 2 ? 'warn' : 'good'),
  ].join('')

  const rows: string[] = []
  // the deployment gate: what the station's power allows
  rows.push(why(p.life >= need.life ? 'good' : 'bad', 'Power Grid', `Life support ${p.life}`, p.life >= need.life ? 'Enough to send the rover out.' : `Below ${need.life}: deployments are blocked.`))
  rows.push(why(p.comms < need.comms ? 'bad' : fastRelay(p) ? 'good' : 'info', 'Power Grid', `Communications ${p.comms}`,
    p.comms < need.comms ? `Below ${need.comms}: commands cannot reach Mars.` : fastRelay(p) ? `Direct link: no relay hand-off, so the signal delay is ${fmt(m.signalMin)} min.` : `Enough to send the rover out. The relay adds ${ship.handoffMin} min to the signal delay; one more unit would skip it.`))
  rows.push(why(researchFilter(p) ? 'good' : 'info', 'Power Grid', `Research ${p.research}`, researchFilter(p) ? 'Coring rock samples uses 30 % less battery.' : 'At 3 or more, coring rock samples would use 30 % less battery.'))
  if (free > 0) rows.push(why('warn', 'Power Grid', `${free} unit${free === 1 ? '' : 's'} unassigned`, 'Power you have and are not using.'))
  // payload and bench
  const drill = (id: InstrumentId, on: RoverSpec) => { const wh = testWh('drill', id, researchFilter(p)); return `Coring three sample tubes uses ${wh} Wh, about ${costPct(on, wh)}% of the battery.` }
  if (!inst) rows.push(why('bad', 'Payload', 'No instrument chosen', 'Without one the rover cannot be sent out.'))
  else if (!m.payloadActive) rows.push(why('info', 'Payload', `${inst.name} selected, not activated`, `${inst.cost} cr and ${inst.massKg} kg. ${drill(inst.id, rv ?? ROVERS.perseverance)} The choice locks when you activate the payload.`))
  else rows.push(why('good', 'Payload', `${inst.name} active`, drill(inst.id, rv ?? ROVERS.perseverance)))
  rows.push(why(m.samplesStudied ? 'good' : 'warn', 'Calibration', m.calibrated ? 'Instrument calibrated' : m.samplesStudied ? 'Experiment rack aboard' : 'Instrument not calibrated', m.samplesStudied ? 'At the sample sites the rover reads what each rock is made of.' : 'At the sample sites the rover reads what each rock is made of only faintly: an organic-like signal stays hidden.'))
  rows.push(why(m.balanced ? 'good' : 'info', 'Power Grid', m.balanced ? 'Battery pack balanced' : 'Battery pack not balanced', m.balanced ? 'Rover driving draws 30 W less.' : 'Balancing it would make every drive cheaper.'))
  rows.push(why(m.completed.has('water') ? 'good' : 'info', 'Hab Systems', m.completed.has('water') ? 'Water purifier running' : 'Water purifier not running', m.completed.has('water') ? `+${WATER_BONUS} on the base score.` : `Running it adds +${WATER_BONUS} to the base score.`))
  // the rover expedition: what the mission's own rules report
  if (!rv) rows.push(why('warn', 'Rover Comms', 'No rover chosen yet', 'Perseverance goes farther and recharges faster. Curiosity is lighter and its weather and radiation were measured in its own crater.'))
  else {
    rows.push(why('info', 'Rover Comms', `${esc(rv.name)}, ${esc(region(m.region!).name)}`, `About ${tens(rangeM(rv))} m on one charge (${f1(driveWhPerM(rv, m.balanced))} Wh for each metre now). A full recharge takes about ${f1(fullRechargeSols(rv))} Mars days.`))
    if (!m.delivery) rows.push(why('warn', 'Rover Comms', 'No rocket chosen yet', `${esc(rv.name)} needs a rocket to reach Mars: ${m.credits} cr is left for it.`))
    else if (m.stuck) rows.push(why('bad', 'Rover', 'Stuck: wheel trouble', 'Read the telemetry at Rover Comms and choose a fix. Every fix costs Mars days.'))
    else if (m.tubesLeft > 0 && !B) rows.push(why('info', 'Rover', `${m.tubesLeft} sample tube${m.tubesLeft === 1 ? '' : 's'} empty`, 'Five rocks wait at three sample sites, the rarest farthest away. Sealed tubes fill the Rock samples check for every spot.'))
    if (m.charging) rows.push(why('info', 'Rover', 'Recharging', `The battery is at ${pct}% and filling. The rover cannot drive or test until the recharge ends.`))
    else if (m.stranded) rows.push(why('bad', 'Rover', 'Safe mode', 'A drive was longer than the battery allowed. Recharge the rover to carry on.'))
    if (m.timeUp && !B) rows.push(why('bad', 'Rover', `The ${m.missionSols} Mars days are over`, 'Build on a spot already visited, or stay in orbit.'))
    for (const c of m.causes()) rows.push(why(c.good ? 'good' : 'bad', 'Rover', esc(c.text), ''))
    if (!B && m.spots.length) {
      const best = m.reports().sort((a, b) => b.score - a.score)[0]
      rows.push(why(best.verdict.level === 'good' ? 'good' : best.verdict.level === 'bad' ? 'bad' : 'warn', 'Base site', `Best spot so far: ${best.spot.label}, ${best.score} out of 100`, esc(best.verdict.title)))
    }
  }
  rows.push(why(m.completed.has('medical') ? 'good' : 'warn', 'Hab Systems', m.completed.has('medical') ? 'Crew medical cleared' : 'Crew medical not done', m.completed.has('medical') ? 'The habitat can be commissioned once the base is built.' : 'The habitat cannot be commissioned, even on a good base site.'))

  const head = B
    ? `<div class="feedback ${B.approved ? 'ok' : 'warn'}">${B.approved ? `Base built at ${esc(B.name)}: ${B.score} out of 100.` : 'No base built. The crew remains in orbit.'}</div>`
    : rv ? `<div class="feedback ok">${esc(rv.name)} is on day ${m.sol} of ${m.missionSols}. These are the numbers it is working with.</div>`
      : '<div class="feedback">Choose your rover at Rover Comms to see how your design shapes the expedition.</div>'
  const prov = `<div class="prov">
      <div>${REAL}Signal delay <b>${fmt(m.signalMin)} min</b>: light time ${fmt(d.lightMin)} min · ${esc(lightTimeSource(d))}${fastRelay(p) ? '' : `, plus ${ship.handoffMin} min relay hand-off (our model)`}</div>
      ${rv ? `<div>${REAL}${esc(rv.name)}: MMRTG <b>${mmrtgNowW(rv)} W</b> today (110 W at launch, falling 4.8 % a year), battery <b>${rv.batteryWh.toLocaleString('en-US')} Wh</b>, ${rv.area.stops.length} real stops on the map.</div>
      <div>${MODEL}Recharge power ${rechargeW(rv)} W: the MMRTG's ${mmrtgNowW(rv)} W minus ${BASE_LOAD_W} W that the rover always uses.</div>` : ''}
    </div>`
  body.innerHTML = `<div class="sim">Mission status · the same rules as the rover screen</div>
    ${head}
    <div class="rbars">${bars}</div>
    ${prov}
    <h3 class="why-head">How your choices are shaping the mission</h3>
    <div class="whys">${rows.join('')}</div>`
}

// ------------------------------------------------------------------ Data sources
type Kind = 'real' | 'model' | 'simulated'
interface Row { kind: Kind; what: string; note: string; origin: string; limit?: string }
const KIND_LABEL: Record<Kind, string> = { real: 'NASA data', model: 'Our model', simulated: 'Simulated' }

/** One row per kind of number the player meets: real measurements first, then what our model
 *  builds on them, then what is simply simulated. */
function sourceRows(m: Mission): Row[] {
  const d = m.ops
  // Before the rover is chosen, the rows describe the first rover's data; both are saved the same way.
  const rv = m.rover ?? ROVERS.perseverance
  const which = m.rover ? rv.name : 'Perseverance and Curiosity'
  return [
    { kind: 'real', what: 'Where the rover is, and how tilted it stood',
      note: `${m.rover ? `${rv.area.stops.length} places ${rv.name} really parked inside the 3 km map` : 'Every place each rover really parked inside its 3 km map'}, with the tilt and height NASA recorded there.`,
      origin: `${rv.area.provider} · saved ${formatDate(rv.area.retrieved)}`, limit: 'A spot more than 75 m from a real stop uses the slope from orbit instead, and the game says so.' },
    { kind: 'real', what: 'The picture of the ground from orbit',
      note: 'The map behind the rover: the colour basemap of NASA\'s own "Where is the rover?" map.',
      origin: `${rv.satellite.provider} · saved ${formatDate(rv.satellite.retrieved)}`, limit: `About ${rv.satellite.metresPerPixel} m of ground for each dot of the picture.` },
    { kind: 'real', what: 'Map heights', note: 'The height map, and the climb that makes a drive cost more battery.', origin: rv.area.mola.provider, limit: rv.area.mola.note },
    { kind: 'real', what: 'Rover photos, selfies and drive films',
      note: `${m.rover ? `${rv.area.photos.length} raw photos from ${photoPlaces(rv).length} places on the map` : 'Raw photos from 16 places on each map'}, a real selfie on the choice screen, and a film made from the rover's own camera during a real drive.`,
      origin: `${rv.area.credit}`, limit: 'The drive film is a real drive, but not the path you chose. Raw photos are not cleaned up or colour-corrected.' },
    { kind: 'real', what: 'Sunlight and warmth', note: 'Sunrise, sunset and air temperature on the newest sols Curiosity reported.',
      origin: `${WEATHER_SOURCE.provider} · ${WEATHER_SOURCE.location} · saved ${formatDate(WEATHER_SOURCE.retrieved)}`, limit: WEATHER_SOURCE.note },
    { kind: 'real', what: 'Radiation', note: `${RADIATION.mGyPerSol} mGy each Mars day at the surface.`, origin: `${RADIATION.provider} · ${RADIATION.label}`, limit: RADIATION.note },
    { kind: 'real', what: 'Terrain roughness', note: 'How bumpy each crater is, seen from orbit.', origin: `${ROUGHNESS_SOURCE.provider} · saved ${formatDate(ROUGHNESS_SOURCE.retrieved)}`, limit: ROUGHNESS_SOURCE.note },
    { kind: 'real', what: 'Rover power source and battery',
      note: `${which}: the nuclear power source made 110 W at launch and loses about 4.8 % a year. Battery size, the 40 % safe-mode line, top speed and mass are NASA figures.`,
      origin: 'NASA/JPL rover fact pages and press kits, JPL Publication 15-6', limit: 'Curiosity\'s battery is given in amp-hours only, so its watt-hours are our estimate.' },
    { kind: 'real', what: 'Signal delay: Earth to Mars light time', note: `${fmt(d.lightMin)} minutes one way on ${d.label}.`,
      origin: `${SOURCES.lightTime.provider} · Earth to Mars · ${d.label} · retrieved ${formatDate(SOURCES.lightTime.retrieved)}`, limit: SOURCES.lightTime.limits },
    { kind: 'real', what: "The rover's rocket",
      note: `Which rocket really launched each rover (the Atlas V 541, both times), what NASA paid to launch Mars 2020 ($${roverRocketFacts('atlas-v-541').cost!.usdMillions} million) and a Falcon 9 mission ($${roverRocketFacts('falcon-9-expendable').cost!.usdMillions} million), and the launch mass of Curiosity's spacecraft (${SPACECRAFT.curiosity.launchMassKg.toLocaleString('en-US')} kg).`,
      origin: `NASA and JPL pages and press kits · retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}`,
      limit: 'The Falcon 9 cost is for a different mission and stands in for a launch NASA never bought. What a Falcon 9 can send to Mars is SpaceX\'s figure, not NASA\'s. The mass of the Mars 2020 spacecraft is our sum of two NASA numbers. That the Falcon 9 of 2011 was too small for Curiosity is the team\'s own research.' },
    { kind: 'real', what: 'The five rocks at the sample sites',
      note: `Each is modelled on a sample Perseverance really sealed (${SAMPLE_FACTS.map(s => s.name).join(', ')}): its name, rock, type, sol and core length come from NASA's catalog, and its story from NASA releases.`,
      origin: `NASA Science, Mars Rock Samples catalog · retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}`,
      limit: 'The catalog does not describe colour or layering: those read-outs are our simulation. The samples were cut elsewhere in Jezero Crater, not at the game\'s sample sites.' },
    { kind: 'real', what: 'The real events behind the rescue',
      note: 'Curiosity\'s worn wheels, the rock that stuck to its drill for six days in 2026, and Opportunity\'s five weeks in a sand trap in 2005.',
      origin: `NASA/JPL-Caltech · retrieved ${formatDate(ROVER_TASK_DATA.retrieved)}`, limit: 'The Atacama rock stuck to Curiosity\'s drill, not to a wheel. The game\'s telemetry is not rover data.' },
    { kind: 'model', what: 'Rocket success, and the backup', note: `${SUCCESS_WITH_MARGIN}% for the rocket with mass to spare, ${SUCCESS_NO_MARGIN}% for the one with none. A failed launch costs ${BACKUP_SOLS} Mars days while a backup rover flies. Prices are one credit for each $10 million of NASA's cost figure.`, origin: 'Built on the NASA cost figures and the spacecraft mass' },
    { kind: 'model', what: 'Getting stuck, the telemetry and the fixes', note: `The risk follows the real slope under the path and how far it strays from where the real rover parked. The readings, the four causes, the fixes, the ${RESCUE_LIMIT_SOLS}-day limit, wheel wear and its effect on speed are game rules.`, origin: 'Built on MOLA heights and the real rover stops' },
    { kind: 'model', what: 'Science value of each rock', note: 'What each of the five rocks is worth to a mission looking for signs of ancient life, the three-tube limit, which stops are sample sites, and which rocks lie at each.', origin: 'Built on what NASA has said about each sample' },
    { kind: 'model', what: 'Recharge time', note: `The power source's output today minus ${BASE_LOAD_W} W the rover always uses. The game plays one Mars hour each second.`, origin: 'Built on the NASA power figures' },
    { kind: 'model', what: 'Weather and radiation at Jezero', note: 'Perseverance has no radiation detector and its weather feed is patchy, so Jezero borrows Curiosity\'s readings from Gale.', origin: 'Built on Curiosity REMS and RAD' },
    { kind: 'model', what: 'Relay hand-off', note: 'Two or three minutes added to the signal delay by the station relay, and skipped by a direct link.', origin: 'Added to JPL Horizons light time' },
    { kind: 'model', what: 'Battery cost of each test', note: 'NASA publishes no per-activity figures, so these are game rules: photograph 80 Wh, weather and radiation 40 Wh, coring three sample tubes 300 or 380 Wh. The photos the rover saves by itself on the way cost nothing.', origin: 'Set against the real battery size' },
    { kind: 'model', what: 'Site score, verdict and stars', note: `Six checks scored 0 to 100 and averaged, a ${MAX_BASE_TILT}° limit for a base, ${GOOD_SCORE} or more for a good place, and +${PHOTO_BONUS_EACH} for each photo spot found.`, origin: 'Built on the real measurements above' },
    { kind: 'simulated', what: `The ${m.missionSols}-day mission limit`, note: 'A game rule that makes waiting for a recharge cost something. Real rover missions last years.', origin: '' },
    { kind: 'simulated', what: 'Budgets, costs and masses', note: 'Game rules for each spacecraft, instrument and supply.', origin: '' },
    { kind: 'simulated', what: 'Station power units', note: 'Ten abstract units with fixed thresholds.', origin: '' },
    { kind: 'simulated', what: 'Station orbit', note: 'A 408 km, 92-minute orbit, played back 30 times faster in the windows.', origin: '' },
  ]
}

function sourcesTab(body: HTMLElement, ctx: PanelCtx) {
  const rows = sourceRows(ctx.m)
  const count = (k: Kind) => rows.filter(r => r.kind === k).length
  body.innerHTML = `<p class="lead">Where each number in this mission comes from. A real measurement is always shown with its source, its place and its date.</p>
    <div class="srcs">${rows.map(r => `<div class="src ${r.kind}"><div><b>${esc(r.what)}</b><span>${esc(r.note)}</span>
      ${r.origin ? `<small>${esc(r.origin)}</small>` : ''}${r.limit ? `<small class="limit">Limit: ${esc(r.limit)}</small>` : ''}</div>
      <em>${KIND_LABEL[r.kind]}</em></div>`).join('')}</div>
    <div class="feedback ok">${count('real')} of these ${rows.length} come from NASA measurements, and ${count('model')} are our model built on them. The rest are simulated. The game reads saved snapshots and does not call NASA while you play, except for the two optional buttons on the rover screen that say they need internet.</div>`
}
