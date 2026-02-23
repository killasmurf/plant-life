// ============================================================
// data.js — Static game data: biomes, seeds, constants
// ============================================================

export const BIOMES = {
  plains: {
    id: 'plains', name: 'Plains', icon: '🌾',
    desc: 'Open grassland. Good sunlight, moderate rainfall, shallow groundwater.',
    sunlight: 0.80,       // fraction of max possible (0-1)
    rainfall: 0.55,
    groundwaterDepth: 2,  // 1=shallow, 5=very deep
    soilNutrients: 0.55,
    npk: { n: 0.55, p: 0.50, k: 0.60 },
    soilType: 'loam',
    tempRange: [5, 30],   // °C seasonal range
    wind: 0.3,            // 0=calm, negative=leftward, positive=rightward (-1 to 1)
    fungalNetwork: 0.45,       // 0=no fungi, 1=rich mycelial network
    seeds: ['grass', 'wildflower', 'shrub', 'oak', 'sunflower'],
  },
  forest: {
    id: 'forest', name: 'Forest', icon: '🌲',
    desc: 'Dense woodland. Filtered sunlight, high rainfall, rich soil.',
    sunlight: 0.50,
    rainfall: 0.80,
    groundwaterDepth: 2,
    soilNutrients: 0.80,
    npk: { n: 0.80, p: 0.70, k: 0.65 },
    soilType: 'clay-loam',
    tempRange: [0, 25],
    wind: 0.0,            // sheltered — calm
    fungalNetwork: 0.85,       // 0=no fungi, 1=rich mycelial network
    seeds: ['oak', 'fern', 'moss', 'pine', 'shrub'],
  },
  desert: {
    id: 'desert', name: 'Desert', icon: '🏜️',
    desc: 'Arid wasteland. Intense sunlight, almost no rain, deep groundwater.',
    sunlight: 0.95,
    rainfall: 0.08,
    groundwaterDepth: 5,
    soilNutrients: 0.20,
    npk: { n: 0.15, p: 0.25, k: 0.20 },
    soilType: 'sand',
    tempRange: [10, 48],
    wind: 0.5,            // hot desert wind from one side
    fungalNetwork: 0.05,       // 0=no fungi, 1=rich mycelial network
    seeds: ['cactus', 'shrub', 'succulent', 'drygrass'],
  },
  wetlands: {
    id: 'wetlands', name: 'Wetlands', icon: '🌿',
    desc: 'Marshy lowlands. Moderate sun, abundant water, waterlogged soil.',
    sunlight: 0.60,
    rainfall: 0.90,
    groundwaterDepth: 1,
    soilNutrients: 0.70,
    npk: { n: 0.70, p: 0.60, k: 0.75 },
    soilType: 'clay',
    tempRange: [8, 28],
    wind: -0.2,           // gentle breeze from right
    fungalNetwork: 0.55,       // 0=no fungi, 1=rich mycelial network
    seeds: ['reed', 'fern', 'moss', 'willow', 'wildflower'],
  },
  mountain: {
    id: 'mountain', name: 'Mountain', icon: '⛰️',
    desc: 'High altitude slopes. Strong wind, cold temps, thin rocky soil.',
    sunlight: 0.70,
    rainfall: 0.60,
    groundwaterDepth: 4,
    soilNutrients: 0.30,
    npk: { n: 0.25, p: 0.35, k: 0.30 },
    soilType: 'rocky',
    tempRange: [-10, 20],
    wind: -0.8,           // strong prevailing wind from the right
    fungalNetwork: 0.35,       // 0=no fungi, 1=rich mycelial network
    seeds: ['pine', 'shrub', 'moss', 'drygrass'],
  },
  tropical: {
    id: 'tropical', name: 'Tropical', icon: '🌴',
    desc: 'Lush rainforest. Bright light, constant rain, incredibly rich soil.',
    sunlight: 0.75,
    rainfall: 0.95,
    groundwaterDepth: 1,
    soilNutrients: 0.90,
    npk: { n: 0.90, p: 0.85, k: 0.80 },
    soilType: 'loam',
    tempRange: [22, 38],
    wind: 0.1,            // very light tropical breeze
    fungalNetwork: 0.9,       // 0=no fungi, 1=rich mycelial network
    seeds: ['palm', 'fern', 'vine', 'oak', 'wildflower'],
  },
};

