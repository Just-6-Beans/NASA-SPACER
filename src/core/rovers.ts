// Rover facts and the "what each part does" guide. Hand-checked against the NASA pages linked
// next to each entry. Descriptions are written in our own words.
import perseveranceArea from '../../data/nasa/perseverance-area.json'
import curiosityArea from '../../data/nasa/curiosity-area.json'
import perseveranceSat from '../../data/nasa/perseverance-satellite.json'
import curiositySat from '../../data/nasa/curiosity-satellite.json'
import refs from '../../data/nasa/site-references.json'
import type { ActionKind } from './survey'

export type RoverId = 'perseverance' | 'curiosity'

/** A real photo, with the map position (metres east and north of the centre) of the stop it was taken at. */
export interface Photo {
  x: number; y: number; sol: number; camera: string; cameraName: string; part: string
  takenUtc: string; credit: string; imageId: string; file: string; source: string
}
/** A place the real rover parked: map position, the tilt NASA recorded, and its elevation. */
export interface AreaStop { x: number; y: number; sol: number; tiltDeg: number; elevationM: number }
/** The 3 km map around the rover: real stops, real photos, and MOLA heights from orbit. */
export interface Area {
  provider: string; retrieved: string; credit: string; source: string[]; gallery: string; sizeM: number
  centre: { lat: number; lon: number; sol: number; elevationM: number; tiltDeg: number; odometerM: number }
  stops: AreaStop[]
  photos: Photo[]
  mola: { provider: string; source: string; note: string; cellM: number; x: number[]; y: number[]; heights: number[][] }
}

/** REAL: orbital map tiles covering the 3 km square, as saved from NASA's rover location map. */
export interface Satellite {
  provider: string; credit: string; page: string; layer: string; retrieved: string; note: string
  zoom: number; tilePx: number; cols: number; rows: number; files: string; missing: string[]
  /** The game square inside the block of tiles, in pixels from the block's top-left corner. */
  square: { left: number; top: number; width: number; height: number }
  metresPerPixel: number
}
/** A saved NASA picture of the rover: a real selfie, or an artist's concept for the parts guide. */
export interface Picture {
  rover: string; use: string; kind: string; file: string; id: string; title: string; date: string
  credit: string; page: string; width: number; height: number; note: string
}
const picture = (rover: RoverId, use: 'selfie' | 'parts') => (refs.pictures as Picture[]).find(p => p.rover === rover && p.use === use)!

/** A place on the rover where a tappable dot sits in the parts guide. */
export type Anchor =
  | 'mastHead' | 'mastCams' | 'mastBooms' | 'arm' | 'turret' | 'wheels' | 'frontHaz' | 'mmrtg'
  | 'hga' | 'uhf' | 'deck' | 'body' | 'belly' | 'rearBelly' | 'batteries' | 'frontBelly'
/** Where each dot sits on a rover's parts picture, in percent of its width and height. Placed by eye. */
export type Anchors = Partial<Record<Anchor, [number, number]>>

export interface Part {
  id: string
  name: string
  anchor: Anchor
  where: string
  what: string
  facts: string[]
  url: string
  /** Rover jobs that use this part. */
  usedBy: ActionKind[]
}

export interface RoverSpec {
  id: RoverId
  name: string
  region: 'jezero' | 'gale'
  launched: string
  landed: string
  /** REAL: MMRTG electrical output at launch, watts. */
  mmrtgLaunchW: number
  /** REAL: two lithium-ion batteries; total energy in watt-hours. */
  batteryWh: number
  batteryText: string
  /** REAL: top driving speed, metres per hour. */
  topSpeedMh: number
  /** REAL ceiling for driving power ("less than 200 W"); MODEL uses 190 W. */
  driveW: number
  /** REAL: rover mass in kilograms (sets the energy needed to climb). */
  massKg: number
  eyes: string
  home: string
  /** REAL photo the rover took of itself, and where the rover is in it (percent), for the choice screen. */
  selfie: Picture
  selfieFocus: [number, number]
  /** NASA artist's concept used by the parts guide, with the dot positions on it. */
  partsPicture: Picture
  /** The part of that picture the guide shows (left, top, right, bottom in percent), so the rover fills the frame. */
  partsCrop: [number, number, number, number]
  anchors: Anchors
  satellite: Satellite
  area: Area
  parts: Part[]
  sources: { label: string; url: string }[]
}

