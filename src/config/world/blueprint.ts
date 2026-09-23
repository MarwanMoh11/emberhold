/**
 * Emberhold — World v2 blueprint.
 *
 * The single source of truth for the new frontier's layout: every region,
 * river, cliff, road, crossing, build pad, warcamp, resource field and point
 * of interest, with the reason it sits where it does.
 *
 * This file is deliberately self-contained (no imports) so the render/lint
 * tool in docs/world/tools can load it on its own. It is the only copy.
 * src/config/world/check.ts pins PadKey and the camp spawn keys against the
 * game's BuildingKey / EnemyKey unions at compile time.
 *
 * Units are world pixels, origin top-left, y down — the same space as
 * src/config/map.ts today. The old world was 3400 x 2800; this one is
 * 10240 x 9216, just under ten times the area (9.9x).
 *
 * Coordinates are authoritative but tunable: an implementing session may move
 * anything up to ~120px to satisfy the map lint (docs/world/tools/render.mjs),
 * and should say so in its commit. Moving something further than that is a
 * design change — update docs/world/design/ in the same commit and log it in STATUS.md.
 */

export type Pt = [number, number]
/** A river or lava centreline point with its full width at that point. */
export type WPt = [number, number, number]

export const WORLD2 = {
  width: 10240,
  height: 9216,
  /** terrain / fog / sprite streaming chunk, in world px */
  chunk: 1024,
  /** navigation + region raster cell, in world px */
  navCell: 32,
  /** the old world's size, drawn on the atlas for scale */
  legacy: { width: 3400, height: 2800 },
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export type RegionId =
  | 'hold' | 'downs' | 'whisperwood' | 'hollow'
  | 'greyfall' | 'ferrow'
  | 'frostmere' | 'saltmere' | 'irontooth' | 'barrowmoor' | 'kettle' | 'deepwood'
  | 'deepvein' | 'rim' | 'ashgate'
  | 'crown' | 'cinderfall'

export type Biome =
  | 'rise' | 'meadow' | 'forest' | 'oldgrowth' | 'village' | 'marsh' | 'scarp'
  | 'highland' | 'rust' | 'sulphur' | 'farmland' | 'moor' | 'badlands'
  | 'deeprock' | 'ash' | 'obsidian' | 'slag'

export type Res = 'coins' | 'wood' | 'food' | 'stone' | 'metal' | 'crystal'
export type Bag = Partial<Record<Res, number>>

export interface RegionBP {
  id: RegionId
  name: string
  blurb: string
  /** 0 = start, 5 = endgame. Drives enemy scaling, loot tier and fog sketch. */
  tier: 0 | 1 | 2 | 3 | 4 | 5
  /** Command Hall level before the border stone accepts payment */
  hall: number
  cost: Bag
  biome: Biome
  /** clockwise-ish outline; neighbours share vertices exactly */
  poly: Pt[]
  /**
   * Where the hero plants the banner. Always on the claimed side of the
   * border, at the crossing or road the region is entered by.
   */
  claim: { x: number; y: number; from: RegionId; at: string }
  /** warcamps that must be burned before the border stone accepts payment */
  requiresCamps?: string[]
  /** off the critical path — the campaign never requires it */
  optional?: boolean
  /** one line: what this region is *for* */
  identity: string
}

export const REGIONS: RegionBP[] = [
  {
    id: 'hold', name: 'Emberhold', tier: 0, hall: 1, cost: {}, biome: 'rise',
    blurb: 'What is left of your outpost, on the rise above the Old King\'s Bridge.',
    identity: 'Home. Hall, depot, the muster buildings and the first line: the bridge.',
    poly: [[4200, 2300], [6000, 2300], [6450, 2950], [6250, 3720], [5700, 4040], [5120, 4230], [4520, 4300], [4100, 3750], [4050, 2950]],
    claim: { x: 5120, y: 3150, from: 'hold', at: 'the hall' },
  },

  // ---- tier 1: the near country, claimable from the first hall ----------------
  {
    id: 'downs', name: 'The Barrow Downs', tier: 1, hall: 1, cost: { coins: 120 }, biome: 'meadow',
    blurb: 'Deep loam over the old kings. Something is digging them up.',
    identity: 'Food. The best open farmland north of the river, and barrows to break open.',
    poly: [[3700, 0], [6100, 0], [6100, 1480], [6000, 2300], [4200, 2300], [3800, 1900]],
    claim: { x: 5120, y: 2440, from: 'hold', at: 'the north road, outside the North Gate' },
  },
  {
    id: 'whisperwood', name: 'Whisperwood', tier: 1, hall: 1, cost: { coins: 200, wood: 60 }, biome: 'forest',
    blurb: 'Deep timber. Something moves in it.',
    identity: 'Wood. Two lumber clearings and the first warcamp worth burning.',
    poly: [[2300, 0], [3700, 0], [3800, 1900], [4200, 2300], [4050, 2950], [3300, 2900], [2700, 3050], [2200, 2600], [2100, 1300]],
    claim: { x: 4260, y: 2650, from: 'hold', at: 'the wood road, north-west of the palisade' },
  },
  {
    id: 'hollow', name: 'Hollow Village', tier: 1, hall: 1, cost: { coins: 300, wood: 150 }, biome: 'village',
    blurb: 'Survivors hiding in the ruins of a river village.',
    identity: 'People. Rebuilt houses, a river fishery, and the Millford crossing to hold.',
    poly: [[3300, 2900], [4050, 2950], [4100, 3750], [4520, 4300], [3850, 4420], [3150, 4640], [2600, 4880], [2500, 3800], [2700, 3050]],
    claim: { x: 4220, y: 3450, from: 'hold', at: 'the west road, outside the West Gate' },
  },

  // ---- tier 2 --------------------------------------------------------------------
  {
    id: 'greyfall', name: 'Greyfall Scarp', tier: 2, hall: 2, cost: { coins: 450, wood: 250 }, biome: 'scarp',
    blurb: 'Good stone, bad neighbours, and the only bridge over the gorge.',
    identity: 'Stone. Quarries at the cliff foot; the Gorge Bridge is the east approach.',
    poly: [[6000, 2300], [6100, 1480], [6700, 1330], [7200, 1480], [7600, 1820], [7880, 2100], [7560, 2420], [7330, 2700], [7080, 3000], [6720, 3350], [6250, 3720], [6450, 2950]],
    claim: { x: 6300, y: 3050, from: 'hold', at: 'the east road, beyond the East Gate' },
  },
  {
    id: 'ferrow', name: 'The Ferrow Fields', tier: 2, hall: 2, cost: { coins: 600, wood: 300, food: 100 }, biome: 'farmland',
    blurb: 'The best soil on the frontier. That is why they burned it.',
    identity: 'The bridgehead. Big farms on the floodplain and the first muster to break.',
    poly: [[6250, 3720], [6300, 4400], [6400, 5700], [3850, 5950], [3850, 4420], [4520, 4300], [5120, 4230], [5700, 4040]],
    claim: { x: 5120, y: 4000, from: 'hold', at: 'the north landing of the Old King\'s Bridge' },
  },

  // ---- tier 3: the wide frontier. Six claims; the campaign asks for four ----------
  {
    id: 'frostmere', name: 'Frostmere', tier: 3, hall: 3, cost: { coins: 900, wood: 400, stone: 200 }, biome: 'highland',
    blurb: 'A cold lake under the peaks, and an island shrine older than the hold.',
    identity: 'Pine and fish, and the Shrine of the First Flame on Frostmere Isle.',
    poly: [[6100, 0], [10240, 0], [10240, 2100], [9400, 2150], [8700, 1850], [8260, 1560], [7880, 2100], [7600, 1820], [7200, 1480], [6700, 1330], [6100, 1480]],
    claim: { x: 5970, y: 850, from: 'downs', at: 'the Highroad, where it leaves the Downs' },
  },
  {
    id: 'saltmere', name: 'Saltmere', tier: 3, hall: 3, cost: { coins: 900, wood: 500, stone: 150 }, biome: 'marsh',
    blurb: 'The harbour still smells of salt and smoke.',
    identity: 'Coin. The old quay takes a trading post — the only building that earns coins.',
    poly: [[420, 3050], [1500, 3100], [2200, 2600], [2700, 3050], [2500, 3800], [2600, 4880], [2100, 5100], [1650, 5320], [1100, 5480], [380, 5570], [420, 5000], [560, 4300], [460, 3600]],
    claim: { x: 2660, y: 4000, from: 'hollow', at: 'the salt road, west of the village' },
  },
  {
    id: 'irontooth', name: 'Irontooth Foothills', tier: 3, hall: 3, cost: { coins: 1000, stone: 350 }, biome: 'rust',
    blurb: 'The hills here are made of rust.',
    identity: 'Metal. Open-cast iron on the east bank, across the Gorge Bridge.',
    poly: [[8260, 1560], [8700, 1850], [9400, 2150], [10240, 2100], [10240, 4500], [9600, 4560], [9000, 4620], [8400, 4640], [7700, 4700], [7400, 3900], [7080, 3000], [7330, 2700], [7560, 2420], [7880, 2100]],
    claim: { x: 7200, y: 2620, from: 'greyfall', at: 'the west end of the Gorge Bridge' },
  },
  {
    id: 'barrowmoor', name: 'Barrowmoor', tier: 3, hall: 3, cost: { coins: 1100, stone: 300, food: 200 }, biome: 'moor',
    blurb: 'An old battlefield that never finished.',
    identity: 'Relics. Barrows and battlefield caches, and the Gallows Knight\'s stronghold.',
    poly: [[380, 5570], [1100, 5480], [1650, 5320], [2100, 5100], [2600, 4880], [3150, 4640], [3850, 4420], [3850, 5950], [3700, 6760], [3000, 6720], [2300, 6880], [1600, 7000], [800, 7170], [560, 6400]],
    claim: { x: 3120, y: 4420, from: 'hollow', at: 'the north bank of Millford' },
  },
  {
    id: 'kettle', name: 'The Kettle', tier: 3, hall: 3, cost: { coins: 1200, stone: 400 }, biome: 'sulphur',
    blurb: 'Hot springs, yellow stone, and powder enough to level a wall.',
    identity: 'The south-east muster. Sulphur stone and healing springs.',
    poly: [[7080, 3000], [7400, 3900], [7700, 4700], [7760, 5200], [7700, 5600], [7740, 6100], [7760, 6720], [6600, 6100], [6400, 5700], [6300, 4400], [6250, 3720], [6720, 3350]],
    claim: { x: 6180, y: 4800, from: 'ferrow', at: 'the east road out of the Ferrow Fields' },
  },
  {
    id: 'deepwood', name: 'The Deepwood', tier: 3, hall: 3, cost: { coins: 1300, wood: 800 }, biome: 'oldgrowth',
    optional: true,
    blurb: 'The oldest trees in the world, and the oldest hunger.',
    identity: 'Optional. Giant timber, the Heart Oak, and the Thornmother\'s den.',
    poly: [[600, 0], [2300, 0], [2100, 1300], [2200, 2600], [1500, 3100], [420, 3050], [520, 2700], [640, 1800], [560, 900]],
    claim: { x: 2270, y: 1600, from: 'whisperwood', at: 'the old track at Whisperwood\'s western edge' },
  },

  // ---- tier 4 ----------------------------------------------------------------------
  {
    id: 'deepvein', name: 'Deepvein', tier: 4, hall: 4, cost: { coins: 1800, stone: 600, metal: 120 }, biome: 'deeprock',
    blurb: 'Iron enough to armour an army, and a violet seam under it.',
    identity: 'Deep metal and the first crystal delve, behind three walls of cliff.',
    poly: [[7700, 4700], [8400, 4640], [9000, 4620], [9600, 4560], [10240, 4500], [10240, 7120], [9500, 7080], [8700, 6980], [7760, 6720], [7740, 6100], [7700, 5600], [7760, 5200]],
    claim: { x: 9000, y: 4450, from: 'irontooth', at: 'the north mouth of the Seamgate' },
  },
  {
    id: 'rim', name: 'The Blackened Rim', tier: 4, hall: 4, cost: { coins: 2000, stone: 700, metal: 150 }, biome: 'badlands',
    blurb: 'The last ground before the Scar. The horde\'s forward camp.',
    identity: 'The Cinder Stair: fortify its top and the south approach is yours.',
    requiresCamps: ['campFerrow'],
    poly: [[3850, 5950], [6400, 5700], [6600, 6100], [7760, 6720], [6900, 6760], [6200, 6790], [5300, 6800], [4400, 6800], [3700, 6760]],
    claim: { x: 5150, y: 5680, from: 'ferrow', at: 'the south road, past the burned muster' },
  },
  {
    id: 'ashgate', name: 'Ashgate', tier: 4, hall: 4, cost: { coins: 2400, stone: 800, metal: 250 }, biome: 'ash',
    blurb: 'Where the horde is coming from.',
    identity: 'The fortress. Burning it unseals the Crown.',
    poly: [[800, 7170], [1600, 7000], [2300, 6880], [3000, 6720], [3700, 6760], [4400, 6800], [4550, 7200], [4750, 7700], [5200, 8050], [5740, 8250], [5700, 9216], [1420, 9216], [1280, 8700], [1040, 8000]],
    claim: { x: 3000, y: 6540, from: 'barrowmoor', at: 'the north mouth of the Bonepass' },
  },

  // ---- tier 5 ------------------------------------------------------------------------
  {
    id: 'crown', name: 'The Cinder Crown', tier: 5, hall: 5, cost: { coins: 4000, stone: 1200, metal: 600, crystal: 40 }, biome: 'obsidian',
    blurb: 'The Regent\'s caldera. Everything burns toward it.',
    identity: 'The finale. The causeway to the throne is sealed until Ashgate falls.',
    requiresCamps: ['campStairwarden'],
    poly: [[4400, 6800], [5300, 6800], [6200, 6790], [6900, 6760], [7760, 6720], [8700, 6980], [8800, 9216], [5700, 9216], [5740, 8250], [5200, 8050], [4750, 7700], [4550, 7200]],
    claim: { x: 5300, y: 6600, from: 'rim', at: 'the top of the Cinder Stair' },
  },
  {
    id: 'cinderfall', name: 'Cinderfall', tier: 5, hall: 5, cost: { coins: 3500, metal: 500, crystal: 30 }, biome: 'slag',
    optional: true,
    blurb: 'Slag, smoke, and the brightest crystal in the world.',
    identity: 'Optional. The richest crystal and the Slag Forges that arm the south-east.',
    poly: [[8700, 6980], [9500, 7080], [10240, 7120], [10240, 9216], [8800, 9216]],
    claim: { x: 8800, y: 6790, from: 'deepvein', at: 'the head of Smelter\'s Ramp' },
  },
]

// ---------------------------------------------------------------------------
// Terrain features. Everything here is either impassable or a crossing of
// something impassable. Features are what make the approaches — the horde
// cannot swim, climb or wade lava, so it comes over the bridges and passes.
// ---------------------------------------------------------------------------

export interface RiverBP { id: string; name: string; pts: WPt[] }
export interface CliffBP { id: string; name: string; pts: Pt[]; thickness: number }
export interface LakeBP { id: string; name: string; cx: number; cy: number; rx: number; ry: number; isle?: { cx: number; cy: number; r: number } }
export interface PoolBP { id: string; cx: number; cy: number; rx: number; ry: number }
export type CrossingKind = 'bridge' | 'ford' | 'pass' | 'stair' | 'causeway'
export interface CrossingBP {
  id: string
  name: string
  kind: CrossingKind
  /** the passable strip, centreline from one bank to the other */
  a: Pt
  b: Pt
  width: number
  /** ford: movement multiplier while in the water */
  slow?: number
  /** closed until this camp is destroyed (drawn as a wall of fire) */
  sealedUntil?: string
  why: string
}

export const FEATURES = {
  /** the western sea — impassable, and the coast the harbour is built on */
  sea: [[0, 0], [600, 0], [560, 900], [640, 1800], [520, 2700], [460, 3600], [560, 4300], [420, 5000], [380, 5570], [560, 6400], [800, 7170], [1040, 8000], [1280, 8700], [1420, 9216], [0, 9216]] as Pt[],

  rivers: [
    {
      id: 'emberflow', name: 'the Emberflow',
      // Out of Frostmere, down the Irontooth gorge, past the hold's feet and
      // west through Millford to the Saltmere delta. It splits the map into a
      // settled north bank and a contested south bank.
      pts: [
        [8260, 1560, 150], [7900, 2080, 140], [7560, 2420, 120], [7330, 2700, 110],
        [7080, 3000, 150], [6720, 3350, 180], [6250, 3720, 210], [5700, 4040, 220],
        [5120, 4230, 220], [4520, 4300, 230], [3850, 4420, 240], [3150, 4640, 250],
        [2600, 4880, 260], [2100, 5100, 280], [1650, 5320, 300], [1100, 5480, 360], [380, 5570, 440],
      ],
    },
  ] as RiverBP[],

  lakes: [
    { id: 'frostmere', name: 'Frostmere', cx: 8750, cy: 1150, rx: 880, ry: 500, isle: { cx: 8750, cy: 1120, r: 170 } },
  ] as LakeBP[],

  cliffs: [
    {
      id: 'escarpment', name: 'the Greyfall Escarpment', thickness: 110,
      // Frostmere's high country ends here in a stone wall. The quarries work its foot.
      pts: [[6100, 1480], [6700, 1330], [7200, 1480], [7600, 1820], [7880, 2100]],
    },
    {
      id: 'ironwall', name: 'the Ironwall', thickness: 120,
      // Seals Deepvein off from the foothills; the Seamgate is the only way through.
      pts: [[7700, 4700], [8400, 4640], [9000, 4620], [9600, 4560], [10240, 4500]],
    },
    {
      id: 'slagwall', name: 'the Slagwall', thickness: 120,
      // Deepvein's west face. The Kettle Pass cuts it halfway down.
      pts: [[7700, 4700], [7760, 5200], [7700, 5600], [7740, 6100], [7760, 6720]],
    },
    {
      id: 'scar', name: 'the Scar', thickness: 160,
      // A chasm coast to edge. Everything south of it is the Ashlands.
      pts: [[800, 7170], [1600, 7000], [2300, 6880], [3000, 6720], [3700, 6760], [4400, 6800], [5300, 6800], [6200, 6790], [6900, 6760], [7760, 6720], [8700, 6980], [9500, 7080], [10240, 7120]],
    },
  ] as CliffBP[],

  lava: {
    rivers: [
      {
        id: 'cinderrun', name: 'the Cinderrun',
        // Pours out of the caldera and up to the Scar, walling Ashgate off
        // from the Crown except at the Obsidian Bridge.
        pts: [[5740, 8250, 140], [5200, 8050, 150], [4750, 7700, 150], [4550, 7200, 140], [4400, 6800, 120]],
      },
      {
        id: 'cinderrunLower', name: 'the Lower Cinderrun',
        // The caldera spills south too, so the Obsidian Bridge really is the only
        // way from Ashgate into the Crown.
        pts: [[5790, 8450, 140], [5740, 8850, 150], [5700, 9216, 160]],
      },
    ] as RiverBP[],
    /** the Regent's caldera: a ring of lava around an island throne */
    caldera: { cx: 6500, cy: 8250, outer: 760, inner: 430 },
    pools: [
      { id: 'ashpoolW', cx: 1900, cy: 8650, rx: 300, ry: 160 },
      { id: 'ashpoolE', cx: 3500, cy: 8750, rx: 220, ry: 130 },
      { id: 'slagpoolN', cx: 8600, cy: 8150, rx: 220, ry: 120 },
      { id: 'slagpoolE', cx: 10000, cy: 7800, rx: 160, ry: 110 },
    ] as PoolBP[],
  },

  crossings: [
    { id: 'oldBridge', name: 'the Old King\'s Bridge', kind: 'bridge', a: [5120, 4090], b: [5120, 4370], width: 120,
      why: 'The south approach. A stone bridge a thousand paces below the hall: the first night comes over it.' },
    { id: 'millford', name: 'Millford', kind: 'ford', a: [3150, 4500], b: [3150, 4780], width: 220, slow: 0.6,
      why: 'The west approach. Shallow enough to wade, slow enough to shoot at.' },
    { id: 'gorgeBridge', name: 'the Gorge Bridge', kind: 'bridge', a: [7250, 2630], b: [7420, 2780], width: 90,
      why: 'The east approach. A narrow span over the gorge — a gate here holds a whole flank.' },
    { id: 'reedwater', name: 'Reedwater Ford', kind: 'ford', a: [1650, 5150], b: [1650, 5490], width: 240, slow: 0.55,
      why: 'Saltmere\'s back door across the delta, and the coast road to Barrowmoor.' },
    { id: 'isleCauseway', name: 'the Isle Causeway', kind: 'causeway', a: [8750, 590], b: [8750, 990], width: 70,
      why: 'A drowned stone path out to the shrine on Frostmere Isle.' },
    { id: 'scarpStair', name: 'the Scarp Stair', kind: 'stair', a: [6700, 1440], b: [6700, 1220], width: 150,
      why: 'Switchbacks up the escarpment: Greyfall\'s back way into Frostmere.' },
    { id: 'seamgate', name: 'the Seamgate', kind: 'pass', a: [9000, 4540], b: [9000, 4700], width: 170,
      why: 'Irontooth\'s way down into Deepvein through the Ironwall.' },
    { id: 'kettlePass', name: 'the Kettle Pass', kind: 'pass', a: [7620, 5600], b: [7780, 5600], width: 170,
      why: 'The Kettle\'s way into Deepvein through the Slagwall — and the horde\'s way out.' },
    { id: 'bonepass', name: 'the Bonepass', kind: 'pass', a: [3000, 6620], b: [3000, 6820], width: 180,
      why: 'The west approach\'s root: Ashgate\'s road north into Barrowmoor.' },
    { id: 'cinderStair', name: 'the Cinder Stair', kind: 'stair', a: [5300, 6700], b: [5300, 6900], width: 200,
      why: 'The south approach\'s root, cut into the Scar. Whoever holds the top holds the south.' },
    { id: 'smeltersRamp', name: 'Smelter\'s Ramp', kind: 'pass', a: [8800, 6850], b: [8800, 7130], width: 180,
      why: 'Deepvein\'s haul road down into the slag fields.' },
    { id: 'obsidianBridge', name: 'the Obsidian Bridge', kind: 'bridge', a: [4670, 7760], b: [4830, 7640], width: 110,
      why: 'The only way over the Cinderrun between Ashgate and the Crown.' },
    { id: 'calderaCauseway', name: 'the Regent\'s Causeway', kind: 'causeway', a: [6500, 7470], b: [6500, 7840], width: 150,
      sealedUntil: 'campAshgate',
      why: 'A wall of fire closes it until Ashgate burns. The finale starts when it opens.' },
  ] as CrossingBP[],
}

// ---------------------------------------------------------------------------
// Roads. Trodden earth painted on the ground, +20% move speed for the hero,
// soldiers and workers (never the horde). They connect every outpost, and
// every crossing has one: a road is how the map says "this way".
// ---------------------------------------------------------------------------

export interface RoadBP { id: string; name: string; width: number; pts: Pt[] }

export const ROADS: RoadBP[] = [
  { id: 'kingsRoad', name: 'the King\'s Road', width: 62,
    pts: [[5000, 250], [5000, 1500], [5120, 2590], [5120, 3150], [5120, 3710], [5120, 4230], [5150, 4950], [5250, 5700], [5300, 6100], [5300, 6800], [5400, 7350], [6000, 7350], [6500, 7470]] },
  { id: 'eastRoad', name: 'the East Road', width: 50,
    pts: [[5760, 3150], [6300, 3050], [6800, 2650], [7250, 2630], [7420, 2780], [8250, 3150], [8800, 3700], [9000, 4540], [9000, 5250]] },
  { id: 'highroad', name: 'the Highroad', width: 44,
    pts: [[5000, 1500], [5600, 1000], [6100, 850], [6800, 900], [7500, 900], [8000, 640], [8750, 580]] },
  { id: 'scarpStairRoad', name: 'the Scarp Stair', width: 36,
    pts: [[6800, 2650], [6700, 2000], [6700, 1440], [6700, 1220], [7100, 1000], [7500, 900]] },
  { id: 'westRoad', name: 'the West Road', width: 50,
    pts: [[4480, 3150], [4100, 3400], [3350, 3800], [2650, 4000], [1900, 4200], [1250, 4300]] },
  { id: 'woodRoad', name: 'the Wood Road', width: 40,
    pts: [[4480, 3150], [4300, 2700], [3700, 2350], [3300, 2150], [2700, 1800], [2270, 1600], [1500, 2050]] },
  { id: 'millRoad', name: 'the Mill Road', width: 44,
    pts: [[3350, 3800], [3150, 4500], [3150, 4780], [2700, 5400], [2900, 6000], [3000, 6620], [3000, 6820], [3500, 7300], [2800, 7900]] },
  { id: 'ferrowWest', name: 'the Ferrow Lane', width: 40,
    pts: [[5150, 4950], [4300, 5150], [3500, 5250], [2700, 5400]] },
  { id: 'ferrowEast', name: 'the Kettle Road', width: 40,
    pts: [[5150, 4950], [6180, 4800], [6950, 4600], [7300, 5100], [7620, 5600], [7780, 5600], [8400, 5500], [9000, 5250]] },
  { id: 'coastRoad', name: 'the Coast Road', width: 36,
    pts: [[1250, 4300], [1500, 4800], [1650, 5150], [1650, 5490], [2100, 5500], [2700, 5400]] },
  { id: 'rampRoad', name: 'the Haul Road', width: 40,
    pts: [[9000, 5250], [9000, 6000], [8800, 6850], [8800, 7130], [9300, 7950]] },
  { id: 'ashRoad', name: 'the Ash Road', width: 40,
    pts: [[5400, 7350], [4830, 7640], [4670, 7760], [4100, 7500], [3500, 7300]] },
  { id: 'isleRoad', name: 'the Isle Path', width: 28,
    pts: [[8750, 580], [8750, 990], [8750, 1060]] },
]

// ---------------------------------------------------------------------------
// Fortification lines. Each becomes a row of wall pads with gates, generated
// the way the rampart ring is today. The palisade is built from the start as
// empty pads; the rest are gated by hall level and sit at crossings.
// ---------------------------------------------------------------------------

export interface WallLineBP {
  id: string
  name: string
  region: RegionId
  hall: number
  /** polyline the wall pads are stepped along; closed when `ring` */
  pts: Pt[]
  ring?: boolean
  step: number
  gates: { id: string; x: number; y: number }[]
  why: string
}

export const WALLS: WallLineBP[] = [
  { id: 'palisade', name: 'the Palisade', region: 'hold', hall: 1, ring: true, step: 62,
    pts: [[4480, 2590], [5760, 2590], [5760, 3710], [4480, 3710]],
    gates: [
      { id: 'gateN', x: 5120, y: 2590 }, { id: 'gateS', x: 5120, y: 3710 },
      { id: 'gateE', x: 5760, y: 3150 }, { id: 'gateW', x: 4480, y: 3150 },
    ],
    why: 'Today\'s rampart ring, unchanged in shape: the hold\'s last line.' },
  { id: 'bridgehead', name: 'the Bridgehead', region: 'hold', hall: 2, step: 62,
    pts: [[4870, 4140], [4900, 3990], [5000, 3890], [5120, 3860], [5240, 3890], [5340, 3960], [5370, 4020]],
    gates: [{ id: 'gateBridge', x: 5120, y: 3860 }],
    why: 'A horseshoe round the bridge\'s north landing, both ends on the bank. Holding the bridge means the horde never reaches the palisade.' },
  { id: 'millfordLine', name: 'the Millford Barricade', region: 'hollow', hall: 3, step: 62,
    pts: [[2900, 4590], [2960, 4440], [3150, 4350], [3320, 4370], [3440, 4415]],
    gates: [{ id: 'gateMillford', x: 3150, y: 4350 }],
    why: 'Closes the ford\'s north bank. The west approach wades into arrow fire and then a wall.' },
  { id: 'gorgeLine', name: 'the Gorge Gate', region: 'greyfall', hall: 3, step: 62,
    pts: [[7390, 2510], [7250, 2450], [7120, 2530], [7080, 2660], [7150, 2800]],
    gates: [{ id: 'gateGorge', x: 7086, y: 2640 }],
    why: 'A short horseshoe round the bridge\'s west landing, both ends on the gorge bank. Cheap, and it holds the whole east approach.' },
  { id: 'stairLine', name: 'the Stair Wall', region: 'rim', hall: 4, step: 62,
    pts: [[5000, 6690], [5080, 6580], [5300, 6540], [5520, 6580], [5600, 6690]],
    gates: [{ id: 'gateStair', x: 5300, y: 6540 }],
    why: 'Caps the Cinder Stair. With it standing, the south approach breaks on the Rim instead of the Ferrow farms.' },
  { id: 'passLine', name: 'the Pass Wall', region: 'kettle', hall: 4, step: 62,
    pts: [[7640, 5480], [7540, 5500], [7500, 5600], [7540, 5700], [7640, 5720]],
    gates: [{ id: 'gatePass', x: 7500, y: 5600 }],
    why: 'Caps the Kettle Pass\'s west mouth, both ends on the Slagwall. Once the Kettle camp burns, the south-east horde comes out of Deepvein through here or not at all.' },
]

// ---------------------------------------------------------------------------
// Build pads. `key` is a BuildingKey, plus the three new types this world
// adds: outpost, fishery, tradingPost. `hall` is the Command Hall level the
// pad waits on (in addition to the building's own requirement).
// ---------------------------------------------------------------------------

export type PadKey =
  | 'townHall' | 'depot' | 'lumberCamp' | 'farm' | 'quarry' | 'mine' | 'crystalDelve'
  | 'barracks' | 'archeryRange' | 'stable' | 'house' | 'warehouse'
  | 'blacksmith' | 'workshop' | 'healingTent'
  | 'watchtower' | 'cannonTower'
  | 'outpost' | 'fishery' | 'tradingPost'

export interface PadBP {
  id: string
  key: PadKey
  x: number
  y: number
  region: RegionId
  hall?: number
  startLevel?: number
  why?: string
}

const P = (id: string, key: PadKey, x: number, y: number, region: RegionId, hall?: number, why?: string): PadBP =>
  ({ id, key, x, y, region, hall, why })

export const PADS: PadBP[] = [
  // ---- Emberhold: the hall on its rise, the muster yards facing the bridge -------
  { ...P('hall', 'townHall', 5120, 3150, 'hold'), startLevel: 1, why: 'Crown of the Ember Rise, a thousand paces above the bridge.' },
  { ...P('depot', 'depot', 5120, 3330, 'hold'), startLevel: 1, why: 'On the south road just below the hall, where every haul comes in.' },
  P('lumber1', 'lumberCamp', 4870, 2910, 'hold', 1, 'Against the Rise copse inside the palisade: the first minute has no walk.'),
  P('farm1', 'farm', 4700, 3450, 'hold', 1, 'The palisade\'s south-west corner runs down onto the river flats.'),
  P('house1', 'house', 4950, 3410, 'hold', 1),
  P('warehouse1', 'warehouse', 5340, 3320, 'hold', 1, 'Beside the depot, on the same road.'),
  P('barracks1', 'barracks', 5420, 3550, 'hold', 1, 'Musters beside the South Gate, facing the bridge the first night comes over.'),
  P('infirm1', 'healingTent', 5140, 2900, 'hold', 1, 'Behind the hall — the safest ground in the hold.'),
  P('archery1', 'archeryRange', 4830, 3640, 'hold', 2, 'The shooting line on the south wall, looking down the bridge road.'),
  P('forge1', 'blacksmith', 5560, 3130, 'hold', 2, 'By the East Gate, where Greyfall\'s stone comes in.'),
  P('workshop1', 'workshop', 5620, 2910, 'hold', 2, 'Next to the smiths.'),
  P('house2', 'house', 4640, 3190, 'hold', 2),
  P('stable1', 'stable', 5420, 2710, 'hold', 3, 'The north-east yard, by the King\'s Road north where there is room to ride.'),
  P('house3', 'house', 4960, 2680, 'hold', 3),
  P('towerSW', 'watchtower', 4990, 3660, 'hold', 1, 'Flanks the South Gate.'),
  P('towerSE', 'watchtower', 5250, 3660, 'hold', 1, 'Flanks the South Gate.'),
  P('towerW', 'watchtower', 4560, 3030, 'hold', 1),
  P('towerE', 'watchtower', 5700, 3270, 'hold', 1),
  P('towerN', 'watchtower', 5260, 2650, 'hold', 2),
  P('bombardE', 'cannonTower', 5610, 3470, 'hold', 2),
  P('bridgeTowerW', 'watchtower', 4930, 3830, 'hold', 2, 'Behind the bridgehead wall, crossing fire over the landing.'),
  P('bridgeTowerE', 'watchtower', 5310, 3830, 'hold', 2, 'Behind the bridgehead wall, crossing fire over the landing.'),

  // ---- the Barrow Downs ---------------------------------------------------------------
  P('outDowns', 'outpost', 5000, 1500, 'downs', 1, 'Kingsbarrow Cross, where the King\'s Road meets the Highroad.'),
  P('farm2', 'farm', 4550, 1780, 'downs', 1, 'Deep loam west of the King\'s Road.'),
  P('farm3', 'farm', 5500, 1780, 'downs', 1, 'Deep loam east of the King\'s Road.'),
  P('lumber2', 'lumberCamp', 4180, 1180, 'downs', 1, 'On the Barrow Copse, facing the open downs.'),
  P('towerDowns', 'watchtower', 5250, 1300, 'downs', 2, 'Watches the Highroad junction for the north-east raids.'),

  // ---- Whisperwood ------------------------------------------------------------------------
  P('outWood', 'outpost', 3300, 2150, 'whisperwood', 1, 'Woodcutters\' Rest, a clearing on the Wood Road.'),
  P('lumber3', 'lumberCamp', 3660, 2510, 'whisperwood', 1, 'The forest edge nearest the hold: open ground to stack on, trees at its back.'),
  P('lumber4', 'lumberCamp', 2790, 1770, 'whisperwood', 2, 'A deep clearing — the heaviest timber in the near country.'),

  // ---- Hollow Village -------------------------------------------------------------------
  P('outHollow', 'outpost', 3350, 3800, 'hollow', 1, 'The old village green.'),
  P('houseH1', 'house', 3560, 3620, 'hollow', 1, 'Rebuilt village houses: the survivors move back in.'),
  P('houseH2', 'house', 3160, 3600, 'hollow', 1),
  P('houseH3', 'house', 3620, 3980, 'hollow', 2),
  P('farm4', 'farm', 2950, 4150, 'hollow', 1, 'The river meadow the village lived on.'),
  P('fishery1', 'fishery', 3700, 4270, 'hollow', 2, 'On the Emberflow\'s bank below the village.'),
  P('towerMillW', 'watchtower', 2960, 4300, 'hollow', 2, 'Over Millford: the west approach wades into it.'),
  P('towerMillE', 'watchtower', 3340, 4280, 'hollow', 2, 'Over Millford.'),

  // ---- Greyfall Scarp -----------------------------------------------------------------------
  P('outGreyfall', 'outpost', 6800, 2650, 'greyfall', 2, 'Scarpfoot, where the East Road turns for the gorge.'),
  P('quarry1', 'quarry', 6350, 1870, 'greyfall', 2, 'At the foot of the escarpment, under the loose face.'),
  P('quarry2', 'quarry', 6880, 1880, 'greyfall', 3, 'Further along the same face.'),
  P('towerGorge', 'watchtower', 6980, 2560, 'greyfall', 2, 'Behind the Gorge Gate, looking straight down the bridge.'),

  // ---- the Ferrow Fields ------------------------------------------------------------------
  P('outFerrow', 'outpost', 5150, 4950, 'ferrow', 2, 'Ferrow Cross: the south road, the lane west and the road east all meet here.'),
  P('farm5', 'farm', 4650, 4650, 'ferrow', 2, 'Floodplain west of the south road.'),
  P('farm6', 'farm', 5650, 4650, 'ferrow', 2, 'Floodplain east of the south road.'),
  P('farm7', 'farm', 4350, 5100, 'ferrow', 3),
  P('towerF1', 'watchtower', 4950, 5300, 'ferrow', 2, 'Covers the south road where the muster\'s horde comes up.'),
  P('towerF2', 'watchtower', 5350, 5300, 'ferrow', 2),
  P('bombardF', 'cannonTower', 5150, 5450, 'ferrow', 3),

  // ---- Frostmere -----------------------------------------------------------------------------
  P('outFrost', 'outpost', 7500, 900, 'frostmere', 3, 'Rimewatch, on the Highroad above the west shore.'),
  P('fishery2', 'fishery', 7800, 1250, 'frostmere', 3, 'The lake\'s west shore, below Rimewatch.'),
  P('fishery3', 'fishery', 9700, 1150, 'frostmere', 4, 'The far shore.'),
  P('lumber5', 'lumberCamp', 6950, 700, 'frostmere', 3, 'The high pinewood.'),
  P('lumber6', 'lumberCamp', 9650, 1820, 'frostmere', 4),
  P('towerStair', 'watchtower', 6800, 1130, 'frostmere', 3, 'Holds the top of the Scarp Stair.'),

  // ---- Saltmere -------------------------------------------------------------------------------
  P('outSalt', 'outpost', 1250, 4300, 'saltmere', 3, 'Saltmere Harbour, at the end of the West Road.'),
  P('trade1', 'tradingPost', 780, 4150, 'saltmere', 3, 'On the old quay: ships still come if someone keeps the lamp lit.'),
  P('fishery4', 'fishery', 640, 4620, 'saltmere', 3, 'The harbour strand.'),
  P('houseS1', 'house', 1500, 4050, 'saltmere', 3),
  P('houseS2', 'house', 1300, 3850, 'saltmere', 3),
  P('towerReed', 'watchtower', 1740, 5030, 'saltmere', 3, 'On Reedwater Ford\'s north bank.'),

  // ---- Irontooth Foothills ----------------------------------------------------------------------
  P('outIron', 'outpost', 8250, 3150, 'irontooth', 3, 'Rustgate, the first dry ground over the Gorge Bridge.'),
  P('mine1', 'mine', 8780, 2780, 'irontooth', 3, 'Open-cast iron below the Irontooth itself.'),
  P('mine2', 'mine', 9550, 3750, 'irontooth', 4),
  P('quarry3', 'quarry', 7980, 3750, 'irontooth', 3),
  P('towerGorgeE', 'watchtower', 7520, 2820, 'irontooth', 3, 'The gorge bridge\'s east landing.'),

  // ---- Barrowmoor ---------------------------------------------------------------------------------
  P('outMoor', 'outpost', 2700, 5400, 'barrowmoor', 3, 'Gallowgate, where the Mill Road, the Ferrow Lane and the Coast Road meet.'),
  P('lumber7', 'lumberCamp', 2050, 5800, 'barrowmoor', 3, 'The dead wood: grey timber, but timber.'),
  P('quarry5', 'quarry', 3240, 6060, 'barrowmoor', 3),
  P('towerBone', 'watchtower', 3100, 6380, 'barrowmoor', 4, 'Over the Bonepass mouth.'),

  // ---- the Kettle -----------------------------------------------------------------------------------
  P('outKettle', 'outpost', 6950, 4600, 'kettle', 3, 'Kettlewatch, above the springs.'),
  P('quarry4', 'quarry', 7200, 5560, 'kettle', 3, 'Yellow sulphur stone.'),
  P('towerK1', 'watchtower', 6850, 5200, 'kettle', 3),
  P('towerPass', 'watchtower', 7420, 5450, 'kettle', 4, 'Behind the Pass Wall, over the Kettle Pass mouth.'),

  // ---- the Deepwood -------------------------------------------------------------------------------
  P('outDeep', 'outpost', 1500, 2050, 'deepwood', 3, 'Heartwood Lodge, at the Wood Road\'s end.'),
  P('lumber8', 'lumberCamp', 1360, 2760, 'deepwood', 3, 'Giant timber.'),
  P('lumber9', 'lumberCamp', 1850, 1150, 'deepwood', 4),

  // ---- Deepvein ---------------------------------------------------------------------------------------
  P('outVein', 'outpost', 9000, 5250, 'deepvein', 4, 'Seamhold, below the Seamgate.'),
  P('mine4', 'mine', 8500, 5550, 'deepvein', 4, 'The western seam, off the Kettle Pass.'),
  P('mine5', 'mine', 9680, 5340, 'deepvein', 4, 'The eastern seam.'),
  P('delve1', 'crystalDelve', 9450, 6400, 'deepvein', 4, 'The violet pocket, 900 paces from the Overseers — never inside their siege radius.'),
  P('towerSeam', 'watchtower', 9000, 4900, 'deepvein', 4, 'Watches the Seamgate: Deepvein\'s only door north.'),

  // ---- the Blackened Rim ----------------------------------------------------------------------------
  P('outRim', 'outpost', 5300, 6100, 'rim', 4, 'Cinderwatch, on the south road above the Stair.'),
  P('towerR1', 'watchtower', 5050, 6350, 'rim', 4, 'Over the Cinder Stair.'),
  P('towerR2', 'watchtower', 5550, 6350, 'rim', 4, 'Over the Cinder Stair.'),
  P('bombardR', 'cannonTower', 5300, 6420, 'rim', 4, 'Shells down the Stair itself.'),

  // ---- Ashgate -----------------------------------------------------------------------------------------
  P('outAsh', 'outpost', 3500, 7300, 'ashgate', 4, 'Ashfall, at the foot of the Bonepass.'),
  P('delve2', 'crystalDelve', 3850, 8150, 'ashgate', 5, 'The ash crystal fields.'),
  P('mine6', 'mine', 1930, 7620, 'ashgate', 5, 'Obsidian and black iron.'),

  // ---- the Cinder Crown --------------------------------------------------------------------------------
  P('outCrown', 'outpost', 5400, 7350, 'crown', 5, 'Emberfall, at the foot of the Cinder Stair.'),
  P('towerC1', 'watchtower', 5800, 7200, 'crown', 5),

  // ---- Cinderfall -------------------------------------------------------------------------------------------
  P('outSlag', 'outpost', 9300, 7950, 'cinderfall', 5, 'Slagwatch, at the Haul Road\'s end.'),
  P('delve3', 'crystalDelve', 9670, 8400, 'cinderfall', 5, 'The brightest crystal on the frontier.'),
  P('mine7', 'mine', 8950, 8500, 'cinderfall', 5),
]

// ---------------------------------------------------------------------------
// Warcamps. Every one sits on a road the horde uses, on the far side of its
// region from the border stone, and at least 600px from any production pad
// (400px from a defence pad): anything closer is besieged forever.
// ---------------------------------------------------------------------------

export type CampTier = 'warcamp' | 'stronghold' | 'fortress'

export interface CampBP {
  id: string
  name: string
  region: RegionId
  x: number
  y: number
  tier: CampTier
  hp: number
  /** EnemyKey. `name[fallback]` marks a new walker (docs/world/design/05-content.md) until S16 adds it */
  spawns: { key: string; every: number; count: number }
  /** stronghold boss (new EnemyKey), fought at the camp */
  boss?: string
  reward: Bag
  why: string
}

export const CAMPS: CampBP[] = [
  { id: 'campDiggers', name: 'the Barrow Diggers', region: 'downs', x: 4600, y: 450, tier: 'warcamp', hp: 1200,
    spawns: { key: 'grunt', every: 9, count: 2 }, reward: { coins: 220, wood: 120 },
    why: 'Husks tearing open the Barrow King\'s mound. The nearest camp to the hold: the first one most players burn.' },
  { id: 'campThornstake', name: 'Thornstake Camp', region: 'whisperwood', x: 2650, y: 800, tier: 'warcamp', hp: 1400,
    spawns: { key: 'grunt', every: 9, count: 2 }, reward: { coins: 260, wood: 180 },
    why: 'Deep in the wood on the old track west. Feeds the north-west raids until it burns.' },
  { id: 'campRotwood', name: 'Rotwood Camp', region: 'hollow', x: 2720, y: 3120, tier: 'warcamp', hp: 1800,
    spawns: { key: 'runner', every: 8, count: 3 }, reward: { coins: 380, wood: 200, stone: 80 },
    why: 'In the rotten wood above the village — why the survivors are still hiding.' },
  { id: 'campScarp', name: 'Scarp Warcamp', region: 'greyfall', x: 7450, y: 2150, tier: 'warcamp', hp: 3000,
    spawns: { key: 'archer', every: 10, count: 2 }, reward: { coins: 650, stone: 300, metal: 60 },
    why: 'Slingers on the ledge over the gorge road: it taxes anything crossing.' },
  { id: 'campFerrow', name: 'the Ferrow Muster', region: 'ferrow', x: 4750, y: 5700, tier: 'warcamp', hp: 3200,
    spawns: { key: 'grunt', every: 8, count: 3 }, reward: { coins: 700, food: 300, wood: 200 },
    why: 'Where the south approach gathers. Burning it pushes the south night back to the Rim.' },
  { id: 'campHollowpeak', name: 'Hollowpeak Den', region: 'frostmere', x: 9700, y: 500, tier: 'warcamp', hp: 4200,
    spawns: { key: 'brute', every: 12, count: 1 }, reward: { coins: 900, wood: 400, stone: 200 },
    why: 'Brutes denned under the peaks. The north-east raids come down the Highroad from here.' },
  { id: 'campDrowned', name: 'the Drowned Bell', region: 'saltmere', x: 1800, y: 3450, tier: 'warcamp', hp: 4000,
    spawns: { key: 'bogWretch[shield]', every: 10, count: 2 }, reward: { coins: 900, wood: 300, metal: 100 },
    why: 'Around the sunken bell tower in the marsh. Raids the harbour and the salt road.' },
  { id: 'campIrontooth', name: 'Irontooth Warcamp', region: 'irontooth', x: 9450, y: 2550, tier: 'warcamp', hp: 4800,
    spawns: { key: 'archer', every: 10, count: 3 }, reward: { coins: 1100, stone: 400, metal: 180 },
    why: 'Holds the ore. The east approach musters here and marches on the Gorge Bridge.' },
  { id: 'campGallows', name: 'Gallows Hill', region: 'barrowmoor', x: 1400, y: 6450, tier: 'stronghold', hp: 6000,
    spawns: { key: 'shield', every: 11, count: 2 }, boss: 'gallowsKnight', reward: { coins: 1400, metal: 200, crystal: 20 },
    why: 'The old battlefield\'s high ground. The west approach musters under the gallows.' },
  { id: 'campKettle', name: 'Kettle Warcamp', region: 'kettle', x: 7200, y: 6250, tier: 'warcamp', hp: 4600,
    spawns: { key: 'bomber', every: 10, count: 2 }, reward: { coins: 1200, stone: 500, metal: 150 },
    why: 'Powderkegs brewed from the Kettle\'s sulphur. The south-east approach.' },
  { id: 'campThornmother', name: 'the Thornmother\'s Den', region: 'deepwood', x: 900, y: 500, tier: 'stronghold', hp: 5500,
    spawns: { key: 'thornling[swarm]', every: 8, count: 5 }, boss: 'thornmother', reward: { coins: 1200, wood: 900, crystal: 15 },
    why: 'The Deepwood\'s heart-rot. Optional, and the richest timber relic on the frontier.' },
  { id: 'campOverseers', name: 'the Seam Overseers', region: 'deepvein', x: 8550, y: 6550, tier: 'stronghold', hp: 7000,
    spawns: { key: 'shield', every: 11, count: 2 }, boss: 'seamOverseer', reward: { coins: 1600, metal: 400, crystal: 30 },
    why: 'Slave-drivers of the deep seams. Sits on the Haul Road between the mines and the Ramp.' },
  { id: 'campStairwarden', name: 'the Stairwarden\'s Bastion', region: 'rim', x: 6000, y: 6450, tier: 'stronghold', hp: 7500,
    spawns: { key: 'ashPriest[commander]', every: 12, count: 1 }, boss: 'stairwarden', reward: { coins: 1800, metal: 450, crystal: 30 },
    why: 'Guards the top of the Cinder Stair. Its fall opens the road to the Crown.' },
  { id: 'campAshgate', name: 'Ashgate Fortress', region: 'ashgate', x: 2500, y: 8150, tier: 'fortress', hp: 12000,
    spawns: { key: 'brute', every: 12, count: 2 }, reward: { coins: 3000, metal: 500, crystal: 40 },
    why: 'The horde\'s great fortress. Burning it drops the fire on the Regent\'s Causeway.' },
  { id: 'campForges', name: 'the Slag Forges', region: 'cinderfall', x: 9650, y: 7450, tier: 'stronghold', hp: 9000,
    spawns: { key: 'cinderHound[runner]', every: 9, count: 3 }, reward: { coins: 2500, metal: 600, crystal: 60 },
    why: 'Where the south-east horde is armed. Optional — the road to the Crown does not pass it.' },
]

/**
 * The Regent is not a camp. She waits on the caldera island and rises when
 * the hero crosses the opened causeway; her health persists like today.
 */
export const THRONE = { x: 6500, y: 8250, boss: 'cinderRegent' }

// ---------------------------------------------------------------------------
// Night approaches. A wave names approaches instead of gates. Each resolves to
// the first *standing* camp in its chain; when the chain is spent it falls back
// to a permanent maw beyond the Scar (closed only by the Regent's death), or —
// for raid approaches with no maw — closes for good. Enemies spawn at that
// muster, clamped to 2400px of path from claimed ground, and force-march
// (2.4x speed) until they set foot on claimed ground.
// ---------------------------------------------------------------------------

export interface MawBP { id: string; name: string; x: number; y: number; region: RegionId }

export const MAWS: MawBP[] = [
  { id: 'mawStair', name: 'the Ashen Maw', x: 6150, y: 7450, region: 'crown' },
  { id: 'mawBone', name: 'the Bone Maw', x: 2900, y: 7150, region: 'ashgate' },
  { id: 'mawRamp', name: 'the Slag Maw', x: 8900, y: 7450, region: 'cinderfall' },
]

export interface ApproachBP {
  id: string
  name: string
  /** camp ids, then optionally a maw id — nearest to the hold first */
  chain: string[]
  /**
   * crossings the horde routes through, in order, before heading for the hall.
   * This is what keeps an approach an approach: without it every late-game
   * night converges on the shortest path, which is always the Old Bridge.
   */
  via?: string[]
  raid?: boolean
  why: string
}

export const APPROACHES: ApproachBP[] = [
  { id: 'south', name: 'the south road', chain: ['campFerrow', 'campStairwarden', 'mawStair'], via: ['oldBridge'],
    why: 'Over the Old King\'s Bridge. The first night and most nights after.' },
  { id: 'west', name: 'the west ford', chain: ['campGallows', 'mawBone'], via: ['millford'],
    why: 'Across Millford into Hollow, then the West Gate.' },
  { id: 'east', name: 'the gorge', chain: ['campIrontooth'], via: ['gorgeBridge'],
    why: 'Over the Gorge Bridge through Greyfall. Closes for good when Irontooth burns.' },
  { id: 'southeast', name: 'the Kettle', chain: ['campKettle', 'campOverseers', 'mawRamp'], via: ['oldBridge'],
    why: 'Up through the Kettle to Ferrow Cross and the bridge — hits Ferrow\'s east flank.' },
  { id: 'north', name: 'the barrows', chain: ['campDiggers'], raid: true,
    why: 'Down the King\'s Road from the Downs, to the North Gate.' },
  { id: 'northwest', name: 'the deep wood', chain: ['campThornstake', 'campThornmother'], raid: true,
    why: 'Out of Whisperwood onto the Wood Road.' },
  { id: 'northeast', name: 'the high country', chain: ['campHollowpeak'], raid: true,
    why: 'Down the Highroad from Frostmere.' },
  { id: 'farwest', name: 'the marsh', chain: ['campDrowned'], raid: true,
    why: 'Along the salt road from Saltmere.' },
]

// ---------------------------------------------------------------------------
// Resource fields. Every production pad has its field inside the worker
// search radius (760px); every field belongs to a region.
// ---------------------------------------------------------------------------

export type NodeType = 'tree' | 'rock' | 'ore' | 'crystal' | 'fish'

export interface NodeFieldBP { type: NodeType; x: number; y: number; r: number; n: number; region: RegionId; name?: string }

const N = (type: NodeType, x: number, y: number, r: number, n: number, region: RegionId, name?: string): NodeFieldBP =>
  ({ type, x, y, r, n, region, name })

export const NODES: NodeFieldBP[] = [
  // hold
  N('tree', 4640, 2740, 150, 13, 'hold', 'the Rise copse'),
  N('tree', 5720, 2470, 130, 8, 'hold'),
  N('rock', 5900, 2950, 110, 5, 'hold'),
  N('tree', 4350, 3800, 150, 10, 'hold', 'the river willows'),
  N('rock', 4450, 2450, 100, 4, 'hold'),
  // downs
  N('tree', 4000, 950, 220, 18, 'downs', 'the Barrow Copse'),
  N('tree', 5800, 2050, 150, 9, 'downs'),
  N('rock', 5650, 700, 120, 6, 'downs', 'the standing stones'),
  // whisperwood
  N('tree', 3350, 2450, 240, 22, 'whisperwood'),
  N('tree', 2700, 1400, 300, 28, 'whisperwood'),
  N('tree', 3200, 1050, 240, 18, 'whisperwood'),
  N('tree', 2500, 2550, 200, 14, 'whisperwood'),
  N('tree', 3650, 1500, 180, 12, 'whisperwood'),
  // hollow
  N('tree', 2850, 3400, 170, 10, 'hollow', 'the rotwood'),
  N('tree', 3950, 4000, 150, 9, 'hollow'),
  N('rock', 2750, 3900, 140, 7, 'hollow', 'fallen houses'),
  N('fish', 3700, 4400, 120, 7, 'hollow'),
  // greyfall
  N('rock', 6350, 1620, 170, 14, 'greyfall'),
  N('rock', 7000, 1680, 150, 12, 'greyfall'),
  N('rock', 6550, 3000, 120, 6, 'greyfall'),
  N('tree', 6250, 2250, 140, 8, 'greyfall'),
  // ferrow
  N('tree', 4200, 4600, 160, 9, 'ferrow', 'the hedgerows'),
  N('tree', 6000, 5200, 170, 9, 'ferrow'),
  N('rock', 4200, 5700, 130, 6, 'ferrow'),
  // frostmere
  N('tree', 6700, 500, 260, 22, 'frostmere', 'the high pinewood'),
  N('tree', 7400, 1500, 170, 10, 'frostmere'),
  N('tree', 9900, 1650, 220, 14, 'frostmere'),
  N('rock', 9300, 250, 160, 8, 'frostmere'),
  N('rock', 7900, 300, 130, 6, 'frostmere'),
  N('fish', 7960, 1250, 110, 6, 'frostmere'),
  N('fish', 9560, 1150, 110, 7, 'frostmere'),
  // saltmere
  N('tree', 2000, 4300, 200, 12, 'saltmere', 'the alder carr'),
  N('tree', 1900, 2950, 160, 9, 'saltmere'),
  N('rock', 800, 3550, 130, 7, 'saltmere'),
  N('fish', 470, 4450, 110, 6, 'saltmere'),
  // irontooth
  N('ore', 8950, 2550, 200, 16, 'irontooth'),
  N('ore', 9750, 3550, 200, 14, 'irontooth'),
  N('rock', 7850, 3950, 160, 10, 'irontooth'),
  N('tree', 8100, 2500, 150, 8, 'irontooth'),
  N('rock', 10000, 2800, 150, 8, 'irontooth'),
  N('rock', 8700, 4200, 140, 7, 'irontooth'),
  // barrowmoor
  N('tree', 1800, 5950, 220, 14, 'barrowmoor', 'the dead wood'),
  N('rock', 3450, 6200, 170, 10, 'barrowmoor'),
  N('rock', 900, 6100, 150, 8, 'barrowmoor'),
  N('tree', 3250, 5150, 150, 8, 'barrowmoor'),
  // kettle
  N('rock', 7300, 5800, 150, 12, 'kettle', 'sulphur stone'),
  N('tree', 6700, 4100, 160, 9, 'kettle'),
  N('rock', 6700, 5900, 140, 7, 'kettle'),
  N('tree', 7300, 4300, 140, 8, 'kettle'),
  // deepwood
  N('tree', 1100, 2500, 280, 26, 'deepwood'),
  N('tree', 1550, 850, 240, 22, 'deepwood'),
  N('tree', 900, 1800, 220, 18, 'deepwood'),
  N('tree', 1850, 1750, 200, 14, 'deepwood'),
  // deepvein
  N('ore', 8300, 5750, 200, 16, 'deepvein'),
  N('ore', 9900, 5200, 180, 12, 'deepvein'),
  N('crystal', 9600, 6550, 140, 6, 'deepvein', 'the violet pocket'),
  N('rock', 9350, 4900, 140, 8, 'deepvein'),
  // rim
  N('rock', 4300, 6350, 180, 10, 'rim'),
  N('rock', 6750, 6450, 160, 8, 'rim'),
  N('crystal', 4800, 6600, 90, 3, 'rim', 'the first glint at the Scar\'s lip'),
  // ashgate
  N('crystal', 4050, 8350, 200, 10, 'ashgate', 'the ash crystal fields'),
  N('ore', 1750, 7800, 180, 12, 'ashgate'),
  N('rock', 3100, 7800, 160, 8, 'ashgate'),
  N('crystal', 1500, 8400, 120, 5, 'ashgate'),
  // crown
  N('crystal', 7400, 7800, 160, 8, 'crown'),
  N('rock', 7600, 7300, 150, 8, 'crown'),
  // cinderfall
  N('crystal', 9900, 8550, 200, 10, 'cinderfall'),
  N('ore', 9050, 8800, 180, 10, 'cinderfall'),
]

// ---------------------------------------------------------------------------
// Points of interest. The reasons to leave the road.
// ---------------------------------------------------------------------------

export type PoiKind = 'waystone' | 'shrine' | 'cache' | 'lore' | 'barrow' | 'survivors' | 'landmark' | 'relic'

export interface PoiBP {
  id: string
  kind: PoiKind
  name: string
  region: RegionId
  x: number
  y: number
  /** shrine: the permanent bonus; relic: the passive; survivors: pop/workers */
  effect?: string
  /** shrine: the one-off restoration cost */
  cost?: Bag
  text?: string
}

export const POIS: PoiBP[] = [
  // waystones outside outposts (every outpost also carries one)
  { id: 'wsHall', kind: 'waystone', name: 'the Hall Stone', region: 'hold', x: 5000, y: 3000 },
  { id: 'wsIsle', kind: 'waystone', name: 'the Isle Stone', region: 'frostmere', x: 8680, y: 1210 },

  // shrines: restore once, keep the bonus forever
  { id: 'shrineHarvest', kind: 'shrine', name: 'Shrine of the Harvest', region: 'ferrow', x: 5850, y: 5450,
    effect: '+15% food from every farm and fishery', cost: { coins: 600, food: 300 } },
  { id: 'shrineMason', kind: 'shrine', name: 'Shrine of the Mason', region: 'greyfall', x: 6550, y: 2250,
    effect: '+20% wall and gate health', cost: { coins: 700, stone: 400 } },
  { id: 'shrineFlame', kind: 'shrine', name: 'Shrine of the First Flame', region: 'frostmere', x: 8820, y: 1080,
    effect: '+10% hero XP and +2 hp/s regeneration', cost: { coins: 1200, crystal: 10 } },
  { id: 'shrineFallen', kind: 'shrine', name: 'Shrine of the Fallen', region: 'barrowmoor', x: 2350, y: 6050,
    effect: '+10% soldier health', cost: { coins: 900, metal: 120 } },
  { id: 'shrineSpring', kind: 'shrine', name: 'the Kettle Springs', region: 'kettle', x: 6700, y: 5350,
    effect: 'Every infirmary heals 25% more, and outposts heal like a Lv.1 infirmary', cost: { coins: 900, stone: 300 } },
  { id: 'shrineTide', kind: 'shrine', name: 'the Saltmere Light', region: 'saltmere', x: 620, y: 3450,
    effect: '+20% trading post income; the coast is revealed on the atlas', cost: { coins: 800, wood: 400 } },

  // survivors: clear the nearby camp, walk in, they join
  { id: 'survHollow', kind: 'survivors', name: 'the cellar under the green', region: 'hollow', x: 3450, y: 3900,
    effect: '+6 population and two free villagers', text: 'Burn Rotwood Camp and they will come up.' },
  { id: 'survFerrow', kind: 'survivors', name: 'the mill families', region: 'ferrow', x: 5850, y: 4950,
    effect: '+6 population and two free farmers', text: 'They will not move while the Muster stands.' },
  { id: 'survSalt', kind: 'survivors', name: 'the lamp-keepers', region: 'saltmere', x: 760, y: 3600,
    effect: '+4 population and a free trader', text: 'They kept the Light burning for no one.' },

  // barrows: break open (a slow node), wake a guardian elite, take the grave goods
  { id: 'barrowKing', kind: 'barrow', name: 'the Barrow King', region: 'downs', x: 4950, y: 650,
    effect: 'Relic: the Barrow Crown (+15% pack size)' },
  { id: 'barrowDowns2', kind: 'barrow', name: 'a green barrow', region: 'downs', x: 5750, y: 1150 },
  { id: 'barrowDowns3', kind: 'barrow', name: 'a green barrow', region: 'downs', x: 4250, y: 2050 },
  { id: 'barrowMoor1', kind: 'barrow', name: 'a sunken barrow', region: 'barrowmoor', x: 1100, y: 5900 },
  { id: 'barrowMoor2', kind: 'barrow', name: 'a sunken barrow', region: 'barrowmoor', x: 2350, y: 6500 },
  { id: 'barrowMoor3', kind: 'barrow', name: 'the Captain\'s barrow', region: 'barrowmoor', x: 3400, y: 5500,
    effect: 'Relic: the Captain\'s Horn (+10% soldier damage)' },

  // landmarks: seen from a distance, painted big, named on the atlas
  { id: 'lmHeartOak', kind: 'landmark', name: 'the Heart Oak', region: 'deepwood', x: 1100, y: 1350,
    effect: 'Relic when the Thornmother dies: the Heart-Oak Seed (+25% wood)' },
  { id: 'lmIrontooth', kind: 'landmark', name: 'the Irontooth', region: 'irontooth', x: 8550, y: 2350 },
  { id: 'lmBell', kind: 'landmark', name: 'the Drowned Bell', region: 'saltmere', x: 2050, y: 3700 },
  { id: 'lmVents', kind: 'landmark', name: 'the Smoking Vents', region: 'kettle', x: 7150, y: 5000 },
  { id: 'lmGallows', kind: 'landmark', name: 'the Gallows', region: 'barrowmoor', x: 1250, y: 6300 },
  { id: 'lmThrone', kind: 'landmark', name: 'the Ember Throne', region: 'crown', x: 6500, y: 8250 },

  // relics dropped by stronghold bosses (see docs/world/design/05-content.md §Relics)
  { id: 'relicGallows', kind: 'relic', name: 'the Gallows Bell', region: 'barrowmoor', x: 1400, y: 6450, effect: 'Army follows 15% faster; rally cooldown -20%' },
  { id: 'relicLash', kind: 'relic', name: 'the Overseer\'s Lash', region: 'deepvein', x: 8550, y: 6550, effect: 'Workers move and gather 15% faster' },
  { id: 'relicAegis', kind: 'relic', name: 'the Warden\'s Aegis', region: 'rim', x: 6000, y: 6450, effect: 'Towers +10% range' },
  { id: 'relicThorn', kind: 'relic', name: 'the Thorn Crown', region: 'deepwood', x: 900, y: 500, effect: 'Hero shots pierce one more enemy' },

  // supply caches: the existing chest, placed off-road so the road is not the only thing worth walking
  { id: 'cache1', kind: 'cache', name: 'the tithe barn', region: 'downs', x: 4300, y: 400 },
  { id: 'cache2', kind: 'cache', name: 'a hunter\'s lodge', region: 'whisperwood', x: 2950, y: 2300 },
  { id: 'cache3', kind: 'cache', name: 'a woodsman\'s cache', region: 'whisperwood', x: 3500, y: 700 },
  { id: 'cache4', kind: 'cache', name: 'the old mill', region: 'hollow', x: 2800, y: 4450 },
  { id: 'cache5', kind: 'cache', name: 'the fallen watch', region: 'greyfall', x: 6700, y: 3100 },
  { id: 'cache6', kind: 'cache', name: 'the burned granary', region: 'ferrow', x: 4400, y: 4850 },
  { id: 'cache7', kind: 'cache', name: 'a ditch cache', region: 'ferrow', x: 6050, y: 5650 },
  { id: 'cache8', kind: 'cache', name: 'the Rime ruins', region: 'frostmere', x: 10000, y: 900 },
  { id: 'cache9', kind: 'cache', name: 'a shepherd\'s hut', region: 'frostmere', x: 8200, y: 400 },
  { id: 'cache10', kind: 'cache', name: 'the customs house', region: 'saltmere', x: 1000, y: 4750 },
  { id: 'cache11', kind: 'cache', name: 'a wreck', region: 'saltmere', x: 720, y: 3200 },
  { id: 'cache12', kind: 'cache', name: 'an assay office', region: 'irontooth', x: 9900, y: 3100 },
  { id: 'cache13', kind: 'cache', name: 'a collapsed adit', region: 'irontooth', x: 8350, y: 4300 },
  { id: 'cache14', kind: 'cache', name: 'the battlefield', region: 'barrowmoor', x: 2300, y: 5700 },
  { id: 'cache15', kind: 'cache', name: 'a camp follower\'s wagon', region: 'barrowmoor', x: 1350, y: 5750 },
  { id: 'cache16', kind: 'cache', name: 'a bathhouse', region: 'kettle', x: 6600, y: 4750 },
  { id: 'cache17', kind: 'cache', name: 'the charcoal burner\'s', region: 'deepwood', x: 800, y: 2900 },
  { id: 'cache18', kind: 'cache', name: 'a strongroom', region: 'deepvein', x: 10000, y: 6200 },
  { id: 'cache19', kind: 'cache', name: 'a lamp store', region: 'deepvein', x: 8200, y: 5000 },
  { id: 'cache20', kind: 'cache', name: 'a tithe of ash', region: 'rim', x: 4200, y: 6100 },
  { id: 'cache21', kind: 'cache', name: 'the quartermaster\'s', region: 'ashgate', x: 3300, y: 8500 },
  { id: 'cache22', kind: 'cache', name: 'a shrine to nothing', region: 'ashgate', x: 1300, y: 7500 },
  { id: 'cache23', kind: 'cache', name: 'a slag cart', region: 'cinderfall', x: 10000, y: 8900 },
  { id: 'cache24', kind: 'cache', name: 'the herald\'s tent', region: 'crown', x: 7900, y: 8500 },

  // lore stones: one line of history each, read by standing on them
  { id: 'lore1', kind: 'lore', name: 'the founding stone', region: 'hold', x: 5280, y: 3000,
    text: 'Emberhold was a waystation. Then it was a wall. Then it was ash.' },
  { id: 'lore2', kind: 'lore', name: 'the bridge plaque', region: 'ferrow', x: 5000, y: 4420,
    text: 'The Old King built one bridge and said a kingdom was a thing you could walk across.' },
  { id: 'lore3', kind: 'lore', name: 'a waymark', region: 'whisperwood', x: 2450, y: 2150,
    text: 'The trees here were planted in rows once. Nobody remembers by whom.' },
  { id: 'lore4', kind: 'lore', name: 'the well-head', region: 'hollow', x: 3250, y: 3950,
    text: 'Hollow drew water from the Emberflow for four hundred years. It still does, if you ask.' },
  { id: 'lore5', kind: 'lore', name: 'a mason\'s mark', region: 'greyfall', x: 6620, y: 1650,
    text: 'Every stone in the Old King\'s Bridge came off this face.' },
  { id: 'lore6', kind: 'lore', name: 'the isle steps', region: 'frostmere', x: 8640, y: 560,
    text: 'The first flame was carried out of the lake, not into it.' },
  { id: 'lore7', kind: 'lore', name: 'a harbour post', region: 'saltmere', x: 1100, y: 4100,
    text: 'Salt, iron and grain left from here. Soldiers came back.' },
  { id: 'lore8', kind: 'lore', name: 'a claim post', region: 'irontooth', x: 8000, y: 3200,
    text: 'The seam belongs to whoever is still standing on it.' },
  { id: 'lore9', kind: 'lore', name: 'a grave marker', region: 'barrowmoor', x: 2900, y: 5950,
    text: 'Both armies are buried here. Only one of them stayed down.' },
  { id: 'lore10', kind: 'lore', name: 'the spring stone', region: 'kettle', x: 7050, y: 4800,
    text: 'The water is warm because something below it is burning.' },
  { id: 'lore11', kind: 'lore', name: 'a scorched signpost', region: 'rim', x: 5500, y: 5950,
    text: 'The top of the stair is the last place the sky is blue.' },
  { id: 'lore12', kind: 'lore', name: 'the Crown\'s herald', region: 'crown', x: 5700, y: 7650,
    text: 'She was a queen once. The fire only kept the crown.' },
]
