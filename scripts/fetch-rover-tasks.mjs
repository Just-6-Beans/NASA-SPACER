// Builds data/nasa/rover-tasks.json: what NASA says about the rockets that could carry the rover,
// the rock samples Perseverance has sealed, and the real events behind the two rover tasks
// (a stuck rover, and choosing rocks to keep). Run with `npm run data:rovertasks` (needs a network
// connection). The game reads the committed snapshot and never calls these pages at runtime.
//
// Like scripts/fetch-launch-vehicles.mjs, every fact keeps the exact words of its source (`quote`)
// beside our short version (`text` or `value`). The script downloads each page and stops if a
// quote is no longer there. Numbers the game calculates with must also appear in their quotes as
// written in `says`.
//
// Two sources are PDFs (the two launch press kits). They are read with `pdftotext` when it is
// installed (it ships with Git for Windows and with poppler); otherwise the quote is kept and
// marked `checked: "by hand"`.
//
// Not NASA: one figure comes from SpaceX (what a Falcon 9 can send to Mars) and one statement
// from a news report (the funding of Mars Sample Return). Both say so in the snapshot.
//
// Our model, not NASA data: prices in credits, success rates, wheel wear, the telemetry in the
// rescue, the scan read-outs and the science values. Those live in src/core/.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'data', 'nasa')
const pics = join(root, 'public', 'nasa', 'samples')
mkdirSync(out, { recursive: true })
mkdirSync(pics, { recursive: true })
const retrieved = new Date().toISOString().slice(0, 10)

