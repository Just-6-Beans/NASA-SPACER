// Builds data/nasa/launch-vehicles.json: what NASA says about the three launch systems on the
// launch field. Run with `npm run data:rockets` (needs a network connection). The game reads the
// committed snapshot and never calls these pages at runtime.
//
// Every fact in the snapshot keeps the exact words of a NASA page (`quote`) beside our short
// version of it (`text` or `value`). This script downloads each page and stops if a quote is no
// longer there, so a fact cannot outlive its source. Numbers the game calculates with (thrust,
// weight, cost) must also appear in their quotes as written in `says`.
//
// Two sources are PDFs. The script reads them with `pdftotext` when that tool is installed (it
// ships with Git for Windows and with poppler) and marks the quote `checked: "by script"`. Where
// the tool is missing the quote is kept and marked `checked: "by hand"`.
//
// Our model, not NASA data: launch prices in credits, cargo ratings, and the ascent itself. Those
// live in src/core/data.ts and src/core/ascent.ts.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nasa')
mkdirSync(out, { recursive: true })
const retrieved = new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ sources
const SOURCES = {
  shuttleRef: { title: 'The Space Shuttle', provider: 'NASA reference page, updated 27 January 2026', url: 'https://www.nasa.gov/reference/the-space-shuttle/' },
  sts1: { title: '40 Years Ago: Columbia Takes Flight!', provider: 'NASA History, Johnson Space Center, 12 April 2021', url: 'https://www.nasa.gov/history/40-years-ago-columbia-takes-flight/' },
  shuttleStudents: { title: 'What Was the Space Shuttle? (Grades 5-8)', provider: 'NASA STEM, 26 November 2013', url: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-space-shuttle-grades-5-8/' },
  sts88: { title: 'STS-88', provider: 'NASA mission page', url: 'https://www.nasa.gov/mission/sts-88/' },
  sts135: { title: 'STS-135', provider: 'NASA mission page', url: 'https://www.nasa.gov/mission/sts-135/' },
  stationFacts: { title: 'International Space Station Facts and Figures', provider: 'NASA, updated 16 July 2024', url: 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/' },
  kennedyFaq: { title: 'Space Shuttle and International Space Station: Frequently Asked Questions', provider: 'NASA Kennedy Space Center, archived page with no date', url: 'https://www3.nasa.gov/centers/kennedy/about/information/shuttle_faq_prt.htm' },
  shuttleEra: { title: 'Space Shuttle Era Facts (FS-2011-7-142-KSC)', provider: 'NASA Kennedy Space Center fact sheet, July 2011', url: 'https://www.nasa.gov/wp-content/uploads/2023/04/2011.07.05-shuttle-era-facts.pdf', pdf: true },
  pressKit: { title: 'Commercial Crew Program Press Kit', provider: 'NASA, a page NASA keeps updating', url: 'https://www.nasa.gov/commercial-crew-program-press-kit/' },
  certified: { title: 'NASA and SpaceX Complete Certification of First Human-Rated Commercial Space System', provider: 'NASA, 10 November 2020', url: 'https://www.nasa.gov/humans-in-space/nasa-and-spacex-complete-certification-of-first-human-rated-commercial-space-system/' },
  crew2: { title: "NASA's SpaceX Crew-2 Astronauts Headed to International Space Station", provider: 'NASA release 21-045, 23 April 2021', url: 'https://www.nasa.gov/news-release/nasas-spacex-crew-2-astronauts-headed-to-international-space-station/' },
  inspectorJune: { title: "NASA's Commercial Crew Program Faces Schedule Delays, Cost Increases, and Safety Challenges", provider: 'NASA Office of Inspector General, 30 June 2026', url: 'https://oig.nasa.gov/news/nasas-commercial-crew-program-faces-schedule-delays-cost-increases-and-safety-challenges/' },
  inspectorSeptember: { title: "Unlocking the Future Space Economy Through NASA's Commercial Crew and Cargo Transportation Programs", provider: 'NASA Office of Inspector General, 10 September 2026', url: 'https://oig.nasa.gov/news/unlocking-the-future-space-economy-through-nasas-commercial-crew-and-cargo-transportation-programs/' },
  seats: { title: "NASA's Management of Crew Transportation to the International Space Station (report IG-20-005)", provider: 'NASA Office of Inspector General, 14 November 2019', url: 'https://oig.nasa.gov/wp-content/uploads/2024/02/IG-20-005.pdf', pdf: true },
  stacked: { title: 'Starliner Joins Atlas V at Space Launch Complex-41', provider: 'NASA Commercial Crew Program blog, 4 May 2022', url: 'https://www.nasa.gov/blogs/commercialcrew/2022/05/04/starliner-joins-atlas-v-at-space-launch-complex-41/' },
  atlasForStarliner: { title: "The Atlas V Rocket for Boeing's CST-100 Starliner Launch", provider: 'NASA Commercial Crew Program blog, 19 May 2022', url: 'https://www.nasa.gov/blogs/commercialcrew/2022/05/19/the-atlas-v-rocket-for-boeings-cst-100-starliner-launch/' },
  atlasImage: { title: 'Atlas V', provider: 'NASA image article, 30 August 2014', url: 'https://www.nasa.gov/image-article/atlas-v/' },
  crew9: { title: "Welcome Home! NASA's SpaceX Crew-9 Back on Earth After Science Mission", provider: 'NASA release 25-027, 18 March 2025', url: 'https://www.nasa.gov/news-release/welcome-home-nasas-spacex-crew-9-back-on-earth-after-science-mission/' },
  uncrewedReturn: { title: 'NASA Decides to Bring Starliner Spacecraft Back to Earth Without Crew', provider: 'NASA release 24-108, 24 August 2024', url: 'https://www.nasa.gov/news-release/nasa-decides-to-bring-starliner-spacecraft-back-to-earth-without-crew/' },
}
/** One quote and the page it is on. */
const q = (source, quote) => ({ source, quote })

// ------------------------------------------------------------------ the three launch systems
// `brief` is the short description behind the "?" on the launch field. `numbers` are its tiles.
// `liftoff` and `cost` are the figures the game calculates with; `says` lists the words that must
// be in their quotes, so a number here cannot drift from the sentence it came from.
const VEHICLES = [
  {
    id: 'space-shuttle',
    name: 'Space Shuttle',
    years: '1998 to 2011',
    first: { label: 'First flight to the station', value: '4 December 1998', backing: [
      q('sts88', 'The STS-88 mission launched aboard the Space Shuttle Endeavour on December 4, 1998 at 2:35 a.m. (CST) to deliver the Unity Node to the International Space Station (ISS).'),
      q('sts88', 'STS-88 was the 1st shuttle mission to the International Space Station, and launched a U.S. built node Unity to the station.'),
    ] },
    last: { label: 'Last landing', value: '21 July 2011', backing: [
      q('sts135', "Space Shuttle Atlantis completed STS-135, its 33rd and final mission landing on Runway 15 at Kennedy Space Center's Shuttle Landing Facility on the morning of Thursday, July 21, 2011."),
    ] },
    brief: [
      { label: 'Stack', text: 'No separate capsule: the orbiter held the crew, a huge cargo bay and the three main engines. An external tank and two solid rocket boosters made up the rest.', backing: [
        q('shuttleRef', 'the Orbiter contains the pressurized crew compartment (which can normally carry up to seven crew members), the huge cargo bay, and the three main engines mounted on its aft end'),
        q('shuttleRef', 'The Space Shuttle consists of three major components: the Orbiter which houses the crew; a large External Tank that holds fuel for the main engines; and two Solid Rocket Boosters'),
      ] },
      { label: 'Strength', text: 'It built the station: 37 of the 42 assembly flights. On the first, its 50-foot robot arm joined the first two modules.', backing: [
        q('stationFacts', 'The large modules and other pieces of the station were delivered on 42 assembly flights, 37 on the U.S. space shuttles and five on Russian Proton/Soyuz rockets.'),
        q('sts88', 'using the 50-foot-long robot arm, the Zarya control module was captured from orbit and mated to Unity'),
      ] },
      { label: 'Coming home', text: 'Glided in to land on a runway. Everything flew again except the external tank.', backing: [
        q('shuttleStudents', "After re-entering Earth's atmosphere, it glided in for a landing on a runway."),
        q('shuttleRef', 'All of the components are reused except for the external fuel tank, which burns up in the atmosphere after each launch.'),
      ] },
    ],
    numbers: [
      { label: 'Crew', value: 'up to 7', backing: [q('shuttleStudents', 'The space shuttle carried as many as seven astronauts at a time to and from space.')] },
      { label: 'Length, stacked', value: '184 ft', backing: [q('shuttleRef', 'Space Shuttle: 184 feet')] },
      { label: 'Lift-off thrust', value: '6.8 million lb', backing: [q('sts1', 'The combined engines generated 6.8 million pounds of thrust, lifting the 4.5-million-pound vehicle off Launch Pad 39A.')] },
      { label: 'Lift-off weight', value: '4.5 million lb', backing: [q('sts1', 'The combined engines generated 6.8 million pounds of thrust, lifting the 4.5-million-pound vehicle off Launch Pad 39A.')] },
      { label: 'Missions', value: '135, from 1981', backing: [q('shuttleStudents', 'The first space shuttle flight took place April 12, 1981. The shuttle made its final landing July 21, 2011. During those 30 years, the space shuttle launched on 135 missions.')] },
      { label: 'Cost per launch', value: 'about $450 million', backing: [q('kennedyFaq', 'The average cost to launch a Space Shuttle is about $450 million per mission.')] },
    ],
    liftoff: {
      thrustLbf: 6_800_000, weightLb: 4_500_000,
      note: 'One NASA sentence gives both figures, for the first launch in 1981.',
      says: ['6.8 million pounds of thrust', '4.5-million-pound vehicle'],
      backing: [q('sts1', 'The combined engines generated 6.8 million pounds of thrust, lifting the 4.5-million-pound vehicle off Launch Pad 39A.')],
    },
    cost: {
      usdMillions: 450, basis: "NASA Kennedy's average for one Shuttle mission.",
      says: ['about $450 million per mission'],
      backing: [q('kennedyFaq', 'The average cost to launch a Space Shuttle is about $450 million per mission.')],
    },
  },
  {
    id: 'falcon-9-crew-dragon',
    name: 'Falcon 9 + Crew Dragon',
    years: '2020 to now',
    first: { label: 'First crew flight', value: '30 May 2020', backing: [
      q('pressKit', 'In Demo-2, launched May 30, 2020, NASA astronauts Bob Behnken and Doug Hurley became the first to fly aboard Dragon and returned to Earth 64 days later with a splashdown in the Gulf of Mexico on Aug. 2, 2020.'),
    ] },
    last: null,
    brief: [
      { label: 'Stack', text: 'Falcon 9 is the rocket; Crew Dragon is the capsule on top. Together, the first new crew system NASA certified since the Shuttle.', backing: [
        q('certified', 'The Crew Dragon, including the Falcon 9 rocket and associated ground systems, is the first new, crew spacecraft to be NASA-certified for regular flights with astronauts since the space shuttle nearly 40 years ago.'),
      ] },
      { label: 'Reuse', text: 'The first stage lands and flies again, and so does the capsule.', backing: [
        q('pressKit', 'Falcon 9 is the first orbital class rocket capable of re-flight.'),
        q('pressKit', 'Carbon fiber landing legs and hypersonic grid fins, all stowed during ascent, are two of the critical elements essential to ensure safe and successful landing of the Falcon 9 first stage.'),
        q('crew2', 'First reuse of the Crew Dragon spacecraft and Falcon 9 rocket on a crew mission'),
      ] },
      { label: 'Escape', text: 'Eight abort engines can pull the capsule clear at any point from the pad to orbit.', backing: [
        q('pressKit', 'Dragon features an advanced abort system with eight SuperDraco engines and a series of parachutes that can be activated instantaneously from the moment they are armed on the launch pad all the way through orbital insertion.'),
      ] },
      { label: 'Coming home', text: 'Docks itself with the station, then returns to a splashdown and a recovery ship.', backing: [
        q('pressKit', 'Dragon performs a series of phasing maneuvers to gradually approach and autonomously dock with the station.'),
        q('pressKit', 'Upon splashdown, the crew will be picked up by the SpaceX recovery ship and returned to shore.'),
      ] },
    ],
    numbers: [
      { label: 'Crew', value: '4 for NASA, room for 7', backing: [q('pressKit', 'Dragon is capable of carrying up to seven passengers but carries up to four astronauts for NASA missions, and is designed for water landings.')] },
      { label: 'Rocket height', value: '229.6 ft', backing: [q('pressKit', 'Height: 70 meters or 229.6 feet')] },
      { label: 'Lift-off thrust', value: 'over 1.7 million lb', backing: [q('pressKit', 'Falcon 9 generates more than 1.7 million pounds of thrust at sea level but produces over 1.8 million pounds of thrust in the vacuum of space.')] },
      { label: 'Mass', value: '1,207,920 lb', backing: [q('pressKit', 'Mass: 549,054 kilograms or 1,207,920 pounds')] },
      { label: 'Crewed missions', value: '12 by June 2026', backing: [q('inspectorJune', 'SpaceX obtained human-rating certification for its Crew Dragon capsule and Falcon 9 launch vehicle in 2020, completing 12 crewed missions to date.')] },
      { label: 'Cost per seat', value: 'about $55 million', backing: [q('seats', 'Assuming four astronauts per flight and using publicly available information, the estimated average cost per seat is approximately $90 million for Boeing and approximately $55 million for SpaceX, potentially providing cost savings over current Soyuz prices.')] },
    ],
    liftoff: {
      thrustLbf: 1_700_000, weightLb: 1_207_920,
      note: 'NASA says "more than" 1.7 million pounds and labels the other figure "Mass", so the true ratio is a little higher.',
      says: ['more than 1.7 million pounds of thrust at sea level', '1,207,920 pounds'],
      backing: [
        q('pressKit', 'Falcon 9 generates more than 1.7 million pounds of thrust at sea level but produces over 1.8 million pounds of thrust in the vacuum of space.'),
        q('pressKit', 'Mass: 549,054 kilograms or 1,207,920 pounds'),
      ],
    },
    cost: {
      usdMillions: 220, perSeatUsdMillions: 55, seats: 4,
      basis: "NASA's inspector general, 2019: an estimated average of about $55 million a seat, at four astronauts a flight.",
      says: ['four astronauts per flight', 'approximately $55 million for SpaceX'],
      backing: [q('seats', 'Assuming four astronauts per flight and using publicly available information, the estimated average cost per seat is approximately $90 million for Boeing and approximately $55 million for SpaceX, potentially providing cost savings over current Soyuz prices.')],
    },
  },
  {
    id: 'atlas-v-n22-starliner',
    name: 'Atlas V N22 + Starliner',
    years: '2024',
    first: { label: 'Crew flight test', value: '5 June 2024', backing: [
      q('crew9', "Williams and Wilmore launched aboard Boeing's Starliner spacecraft and United Launch Alliance Atlas V rocket on June 5, 2024, from Space Launch Complex 41 as part of the agency's Boeing Crew Flight Test."),
    ] },
    last: { label: 'Crew flight test', value: '5 June 2024', backing: [
      q('crew9', "Williams and Wilmore launched aboard Boeing's Starliner spacecraft and United Launch Alliance Atlas V rocket on June 5, 2024, from Space Launch Complex 41 as part of the agency's Boeing Crew Flight Test."),
    ] },
    brief: [
      { label: 'Stack', text: "Atlas V is the rocket; Starliner is Boeing's capsule on top. No nose fairing, two solid rocket boosters and a two-engine Centaur upper stage.", backing: [
        q('pressKit', 'For Starliner missions to station, Boeing will use the Starliner Configuration of the Atlas V, as seen above.'),
        q('atlasForStarliner', 'This rocket configuration does not include a payload fairing.'),
        q('atlasForStarliner', 'The rocket has two solid rocket boosters (SRBs) and a dual-engine Centaur upper stage.'),
      ] },
      { label: 'Record', text: 'In 2019 NASA\'s inspector general wrote of the rocket\'s "long history of mission success", though it had never carried people.', backing: [
        q('seats', 'While the Atlas V has a long history of mission success, it has not been used for human space flight.'),
      ] },
      { label: 'Escape', text: 'Four abort engines of its own can push the capsule clear all the way up.', backing: [
        q('pressKit', 'The pusher abort system provides safe crew escape throughout the launch and ascent phase of the mission.'),
        q('pressKit', 'Starliner has four launch abort engines that each provide 40,000 pounds of thrust and are dedicated for low altitude abort-use.'),
      ] },
      { label: 'Coming home', text: 'Lands on the ground under parachutes, on airbags. The capsule is built for up to 10 flights; the rocket flies once.', backing: [
        q('pressKit', 'Starliner uses a proven parachute and airbag system for shock absorption in order to land on ground.'),
        q('pressKit', 'Boeing designed the spacecraft to be reusable up to 10 times with a six-month processing turnaround time.'),
        q('atlasImage', 'The Atlas V is an expendable launch system in the Evolved Expendable Launch Vehicles family.'),
      ] },
      { label: 'Status', text: 'After its 2024 test flight NASA brought the capsule home empty. In September 2026 it was still not certified to carry crew.', backing: [
        q('uncrewedReturn', "NASA will return Boeing's Starliner to Earth without astronauts Butch Wilmore and Suni Williams aboard the spacecraft, the agency announced Saturday."),
        q('inspectorSeptember', 'Boeing, meanwhile, has still not obtained human-rating certification for its Starliner capsule and Atlas V launch vehicle.'),
      ] },
    ],
    numbers: [
      { label: 'Crew', value: '4 for NASA, room for 7', backing: [q('pressKit', 'Starliner is designed for up to seven passengers or a mix of crew and cargo, but for NASA missions will carry up to four astronauts to the orbiting laboratory.')] },
      { label: 'Height with capsule', value: '172 ft', backing: [q('stacked', 'Starliner was raised and carefully placed onto the rocket and now is fully assembled and ready for an integrated systems test, a tip-to-tail electrical check of the 172-foot-tall Atlas V and Starliner stack.')] },
      { label: 'Lift-off thrust', value: 'over 1.6 million lb', backing: [q('pressKit', 'Each SRB is capable of approximately 380,000 pounds of thrust, for a total of over 1.6 million pounds of thrust at liftoff.')] },
      { label: 'Lift-off weight', value: 'not given by NASA', backing: [] },
      { label: 'Crewed flights', value: '1, in June 2024', backing: [
        q('crew9', "Williams and Wilmore launched aboard Boeing's Starliner spacecraft and United Launch Alliance Atlas V rocket on June 5, 2024, from Space Launch Complex 41 as part of the agency's Boeing Crew Flight Test."),
        q('inspectorSeptember', 'Boeing, meanwhile, has still not obtained human-rating certification for its Starliner capsule and Atlas V launch vehicle.'),
      ] },
      { label: 'Cost per seat', value: 'about $90 million', backing: [q('seats', 'Assuming four astronauts per flight and using publicly available information, the estimated average cost per seat is approximately $90 million for Boeing and approximately $55 million for SpaceX, potentially providing cost savings over current Soyuz prices.')] },
    ],
    // NASA gives the thrust but no lift-off weight for this stack, so there is no ratio to take from it.
    liftoff: null,
    cost: {
      usdMillions: 360, perSeatUsdMillions: 90, seats: 4,
      basis: "NASA's inspector general, 2019: an estimated average of about $90 million a seat, at four astronauts a flight.",
      says: ['four astronauts per flight', 'approximately $90 million for Boeing'],
      backing: [q('seats', 'Assuming four astronauts per flight and using publicly available information, the estimated average cost per seat is approximately $90 million for Boeing and approximately $55 million for SpaceX, potentially providing cost savings over current Soyuz prices.')],
    },
  },
]

// Where NASA's own pages disagree with a figure this snapshot uses. Checked like every other quote.
const DISAGREEMENTS = [
  { about: 'space-shuttle', text: 'Another NASA page puts the Shuttle\'s thrust at lift-off at 7.8 million pounds, not 6.8 million. This snapshot uses the sentence that gives thrust and weight together.', backing: [
    q('shuttleRef', 'At liftoff, the External Tank absorbs the total (7.8 million pounds) thrust loads of the three main engines and the two solid rocket motors.'),
  ] },
  { about: 'space-shuttle', text: 'A 2011 NASA fact sheet puts the cost of a Shuttle mission far higher for one year: about $775 million in fiscal year 2010.', backing: [
    q('shuttleEra', 'For Fiscal Year 2010, the average cost to prepare and launch a shuttle mission was approximately $775 million.'),
  ] },
]

// ------------------------------------------------------------------ download and check
const AGENT = { 'user-agent': 'Mozilla/5.0 (compatible; data-snapshot-script)' }
const pages = new Map()
function download(url) {
  if (!pages.has(url)) {
    pages.set(url, (async () => {
      const response = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(90_000) })
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

/** The text of a PDF, or null when pdftotext is not installed. The file goes in its own empty folder. */
let warned = false
function pdfText(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'nasa-pdf-'))
  try {
    const file = join(dir, 'source.pdf')
    writeFileSync(file, bytes)
    const run = spawnSync('pdftotext', ['-q', file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    if (run.error || run.status !== 0) {
      if (!warned) console.warn('pdftotext is not installed here: quotes from PDFs are kept and marked "by hand".')
      warned = true
      return null
    }
    return flat(run.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const texts = new Map()
/** The comparable text of a source, or null for a PDF that cannot be read here. */
function textOf(source) {
  if (!texts.has(source.url)) texts.set(source.url, download(source.url).then(bytes => (source.pdf ? pdfText(bytes) : plain(bytes.toString('utf8')))))
  return texts.get(source.url)
}

/** Proves each quote of one fact is on its page and resolves its source. */
async function backed(where, fact) {
  const { says = [], backing, ...rest } = fact
  const quotes = []
  for (const item of backing) {
    const source = SOURCES[item.source]
    if (!source) throw new Error(`${where}: unknown source "${item.source}"`)
    const text = await textOf(source)
    if (text !== null && !text.includes(flat(item.quote))) throw new Error(`${where}: this quote is no longer on ${source.url}\n  "${item.quote}"`)
    const { pdf, ...shown } = source
    quotes.push({ quote: item.quote, source: shown, checked: text === null ? 'by hand' : 'by script' })
  }
  for (const words of says) {
    if (!backing.some(item => item.quote.includes(words))) throw new Error(`${where}: none of its quotes says "${words}"`)
  }
  return { ...rest, backing: quotes }
}

const vehicles = []
for (const v of VEHICLES) {
  const at = part => `${v.id} ${part}`
  const liftoff = v.liftoff && await backed(at('lift-off'), v.liftoff)
  vehicles.push({
    id: v.id, name: v.name, years: v.years,
    first: await backed(at('first flight'), v.first),
    last: v.last && await backed(at('last flight'), v.last),
    brief: await Promise.all(v.brief.map(item => backed(at(`"${item.label}"`), item))),
    numbers: await Promise.all(v.numbers.map(item => backed(at(`"${item.label}"`), item))),
    // thrust divided by weight, both in pounds as NASA gives them
    liftoff: liftoff && { ...liftoff, twr: Math.round((liftoff.thrustLbf / liftoff.weightLb) * 100) / 100 },
    cost: v.cost && await backed(at('cost'), v.cost),
  })
}
const disagreements = await Promise.all(DISAGREEMENTS.map(item => backed(`${item.about} disagreement`, item)))

const snapshot = {
  about: 'What NASA says about the three launch systems on the launch field. Built by scripts/fetch-launch-vehicles.mjs. Do not edit by hand.',
  retrieved,
  how: 'Each fact keeps the exact words of a NASA page (quote) beside our short version (text or value). "by script": the script downloaded the source on the retrieval date and found the quote in it. "by hand": the source is a PDF and the script could not read it on that run, so the quote stands as it was checked when it was added, against the text of the PDF.',
  limits: 'These are descriptions and a few headline figures, not a performance dataset. The Shuttle\'s thrust and weight are for its first launch. Falcon 9\'s thrust is given as "more than" 1.7 million pounds and its other figure is labelled "Mass", so its ratio is a floor. NASA gives no lift-off weight for the Atlas V with Starliner. The cost figures are not like for like: an undated average for the Shuttle, and 2019 estimates per seat for the two capsules. NASA\'s pages say "Falcon 9" and "the Starliner Configuration of the Atlas V"; "Block 5" and "N22" are the names their builders use.',
  model: 'Our model, not NASA data: launch prices in credits (one credit for each $10 million of the cost figure), cargo ratings, every instrument and supply, and the ascent itself. Thrust over weight at lift-off is NASA\'s figures divided for the Shuttle and Falcon 9, and our own estimate for the Atlas V.',
  disagreements,
  vehicles,
}
writeFileSync(join(out, 'launch-vehicles.json'), JSON.stringify(snapshot, null, 2) + '\n')

const all = v => [v.first, v.last, ...v.brief, ...v.numbers, v.liftoff, v.cost].filter(Boolean).flatMap(f => f.backing)
for (const v of vehicles) {
  const quotes = all(v)
  console.log(`${v.name}: ${quotes.filter(x => x.checked === 'by script').length} quotes found in their sources, ${quotes.filter(x => x.checked === 'by hand').length} kept by hand, ` +
    `thrust over weight ${v.liftoff ? v.liftoff.twr : 'not given by NASA'}, cost $${v.cost.usdMillions} million a flight`)
}
console.log(`${disagreements.length} disagreements between NASA pages recorded`)
