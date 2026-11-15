// Builds data/nasa/station-tasks.json: what NASA says about the real events behind the station
// tasks (the Apollo 13 air filter and power-down, the station's water recovery, the fire on Mir,
// a crew day, the dust storm of 2018), and eight photographs of Earth taken from the International
// Space Station, saved to public/nasa/earth/. Run with `npm run data:station` (needs a network
// connection). The game reads the committed snapshot and never calls these pages at runtime.
//
// Like scripts/fetch-rover-tasks.mjs, every fact keeps the exact words of its source (`quote`)
// beside our short version (`text`). The script downloads each page and stops if a quote is no
// longer there. Numbers the game shows as NASA's must also appear in their quotes, as written
// in `says`.
//
// Our model, not NASA data: every rule of the station tasks (timers, parts, power draws, the crew
// performance figure, scores) and what the dust storm does to the game's rover. Those live in
// src/core/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'data', 'nasa')
const pics = join(root, 'public', 'nasa', 'earth')
mkdirSync(out, { recursive: true })
mkdirSync(pics, { recursive: true })
const retrieved = new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ sources
const SOURCES = {
  apollo13: { title: 'Apollo 13: Mission Details', provider: 'NASA', url: 'https://www.nasa.gov/missions/apollo/apollo-13-mission-details/' },
  water: { title: 'NASA Achieves Water Recovery Milestone on International Space Station', provider: 'NASA, 20 June 2023', url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/' },
  mirFire: { title: '25 Years Ago: Fire Aboard Space Station Mir', provider: 'NASA Johnson Space Center, 23 February 2022', url: 'https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/' },
  drill: { title: 'Station Trio Practices Emergency Before Radiation, Physics Research', provider: 'NASA space station blog, 15 January 2019', url: 'https://www.nasa.gov/blogs/spacestation/2019/01/15/station-trio-practices-emergency-before-radiation-physics-research/' },
  exercise: { title: 'Counteracting Bone and Muscle Loss in Microgravity', provider: 'NASA, 1 December 2023', url: 'https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/' },
  opportunity: { title: "NASA's Record-Setting Opportunity Rover Mission on Mars Comes to End", provider: 'NASA release, 13 February 2019', url: 'https://www.nasa.gov/news-release/nasas-record-setting-opportunity-rover-mission-on-mars-comes-to-end/' },
  dust2018: { title: 'Martian Dust Storm Grows Global; Curiosity Captures Photos of Thickening Haze', provider: 'NASA/JPL-Caltech, 20 June 2018', url: 'https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/' },
}
/** One quote and the page it is on. */
const q = (source, quote) => ({ source, quote })

// ------------------------------------------------------------------ the cards
// One "what really happened" card for each task. `says` lists words that must be in its quotes.
const CARDS = [
  {
    id: 'apollo13-filter', title: 'Apollo 13: a square filter, a round socket', provider: 'NASA',
    text: 'In April 1970 an oxygen tank blew up on the way to the Moon. The three astronauts sheltered in the lunar module, built for two. Its round sockets did not take the command module\'s square air filters, so mission control worked out an adapter from plastic bags, cardboard and tape.',
    says: ['square canisters', 'round openings', 'plastic bags, cardboard', 'three men'],
    backing: [
      q('apollo13', 'oxygen tank No. 2 blew up, causing the No. 1 tank to also fail.'),
      q('apollo13', 'There were enough lithium hydroxide canisters, which remove carbon dioxide from the spacecraft, but the square canisters from the command module were not compatible with the round openings in the lunar module environmental system.'),
      q('apollo13', 'the LM was designed to support two men for two days and was being asked to care for three men for about four days.'),
      q('apollo13', 'After a day and a half in the LM, a warning light showed that the carbon dioxide had built up to a dangerous level.'),
      q('apollo13', 'Mission control devised a way to attach the CM canisters to the LM system by using plastic bags, cardboard'),
      q('apollo13', 'April 17, 1970'),
    ],
  },
  {
    id: 'apollo13-power', title: 'Apollo 13: the power-down', provider: 'NASA',
    text: 'To save power for the way home, the Apollo 13 crew turned off every system that was not critical and cut energy use to one fifth. The cabin cooled to 38 °F (about 3 °C). Flight controllers wrote the procedure for powering the command module up again in three days, not the usual three months.',
    says: ['reduced to 1/5', '38 degrees Fahrenheit', 'three days'],
    backing: [
      q('apollo13', 'All noncritical systems were turned off and energy consumption was reduced to 1/5'),
      q('apollo13', 'When the electrical systems were turned off, the spacecraft lost an important source of heat. The temperature dropped to 38 degrees Fahrenheit and condensation formed on all the walls.'),
      q('apollo13', 'The most remarkable achievement of mission control was quickly developing procedures for powering up the CM after its long, cold sleep. Flight controllers wrote the documents for this innovation in three days, instead of the usual three months.'),
    ],
  },
  {
    id: 'iss-water', title: 'Space station water recovery: 98%', provider: 'NASA',
    text: 'The station turns urine, sweat and the moisture in breath back into drinking water. A distiller boils the urine at low pressure, filters and a catalytic reactor clean the water, and a brine processor recovers what the distiller leaves behind. Recovery was 93 to 94% before the brine processor and reached 98% with it.',
    says: ['98% water recovery', '93 and 94%', 'vacuum distillation', 'catalytic reactor'],
    backing: [
      q('water', 'One specialized component uses advanced dehumidifiers to capture moisture released into the cabin air from crew breath and sweat.'),
      q('water', 'Another subsystem, the Urine Processor Assembly (UPA), recovers water from urine using vacuum distillation.'),
      q('water', 'Distillation produces water and a urine brine that still contains some reclaimable water.'),
      q('water', 'It first uses a series of specialized filters, then a catalytic reactor that breaks down any trace contaminants that remain.'),
      q('water', 'Sensors check the water purity and unacceptable water is reprocessed.'),
      q('water', 'Before the BPA, our total water recovery was between 93 and 94% overall'),
      q('water', 'Recent assessments found that the BPA helped the system achieve the 98% water recovery goal.'),
    ],
  },
  {
    id: 'mir-fire', title: 'Fire on Mir, 1997', provider: 'NASA',
    text: 'On 24 February 1997 an oxygen generator caught fire on the space station Mir with six people aboard. The flame cut off one of the two escape ships and filled the modules with smoke. The crew put on oxygen masks and fought it with extinguishers. Space station crews still drill for three emergencies: a fire, a pressure leak and an ammonia leak.',
    says: ['Feb. 24, 1997', 'six crew members', 'oxygen masks', 'closing a module hatch'],
    backing: [
      q('mirFire', 'On Feb. 24, 1997, the six crew members aboard the Russian space station Mir faced significant danger when a fire ignited in an oxygen generating system.'),
      q('mirFire', 'not only cut off access to one of the two Soyuz escape vehicles but also filled the station'),
      q('mirFire', 'The crew quickly donned oxygen masks'),
      q('drill', 'The unlikely emergency scenarios the crew trains for include events such as depressurization, ammonia leaks and fires.'),
      q('drill', 'Responses include quickly donning safety gear, closing a module hatch to isolate pressure and ammonia leaks, extinguishing a fire and evacuating the station aboard the Soyuz crew ship.'),
    ],
  },
  {
    id: 'crew-day', title: 'A crew day in orbit', provider: 'NASA',
    text: 'Without gravity to work against, bones and muscles weaken: weight-bearing bones lose roughly 1% of their density each month. So station crews exercise for an average of two hours a day, on a treadmill, a bicycle and a weightlifting machine.',
    says: ['two hours a day', 'roughly 1% less dense'],
    backing: [
      q('exercise', 'For every month in space, astronauts'),
      q('exercise', 'weight-bearing bones become roughly 1% less dense if they don'),
      q('exercise', 'Muscles, usually activated by simply moving around on Earth, also weaken because they no longer need to work as hard.'),
      q('exercise', 'Crews exercise for an average of two hours a day.'),
    ],
  },
  {
    id: 'dust-2018', title: 'The dust storm of 2018', provider: 'NASA/JPL-Caltech',
    text: 'In June 2018 a dust storm grew until it circled all of Mars. The solar-powered Opportunity rover sent its last message on 10 June and never woke. Curiosity runs on a nuclear power source, so it kept working, under a haze six to eight times thicker than normal.',
    says: ['June 2018', 'June 10', 'nuclear-powered battery', 'six to eight times thicker than normal'],
    backing: [
      q('opportunity', 'The Opportunity rover stopped communicating with Earth when a severe Mars-wide dust storm blanketed its location in June 2018.'),
      q('opportunity', 'final communication was received June 10.'),
      q('dust2018', 'While Opportunity is powered by sunlight, which is blotted out by dust at its current location, Curiosity has a nuclear-powered battery that runs day and night.'),
      q('dust2018', 'The Martian dust storm has grown in size and is now officially a "planet-encircling" (or "global") dust event'),
      q('dust2018', 'six to eight times thicker than normal'),
    ],
  },
]

// ------------------------------------------------------------------ Earth from the station
// Photographs taken by station crews, from the NASA Image and Video Library. `title` is ours; the
// caption is NASA's own, read from the library on the retrieval date.
const EARTH = [
  ['iss071e570863', 'Aurora over the Indian Ocean'],
  ['iss073e0422279', 'The Nile at night'],
  ['iss072e001649', 'Hurricane Helene'],
  ['iss069e003192', 'The Himalayas and Mount Everest'],
  ['iss071e449837', 'The Bahamas'],
  ['iss061e123823', 'Orbital sunrise'],
  ['iss069e005526', 'The Eye of the Sahara'],
  ['iss068e021122', 'Tokyo, Nagoya and Osaka at night'],
]

// ------------------------------------------------------------------ download and check
const AGENT = { 'user-agent': 'Mozilla/5.0 (compatible; data-snapshot-script)' }
const pages = new Map()
function download(url) {
  if (!pages.has(url)) {
    pages.set(url, (async () => {
      const response = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(120_000) })
      if (!response.ok) throw new Error(`${response.status} from ${url}`)
      return Buffer.from(await response.arrayBuffer())
    })())
  }
  return pages.get(url)
}
const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: '-', mdash: '-' }
/** Quote marks, dashes and spacing made plain so wording can be compared. */
const flat = text => text
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, '-')
  .replace(/\s+/g, ' ').trim()