// ------------------------------------------------------------------ sources
const SOURCES = {
  atacama: { title: "NASA's Curiosity Rover Frees Its Drill From a Rock (PIA26723)", provider: 'NASA/JPL-Caltech, 4 May 2026', url: 'https://www.jpl.nasa.gov/images/pia26723-nasas-curiosity-rover-frees-its-drill-from-a-rock/' },
  wheels: { title: "An Algorithm Helps Protect Mars Curiosity's Wheels", provider: 'NASA/JPL-Caltech, 29 June 2017', url: 'https://www.jpl.nasa.gov/news/an-algorithm-helps-protect-mars-curiositys-wheels/' },
  sandTrap: { title: "NASA's Opportunity Rover Rolls Free on Mars", provider: 'NASA/JPL-Caltech, 6 June 2005', url: 'https://www.jpl.nasa.gov/news/nasas-opportunity-rover-rolls-free-on-mars/' },
  catalog: { title: 'Mars Rock Samples', provider: 'NASA Science, Mars 2020 Perseverance sample catalog', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/' },
  firstAttempt: { title: "NASA's Perseverance Team Assessing First Mars Sampling Attempt", provider: 'NASA/JPL-Caltech, 6 August 2021', url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-team-assessing-first-mars-sampling-attempt/' },
  nextAttempt: { title: "NASA's Perseverance Plans Next Sample Attempt", provider: 'NASA/JPL-Caltech, 26 August 2021', url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-plans-next-sample-attempt/' },
  rochette: { title: "NASA's Perseverance Rover Collects Puzzle Pieces of Mars' History", provider: 'NASA release, 10 September 2021', url: 'https://www.nasa.gov/news-release/nasas-perseverance-rover-collects-puzzle-pieces-of-mars-history/' },
  delta: { title: "NASA's Perseverance Rover Investigates Geologically Rich Mars Terrain", provider: 'NASA release, 15 September 2022', url: 'https://www.nasa.gov/news-release/nasas-perseverance-rover-investigates-geologically-rich-mars-terrain/' },
  biosignature: { title: 'NASA Says Mars Rover Discovered Potential Biosignature Last Year', provider: 'NASA release, 10 September 2025', url: 'https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/' },
  sapphire: { title: 'Meet the Mars Samples: Sapphire Canyon (Sample 25)', provider: 'NASA Science', url: 'https://science.nasa.gov/resource/meet-the-mars-samples-sapphire-canyon-sample-25/' },
  m2020Contract: { title: 'NASA Awards Launch Services Contract for Mars 2020 Rover Mission', provider: 'NASA release 16-089, 25 August 2016', url: 'https://www.nasa.gov/news-release/nasa-awards-launch-services-contract-for-mars-2020-rover-mission/' },
  m2020Liftoff: { title: 'Mars 2020 Liftoff', provider: 'NASA image article, 30 July 2020', url: 'https://www.nasa.gov/image-article/mars-2020-liftoff/' },
  m2020Mission: { title: 'Mars 2020 Perseverance Launch Press Kit: Mission Overview', provider: 'NASA/JPL-Caltech, June 2020', url: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/' },
  m2020Kit: { title: 'Mars 2020 Perseverance Launch Press Kit', provider: 'NASA/JPL-Caltech, June 2020', url: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/download/mars_2020_launch_press_kit.pdf', pdf: true },
  mslKit: { title: 'Mars Science Laboratory Launch Press Kit', provider: 'NASA/JPL-Caltech, November 2011', url: 'https://mars.nasa.gov/internal_resources/822/', pdf: true },
  mslLaunch: { title: 'NASA Launches Most Capable and Robust Rover to Mars', provider: 'NASA/JPL-Caltech, 26 November 2011', url: 'https://www.jpl.nasa.gov/news/nasa-launches-most-capable-and-robust-rover-to-mars/' },
  saturn: { title: 'What Was the Saturn V? (Grades 5-8)', provider: 'NASA STEM, updated 1 April 2025', url: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/' },
  imap: { title: 'NASA Awards Launch Services Contract for IMAP Mission', provider: 'NASA release, 25 September 2020', url: 'https://www.nasa.gov/news-release/nasa-awards-launch-services-contract-for-imap-mission/' },
  dart: { title: 'NASA Awards Launch Services Contract for Asteroid Redirect Test Mission', provider: 'NASA release, 11 April 2019', url: 'https://www.nasa.gov/news-release/nasa-awards-launch-services-contract-for-asteroid-redirect-test-mission/' },
  register: { title: 'Congress throws NASA a lifeline, leaves Mars sample mission to die in the dust', provider: 'The Register (news report, not NASA), 16 January 2026', url: 'https://www.theregister.com/2026/01/16/nasa_science_budget/' },
}
/** One quote and the page it is on. */
const q = (source, quote) => ({ source, quote })

// ------------------------------------------------------------------ the three rockets
// `cost` is the figure the game's price comes from; `says` lists the words that must be in its quotes.
const ROCKETS = [
  {
    id: 'atlas-v-541', name: 'Atlas V 541', maker: 'United Launch Alliance',
    brief: [
      { label: 'Record', text: 'The rocket that really launched both rovers: Curiosity in 2011 and Perseverance in 2020.', backing: [
        q('mslKit', 'Type: Atlas V 541'),
        q('mslLaunch', 'NASA began a historic voyage to Mars with the Nov. 26 launch of the Mars Science Laboratory, which carries a car-sized rover named Curiosity.'),
        q('m2020Liftoff', 'A United Launch Alliance Atlas V 541 rocket lifts off from Space Launch Complex 41 at Cape Canaveral Air Force Station in Florida on July 30, 2020'),
      ] },
      { label: 'Name', text: '541 stands for a 5-metre nose cone, 4 solid boosters and 1 engine on the upper stage.', backing: [
        q('m2020Mission', 'The numbers "541" in the launch vehicle\'s designation signify a 5-meter (17-foot) short payload fairing, four solid-rocket boosters, and a one-engine Centaur upper stage.'),
      ] },
    ],
    numbers: [
      { label: 'Flew Curiosity', value: '26 Nov 2011', backing: [q('mslLaunch', 'NASA began a historic voyage to Mars with the Nov. 26 launch of the Mars Science Laboratory, which carries a car-sized rover named Curiosity.')] },
      { label: 'Flew Perseverance', value: '30 Jul 2020', backing: [q('m2020Liftoff', 'A United Launch Alliance Atlas V 541 rocket lifts off from Space Launch Complex 41 at Cape Canaveral Air Force Station in Florida on July 30, 2020')] },
    ],
    cost: {
      usdMillions: 243, basis: "NASA's total cost to launch Mars 2020 (Perseverance) on this rocket.", says: ['$243 million', 'Mars 2020'],
      backing: [q('m2020Contract', 'The total cost for NASA to launch Mars 2020 is approximately $243 million, which includes: the launch service; spacecraft and spacecraft power source processing; planetary protection processing; launch vehicle integration; and tracking, data and telemetry support.')],
    },
  },
  {
    id: 'falcon-9-expendable', name: 'Falcon 9, booster not recovered', maker: 'SpaceX',
    brief: [
      { label: 'Record', text: 'NASA flies science missions on Falcon 9, among them DART and IMAP. No rover has gone to Mars on one.', backing: [
        q('dart', 'The DART mission currently is targeted to launch in June 2021 on a Falcon 9 rocket from Space Launch Complex 4E at Vandenberg Air Force Base in California.'),
        q('imap', 'The IMAP mission is targeted to launch in October 2024 on a Falcon 9 Full Thrust rocket from Launch Complex 40 at Cape Canaveral Air Force Station in Florida.'),
      ] },
    ],
    numbers: [
      { label: 'NASA paid, DART', value: '$69 million', backing: [q('dart', 'The total cost for NASA to launch DART is approximately $69 million, which includes the launch service and other mission related costs.')] },
      { label: 'NASA paid, IMAP', value: '$109.4 million', backing: [q('imap', 'The total cost for NASA to launch IMAP and the secondary payloads is approximately $109.4 million, which includes the launch service and other mission related costs.')] },
    ],
    cost: {
      usdMillions: 109.4, says: ['$109.4 million', 'IMAP'],
      basis: "NASA's cost to launch IMAP on a Falcon 9, the dearer of the two Falcon 9 launches recorded here. NASA has published no price for a Falcon 9 that gives up its booster to reach Mars, so the game uses this figure as a stand-in.",
      backing: [q('imap', 'The total cost for NASA to launch IMAP and the secondary payloads is approximately $109.4 million, which includes the launch service and other mission related costs.')],
    },
  },
  {
    id: 'saturn-v', name: 'Saturn V', maker: 'NASA',
    brief: [
      { label: 'Record', text: 'The Moon rocket. It first flew in 1967, and the last one launched the Skylab space station in 1973.', backing: [
        q('saturn', 'The first Saturn V was launched in 1967.'),
        q('saturn', 'The last Saturn V was launched in 1973, without a crew.'),
        q('saturn', 'It was used to launch the Skylab space station into Earth orbit.'),
      ] },
    ],
    numbers: [
      { label: 'Last launch', value: '1973', backing: [q('saturn', 'The last Saturn V was launched in 1973, without a crew.')] },
      { label: 'Height', value: '111 m', backing: [q('saturn', 'The Saturn V rocket was 111 meters (363 feet) tall, about the height of a 36-story-tall building, and 18 meters (60 feet) taller than the Statue of Liberty.')] },
      { label: 'Fuelled weight', value: '2.8 million kg', backing: [q('saturn', 'Fully fueled for liftoff, the Saturn V weighed 2.8 million kilograms (6.2 million pounds), the weight of about 400 elephants.')] },
    ],
    cost: null,
  },
]

// What the rocket has to lift: the whole spacecraft, not the rover alone.
const SPACECRAFT = {
  curiosity: {
    launchMassKg: 3893, says: ['3,893 kilograms', '899-kilogram'],
    text: 'The whole spacecraft at launch: the 899 kg rover, its landing system and the cruise stage.',
    backing: [q('mslKit', 'Mass: 8,463 pounds (3,893 kilograms) total at launch, consisting of 1,982-pound (899-kilogram) rover; 5,293-pound (2,401-kilogram) entry, descent and landing system (aeroshell plus fueled descent stage); and 1,188-pound (539-kilogram) fueled cruise stage')],
  },
  perseverance: {
    extraRoverKg: 126, says: ['126 kilograms'],
    text: "NASA's press kit gives no launch mass for the Mars 2020 spacecraft on its own. It says the rover is 126 kg heavier than Curiosity, so the game adds that to Curiosity's 3,893 kg: about 4,019 kg. That sum is our estimate, not a NASA figure.",
    backing: [q('m2020Kit', 'Perseverance has about 5 inches (3 centimeters) additional chassis length and 278 additional pounds (126 kilograms) compared to Curiosity.')],
  },
}

// The one figure here that is not NASA's. SpaceX's page is drawn by a script, so this script cannot read it.
const FALCON_MARS = {
  kg: 4020, provider: 'SpaceX', url: 'https://www.spacex.com/vehicles/falcon-9/', checked: 'by hand',
  note: 'What SpaceX lists as the payload a Falcon 9 can send to Mars. It applies to a booster that is not flown back and landed. Not a NASA figure. The page is drawn by a script, so the snapshot script cannot check it.',
}

// ------------------------------------------------------------------ five of Perseverance's sealed samples
// `catalog` is the entry in NASA's sample catalog. `story` is what NASA has said about the rock.
const entry = (name, no, feature, type, sol, date, rock, height) =>
  `${name} Sample No. ${no} Feature Name: ${feature} Sample Type: ${type} Sol Sealed: ${sol} Date Sealed: ${date} Rock Type: ${rock} Sample Height: ${height}`
const SAMPLES = [
  {
    id: 'roubion', number: 1, name: 'Roubion', feature: 'Roubion', sampleType: 'Atmospheric', rockType: null, sol: 164, sealed: '6 August 2021', heightCm: null,
    catalog: [q('catalog', entry('Roubion', 1, 'Roubion', 'Atmospheric', 164, 'Aug. 6, 2021', 'n/a', 'n/a'))],
    story: [
      { label: 'What happened', text: 'The first coring attempt. The rock crumbled to powder, so the tube was sealed with no rock in it. The catalog lists it as a sample of the air.', backing: [
        q('firstAttempt', "Data sent to Earth by NASA's Perseverance rover after its first attempt to collect a rock sample on Mars and seal it in a sample tube indicate that no rock was collected during the initial sampling activity."),
        q('nextAttempt', 'breaking into powder and fragments of material too small to be retained in the sample tube before it was sealed and stored within the rover.'),
      ] },
    ],
  },
  {
    id: 'montdenier', number: 2, name: 'Montdenier', feature: 'Rochette', sampleType: 'Rock Core', rockType: 'Igneous', sol: 194, sealed: '6 September 2021', heightCm: 5.98,
    catalog: [q('catalog', entry('Montdenier', 2, 'Rochette', 'Rock Core', 194, 'Sept. 6, 2021', 'Igneous', '5.98 cm (2.35 in)'))],
    story: [
      { label: 'The rock', text: 'Basaltic rock, probably from a lava flow. Volcanic rock can be dated precisely.', backing: [
        q('rochette', "The rock that provided the mission's first core samples is basaltic in composition and may be the product of lava flows."),
        q('rochette', 'The volcanic origin of the rock could help scientists accurately date when it formed.'),
      ] },
      { label: 'Water', text: 'Salts in it show that water once moved through or over the rock.', backing: [
        q('rochette', "What's more, salts have been spied within these rocks."),
      ] },
    ],
  },
  {
    id: 'skyland', number: 11, name: 'Skyland', feature: 'Skinner Ridge', sampleType: 'Rock Core', rockType: 'Sedimentary', sol: 495, sealed: '12 July 2022', heightCm: 5.85,
    catalog: [q('catalog', entry('Skyland', 11, 'Skinner Ridge', 'Rock Core', 495, 'July 12, 2022', 'Sedimentary', '5.85 cm (2.30 in)'))],
    note: "NASA's release describes a delta sandstone without naming the rock. Skinner Ridge is the delta rock sampled alongside the Wildcat Ridge mudstone, so the game reads the sandstone as Skinner Ridge: our reading.",
    story: [
      { label: 'The rock', text: 'A sandstone from the river delta, carrying grains and rock fragments that came from far outside Jezero Crater.', backing: [
        q('delta', 'we found a sandstone that carries grains and rock fragments created far from Jezero Crater - and a mudstone that includes intriguing organic compounds.'),
      ] },
    ],
  },
  {
    id: 'hazeltop', number: 12, name: 'Hazeltop', feature: 'Wildcat Ridge', sampleType: 'Rock Core', rockType: 'Sedimentary', sol: 509, sealed: '27 July 2022', heightCm: 5.97,
    catalog: [q('catalog', entry('Hazeltop', 12, 'Wildcat Ridge', 'Rock Core', 509, 'July 27, 2022', 'Sedimentary', '5.97 cm (2.35 in)'))],
    story: [
      { label: 'The rock', text: 'A mudstone: mud and fine sand that settled in an evaporating salt lake billions of years ago.', backing: [
        q('delta', '"Wildcat Ridge" is the name given to a rock about 3 feet (1 meter) wide that likely formed billions of years ago as mud and fine sand settled in an evaporating saltwater lake.'),
      ] },
      { label: 'Organics', text: 'The SHERLOC instrument found organic molecules together with sulfate minerals: the most abundant organic detections of the mission at that time.', backing: [
        q('delta', "SHERLOC's analysis indicates the samples feature a class of organic molecules that are spatially correlated with those of sulfate minerals."),
        q('delta', 'In its analysis of Wildcat Ridge, the SHERLOC instrument registered the most abundant organic detections on the mission to date.'),
      ] },
    ],
  },
  {
    id: 'sapphire', number: 25, name: 'Sapphire Canyon', feature: 'Cheyava Falls', sampleType: 'Rock Core', rockType: 'Sedimentary', sol: 1215, sealed: '21 July 2024', heightCm: 6.2,
    catalog: [q('catalog', entry('Sapphire Canyon', 25, 'Cheyava Falls', 'Rock Core', 1215, 'July 21, 2024', 'Sedimentary', '6.2 cm (2.44 in)'))],
    story: [
      { label: 'The rock', text: 'A reddish rock covered in "leopard spots".', backing: [
        q('biosignature', 'NASA\'s Perseverance rover discovered leopard spots on a reddish rock nicknamed "Cheyava Falls" in Mars\' Jezero Crater in July 2024.'),
      ] },
      { label: 'Why it matters', text: 'NASA says the sample contains potential biosignatures: something that might have a biological origin but needs more study before anyone can say.', backing: [
        q('biosignature', 'Taken from a rock named "Cheyava Falls" last year, the sample, called "Sapphire Canyon," contains potential biosignatures, according to a paper published Wednesday in the journal Nature.'),
        q('biosignature', 'A potential biosignature is a substance or structure that might have a biological origin but requires more data or further study before a conclusion can be reached about the absence or presence of life.'),
      ] },
    ],
  },
]

/** The picture NASA's catalog shows with each sample. `says` is the caption printed beside it on the page. */
const IMAGES = {
  "roubion": [
    "https://science.nasa.gov/wp-content/uploads/2024/03/mars-sample-01-flf-0164-0681506341-857eby-n0060000fhaz00209-01-0llj.png?w=1024",
    "roubion.png",
    "NASA's Mars Perseverance rover acquired this image of the area in front of it using its onboard Front Left Hazard Avoidance Camera A. This image was acquired on Aug. 6, 2021 (Sol 164) at the local mean solar time of 14:22:08."
  ],
  "montdenier": [
    "https://science.nasa.gov/wp-content/uploads/2024/03/mars-sample-02-pia24805-navcam-of-borehole-sol190-navcam-borehole.jpg?w=1024",
    "montdenier.jpg",
    "This composite of two images shows the hole drilled by NASA's Perseverance rover during its second sample-collection attempt. at Montdenier."
  ],
  "skyland": [
    "https://science.nasa.gov/wp-content/uploads/2024/03/mars-sample-11-nlf-0495-0710900102-755ecm-n0261004ncam00709-01-095j.png?w=1024",
    "skyland.png",
    "NASA's Mars Perseverance rover acquired this image using its onboard Left Navigation Camera (Navcam). The camera is located high on the rover's mast and aids in driving. This image was acquired on July 12, 2022 (Sol 495) at the local mean solar time of 16:54:24."
  ],
  "hazeltop": [
    "https://science.nasa.gov/wp-content/uploads/2024/03/mars-sample-12-nlf-0509-0712140650-691ecm-n0261222ncam00709-01-095j.png?w=1024",
    "hazeltop.png",
    "NASA's Mars Perseverance rover acquired this image using its onboard Left Navigation Camera (Navcam). The camera is located high on the rover's mast and aids in driving. This image was acquired on July 26, 2022 (Sol 509) at the local mean solar time of 16:17:10."
  ],
  "sapphire": [
    "https://science.nasa.gov/wp-content/uploads/2024/04/mars-perseverance-flf-1216-0774891765-475ecm-n0560000fhaz02008-01-095j.jpg?w=1024",
    "sapphire.jpg",
    "NASA's Mars Perseverance rover acquired this image from the Bright Angel rock formation, showing the target \"Cheyava Falls.\" The whitish spot at center is an abrasion patch Perseverance created, while the hole at left is where it acquired the \"Sapphire Canyon\" core sample."
  ]
}
const SHOWS = {
  "roubion": "The ground in front of the rover after the first attempt. No rock came up, so there is no core to show.",
  "montdenier": "The hole the rover drilled in Rochette.",
  "skyland": "The drill hole in Skinner Ridge, with a nearby patch where the rover ground the surface clean.",
  "hazeltop": "The drill hole in Wildcat Ridge (left) and the patch ground clean beside it.",
  "sapphire": "Cheyava Falls: the hole where the core was taken (left) and the pale patch the rover ground clean (centre)."
}

const TUBES = {
  total: 43, forSamples: 38, says: ['43 tubes', '38 are for collecting samples'],
  backing: [q('catalog', 'Of the 43 tubes Perseverance brought to Mars, 38 are for collecting samples')],
  collected: { label: 'Sealed so far', value: '30 of 38', backing: [q('catalog', 'Samples Collected 30 of 38')] },
}

// ------------------------------------------------------------------ the cards the two tasks show
const CARDS = [
  {
    id: 'rock-delay', title: "Curiosity's rock delay", provider: 'NASA/JPL-Caltech',
    text: "In April 2026 a 13 kg (28.6 lb) rock called Atacama lifted out of the ground, stuck to Curiosity's drill. It took the team from 25 April to 1 May to shake it off.",
    backing: [
      q('atacama', 'On April 25, 2026, Curiosity drilled a sample from a rock nicknamed "Atacama," which is an estimated 1.5 feet in diameter at its base, 6 inches thick and weighs roughly 28.6 pounds (13 kilograms).'),
      q('atacama', 'When the rover retracted its arm, the entire rock lifted out of the ground, suspended by the fixed sleeve that surrounds the rotating drill bit.'),
      q('atacama', "Finally, on May 1, Curiosity's team tried again, tilting the drill more, rotating and vibrating the drill, and spinning the drill bit."),
    ],
  },
  {
    id: 'wheel-wear', title: 'Worn wheels', provider: 'NASA/JPL-Caltech',
    text: "Curiosity's wheels began to show wear in 2013. Software now adjusts each wheel's speed to take pressure off them.",
    backing: [
      q('wheels', 'Even before 2013, when the wheels began to show signs of wear, JPL engineers had been studying how to reduce the effects of the rugged Martian surface.'),
      q('wheels', "The traction control algorithm uses real-time data to adjust each wheel's speed, reducing pressure from the rocks."),
    ],
  },
  {
    id: 'sand-trap', title: 'A rover that really got stuck', provider: 'NASA/JPL-Caltech',
    text: 'In 2005 Opportunity sank to its wheel rims in a small dune. Freeing it took nearly five weeks: 192 m of wheel turns to move 1 m.',
    backing: [
      q('sandTrap', "From about 174 million kilometers away (about 108 million miles), the rover team at NASA's Jet Propulsion Laboratory, Pasadena, Calif., had worked diligently for nearly five weeks to extricate the rover."),
      q('sandTrap', 'In the weeks following, the rover churned 192 meters (629 feet) worth of wheel rotations before gaining enough traction to actually move one meter (about three feet).'),
    ],
  },
  {
    id: 'sample-caching', title: 'Sample caching', provider: 'NASA',
    text: 'Perseverance brought 43 tubes to Mars, 38 of them for samples, and has sealed 30. One of its main goals is the search for signs of ancient microbial life.',
    backing: [
      q('catalog', 'Of the 43 tubes Perseverance brought to Mars, 38 are for collecting samples'),
      q('catalog', 'Samples Collected 30 of 38'),
      q('sapphire', "A key objective for Perseverance's mission on Mars is astrobiology, including the search for signs of ancient microbial life."),
    ],
  },
  {
    id: 'curiosity-powder', title: 'Curiosity carries no tubes', provider: 'NASA/JPL-Caltech',
    text: 'Curiosity grinds rock to powder and studies it in its own laboratory. Perseverance cuts whole cores and seals them in tubes.',
    backing: [
      q('m2020Kit', "The drill will cut intact rock cores, and they'll be placed in sample tubes via a complex storage system."),
      q('m2020Kit', '(Curiosity, on the other hand, pulverizes rock for its instruments to study.)'),
    ],
  },
  {
    id: 'sample-return', title: 'Will the tubes come home?', provider: 'News report, not NASA',
    text: 'The mission meant to bring the tubes to Earth, Mars Sample Return, was left without funding in the United States budget passed in January 2026.',
    backing: [
      q('register', "US Congress has rejected plans to slash NASA's science budget, restoring most funding with one notable exception: Mars Sample Return remains cancelled."),
    ],
  },
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
  const quotes = await quoted(where, backing)
  for (const words of says) {
    if (!backing.some(item => item.quote.includes(words))) throw new Error(`${where}: none of its quotes says "${words}"`)
  }
  return { ...rest, backing: quotes }
}
async function quoted(where, backing) {
  const quotes = []
  for (const item of backing) {
    const source = SOURCES[item.source]
    if (!source) throw new Error(`${where}: unknown source "${item.source}"`)
    const text = await textOf(source)
    if (text !== null && !text.includes(flat(item.quote))) throw new Error(`${where}: this quote is no longer on ${source.url}\n  "${item.quote}"`)
    const { pdf, ...shown } = source
    quotes.push({ quote: item.quote, source: shown, checked: text === null ? 'by hand' : 'by script' })
  }
  return quotes
}

const rockets = []
for (const r of ROCKETS) {
  const at = part => `${r.id} ${part}`
  rockets.push({
    id: r.id, name: r.name, maker: r.maker,
    brief: await Promise.all(r.brief.map(item => backed(at(`"${item.label}"`), item))),
    numbers: await Promise.all(r.numbers.map(item => backed(at(`"${item.label}"`), item))),
    cost: r.cost && await backed(at('cost'), r.cost),
  })
}
const curiosity = await backed('Curiosity launch mass', SPACECRAFT.curiosity)
const perseverance = await backed('Perseverance launch mass', SPACECRAFT.perseverance)
const spacecraft = {
  curiosity,
  // 3,893 kg + 126 kg: both numbers are NASA's, the sum is ours
  perseverance: { ...perseverance, estimateKg: curiosity.launchMassKg + perseverance.extraRoverKg },
}
/** Saves the catalog's picture of a sample into public/nasa/samples and records its caption, checked against the page. */
async function picture(s) {
  const [url, file, caption] = IMAGES[s.id]
  const target = join(pics, file)
  if (!existsSync(target)) writeFileSync(target, await download(url))
  const [shown] = await quoted(`${s.name} picture caption`, [q('catalog', caption)])
  return { file: `nasa/samples/${file}`, shows: SHOWS[s.id], url: url.split('?')[0], credit: 'NASA/JPL-Caltech', caption: shown }
}
const samples = []
for (const s of SAMPLES) {
  const { catalog, story, ...facts } = s
  samples.push({
    ...facts,
    catalog: await quoted(`${s.name} catalog entry`, catalog),
    story: await Promise.all(story.map(item => backed(`${s.name} "${item.label}"`, item))),
    image: await picture(s),
  })
}
const { collected, ...tubeFacts } = TUBES
const tubes = { ...await backed('sample tubes', tubeFacts), collected: await backed('samples collected', collected) }
const cards = await Promise.all(CARDS.map(c => backed(`card ${c.id}`, c)))

const snapshot = {
  about: 'What NASA says about the rockets that could carry the rover, five of the rock samples Perseverance has sealed, and the real events behind the rover tasks. Built by scripts/fetch-rover-tasks.mjs. Do not edit by hand.',
  retrieved,
  how: 'Each fact keeps the exact words of its source (quote) beside our short version (text or value). "by script": the script downloaded the source on the retrieval date and found the quote in it. "by hand": the script could not read the source on that run (a PDF without pdftotext, or a page drawn by a script), so the quote or figure stands as it was checked when it was added.',
  limits: "The pictures are the ones NASA's catalog prints beside each sample: they show the drill hole and its surroundings, not the core tube. " + "These are descriptions and a few headline figures, not a performance dataset. The Atlas V cost is NASA's 2016 figure for the whole Mars 2020 launch, not a list price. The Falcon 9 cost is for a different mission (IMAP) and stands in for a launch NASA has never bought. NASA's press kit gives no launch mass for the Mars 2020 spacecraft on its own, so that figure is our sum of two NASA numbers. NASA's sample catalog gives each sample's type, rock, dates and core length; it does not describe colour or layering. The Atacama rock stuck to Curiosity's drill, not to a wheel.",
  model: 'Our model, not NASA data: prices in credits (one credit for each $10 million of the cost figure), the success rate of each rocket, the Mars days a failed launch costs, how often the rover gets stuck, the telemetry and the fixes in the rescue, wheel wear and its effect on speed, the scan read-outs of each rock and its science value.',
  rockets,
  spacecraft,
  falconMarsPayload: FALCON_MARS,
  samples,
  tubes,
  cards,
}
writeFileSync(join(out, 'rover-tasks.json'), JSON.stringify(snapshot, null, 2) + '\n')

const every = [
  ...rockets.flatMap(r => [...r.brief, ...r.numbers, r.cost].filter(Boolean).flatMap(f => f.backing)),
  ...spacecraft.curiosity.backing, ...spacecraft.perseverance.backing,
  ...samples.flatMap(s => [...s.catalog, ...s.story.flatMap(x => x.backing)]),
  ...tubes.backing, ...tubes.collected.backing, ...cards.flatMap(c => c.backing),
]
console.log(`${every.filter(x => x.checked === 'by script').length} quotes found in their sources, ${every.filter(x => x.checked === 'by hand').length} kept by hand`)
console.log(`rockets: ${rockets.map(r => `${r.name}${r.cost ? ` $${r.cost.usdMillions} million` : ''}`).join(', ')}`)
console.log(`spacecraft at launch: Curiosity ${spacecraft.curiosity.launchMassKg} kg (NASA), Perseverance about ${spacecraft.perseverance.estimateKg} kg (our sum); Falcon 9 to Mars ${FALCON_MARS.kg} kg (SpaceX)`)
console.log(`samples: ${samples.map(s => `${s.name} (No. ${s.number})`).join(', ')}`)