export const SEEDS = {
  oak: {
    id: 'oak', name: 'Oak Tree', icon: '🌰', rarity: 'uncommon',
    lifespan: 'perennial',
    deciduous: true,
    desc: 'Slow-growing but mighty. Excellent structural roots, dense canopy and long-lived.',
    growthRate: 0.6,
    startEnergy: 60, startWater: 50, startNutrients: 40,
    npkNeed: { n: 0.8, p: 1.0, k: 0.9 },
    trunkStrength: 1.4,
    rootEfficiency: 1.0,
    leafEfficiency: 1.1,
    waterNeed: 1.0,
    energyNeed: 0.9,
    maxHeight: 120,
    maxSpread: 80,
    stomatalType: 'normal',
    tempOptimum: 20,
    cavitationResistance: 0.45,
    floweringSeason: -1,  // day-neutral
    pollinatorAttraction: 0.3,  // wind-pollinated
    cambiumRate: 0.5,  // very slow — dense rings
    mycorrhizalAffinity: 0.9,  // ectomycorrhizal — very strong symbiosis
    herbivorySusceptibility: 0.5,
    defenseStrength: 0.7,  // tannins
  },
  pine: {
    id: 'pine', name: 'Pine Tree', icon: '🌲', rarity: 'common',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'Needle leaves shed less water. Thrives in cold, poor soil. Tap-root focused.',
    growthRate: 0.7,
    startEnergy: 55, startWater: 45, startNutrients: 35,
    npkNeed: { n: 0.7, p: 1.2, k: 0.8 },
    trunkStrength: 1.2,
    rootEfficiency: 1.2,
    leafEfficiency: 0.8,
    waterNeed: 0.7,
    energyNeed: 0.8,
    maxHeight: 100,
    maxSpread: 40,
    stomatalType: 'normal',
    tempOptimum: 15,
    cavitationResistance: 0.50,
    floweringSeason: -1,  // day-neutral
    pollinatorAttraction: 0.2,  // wind-pollinated
    cambiumRate: 0.7,
    mycorrhizalAffinity: 0.85,  // ectomycorrhizal
    herbivorySusceptibility: 0.4,
    defenseStrength: 0.8,  // resin
  },
  cactus: {
    id: 'cactus', name: 'Cactus', icon: '🌵', rarity: 'uncommon',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'Extreme water storage. Survives drought but grows slowly. Spines deter grazers.',
    growthRate: 0.35,
    startEnergy: 40, startWater: 80, startNutrients: 20,
    npkNeed: { n: 0.4, p: 0.9, k: 1.5 },
    trunkStrength: 0.9,
    rootEfficiency: 0.9,
    leafEfficiency: 0.5,
    waterNeed: 0.2,
    energyNeed: 0.7,
    maxHeight: 40,
    maxSpread: 20,
    stomatalType: 'cam',
    tempOptimum: 32,
    cavitationResistance: 0.70,
    floweringSeason: 1,  // Summer, heat trigger
    pollinatorAttraction: 0.0,  // self-pollinating
    cambiumRate: 0.4,  // very slow
    mycorrhizalAffinity: 0.2,  // low affinity — already desert-adapted
    herbivorySusceptibility: 0.2,
    defenseStrength: 0.9,  // spines
  },
  fern: {
    id: 'fern', name: 'Fern', icon: '🌿', rarity: 'common',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'Ancient low-growing plant. Loves shade and moisture. No seeds — spores only.',
    growthRate: 1.1,
    startEnergy: 35, startWater: 65, startNutrients: 50,
    npkNeed: { n: 1.2, p: 0.8, k: 0.9 },
    trunkStrength: 0.4,
    rootEfficiency: 0.9,
    leafEfficiency: 1.4,
    waterNeed: 1.2,
    energyNeed: 0.6,
    maxHeight: 8,
    maxSpread: 15,
    stomatalType: 'normal',
    tempOptimum: 18,
    cavitationResistance: 0.30,
    floweringSeason: 0,  // Spring sporulation
    pollinatorAttraction: 0.0,  // spores, no pollination
    cambiumRate: 0,  // no cambium — ferns are non-woody
    mycorrhizalAffinity: 0.5,
    herbivorySusceptibility: 0.6,
    defenseStrength: 0.3,
  },
  wildflower: {
    id: 'wildflower', name: 'Wildflower', icon: '🌸', rarity: 'common',
    lifespan: 'annual',
    deciduous: false,
    desc: 'Fast-growing annual. Quick to flower and seed. Attracts pollinators.',
    growthRate: 1.5,
    startEnergy: 30, startWater: 35, startNutrients: 30,
    npkNeed: { n: 1.1, p: 0.9, k: 1.0 },
    trunkStrength: 0.3,
    rootEfficiency: 0.7,
    leafEfficiency: 1.2,
    waterNeed: 0.8,
    energyNeed: 1.0,
    maxHeight: 5,
    maxSpread: 5,
    stomatalType: 'normal',
    tempOptimum: 22,
    cavitationResistance: 0.35,
    floweringSeason: 1,  // long-day, Summer
    pollinatorAttraction: 0.9,  // highly attractive
    cambiumRate: 0,  // herbaceous annual — no wood
    mycorrhizalAffinity: 0.7,  // arbuscular mycorrhizal
    herbivorySusceptibility: 0.8,
    defenseStrength: 0.2,
  },
  sunflower: {
    id: 'sunflower', name: 'Sunflower', icon: '🌻', rarity: 'uncommon',
    lifespan: 'annual',
    deciduous: false,
    desc: 'Tracks the sun for maximum energy. Needs good soil and water to grow tall.',
    growthRate: 1.2,
    startEnergy: 50, startWater: 50, startNutrients: 55,
    npkNeed: { n: 1.3, p: 1.0, k: 1.1 },
    trunkStrength: 0.7,
    rootEfficiency: 0.8,
    leafEfficiency: 1.5,
    waterNeed: 1.1,
    energyNeed: 1.3,
    maxHeight: 12,
    maxSpread: 10,
    stomatalType: 'normal',
    tempOptimum: 25,
    cavitationResistance: 0.30,
    floweringSeason: 1,  // long-day, Summer
    pollinatorAttraction: 0.8,  // very attractive
    cambiumRate: 0.2,  // soft wood only
    mycorrhizalAffinity: 0.6,
    herbivorySusceptibility: 0.7,
    defenseStrength: 0.3,
  },
  shrub: {
    id: 'shrub', name: 'Shrub', icon: '🌱', rarity: 'common',
    lifespan: 'perennial',
    deciduous: true,
    desc: 'Resilient multi-stemmed plant. Balanced growth, good in most biomes.',
    growthRate: 0.9,
    startEnergy: 45, startWater: 45, startNutrients: 45,
    npkNeed: { n: 0.9, p: 0.9, k: 1.0 },
    trunkStrength: 0.8,
    rootEfficiency: 1.0,
    leafEfficiency: 1.0,
    waterNeed: 0.9,
    energyNeed: 0.9,
    maxHeight: 20,
    maxSpread: 25,
    stomatalType: 'normal',
    tempOptimum: 20,
    cavitationResistance: 0.40,
    floweringSeason: 0,  // Spring
    pollinatorAttraction: 0.5,  // 
    cambiumRate: 0.8,
    mycorrhizalAffinity: 0.7,
    herbivorySusceptibility: 0.5,
    defenseStrength: 0.5,
  },
  grass: {
    id: 'grass', name: 'Grass', icon: '🌾', rarity: 'common',
    lifespan: 'annual',
    deciduous: false,
    desc: 'Simplest form. Explosive lateral root spread. Very fast early growth.',
    growthRate: 2.0,
    startEnergy: 20, startWater: 30, startNutrients: 25,
    npkNeed: { n: 1.2, p: 0.7, k: 0.8 },
    trunkStrength: 0.1,
    rootEfficiency: 1.3,
    leafEfficiency: 1.0,
    waterNeed: 0.6,
    energyNeed: 0.7,
    maxHeight: 2,
    maxSpread: 30,
    stomatalType: 'normal',
    tempOptimum: 22,
    cavitationResistance: 0.45,
    floweringSeason: 1,  // long-day, Summer
    pollinatorAttraction: 0.1,  // wind-pollinated
    cambiumRate: 0,  // no wood
    mycorrhizalAffinity: 0.65,
    herbivorySusceptibility: 0.9,
    defenseStrength: 0.1,  // regrows fast though
  },
  moss: {
    id: 'moss', name: 'Moss', icon: '🍀', rarity: 'common',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'No roots — absorbs water directly. Thrives in shade and humidity.',
    growthRate: 0.8,
    startEnergy: 25, startWater: 70, startNutrients: 30,
    npkNeed: { n: 0.8, p: 0.5, k: 0.6 },
    trunkStrength: 0.05,
    rootEfficiency: 0.4,
    leafEfficiency: 1.3,
    waterNeed: 1.5,
    energyNeed: 0.4,
    maxHeight: 0.5,
    maxSpread: 20,
    stomatalType: 'normal',
    tempOptimum: 15,
    cavitationResistance: 0.55,
    floweringSeason: 0,  // Spring sporulation
    pollinatorAttraction: 0.0,  // spores
    cambiumRate: 0,  // no wood
    mycorrhizalAffinity: 0.1,  // no roots — minimal
    herbivorySusceptibility: 0.3,
    defenseStrength: 0.2,
  },
  succulent: {
    id: 'succulent', name: 'Succulent', icon: '🪴', rarity: 'uncommon',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'Thick water-storing leaves. Extremely drought-resistant. Slow but steady.',
    growthRate: 0.5,
    startEnergy: 45, startWater: 75, startNutrients: 25,
    npkNeed: { n: 0.5, p: 0.8, k: 1.4 },
    trunkStrength: 0.6,
    rootEfficiency: 0.8,
    leafEfficiency: 0.9,
    waterNeed: 0.25,
    energyNeed: 0.8,
    maxHeight: 6,
    maxSpread: 8,
    stomatalType: 'cam',
    tempOptimum: 28,
    cavitationResistance: 0.65,
    floweringSeason: 1,  // Summer
    pollinatorAttraction: 0.4,  // 
    cambiumRate: 0.3,
    mycorrhizalAffinity: 0.15,
    herbivorySusceptibility: 0.3,
    defenseStrength: 0.7,  // toxic/waxy
  },
  palm: {
    id: 'palm', name: 'Palm Tree', icon: '🌴', rarity: 'rare',
    lifespan: 'perennial',
    deciduous: false,
    desc: 'Tall single-trunk tropical giant. Loves heat and light. Deep tap-root.',
    growthRate: 0.8,
    startEnergy: 65, startWater: 60, startNutrients: 50,
    npkNeed: { n: 1.0, p: 1.1, k: 1.2 },
    trunkStrength: 1.1,
    rootEfficiency: 1.1,
    leafEfficiency: 1.2,
    waterNeed: 1.0,
    energyNeed: 1.1,
    maxHeight: 60,
    maxSpread: 20,
    stomatalType: 'normal',
    tempOptimum: 30,
    cavitationResistance: 0.40,
    floweringSeason: 1,  // Summer
    pollinatorAttraction: 0.3,  // wind
    cambiumRate: 0.6,  // monocot — different but still thickens
    mycorrhizalAffinity: 0.7,
    herbivorySusceptibility: 0.4,
    defenseStrength: 0.5,
  },
  willow: {
    id: 'willow', name: 'Willow', icon: '🎋', rarity: 'rare',
    lifespan: 'perennial',
    deciduous: true,
    desc: 'Weeping tree of waterways. Extraordinary water uptake. Flexible branches.',
    growthRate: 1.0,
    startEnergy: 55, startWater: 70, startNutrients: 60,
    npkNeed: { n: 1.1, p: 1.0, k: 0.9 },
    trunkStrength: 1.0,
    rootEfficiency: 1.5,
    leafEfficiency: 1.1,
    waterNeed: 1.8,
    energyNeed: 0.9,
    maxHeight: 50,
    maxSpread: 60,
    stomatalType: 'normal',
    tempOptimum: 20,
    cavitationResistance: 0.20,
    floweringSeason: 0,  // Spring catkins
    pollinatorAttraction: 0.4,  // early spring insects
    cambiumRate: 1,  // fast growth rings
    mycorrhizalAffinity: 0.75,
    herbivorySusceptibility: 0.6,
    defenseStrength: 0.4,
  },
  drygrass: {
    id: 'drygrass', name: 'Dry Grass', icon: '🌵', rarity: 'common',
    lifespan: 'annual',
    deciduous: false,
    desc: 'Hardy desert grass. Near-zero water use. Dormant in drought.',
    growthRate: 0.9,
    startEnergy: 15, startWater: 20, startNutrients: 15,
    npkNeed: { n: 0.6, p: 0.7, k: 1.1 },
    trunkStrength: 0.1,
    rootEfficiency: 1.1,
    leafEfficiency: 0.7,
    waterNeed: 0.3,
    energyNeed: 0.6,
    maxHeight: 1.5,
    maxSpread: 15,
    stomatalType: 'normal',
    tempOptimum: 30,
    cavitationResistance: 0.60,
    floweringSeason: 2,  // Autumn dry season
    pollinatorAttraction: 0.1,  // wind
    cambiumRate: 0,
    mycorrhizalAffinity: 0.3,
    herbivorySusceptibility: 0.7,
    defenseStrength: 0.2,
  },
  reed: {
    id: 'reed', name: 'Reed', icon: '🌾', rarity: 'common',
    lifespan: 'annual',
    deciduous: false,
    desc: 'Wetland specialist. Thrives in waterlogged soil. Rapid vertical growth.',
    growthRate: 1.3,
    startEnergy: 40, startWater: 80, startNutrients: 45,
    npkNeed: { n: 1.2, p: 0.8, k: 1.0 },
    trunkStrength: 0.5,
    rootEfficiency: 0.9,
    leafEfficiency: 1.1,
    waterNeed: 1.6,
    energyNeed: 0.8,
    maxHeight: 5,
    maxSpread: 12,
    stomatalType: 'normal',
    tempOptimum: 22,
    cavitationResistance: 0.25,
    floweringSeason: 2,  // Autumn
    pollinatorAttraction: 0.1,  // wind
    cambiumRate: 0,
    mycorrhizalAffinity: 0.4,  // waterlogged soil inhibits fungi
    herbivorySusceptibility: 0.5,
    defenseStrength: 0.3,
  },
  vine: {
    id: 'vine', name: 'Vine', icon: '🌿', rarity: 'rare',
    lifespan: 'perennial',
    deciduous: true,
    desc: 'Climbing plant. Needs support to grow tall. Extraordinary leaf coverage.',
    growthRate: 1.4,
    startEnergy: 40, startWater: 55, startNutrients: 55,
    npkNeed: { n: 1.3, p: 0.9, k: 1.0 },
    trunkStrength: 0.3,
    rootEfficiency: 0.9,
    leafEfficiency: 1.8,
    waterNeed: 1.1,
    energyNeed: 1.0,
    maxHeight: 30,
    maxSpread: 25,
    stomatalType: 'normal',
    tempOptimum: 26,
    cavitationResistance: 0.30,
    floweringSeason: 1,  // Summer
    pollinatorAttraction: 0.7,  // insect-pollinated
    cambiumRate: 0.4,
    mycorrhizalAffinity: 0.8,
    herbivorySusceptibility: 0.7,
    defenseStrength: 0.3,
  },
};