/** Page text without markup. */
const plain = html => flat(html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name] ?? whole))
const texts = new Map()
const textOf = source => {
  if (!texts.has(source.url)) texts.set(source.url, download(source.url).then(bytes => plain(bytes.toString('utf8'))))
  return texts.get(source.url)
}

/** Proves each quote of one card is on its page and resolves its source. */
async function backed(card) {
  const { says = [], backing, ...rest } = card
  const quotes = []
  for (const item of backing) {
    const source = SOURCES[item.source]
    if (!source) throw new Error(`${card.id}: unknown source "${item.source}"`)
    const text = await textOf(source)
    if (!text.includes(flat(item.quote))) throw new Error(`${card.id}: this quote is no longer on ${source.url}\n  "${item.quote}"`)
    quotes.push({ quote: item.quote, source, checked: 'by script' })
  }
  for (const words of says) {
    if (!backing.some(item => item.quote.includes(words))) throw new Error(`${card.id}: none of its quotes says "${words}"`)
  }
  return { ...rest, backing: quotes }
}

/** One photograph: NASA's record of it, and the picture saved beside the game. */
async function photo([id, title]) {
  const found = JSON.parse((await download(`https://images-api.nasa.gov/search?nasa_id=${id}`)).toString('utf8')).collection.items[0]
  if (!found) throw new Error(`${id}: not in the NASA Image and Video Library`)
  const record = found.data[0]
  const files = JSON.parse((await download(`https://images-api.nasa.gov/asset/${id}`)).toString('utf8')).collection.items.map(item => item.href)
  const pick = ['~medium.jpg', '~large.jpg', '~orig.jpg'].map(end => files.find(f => f.endsWith(end))).find(Boolean)
  if (!pick) throw new Error(`${id}: no picture file listed`)
  const target = join(pics, `${id}.jpg`)
  if (!existsSync(target)) writeFileSync(target, await download(pick.replace(/^http:/, 'https:').replace(/ /g, '%20')))
  // NASA's caption starts with the frame number and the date: "iss071e570863 (Aug. 10, 2024) --- ..."
  const whole = flat(record.description ?? '')
  const head = whole.match(/^\S+\s*\(([^)]+)\)\s*-+\s*/)
  return {
    id, title,
    caption: head ? whole.slice(head[0].length) : whole,
    taken: head ? head[1] : record.date_created.slice(0, 10),
    centre: record.center ?? 'JSC',
    file: `nasa/earth/${id}.jpg`,
    page: `https://images.nasa.gov/details/${id}`,
    credit: 'NASA',
  }
}