/** REAL: MMRTG power falls about 4.8 % a year (JPL Publication 15-6, vacuum rate). */
export const MMRTG_DECAY_PER_YEAR = 0.048
const SURVEY_DATE = new Date(perseveranceArea.photos[0]?.takenUtc ?? '2026-11-01')
const years = (from: string) => (SURVEY_DATE.getTime() - new Date(from).getTime()) / (365.25 * 86400e3)
/** MODEL estimate from REAL inputs: today's MMRTG output from the launch figure and the decay rate. */
export const mmrtgNowW = (r: RoverSpec) => Math.round(r.mmrtgLaunchW * (1 - MMRTG_DECAY_PER_YEAR) ** years(r.launched))

const PERSEVERANCE_PARTS: Part[] = [
  { id: 'mastcamz', name: 'Mastcam-Z', anchor: 'mastCams', where: 'Top of the mast, about 2 m up', what: 'A pair of zoom cameras that work like the rover\'s eyes for science. They shoot colour panoramas, 3D stereo views and video, so the team can pick targets and read the landscape.', facts: ['Sees details from 0.15 mm to 7.4 mm per pixel'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: ['photo'] },
  { id: 'supercam', name: 'SuperCam', anchor: 'mastHead', where: 'Mast head', what: 'Fires a laser at a rock from a distance and reads the tiny flash of vapour to learn what the rock is made of. It also has a camera and a microphone that hears each laser zap.', facts: ['Laser works on targets more than 7 m away', 'Microphone hears zaps up to 4 m away'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: [] },
  { id: 'navcam', name: 'Navcams', anchor: 'mastHead', where: 'Mast head', what: 'Two colour cameras that look ahead in stereo. Drivers use their pictures to plan routes and build 3D maps of the ground.', facts: ['2 cameras', 'Can spot a golf ball 25 m away'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['photo', 'drive'] },
  { id: 'hazcam', name: 'Hazcams', anchor: 'frontHaz', where: 'Front and back of the body, pointing down', what: 'Wide-angle cameras that watch the ground right around the wheels for rocks, holes and sand, so the rover can steer itself safely.', facts: ['6 cameras: 4 front, 2 rear'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['photo', 'drive'] },
  { id: 'meda', name: 'MEDA weather station', anchor: 'mastBooms', where: 'Sensors on the mast, deck and body', what: 'Measures wind, air temperature, humidity and the dust in the air, like a weather station that travels with the rover. Its SkyCam looks straight up at the sky.', facts: ['Includes SkyCam on the top deck'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: ['weather'] },
  { id: 'arm', name: 'Robotic arm', anchor: 'arm', where: 'Front of the body', what: 'A strong arm that holds the drill and close-up instruments against rocks, much like a human arm and hand.', facts: ['2.1 m long', '5 joints'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['drill'] },
  { id: 'drill', name: 'Coring drill', anchor: 'turret', where: 'End of the arm (turret)', what: 'Grinds the surface clean and cuts out rock cores about the size of a piece of chalk, which go into sealed sample tubes.', facts: ['Fills sample tubes for possible return to Earth'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['drill'] },
  { id: 'pixl', name: 'PIXL', anchor: 'turret', where: 'Arm turret', what: 'Shines X-rays on a rock and maps which chemical elements are in it, down to grains as small as sand.', facts: ['Detects more than 20 elements', 'About 10 s per grain-sized spot'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: ['drill'] },
  { id: 'sherloc', name: 'SHERLOC and WATSON', anchor: 'turret', where: 'Arm turret', what: 'SHERLOC uses an ultraviolet laser to look for organic molecules and minerals that formed in water. WATSON is its close-up colour camera for rock textures.', facts: ['Laser spot 100 µm wide', 'WATSON sees details of 15.9 µm'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: ['drill'] },
  { id: 'caching', name: 'Sample Caching System', anchor: 'belly', where: 'Inside the body', what: 'A small inner arm moves each filled tube, a camera photographs it, and the tube is sealed. Some tubes were left on the ground as a depot for a future mission.', facts: ['43 sample tubes', 'Three Forks depot: 10 tubes, finished 28 Jan 2023'], url: 'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-completes-mars-sample-depot/', usedBy: ['drill'] },
  { id: 'rimfax', name: 'RIMFAX radar', anchor: 'rearBelly', where: 'Low on the back of the rover', what: 'A ground-penetrating radar that maps buried rock layers under the wheels as the rover drives.', facts: ['Sees more than 10 m deep', 'Shows layers 15 to 30 cm thick'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/', usedBy: ['drive'] },
  { id: 'wheels', name: 'Wheels and rocker-bogie', anchor: 'wheels', where: 'Under the body', what: 'Six motorised wheels on a rocker-bogie suspension that keeps all six touching the ground as the rover climbs over rocks.', facts: ['6 aluminium wheels, 52.5 cm across', 'Top speed 152 m per hour', 'Driving uses less than 200 W'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['drive'] },
  { id: 'mmrtg', name: 'MMRTG power source', anchor: 'mmrtg', where: 'Back of the rover', what: 'Turns the heat from decaying plutonium into electricity, day and night, in any season. Its spare heat also keeps the rover\'s insides warm.', facts: ['About 110 W at launch, falling a few percent a year', 'Designed for 14 years of operation'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['drive', 'drill'] },
  { id: 'batteries', name: 'Batteries', anchor: 'batteries', where: 'Inside the body', what: 'Two lithium-ion batteries store the MMRTG\'s steady trickle so the rover can use more power than the MMRTG makes during busy moments, like driving or drilling.', facts: ['2 batteries, about 43 Ah each', '2,408 Wh in total', 'Kept at 40 % charge or more'], url: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/spacecraft/power/', usedBy: ['drive', 'drill'] },
  { id: 'moxie', name: 'MOXIE', anchor: 'body', where: 'Inside the body, front right', what: 'A test machine that made oxygen from the carbon dioxide in Mars\' air, showing that future crews could make oxygen on Mars. Its mission is complete.', facts: ['122 g of oxygen in 16 runs', 'Final run 7 Aug 2023'], url: 'https://www.jpl.nasa.gov/news/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/', usedBy: [] },
  { id: 'hga', name: 'High-gain antenna', anchor: 'hga', where: 'On the deck', what: 'A steerable flat antenna that talks straight to Earth. It is slow, so most data goes through orbiters instead.', facts: ['Up to 3,000 bits per second with a 70 m dish'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: [] },
  { id: 'uhf', name: 'UHF antenna', anchor: 'uhf', where: 'Back of the deck', what: 'Sends data up to orbiting spacecraft such as Mars Reconnaissance Orbiter, which pass it on to Earth. This is how nearly all the rover\'s photos come home.', facts: ['Up to 2 megabits per second', 'About 99.9 % of science data goes this way'], url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/', usedBy: ['photo'] },
  { id: 'ingenuity', name: 'Ingenuity helicopter', anchor: 'frontBelly', where: 'Carried under the body until 2021', what: 'A small test helicopter that proved powered flight works on Mars. It was meant to fly five times and flew far more before a damaged rotor ended its mission.', facts: ['72 flights', 'Last flight 18 Jan 2024'], url: 'https://www.nasa.gov/news-release/after-three-years-on-mars-nasas-ingenuity-helicopter-mission-ends/', usedBy: [] },
]

const MSL_KIT = 'https://mars.nasa.gov/internal_resources/822/'
const MSL_SI = 'https://science.nasa.gov/mission/msl-curiosity/science-instruments/'
const CURIOSITY_PARTS: Part[] = [
  { id: 'mastcam', name: 'Mastcam', anchor: 'mastCams', where: 'Top of the mast, about 2 m up', what: 'Two colour cameras, one wide and one telephoto, that photograph the landscape, shoot video and help the team choose targets.', facts: ['34 mm and 100 mm lenses', '1600 × 1200 pixels'], url: MSL_SI, usedBy: ['photo'] },
  { id: 'chemcam', name: 'ChemCam', anchor: 'mastHead', where: 'Laser on the mast head, spectrometers inside the body', what: 'Zaps a pinhead-sized spot on a rock with a laser, turning it into glowing plasma. The colours of that light reveal which elements are in the rock.', facts: ['Works on targets up to 7 m away'], url: MSL_KIT, usedBy: [] },
  { id: 'navcam', name: 'Navcams', anchor: 'mastHead', where: 'Mast head', what: 'Black-and-white stereo cameras that drivers use to plan each route and build 3D maps of the ground ahead.', facts: ['45° field of view', 'A golf ball 25 m away is about 2 pixels wide'], url: MSL_KIT, usedBy: ['photo', 'drive'] },
  { id: 'hazcam', name: 'Hazcams', anchor: 'frontHaz', where: 'Front and back of the body, pointing down', what: 'Fisheye cameras that watch for rocks and holes around the wheels and help aim the arm.', facts: ['124° field of view', '12 engineering cameras in total'], url: MSL_KIT, usedBy: ['photo', 'drive'] },
  { id: 'rems', name: 'REMS weather station', anchor: 'mastBooms', where: 'Booms on the mast, UV sensor on the deck', what: 'Measures air and ground temperature, pressure, humidity, wind and ultraviolet light. Its readings set the temperatures and daylight in this game.', facts: ['Reads temperatures from −130 °C to +70 °C'], url: MSL_SI, usedBy: ['weather'] },
  { id: 'arm', name: 'Robotic arm', anchor: 'arm', where: 'Front of the body', what: 'A five-jointed arm that carries a heavy tool turret and holds the drill and close-up instruments against rocks.', facts: ['2.1 m long', 'Carries a 30 kg turret'], url: 'https://science.nasa.gov/photojournal/curiositys-robotic-arm/', usedBy: ['drill'] },
  { id: 'drill', name: 'Drill', anchor: 'turret', where: 'Arm turret', what: 'Hammers and spins into rock to turn it into powder, which it then delivers to the labs inside the rover.', facts: ['Up to 5 cm deep', '1.6 cm wide hole'], url: MSL_KIT, usedBy: ['drill'] },
  { id: 'mahli', name: 'MAHLI', anchor: 'turret', where: 'Arm turret', what: 'A focusing colour camera that works like a geologist\'s hand lens, taking close-ups of grains and textures.', facts: ['14 µm per pixel at its closest'], url: MSL_KIT, usedBy: ['drill'] },
  { id: 'apxs', name: 'APXS', anchor: 'turret', where: 'Arm turret', what: 'Pressed against a rock, it reads the X-rays that come back to work out which elements the rock contains.', facts: ['Finds trace elements down to 100 parts per million'], url: MSL_KIT, usedBy: ['drill'] },
  { id: 'chemin', name: 'CheMin', anchor: 'body', where: 'Inside the body, with a funnel on the deck', what: 'Shines X-rays through drilled rock powder to identify exactly which minerals it holds, many of which form in water.', facts: ['25 cm cube, 10 kg'], url: MSL_KIT, usedBy: ['drill'] },
  { id: 'sam', name: 'SAM', anchor: 'body', where: 'Inside the body, front', what: 'A microwave-sized chemistry lab that bakes samples and studies the gases they give off, searching for carbon-based molecules.', facts: ['40 kg', 'Ovens reach 1,000 °C using at most 40 W'], url: MSL_SI, usedBy: ['drill'] },
  { id: 'dan', name: 'DAN', anchor: 'rearBelly', where: 'Low on the sides of the body', what: 'Fires neutrons into the ground and counts how they bounce back. Hydrogen slows them, so DAN can sense water bound in the ground beneath the rover.', facts: ['Senses water down to 0.1 %', 'Looks about 50 cm to 1 m down'], url: MSL_SI, usedBy: ['drive'] },
  { id: 'rad', name: 'RAD', anchor: 'deck', where: 'On the deck, looking up', what: 'Counts the radiation reaching the surface from space and the Sun. Its readings set the radiation bar in this game.', facts: ['About the size of a small toaster', 'Average 0.67 mSv per day (2012–2013)'], url: MSL_SI, usedBy: ['radiation'] },
  { id: 'mardi', name: 'MARDI', anchor: 'frontBelly', where: 'Under the front of the body, pointing down', what: 'Filmed the ground rushing up during landing so the team could see exactly where Curiosity came down.', facts: ['About 4 frames per second'], url: MSL_SI, usedBy: [] },
  { id: 'wheels', name: 'Wheels and rocker-bogie', anchor: 'wheels', where: 'Under the body', what: 'Six aluminium wheels on a rocker-bogie suspension. Sharp rocks have worn holes in them, so special software now eases the load on the wheels.', facts: ['50 cm across', 'Top speed about 4 cm per second', 'In 2022 one wheel had 5 of 19 treads broken'], url: 'https://www.jpl.nasa.gov/news/an-algorithm-helps-protect-mars-curiositys-wheels/', usedBy: ['drive'] },
  { id: 'mmrtg', name: 'MMRTG power source', anchor: 'mmrtg', where: 'Back of the rover, with white fins', what: 'Turns heat from decaying plutonium into electricity day and night. As it ages it makes less power, so recharging takes longer and heaters take a bigger share.', facts: ['Slightly over 110 W at launch', 'Designed for at least 14 years'], url: MSL_KIT, usedBy: ['drive', 'drill'] },
  { id: 'batteries', name: 'Batteries', anchor: 'batteries', where: 'Inside the body', what: 'Two lithium-ion batteries store the MMRTG\'s steady trickle so the rover can briefly use more power than the MMRTG makes.', facts: ['2 batteries, about 42 Ah each'], url: MSL_KIT, usedBy: ['drive', 'drill'] },
  { id: 'hga', name: 'High-gain antenna', anchor: 'hga', where: 'Left edge of the deck', what: 'A steerable hexagonal antenna that talks straight to Earth, slowly.', facts: ['About 0.3 m across', 'At least 800 bits per second with a 70 m dish'], url: MSL_KIT, usedBy: [] },
  { id: 'uhf', name: 'UHF antenna', anchor: 'uhf', where: 'Right-rear corner', what: 'Sends most of the rover\'s data up to orbiters such as Mars Reconnaissance Orbiter, which relay it to Earth.', facts: ['Up to about 2 megabits per second to MRO'], url: MSL_KIT, usedBy: ['photo'] },
]

export const ROVERS: Record<RoverId, RoverSpec> = {
  perseverance: {
    id: 'perseverance', name: 'Perseverance', region: 'jezero', launched: '2020-07-30', landed: '2021-02-18',
    mmrtgLaunchW: 110, batteryWh: 2408, batteryText: '2 lithium-ion batteries, 43 Ah each, 2,408 Wh',
    topSpeedMh: 152, driveW: 190, massKg: 1025,
    eyes: 'https://science.nasa.gov/mission/mars-2020-perseverance/location-map/', home: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    selfie: picture('perseverance', 'selfie'), selfieFocus: [71, 47],
    partsPicture: picture('perseverance', 'parts'), partsCrop: [13, 13, 81, 83],
    anchors: {
      mastHead: [33.3, 20.6], mastCams: [35.9, 27.4], mastBooms: [31, 35.7], arm: [57.3, 45.6], turret: [72.1, 54.2], wheels: [33.3, 71.8],
      frontHaz: [44.3, 55.4], mmrtg: [23.8, 48.2], hga: [42.5, 43.2], uhf: [23.8, 38.3], deck: [37.5, 46.3], body: [34.6, 49.4],
      belly: [39.4, 54.6], rearBelly: [25.6, 58.4], batteries: [28.6, 52.6], frontBelly: [41.6, 62],
    },
    satellite: perseveranceSat as Satellite,
    area: perseveranceArea as Area,
    parts: PERSEVERANCE_PARTS,
    sources: [
      { label: 'Rover components (NASA)', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/' },
      { label: 'Science instruments (NASA)', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/' },
      { label: 'Power press kit (JPL)', url: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/spacecraft/power/' },
      { label: 'Battery design paper: 2,408 Wh, 40 % minimum charge (NASA)', url: 'https://www.nasa.gov/wp-content/uploads/2024/01/battery-system-design-testing-and-operation-for-the-mars-perseverance-rover-and-ingenuity-helicopter.pdf' },
      { label: 'MMRTG decay 4.8 %/year (JPL Publication 15-6)', url: 'https://ntrs.nasa.gov/api/citations/20160001769/downloads/20160001769.pdf' },
      { label: 'Live location map (NASA)', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/location-map/' },
    ],
  },
  curiosity: {
    id: 'curiosity', name: 'Curiosity', region: 'gale', launched: '2011-11-26', landed: '2012-08-06',
    // 2 x 42 Ah (REAL). NASA gives no Curiosity voltage, so Wh uses Perseverance's 2,408 Wh / 86 Ah ratio (MODEL).
    mmrtgLaunchW: 110, batteryWh: Math.round((2 * 42 * 2408) / 86), batteryText: '2 lithium-ion batteries, about 42 Ah each (Wh estimated)',
    topSpeedMh: 144, driveW: 190, massKg: 899,
    eyes: 'https://eyes.nasa.gov/apps/curiosity/', home: 'https://science.nasa.gov/mission/msl-curiosity/',
    selfie: picture('curiosity', 'selfie'), selfieFocus: [76.5, 53],
    partsPicture: picture('curiosity', 'parts'), partsCrop: [3, 2, 89, 98],
    anchors: {
      mastHead: [35.3, 13.1], mastCams: [36.5, 20.7], mastBooms: [35.8, 35.5], arm: [66.5, 39.7], turret: [77, 43.1], wheels: [31, 67.6],
      frontHaz: [45.8, 63.9], mmrtg: [30.6, 36.5], hga: [46.5, 36.3], uhf: [24.2, 24.1], deck: [48, 47.3], body: [47, 52.4],
      rearBelly: [25, 54.1], batteries: [54.5, 54.9], frontBelly: [49, 68.4],
    },
    satellite: curiositySat as Satellite,
    area: curiosityArea as Area,
    parts: CURIOSITY_PARTS,
    sources: [
      { label: 'Experience Curiosity: 3D rover in NASA Eyes', url: 'https://eyes.nasa.gov/apps/curiosity/' },
      { label: 'Science instruments (NASA)', url: 'https://science.nasa.gov/mission/msl-curiosity/science-instruments/' },
      { label: 'Launch press kit: power, batteries, speed, instruments (JPL)', url: 'https://mars.nasa.gov/internal_resources/822/' },
      { label: 'MMRTG decay 4.8 %/year (JPL Publication 15-6)', url: 'https://ntrs.nasa.gov/api/citations/20160001769/downloads/20160001769.pdf' },
      { label: 'Live location map (NASA)', url: 'https://science.nasa.gov/mission/msl-curiosity/location-map/' },
    ],
  },
}