// Resource constants
export const RESOURCE_MAX = 100;
export const TICK_MS_BASE = 1000; // 1 real second = 1 game tick at speed ×1

export const ROOT_TYPES = {
  taproot: {
    id: 'taproot', name: 'Tap Root',
    desc: 'Drills deep to reach groundwater. Best for drought resistance.',
    icon: '⬇️',
    waterBonus: 1.8, nutrientBonus: 0.6, structuralBonus: 0.5,
  },
  structural: {
    id: 'structural', name: 'Structural Root',
    desc: 'Anchors the plant. Allows bigger trunk and branches.',
    icon: '↔️',
    waterBonus: 0.5, nutrientBonus: 0.7, structuralBonus: 2.0,
  },
  surface: {
    id: 'surface', name: 'Surface Root',
    desc: 'Spreads wide to catch rainwater and gather nutrients.',
    icon: '🌐',
    waterBonus: 1.2, nutrientBonus: 1.4, structuralBonus: 0.8,
  },
};

// ── Biology simulation feature flags ─────────────────────
export const DEFAULT_SETTINGS = {
  stomatalRegulation: true,   // Phase 1.1: stomata open/close with water stress
  npkNutrients:       true,   // Phase 1.2: N/P/K split instead of single nutrients
  hydraulicFailure:   true,   // Phase 1.3: xylem cavitation under drought
  tempOptima:         true,   // Phase 1.4: bell-curve temperature efficiency
  flowering:          true,   // Phase 2.1: flowering and pollination
  lifeCycles:         true,   // Phase 2.3: annual death / perennial dormancy
  cambiumGrowth:      true,   // Phase 2.4: secondary thickening growth rings
  mycorrhizae:        true,   // Phase 3.1: fungal symbiosis
  herbivory:     true,   // Phase 3.2: insects and grazers damage leaves/trunk
  weatherEvents: true,   // Phase 3.3: drought, flood, and storm events
};