const cards = []
for (const c of CARDS) cards.push(await backed(c))
const earth = []
for (const e of EARTH) earth.push(await photo(e))

const snapshot = {
  about: 'What NASA says about the real events behind the station tasks and the dust storm, and eight photographs of Earth taken from the International Space Station. Built by scripts/fetch-station-tasks.mjs. Do not edit by hand.',
  retrieved,
  how: 'Each card keeps the exact words of its source (quote) beside our short version (text). "by script": the script downloaded the source on the retrieval date and found the quote in it. The photographs and their captions come from the NASA Image and Video Library (images.nasa.gov); the short titles are ours.',
  limits: 'These are descriptions of real events, not datasets: nothing here drives a game number. The conversion of 38 degrees Fahrenheit to about 3 degrees Celsius is ours. NASA publishes how long crews exercise; the hours of sleep and work in the game are our model.',
  model: 'Our model, not NASA data: every rule of the station tasks (the adapter parts and timers, the power draws, the water loop figures other than 93 to 94% and 98%, the cabin alarm, the crew performance figure), the scores, and what a dust storm does to the rover in the game (a hazy camera and slower driving).',
  cards,
  earth,
}
writeFileSync(join(out, 'station-tasks.json'), JSON.stringify(snapshot, null, 2) + '\n')

const quotes = cards.flatMap(c => c.backing)
console.log(`${quotes.length} quotes found in their sources, for ${cards.length} cards`)
console.log(`photographs: ${earth.map(e => `${e.title} (${e.id}, ${e.taken})`).join('; ')}`)