export const SETTINGS_META = [
  { key: 'stomatalRegulation', label: 'Stomatal Regulation',   desc: 'Stomata open/close based on water stress. Affects CO₂ uptake and transpiration.' },
  { key: 'npkNutrients',       label: 'NPK Nutrients',         desc: 'Nitrogen, Phosphorus and Potassium each have distinct effects on growth.' },
  { key: 'hydraulicFailure',   label: 'Hydraulic Failure',     desc: 'Severe drought causes xylem cavitation — permanent transport damage.' },
  { key: 'tempOptima',         label: 'Temperature Optima',    desc: 'Photosynthesis peaks at each plant\'s optimal temperature; extremes cause enzyme failure.' },
  { key: 'flowering',          label: 'Flowering & Pollination', desc: 'Plants flower seasonally and require pollination to produce seeds.' },
  { key: 'lifeCycles',         label: 'Life Cycles',           desc: 'Annuals die after seeding; perennials enter winter dormancy.' },
  { key: 'cambiumGrowth',      label: 'Cambium Growth',        desc: 'Trunk adds growth rings each year; phloem starvation damages roots.' },
  { key: 'mycorrhizae',        label: 'Mycorrhizal Network',   desc: 'Roots can form fungal symbiosis, trading sugar for enhanced nutrient uptake.' },
  { key: 'herbivory',     label: 'Herbivory',        desc: 'Insects eat leaves; grazers damage the trunk. Plants can invest in chemical or physical defenses.' },
  { key: 'weatherEvents', label: 'Weather Events',    desc: 'Random drought, flood and windstorm events challenge the plant beyond normal seasonal cycles.' },
];
