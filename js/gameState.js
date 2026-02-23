// ============================================================
// gameState.js — Core game state and resource simulation
// ============================================================

import { RESOURCE_MAX, ROOT_TYPES, DEFAULT_SETTINGS } from './data.js';

export function createGameState(biome, seed, settings = DEFAULT_SETTINGS) {
  // Apply biome variance (random offset ±15%)
  const vary = (base, delta = 0.15) => Math.max(0, Math.min(1, base + (Math.random() - 0.5) * delta * 2));

  return {
    // Meta
    biome,
    seed,
    day: 1,
    season: 0,   // 0=Spring 1=Summer 2=Autumn 3=Winter
    tick: 0,
    paused: true,
    dormant:       false,         // currently in winter dormancy
    dormancyDepth: 0.0,           // 0=active, 1=fully dormant
    lifeComplete:  false,         // annual has completed its life cycle
    settings,   // biology feature flags
    speed: 0,

    // Resources (0–100)
    energy:    seed.startEnergy,
    water:     seed.startWater,
    o2:        50,
    co2:       50,
    nitrogen:   Math.round(seed.startNutrients * 0.9),
    phosphorus: Math.round(seed.startNutrients * 0.8),
    potassium:  Math.round(seed.startNutrients * 1.0),
    health:    80,

    // Environment (derived from biome with variance)
    env: {
      sunlight:        vary(biome.sunlight),
      rainfall:        vary(biome.rainfall),
      groundwaterDepth: biome.groundwaterDepth,
      soilNutrients:   vary(biome.soilNutrients),
      temperature:     lerp(biome.tempRange[0], biome.tempRange[1], 0.3), // spring
    },

    // Active player action
    activeAction: null,   // 'roots'|'trunk'|'branches'|'leaves'
    rootType: 'surface',  // default root type

    // Plant structure (each value 0–100 represents growth progress)
    plant: {
      rootDepth:      0,    // tap root depth progress
      rootSpread:     0,    // surface/lateral spread
      rootStructural: 0,    // structural root mass
      trunkHeight:    0,    // trunk height progress
      trunkGirth:     0,    // trunk thickness
      branchCount:    0,    // number of branches (integer in render)
      branchLength:   0,    // average branch reach
      leafMass:       0,    // total leaf area
      flowerProgress: 0,    // % toward flowering
      seedsProduced:  0,    // total seeds produced (endgame score)
      pollinated:     false,
      ageInDays:      0,
      growthRings:    0,    // number of annual growth rings (cosmetic + cambium tracking)
      damagedLeaves:  0,    // cumulative leaf damage from herbivory
      scarredTrunk:   false, // permanent trunk scar from severe grazing
      // Spatial graph — nodes are coords relative to (cx, groundY)
      nodes:      [],       // trunk + leaf node objects
      nextNodeId: 0,
      // Persistent root fractal graph — generated once, thickened over time
      rootGraph: {
        surface:    [],     // array of root segment objects
        taproot:    [],
        structural: [],
        // Track how many arms/milestone segments have been generated
        surfaceArms:    0,
        taprootDepth:   0,  // generation depth currently grown to
        structuralArms: 0,
      },
    },

    // Capability flags (unlock as plant grows)
    unlocked: {
      trunk:    false,
      branches: false,
      leaves:   false,
      flower:   false,
    },

    // Interactive placement state
    placement: {
      mode:       null,   // null | 'trunk' | 'leaf'
      candidates: [],
      hoveredId:  null,
    },

    flowering: false,    // currently in flowering state
    log: [],
    stomata: 1.0,   // 0=fully closed, 1=fully open (computed each tick)
    xylemIntegrity: 1.0,   // 0=fully embolized, 1=fully functional
    cavitationEvents: 0,   // total cavitation events (for display)
    mycorrhizalColonisation: 0.0,  // 0-1: how established the fungal network is
    mycorrhizalBonus: 0.0,         // current bonus to P and water uptake
    // Herbivory state
    herbivorePressure: 0.0,    // current grazing pressure (0-1)
    herbivoreEvent:    false,  // currently under attack
    // Weather event state
    activeWeatherEvent: null,  // null | 'drought' | 'flood' | 'storm'
    weatherEventTimer:  0,     // ticks remaining for current event
    weatherEventLog:    0,     // last day a weather event was logged (debounce)
  };
}

// ── Simulation tick ────────────────────────────────────────
export function simulateTick(gs) {
  gs.tick++;
  gs.day = Math.floor(gs.tick / 10) + 1;   // 10 ticks = 1 day
  gs.season = Math.floor((gs.day % 360) / 90);
  gs.plant.ageInDays = gs.day;

  const s = gs.settings;

  updateEnvironment(gs);
  if (s.stomatalRegulation) updateStomata(gs);
  else gs.stomata = 1.0;  // always open if disabled

  if (s.hydraulicFailure) updateHydraulics(gs);
  else gs.xylemIntegrity = 1.0;  // no damage if disabled

  computeResourceFlows(gs);  // always runs; internally checks s flags
  applyGrowth(gs);
  updateRootGraph(gs);
  seedBaseNode(gs);
  checkUnlocks(gs);
  updateHealth(gs);

  if (s.flowering)     updateFlowering(gs);
  if (s.lifeCycles)    updateLifeCycle(gs);
  if (s.cambiumGrowth) updateCambium(gs);     // Phase 2.4: cambium growth rings
  if (s.mycorrhizae)   updateMycorrhizae(gs); // Phase 3.1: mycorrhizal network
  if (s.herbivory)      updateHerbivory(gs);      // Phase 3.2: herbivory events
  if (s.weatherEvents)  updateWeatherEvents(gs);  // Phase 3.3: weather events
}

// ── Environment changes with season ───────────────────────
function updateEnvironment(gs) {
  const season = gs.season;
  const biome   = gs.biome;

  const seasonSunMod  = [0.85, 1.15, 0.90, 0.60][season];
  const seasonRainMod = [1.10, 0.80, 1.00, 0.90][season];
  const tempFraction  = [0.3, 0.9, 0.6, 0.05][season];

  gs.env.sunlight     = clamp(vary(biome.sunlight * seasonSunMod, 0.05), 0, 1);
  gs.env.rainfall     = clamp(vary(biome.rainfall * seasonRainMod, 0.08), 0, 1);
  gs.env.temperature  = lerp(biome.tempRange[0], biome.tempRange[1], tempFraction) + (Math.random() - 0.5) * 3;
}

// ── Resource production / consumption ─────────────────────
// ── Stomatal regulation ──────────────────────────────
function updateStomata(gs) {
  const waterStress = clamp((gs.water - 10) / 25, 0, 1);
  const temp = gs.env.temperature;
  const optTemp = gs.seed.tempOptimum ?? 22;
  const tempDelta = Math.abs(temp - optTemp);
  const tempStress = clamp(1 - tempDelta / 20, 0.1, 1.0);
  const camFactor = gs.seed.stomatalType === 'cam' ? 0.15 : 1.0;
  gs.stomata = clamp(waterStress * tempStress * camFactor, 0, 1);

  if (gs.stomata < 0.2 && gs.tick % 30 === 0) {
    addLog(gs, 'Stomata nearly closed — photosynthesis stalled to conserve water.', 'danger');
  } else if (gs.stomata < 0.5 && gs.tick % 60 === 0) {
    addLog(gs, 'Stomata partially closed — trading growth for drought survival.', '');
  }
}

function updateHydraulics(gs) {
  // Xylem tension is high when: lots of leaf area transpiring, low water, high temp
  const leafArea  = gs.plant.leafMass / 100;
  const transpireDemand = leafArea * gs.seed.waterNeed * (1 - gs.stomata * 0.7);
  const waterDeficit    = Math.max(0, (30 - gs.water) / 30);  // stress when water < 30
  const tension         = transpireDemand * waterDeficit;

  // Cavitation occurs when tension exceeds threshold (varies by seed)
  // willow/reed are susceptible; cactus/succulent very resistant
  const cavitationThreshold = gs.seed.cavitationResistance ?? 0.35;
  if (tension > cavitationThreshold && gs.tick % 5 === 0) {
    const damage = (tension - cavitationThreshold) * 0.008;
    gs.xylemIntegrity = clamp(gs.xylemIntegrity - damage, 0.05, 1.0);
    if (damage > 0.002) {
      gs.cavitationEvents++;
      if (gs.cavitationEvents % 5 === 1) {
        addLog(gs, 'Xylem cavitation — air bubbles block water transport!', 'danger');
      }
    }
  }

  // Slow recovery via new vascular tissue (trunkGirth acts as proxy for xylem area)
  // Recovery only happens when water is plentiful and the plant is healthy
  if (gs.xylemIntegrity < 1.0 && gs.water > 50 && gs.health > 60) {
    const recovery = 0.0002 * (gs.plant.trunkGirth / 50 + 0.1);
    gs.xylemIntegrity = clamp(gs.xylemIntegrity + recovery, 0, 1.0);
  }
}

function computeResourceFlows(gs) {
  const { plant, env, seed, rootType } = gs;
  const rt = ROOT_TYPES[gs.rootType];

  // --- Photosynthesis: leaves make energy from sunlight + CO2
  const leafArea   = plant.leafMass / 100;
  const sunFactor  = env.sunlight * seed.leafEfficiency;
  const tempOpt    = seed.tempOptimum ?? 22;
  const tempBreadth = 8;  // ±8°C gives ~60% efficiency at edge of comfortable range
  const photoTempF = gs.settings.tempOptima
    ? _tempFactor(env.temperature, tempOpt, tempBreadth)
    : 1.0;
  const co2Factor  = clamp(gs.co2 / 60, 0.1, 1.5) * gs.stomata;
  const photoRate  = leafArea * sunFactor * co2Factor * 3.5 * photoTempF * (gs.activeAction === 'leaves' ? 1.3 : 1.0);
  const photoRateEff = photoRate * (1.0 - gs.dormancyDepth * 0.9);

  // --- Seed energy if no leaves yet (enough to sustain early root growth)
  const seedEnergy = plant.leafMass < 5 ? 3.5 : 0;

  // --- Respiration: all living cells consume energy + O2
  const biomass      = (plant.trunkHeight + plant.branchLength + plant.leafMass + plant.rootSpread) / 100;
  const respireCost  = Math.max(0.4, biomass * 1.5);
  // Heat stress: above optimum+12°C, enzymes denature and respiration uncouples
  const heatStress = gs.settings.tempOptima ? Math.max(0, (env.temperature - (tempOpt + 12)) / 15) : 0;
  const coldStress = gs.settings.tempOptima ? Math.max(0, ((tempOpt - 15) - env.temperature) / 15) : 0;
  const respireMod = 1.0 + heatStress * 1.5 + coldStress * 0.5;
  const transpire    = leafArea * 0.8 * seed.waterNeed * gs.stomata;
  const transpireEff = transpire * (1.0 - gs.dormancyDepth * 0.8);

  // --- Root water uptake
  const rootTotal    = (plant.rootSpread + plant.rootDepth + plant.rootStructural) / 100;
  const rainCapture  = env.rainfall * plant.rootSpread / 100 * rt.waterBonus * 4.5;
  const tapCapture   = (5 / env.groundwaterDepth) * plant.rootDepth / 100 * rt.waterBonus * 2.0;
  const mycoBonus = gs.mycorrhizalBonus ?? 0;
  const waterIn   = (rainCapture + tapCapture) * seed.rootEfficiency * gs.xylemIntegrity * (1 + mycoBonus * 0.4);

  // --- Root NPK uptake — each nutrient drawn from soil separately
  let nIn, pIn, kIn;
  if (gs.settings.npkNutrients) {
    const npk  = gs.biome.npk  ?? { n: 0.5, p: 0.5, k: 0.5 };
    const need = gs.seed.npkNeed ?? { n: 1.0, p: 1.0, k: 1.0 };
    nIn = rootTotal * npk.n * rt.nutrientBonus * seed.rootEfficiency * 1.5 * need.n;
    pIn = rootTotal * npk.p * rt.nutrientBonus * seed.rootEfficiency * 1.2 * need.p * (1 + mycoBonus * 0.8);
    kIn = rootTotal * npk.k * rt.nutrientBonus * seed.rootEfficiency * 1.0 * need.k;
  } else {
    // Simplified: single nutrient flow split evenly
    const nutIn = rootTotal * (gs.biome.soilNutrients ?? 0.5) * rt.nutrientBonus * seed.rootEfficiency * 1.5;
    nIn = nutIn * 0.5;
    pIn = nutIn * 0.3 * (1 + mycoBonus * 0.8);
    kIn = nutIn * 0.2;
  }

  // --- Gas exchange: leaves produce O2 and consume CO2
  const o2Out        = leafArea * sunFactor * 1.5;
  const co2Consumed  = leafArea * sunFactor * 0.8;
  // Roots consume O2 slightly
  const o2Consumed   = rootTotal * 0.3;

  // Growth action costs (paid per tick)
  let growCostEnergy    = 0;
  let growCostWater     = 0;
  let growCostNutrients = 0;
  if (gs.activeAction) {
    growCostEnergy    = 2.0;
    growCostWater     = gs.activeAction === 'roots'    ? 1.5 : 0.8;
    growCostNutrients = gs.activeAction === 'trunk'    ? 1.2
                      : gs.activeAction === 'branches' ? 1.0 : 0.6;
  }

  // --- Apply changes (clamped)
  gs.energy    = clamp(gs.energy    + photoRateEff + seedEnergy - respireCost * respireMod - growCostEnergy, 0, RESOURCE_MAX);
  gs.water     = clamp(gs.water     + waterIn   - transpireEff - growCostWater,                     0, RESOURCE_MAX);
  gs.nitrogen   = clamp(gs.nitrogen   + nIn - growCostNutrients * 0.5, 0, RESOURCE_MAX);
  gs.phosphorus = clamp(gs.phosphorus + pIn - growCostNutrients * 0.3, 0, RESOURCE_MAX);
  gs.potassium  = clamp(gs.potassium  + kIn - growCostNutrients * 0.2, 0, RESOURCE_MAX);
  gs.o2        = clamp(gs.o2        + o2Out      - o2Consumed,                                    0, RESOURCE_MAX);
  gs.co2       = clamp(gs.co2       - co2Consumed + respireCost * 0.3,                            0, RESOURCE_MAX);

  // Store flows for HUD
  gs.flows = { photoRate, waterIn, respireCost, nIn, pIn, kIn, transpire };
}

// ── Apply growth for active action ────────────────────────
function applyGrowth(gs) {
  if (!gs.activeAction) return;
  if (gs.energy < 5 || gs.water < 3) return;  // insufficient resources
  if (gs.dormant) return;  // no active growth during dormancy

  const { plant, seed } = gs;
  const rt  = ROOT_TYPES[gs.rootType];
  const spd = seed.growthRate * 0.6;            // growth per tick (visible per second at ×1)

  // Nutrient factors — scale growth rate per nutrient type
  let nFactor, pFactor, kFactor;
  if (gs.settings.npkNutrients) {
    nFactor = clamp(gs.nitrogen   / 30, 0.1, 1.5);  // N drives leaf/branch growth
    pFactor = clamp(gs.phosphorus / 30, 0.1, 1.5);  // P drives root/trunk growth
    kFactor = clamp(gs.potassium  / 30, 0.5, 1.2);  // K boosts overall efficiency
  } else {
    nFactor = 1.0;
    pFactor = 1.0;
    kFactor = 1.0;
  }
  const spdR = spd * pFactor * kFactor;  // roots
  const spdT = spd * pFactor;            // trunk
  const spdB = spd * nFactor * kFactor;  // branches
  const spdL = spd * nFactor;            // leaves

  switch (gs.activeAction) {
    case 'roots': {
      if (gs.rootType === 'taproot') {
        plant.rootDepth      = clamp(plant.rootDepth      + spdR * rt.waterBonus,       0, 100);
        plant.rootStructural = clamp(plant.rootStructural + spdR * 0.3,                 0, 100);
      } else if (gs.rootType === 'structural') {
        plant.rootStructural = clamp(plant.rootStructural + spdR * rt.structuralBonus,  0, 100);
        plant.rootSpread     = clamp(plant.rootSpread     + spdR * 0.4,                 0, 100);
        plant.rootDepth      = clamp(plant.rootDepth      + spdR * 0.5,                 0, 100);
      } else {
        plant.rootSpread     = clamp(plant.rootSpread     + spdR * rt.nutrientBonus,    0, 100);
        plant.rootDepth      = clamp(plant.rootDepth      + spdR * 0.2,                 0, 100);
      }
      break;
    }
    case 'trunk': {
      if (!gs.unlocked.trunk) break;
      // supportRatio: total anchor score vs trunk height — roots must grow
      // with the trunk or it slows. Surface spread counts here too.
      const totalAnchor  = plant.rootStructural + plant.rootDepth * 0.5 + plant.rootSpread * 0.3;
      const supportRatio = clamp(totalAnchor / Math.max(8, plant.trunkHeight * 0.8), 0, 1);
      const trunkGain    = spdT * seed.trunkStrength * supportRatio;
      plant.trunkHeight  = clamp(plant.trunkHeight + trunkGain,       0, 100);
      plant.trunkGirth   = clamp(plant.trunkGirth  + trunkGain * 0.4, 0, 100);
      break;
    }
    case 'branches': {
      if (!gs.unlocked.branches) break;
      const trunkSupport = plant.trunkHeight / 20;
      const branchGain   = spdB * Math.min(1, trunkSupport);
      plant.branchCount  = clamp(plant.branchCount  + branchGain * 0.5, 0, 100);
      plant.branchLength = clamp(plant.branchLength + branchGain,       0, 100);
      break;
    }
    case 'leaves': {
      if (!gs.unlocked.leaves) break;
      const branchBase = Math.max(0.2, plant.branchLength / 15 + plant.trunkHeight / 30);
      // rootBalance: roots must keep pace with leaf mass or leaves grow slowly.
      // Surface roots count well here — they supply water to leaves.
      const totalRoots  = plant.rootSpread + plant.rootDepth + plant.rootStructural;
      const rootBalance = clamp(totalRoots / Math.max(10, plant.leafMass * 1.5), 0, 1);
      plant.leafMass    = clamp(plant.leafMass + spdL * branchBase * seed.leafEfficiency * rootBalance, 0, 100);
      break;
    }
  }
}

// ── Seed base node when seedling first sprouts ────────────
function seedBaseNode(gs) {
  if (gs.plant.leafMass >= 0.5 && gs.plant.nodes.length === 0) {
    gs.plant.nodes.push({
      type:      'trunk',
      id:        gs.plant.nextNodeId++,
      parentId:  null,
      x:         0,              // relative to cx
      y:         -6,             // just above ground
      angle:     -Math.PI / 2,  // pointing straight up
      length:    6,
      thickness: 2,
      children:  [],
    });
    addLog(gs, 'A seedling has sprouted — choose where to grow your first trunk segment!', 'good');
  }
}

// ── Unlock gates ──────────────────────────────────────────
function checkUnlocks(gs) {
  const { plant } = gs;

  // Anchor score: structural roots count fully, tap root depth and
  // surface spread both count partially (surface roots double as
  // early anchors in the seedling stage before structural roots develop).
  const anchorScore = plant.rootStructural
                    + plant.rootDepth   * 0.5
                    + plant.rootSpread  * 0.3;  // surface roots help early on

  // Trunk: low threshold so early game flows naturally; surface roots alone
  // can satisfy it. Balance is enforced by the supportRatio in applyGrowth.
  if (!gs.unlocked.trunk && anchorScore >= 8) {
    gs.unlocked.trunk = true;
    addLog(gs, 'Your roots can support a trunk — but keep them growing to match it!', 'good');
  }
  if (!gs.unlocked.trunk && anchorScore >= 4 && gs.tick % 20 === 0) {
    addLog(gs, `Roots ${Math.round(anchorScore)}/8 anchor strength — almost ready for a trunk.`, '');
  }

  // Leaves: unlock as soon as the seedling node exists (cotyledons count),
  // but meaningful photosynthesis only comes once real leaf nodes are placed.
  if (!gs.unlocked.leaves && plant.nodes.length > 0) {
    gs.unlocked.leaves = true;
    addLog(gs, 'The seedling can grow leaves — balance leaf growth with your roots!', 'good');
  }

  // Branches: once trunk has some height
  if (!gs.unlocked.branches && plant.trunkHeight >= 16) {
    gs.unlocked.branches = true;
    addLog(gs, 'The trunk is tall enough to grow branches.', 'good');
  }
}

// ── Health calculation ─────────────────────────────────────
function updateHealth(gs) {
  let stress = 0;
  if (gs.energy    < 10) stress += 2;
  if (gs.water     < 10) stress += 3;
  if (gs.nitrogen < 8 || gs.phosphorus < 8) stress += 1;
  if (gs.potassium < 8) stress += 1;
  if (gs.o2        < 15) stress += 1;

  const temp    = gs.env.temperature;
  const tempOpt = gs.seed.tempOptimum ?? 22;
  const tFactor = _tempFactor(temp, tempOpt, 10);  // wider breadth for survival vs growth
  // Dormant plants are cold-hardened — reduce cold stress penalty
  const coldHardening = gs.dormant ? gs.dormancyDepth : 0;
  const effectiveTFactor = tFactor + coldHardening * 0.4;
  if (gs.settings.tempOptima) {
    if (effectiveTFactor < 0.3) stress += 2;       // severe temp stress — outside survival zone
    else if (effectiveTFactor < 0.6) stress += 1;  // moderate temp stress
  }

  if (tFactor < 0.2 && gs.tick % 40 === 0) {
    const dir = temp > (gs.seed.tempOptimum ?? 22) ? 'heat' : 'cold';
    addLog(gs, `Extreme ${dir} stress — enzymes failing, growth halted.`, 'danger');
  }

  if (stress === 0) gs.health = clamp(gs.health + 0.3, 0, 100);
  else              gs.health = clamp(gs.health - stress * 0.5, 0, 100);

  if (gs.health < 30 && gs.tick % 50 === 0) addLog(gs, 'The plant is struggling to survive!', 'danger');
}

// ── Persistent root fractal graph generation ──────────────
// Called every tick; only adds new segments when growth milestones are hit.
// Segments are never re-randomised — they accumulate and thicken over time.
function updateRootGraph(gs) {
  const { plant } = gs;
  const rg = plant.rootGraph;

  // ── Surface roots: one new arm per 12 units of rootSpread ──
  const targetSurfaceArms = Math.max(0, Math.floor(plant.rootSpread / 12));
  if (targetSurfaceArms > rg.surfaceArms) {
    const newArms = targetSurfaceArms - rg.surfaceArms;
    for (let a = 0; a < newArms; a++) {
      const armIndex = rg.surfaceArms + a;
      // Alternate left/right, fan outward from nearly horizontal
      const side = armIndex % 2 === 0 ? 1 : -1;
      const fan  = Math.floor(armIndex / 2);
      // In canvas coords: 0=right, PI/2=down, PI=left
      // Surface roots must go INTO the ground but stay SHALLOW:
      //   first arm:  ~8° below horizontal  (0.14 rad from horizontal)
      //   each pair fans 12° steeper, max ~30° below horizontal (0.52 rad)
      const dipAngle = Math.min(0.52, 0.14 + fan * 0.21); // radians below horizontal
      const baseAngle = side > 0
        ? dipAngle              // right side: small positive angle (slightly below horiz)
        : Math.PI - dipAngle;   // left side: mirrored (just past PI, slightly below horiz)
      const segLen = 20 + plant.rootSpread * 2.0;
      const segs = _buildRootSegments(0, 0, baseAngle, segLen, 3, 1.4, 'surface', armIndex);
      rg.surface.push(...segs);
    }
    rg.surfaceArms = targetSurfaceArms;
  }

  // ── Tap root: grow one more fractal depth level per 25 units of rootDepth ──
  const targetDepth = Math.min(4, 1 + Math.floor(plant.rootDepth / 22));
  if (targetDepth > rg.taprootDepth) {
    // Clear and rebuild with deeper recursion (tap root replaces in-place)
    rg.taproot = [];
    const rootLen = plant.rootDepth * 2.6;
    const segs = _buildRootSegments(0, 0, Math.PI / 2, rootLen, targetDepth, 2.2, 'taproot', 0);
    rg.taproot.push(...segs);
    rg.taprootDepth = targetDepth;
  }

  // ── Structural roots: one new arm per 15 units of rootStructural ──
  const targetStructArms = Math.max(0, Math.floor(plant.rootStructural / 15));
  if (targetStructArms > rg.structuralArms) {
    const newArms = targetStructArms - rg.structuralArms;
    for (let a = 0; a < newArms; a++) {
      const armIndex = rg.structuralArms + a;
      const side  = armIndex % 2 === 0 ? 1 : -1;
      const fan   = Math.floor(armIndex / 2);
      // Structural: steeper downward angle than surface (30-60° below horizontal)
      const baseAngle = side > 0
        ? 0.5  + fan * 0.28           // right: ~29° to ~45° below horizontal
        : Math.PI - 0.5 - fan * 0.28; // left mirrored
      const segLen = 16 + plant.rootStructural * 0.9;
      const segs = _buildRootSegments(0, 0, baseAngle, segLen, 2, 2.8, 'structural', armIndex);
      rg.structural.push(...segs);
    }
    rg.structuralArms = targetStructArms;
  }

  // ── Thicken all existing segments proportionally to growth ──
  const surfScale  = 0.012 + plant.rootSpread    / 3000;
  const tapScale   = 0.018 + plant.rootDepth     / 2500;
  const struScale  = 0.020 + plant.rootStructural / 2200;
  rg.surface.forEach(s    => { s.width = Math.min(s.width + surfScale, s.maxWidth); });
  rg.taproot.forEach(s    => { s.width = Math.min(s.width + tapScale,  s.maxWidth); });
  rg.structural.forEach(s => { s.width = Math.min(s.width + struScale, s.maxWidth); });
}

/**
 * Build a list of root segment objects using a seeded pseudo-random walk.
 * All randomness is determined by (armSeed + segment index) so the graph
 * is stable across ticks.
 * Returns flat array of {x1,y1,x2,y2,cpx,cpy,width,maxWidth,colA,colB,type}
 */
function _buildRootSegments(startX, startY, angle, length, depth, width, rootType, armSeed) {
  const segments = [];
  _recurseRoot(startX, startY, angle, length, depth, width, rootType, armSeed, 0, segments);
  return segments;
}

function _recurseRoot(x, y, angle, length, depth, width, rootType, armSeed, segIndex, out) {
  if (depth <= 0 || length < 2.5) return;

  // Seeded pseudo-random: consistent across ticks for same arm
  const rng  = _seededRand(armSeed * 1000 + segIndex * 37 + depth * 13);
  const rng2 = _seededRand(armSeed * 1000 + segIndex * 37 + depth * 13 + 7);
  const rng3 = _seededRand(armSeed * 1000 + segIndex * 37 + depth * 13 + 17);

  // Small natural wobble — tighter for tap root so it stays vertical
  const wobbleAmt = rootType === 'taproot' ? 0.08 : 0.14;
  const wobble    = (rng - 0.5) * wobbleAmt;
  const a         = angle + wobble;
  const ex        = x + Math.cos(a) * length;
  const ey        = y + Math.sin(a) * length;
  // Control point: wobble in lateral direction only (not depth) for surface roots
  const lateralWobble = rootType === 'surface' ? (rng2 - 0.5) * length * 0.35 : (rng2 - 0.5) * length * 0.22;
  const depthWobble   = rootType === 'surface' ? (rng3 - 0.5) * length * 0.06 : (rng3 - 0.5) * length * 0.15;
  const mx  = (x + ex) / 2 + lateralWobble;
  const my  = (y + ey) / 2 + depthWobble;

  const colours = {
    surface:    { a: '#c8a060', b: '#a07840' },
    taproot:    { a: '#7a3a18', b: '#3a1a06' },
    structural: { a: '#a06030', b: '#5a3018' },
  }[rootType];

  const maxW = rootType === 'structural' ? width * 1.6
             : rootType === 'taproot'    ? width * 1.4
             :                            width * 1.2;

  out.push({
    x1: x, y1: y, x2: ex, y2: ey,
    cpx: mx, cpy: my,
    width:    width * 0.35,   // start thin, thickened by updateRootGraph
    maxWidth: maxW,
    colA: colours.a,
    colB: colours.b,
    rootType,
  });

  const childCount = depth > 1 ? 2 : 1;
  const childLen   = length * 0.60;
  const childW     = width  * 0.58;

  for (let i = 0; i < childCount; i++) {
    const fraction = childCount === 1 ? 0 : (i === 0 ? -0.5 : 0.5);
    let childAngle;

    if (rootType === 'surface') {
      // Surface roots stay shallow: children fan left/right along the same
      // horizontal-ish plane. The base angle is near-horizontal so we spread
      // further in the lateral (horizontal) direction only — NO downward bias.
      // Fan children ±20° around the parent's current shallow angle.
      childAngle = a + fraction * 0.35;
      // Clamp so surface roots never go below 70° from vertical (i.e. stay
      // within 20° of horizontal). In canvas: angle must stay < PI*0.35 (right)
      // or > PI*0.65 (left). Clamp toward horizontal (0 or PI).
      const isRight = Math.cos(childAngle) > 0;
      const maxDip  = 0.38; // ~22° below horizontal max
      if (isRight) childAngle = Math.min(childAngle, maxDip);
      else          childAngle = Math.max(childAngle, Math.PI - maxDip);

    } else if (rootType === 'taproot') {
      // Tap root: children stay near-vertical, slight spread
      childAngle = a + fraction * 0.18;
      // Bias toward PI/2 (straight down) strongly
      childAngle = childAngle * 0.25 + (Math.PI / 2) * 0.75;

    } else {
      // Structural: medium diagonal — fan moderately, drift somewhat downward
      childAngle = a + fraction * 0.28;
      // Soft bias toward downward without going vertical
      const target = a + 0.20; // drift slightly steeper each generation
      childAngle = childAngle * 0.80 + target * 0.20;
    }

    _recurseRoot(ex, ey, childAngle, childLen, depth - 1, childW, rootType, armSeed, segIndex * 10 + i + 1, out);
  }
}

/** Simple deterministic hash → 0..1 float */
function _seededRand(seed) {
  const s = Math.sin(seed + 1) * 43758.5453;
  return s - Math.floor(s);
}

// ── Flowering and pollination ────────────────────────────
function updateFlowering(gs) {
  const { plant, seed } = gs;

  // Prerequisites: enough leaf mass and age before flowering begins
  const canFlower = plant.leafMass >= 25 && plant.ageInDays >= 30;
  if (!canFlower) return;

  // Photoperiod check: day-neutral (-1) always eligible; others need right season
  const seasonOk = seed.floweringSeason === -1 || seed.floweringSeason === gs.season;
  if (!seasonOk) {
    // Wrong season: gradually reset progress
    if (plant.flowerProgress > 0 && gs.tick % 5 === 0) {
      plant.flowerProgress = clamp(plant.flowerProgress - 0.5, 0, 100);
    }
    return;
  }

  // Accumulate flowering progress (costs energy)
  if (plant.flowerProgress < 100) {
    const flowerRate = seed.growthRate * 0.4 * (gs.energy > 20 ? 1.0 : 0.3);
    plant.flowerProgress = clamp(plant.flowerProgress + flowerRate, 0, 100);
    gs.energy = clamp(gs.energy - 0.3, 0, 100);  // flowering costs energy

    if (plant.flowerProgress >= 100 && !gs.flowering) {
      gs.flowering = true;
      addLog(gs, seed.icon + ' The plant has flowered! Awaiting pollination…', 'good');
    }
  }

  // Pollination: happens once flowering is complete
  if (gs.flowering && !plant.pollinated) {
    const attr = seed.pollinatorAttraction ?? 0.5;
    // Pollinators absent in winter; reduced in autumn
    const pollinatorPresence = [0.8, 1.0, 0.5, 0.0][gs.season];
    // Self-pollinators (attr === 0) always succeed
    const pollChance = attr === 0
      ? 0.02                                      // self-pollination: slow but certain
      : attr * pollinatorPresence * 0.015;        // insect/wind: depends on season

    if (Math.random() < pollChance) {
      plant.pollinated = true;
      // Seed yield scales with health, leaf mass, and pollinator attraction
      const yield_ = Math.round(
        3 + gs.health / 20 + plant.leafMass / 15 + (attr > 0 ? pollinatorPresence * 4 : 0)
      );
      plant.seedsProduced += yield_;
      addLog(gs, 'Pollination successful! ' + yield_ + ' seeds produced. (Total: ' + plant.seedsProduced + ')', 'good');

      // After pollination, flowering resets for next cycle (perennials can flower again)
      gs.flowering = false;
      plant.flowerProgress = 0;
      plant.pollinated = false;
    }
  }
}

// ── Life cycle: annual death and perennial dormancy ────────────────────────
function updateLifeCycle(gs) {
  const { seed, plant } = gs;
  const isWinter = gs.season === 3;
  const isSpring = gs.season === 0;

  // Annual death
  if (seed.lifespan === 'annual' && !gs.lifeComplete) {
    const hasSeeded = plant.seedsProduced > 0;
    const autumnEnd = gs.day > 270;
    if ((hasSeeded && gs.season >= 2) || autumnEnd) {
      gs.lifeComplete = true;
      gs.paused = true;
      addLog(gs, seed.icon + ' Life cycle complete! ' + (plant.seedsProduced || 0) + ' seeds produced in ' + gs.day + ' days.', 'good');
      addLog(gs, 'The annual plant has completed its life. Restart to grow again.', '');
    }
  }

  // Perennial dormancy
  if (seed.lifespan === 'perennial') {
    if (isWinter) {
      const targetDepth = 0.9;
      gs.dormancyDepth = clamp(gs.dormancyDepth + 0.02, 0, targetDepth);
      if (!gs.dormant && gs.dormancyDepth > 0.5) {
        gs.dormant = true;
        addLog(gs, 'The plant enters winter dormancy — metabolism slows to survive the cold.', '');
        if (seed.deciduous) {
          plant.leafMass = clamp(plant.leafMass * 0.15, 0, 100);
          addLog(gs, 'Leaves shed for winter.', '');
        } else {
          plant.leafMass = clamp(plant.leafMass * 0.75, 0, 100);
        }
      }
    } else if (isSpring && gs.dormant) {
      gs.dormancyDepth = clamp(gs.dormancyDepth - 0.04, 0, 1);
      if (gs.dormancyDepth <= 0) {
        gs.dormant = false;
        addLog(gs, 'Spring returns — the plant wakes from dormancy with a burst of growth!', 'good');
      }
    } else if (!isWinter) {
      gs.dormancyDepth = clamp(gs.dormancyDepth - 0.05, 0, 1);
      if (gs.dormancyDepth <= 0) gs.dormant = false;
    }
  }
}

// ── Cambium Growth (Phase 2.4) ───────────────────────────
function updateCambium(gs) {
  const { plant, seed } = gs;
  const rate = seed.cambiumRate ?? 0;
  if (rate === 0) return;  // herbaceous — no secondary growth

  // Cambium only active in growing season (not dormant)
  if (gs.dormant) return;

  // One growth ring per year: add girth based on energy surplus
  // (requires both photosynthate from leaves AND water/nutrients from roots)
  const energySurplus = Math.max(0, gs.energy - 40) / 60;  // how much energy above maintenance
  const phloemFlow    = Math.min(1, plant.leafMass / 40);   // sugar supply to roots
  const xylemFlow     = gs.xylemIntegrity;                  // water supply upward

  // Annual ring accumulation — very slow, builds over years
  const girthGain = rate * 0.004 * energySurplus * phloemFlow * xylemFlow;
  plant.trunkGirth = clamp(plant.trunkGirth + girthGain, 0, 100);

  // Phloem starvation: if leaf mass drops sharply, root sugar supply falls
  // This causes root die-back (reduces rootSpread and rootStructural slightly)
  if (phloemFlow < 0.2 && plant.trunkHeight > 10 && gs.tick % 20 === 0) {
    plant.rootSpread     = clamp(plant.rootSpread     - 0.3, 0, 100);
    plant.rootStructural = clamp(plant.rootStructural - 0.2, 0, 100);
    if (phloemFlow < 0.1 && gs.tick % 60 === 0) {
      addLog(gs, 'Phloem starvation — roots losing sugar supply from the canopy!', 'danger');
    }
  }

  // Track growth rings per year (cosmetic, used in renderer)
  // ageInDays increments each day; rings = floor(ageInDays / 360)
  plant.growthRings = Math.floor(plant.ageInDays / 360);
}

// ── Mycorrhizal Network (Phase 3.1) ──────────────────────
function updateMycorrhizae(gs) {
  const affinity = gs.seed.mycorrhizalAffinity ?? 0.5;
  const network  = gs.biome.fungalNetwork ?? 0.3;

  // Colonisation requires established roots and costs sugar
  const rootMass = (gs.plant.rootSpread + gs.plant.rootDepth + gs.plant.rootStructural) / 3;
  if (rootMass < 10) return;  // not enough root surface area

  // Colonisation rate — slow establishment (weeks in game time)
  if (gs.mycorrhizalColonisation < 1.0) {
    const colonRate = affinity * network * 0.0005 * (rootMass / 50);
    gs.mycorrhizalColonisation = clamp(gs.mycorrhizalColonisation + colonRate, 0, 1.0);

    if (gs.mycorrhizalColonisation > 0.3 && gs.mycorrhizalColonisation - colonRate <= 0.3) {
      addLog(gs, '🍄 Mycorrhizal fungi are colonising your roots — nutrient uptake improving!', 'good');
    }
    if (gs.mycorrhizalColonisation > 0.8 && gs.mycorrhizalColonisation - colonRate <= 0.8) {
      addLog(gs, '🍄 Mycorrhizal network fully established — major phosphorus and water boost!', 'good');
    }
  }

  // Cost: sugar drain from roots (modelled as small energy tax)
  const sugarCost = gs.mycorrhizalColonisation * affinity * 0.05;
  gs.energy = clamp(gs.energy - sugarCost, 0, 100);

  // Benefit: bonus to phosphorus and water uptake (applied in computeResourceFlows via gs.mycorrhizalBonus)
  gs.mycorrhizalBonus = gs.mycorrhizalColonisation * affinity * network;

  // Network degrades slightly if plant is very stressed (fungi die-back)
  if (gs.health < 20 && gs.tick % 30 === 0) {
    gs.mycorrhizalColonisation = clamp(gs.mycorrhizalColonisation - 0.02, 0, 1.0);
  }
}


// ── Herbivory (Phase 3.2) ────────────────────────────────
function updateHerbivory(gs) {
  const { plant, seed, env } = gs;
  const susceptibility = seed.herbivorySusceptibility ?? 0.5;
  const defense        = seed.defenseStrength ?? 0.3;

  // Herbivore events are random, more likely in warm seasons with lots of leaves
  const season     = gs.season;
  const leafTarget = plant.leafMass > 10;  // need leaves to attract grazers
  const seasonMod  = [0.8, 1.2, 1.0, 0.1][season];  // winter suppresses insects

  // Random chance of an herbivore event starting
  if (!gs.herbivoreEvent && leafTarget && gs.tick % 20 === 0) {
    const chance = 0.04 * susceptibility * seasonMod * (1 - defense * 0.6);
    if (Math.random() < chance) {
      gs.herbivoreEvent = true;
      gs.herbivorePressure = 0.3 + Math.random() * 0.5;

      // What kind of attack?
      const isInsect = plant.leafMass > 5;
      const isGrazer = plant.trunkHeight > 15 && Math.random() < 0.3;

      if (isGrazer) {
        addLog(gs, '🦌 A grazer is chewing on your trunk! Structural damage imminent.', 'danger');
      } else {
        addLog(gs, '🐛 Insects are devouring your leaves! Activate defense response?', 'danger');
      }
      gs.herbivorePressure = isGrazer ? 0.8 : gs.herbivorePressure;
    }
  }

  // Apply herbivore damage each tick while event is active
  if (gs.herbivoreEvent) {
    const damage = gs.herbivorePressure * susceptibility * (1 - defense * 0.7) * 0.3;

    // Leaf damage — primary target
    plant.leafMass = clamp(plant.leafMass - damage, 0, 100);
    plant.damagedLeaves = clamp((plant.damagedLeaves || 0) + damage * 0.5, 0, 100);

    // Trunk damage at high pressure (grazers)
    if (gs.herbivorePressure > 0.7 && plant.trunkHeight > 5) {
      plant.trunkGirth = clamp(plant.trunkGirth - damage * 0.1, 0, 100);
      if (gs.herbivorePressure > 0.85 && !plant.scarredTrunk) {
        plant.scarredTrunk = true;
        addLog(gs, '🦌 Deep trunk scarring — structural support permanently reduced!', 'danger');
      }
    }

    // Defense costs energy (producing tannins, resins, etc.)
    const defenseCost = defense * 0.15;
    gs.energy = clamp(gs.energy - defenseCost, 0, 100);

    // Health impact
    gs.health = clamp(gs.health - damage * 0.3, 0, 100);

    // Event wanes over time (herbivores move on, defense kicks in)
    gs.herbivorePressure = clamp(gs.herbivorePressure - 0.015, 0, 1.0);
    if (gs.herbivorePressure < 0.05) {
      gs.herbivoreEvent = false;
      gs.herbivorePressure = 0;
      addLog(gs, '🌿 Herbivore threat has passed.', '');
    }
  }
}

// ── Weather Events (Phase 3.3) ───────────────────────────
function updateWeatherEvents(gs) {
  const { env, biome, plant } = gs;

  // --- Progress active event ---
  if (gs.activeWeatherEvent) {
    gs.weatherEventTimer--;

    switch (gs.activeWeatherEvent) {
      case 'drought': {
        // Suppress rainfall to near zero
        env.rainfall = clamp(env.rainfall * 0.3, 0, 0.05);
        if (gs.weatherEventTimer % 30 === 0) {
          addLog(gs, '🏜️ Drought continues — rainfall almost zero.', 'danger');
        }
        break;
      }
      case 'flood': {
        // Waterlogged soil: excess water but root oxygen depletion
        env.rainfall = Math.min(1, env.rainfall * 1.5 + 0.4);
        gs.water = Math.min(100, gs.water + 2);
        // Root oxygen depletion — kills surface and structural roots slowly
        if (gs.tick % 10 === 0) {
          plant.rootSpread     = clamp(plant.rootSpread     - 0.4, 0, 100);
          plant.rootStructural = clamp(plant.rootStructural - 0.2, 0, 100);
        }
        if (gs.weatherEventTimer % 30 === 0) {
          addLog(gs, '🌊 Flooding — roots starved of oxygen, structural roots dying.', 'danger');
        }
        break;
      }
      case 'storm': {
        // High wind — tests structural roots; branch/leaf damage
        const windStress = 1.0 - clamp(plant.rootStructural / 40, 0, 1);
        if (gs.tick % 5 === 0 && windStress > 0.3) {
          plant.branchLength = clamp(plant.branchLength - windStress * 0.8, 0, 100);
          plant.leafMass     = clamp(plant.leafMass     - windStress * 1.2, 0, 100);
        }
        if (gs.weatherEventTimer % 20 === 0) {
          addLog(gs, '🌪️ Storm battering the plant — branches and leaves tearing!', 'danger');
        }
        break;
      }
    }

    if (gs.weatherEventTimer <= 0) {
      const ended = gs.activeWeatherEvent;
      gs.activeWeatherEvent = null;
      gs.weatherEventTimer  = 0;
      addLog(gs, `Weather event ended: ${ended} has passed.`, '');
    }
    return;
  }

  // --- Random chance of a new event ---
  // Only check every 50 ticks to avoid spam
  if (gs.tick % 50 !== 0) return;
  // Cooldown: don't start a new event within 90 days of the last one
  if (gs.day - (gs.weatherEventLog || 0) < 90) return;

  // Probability scales with how extreme the biome is
  const eventChance = 0.15;
  if (Math.random() > eventChance) return;

  // Weight event types by biome
  const weights = {
    drought: biome.rainfall < 0.4 ? 0.5 : biome.rainfall < 0.7 ? 0.25 : 0.10,
    flood:   biome.groundwaterDepth <= 2 ? 0.35 : 0.15,
    storm:   Math.abs(biome.wind ?? 0) > 0.3 ? 0.4 : 0.20,
  };
  const total = weights.drought + weights.flood + weights.storm;
  let r = Math.random() * total;
  let chosen = 'storm';
  for (const [type, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) { chosen = type; break; }
  }

  // Duration: 20-60 days in game ticks (x10)
  const duration = (20 + Math.floor(Math.random() * 40)) * 10;
  gs.activeWeatherEvent = chosen;
  gs.weatherEventTimer  = duration;
  gs.weatherEventLog    = gs.day;

  const msgs = {
    drought: '☀️ A severe drought has set in! Rainfall has dried up.',
    flood:   '🌊 Heavy rains are causing flooding! Root systems at risk.',
    storm:   '🌪️ A violent storm is hitting — structural roots will be tested!',
  };
  addLog(gs, msgs[chosen], 'danger');
}


// ── Helpers ───────────────────────────────────────────────
export function addLog(gs, msg, type = '') {
  gs.log.unshift({ day: gs.day, msg, type });
  if (gs.log.length > 40) gs.log.pop();
}

function vary(val, delta = 0.03) {
  return val + (Math.random() - 0.5) * delta * 2;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t)    { return a + (b - a) * t; }

// Bell curve temperature response — peaks at 1.0 at optimum, falls to 0 at extremes
// breadth controls width of the curve (higher = wider tolerance)
function _tempFactor(temp, optimum, breadth) {
  const delta = temp - optimum;
  return Math.max(0, Math.exp(-(delta * delta) / (2 * breadth * breadth)));
}

// ── Placement: compute clickable candidate spots ──────────
export function computePlacementCandidates(gs, type) {
  const candidates = [];
  const nodes = gs.plant.nodes;

  if (type === 'trunk') {
    // Offer new trunk segments off any trunk tip with no trunk child yet
    nodes.filter(n => n.type === 'trunk').forEach(node => {
      const hasTrunkChild = node.children.some(
        cid => nodes.find(n => n.id === cid)?.type === 'trunk'
      );
      if (hasTrunkChild) return;
      // Three angle options: left, straight, right relative to current angle
      const segLen = Math.max(16, 12 + gs.plant.trunkHeight * 0.25);
      [{ delta: -0.45, label: '↖ Left' }, { delta: 0, label: '↑ Straight' }, { delta: 0.45, label: '↗ Right' }]
        .forEach(({ delta, label }) => {
          const angle = node.angle + delta;
          candidates.push({
            id:           `trunk-${node.id}-${delta}`,
            parentNodeId: node.id,
            x:            node.x + Math.cos(angle) * segLen,
            y:            node.y + Math.sin(angle) * segLen,
            angle,
            length:       segLen,
            label,
          });
        });
    });
  }

  if (type === 'leaf') {
    // Offer leaf spots on any trunk node with fewer than 2 leaf children
    nodes.filter(n => n.type === 'trunk').forEach(node => {
      const leafCount = node.children.filter(
        cid => nodes.find(n => n.id === cid)?.type === 'leaf'
      ).length;
      if (leafCount >= 2) return;
      const leafSize = Math.max(10, 8 + gs.plant.leafMass * 0.35);
      [{ side: -1, label: '← Left leaf' }, { side: 1, label: '→ Right leaf' }]
        .forEach(({ side, label }) => {
          const alreadyHasSide = node.children.some(cid => {
            const c = nodes.find(n => n.id === cid);
            return c?.type === 'leaf' && (side < 0 ? c.x < node.x : c.x >= node.x);
          });
          if (alreadyHasSide) return;
          const leafAngle = node.angle + side * (Math.PI * 0.55);
          const offset    = leafSize * 1.2;
          candidates.push({
            id:           `leaf-${node.id}-${side}`,
            parentNodeId: node.id,
            x:            node.x + Math.cos(leafAngle) * offset,
            y:            node.y + Math.sin(leafAngle) * offset,
            angle:        leafAngle,
            size:         leafSize,
            label,
          });
        });
    });
  }

  return candidates;
}

// ── Placement: commit a chosen candidate into the graph ───
export function commitPlacement(gs, candidate, type) {
  const parent = gs.plant.nodes.find(n => n.id === candidate.parentNodeId);
  if (!parent) return;

  const newNode = {
    type,
    id:        gs.plant.nextNodeId++,
    parentId:  parent.id,
    x:         candidate.x,
    y:         candidate.y,
    angle:     candidate.angle,
    length:    candidate.length  || 14,
    thickness: type === 'trunk' ? Math.max(2, 2 + gs.plant.trunkGirth * 0.06) : 0,
    size:      type === 'leaf'  ? (candidate.size || 12) : 0,
    children:  [],
  };

  gs.plant.nodes.push(newNode);
  parent.children.push(newNode.id);

  // Update scalars so simulation formulas stay accurate
  if (type === 'trunk') {
    gs.plant.trunkHeight = clamp(gs.plant.trunkHeight + 8, 0, 100);
    gs.plant.trunkGirth  = clamp(gs.plant.trunkGirth  + 3, 0, 100);
    // One-time resource cost
    gs.energy    = clamp(gs.energy    - 12, 0, 100);
    gs.phosphorus = clamp(gs.phosphorus - 6, 0, 100);
    gs.nitrogen   = clamp(gs.nitrogen   - 4, 0, 100);
    gs.water     = clamp(gs.water     -  6, 0, 100);
    addLog(gs, `Trunk segment placed (${candidate.label}).`, '');
  }
  if (type === 'leaf') {
    gs.plant.leafMass    = clamp(gs.plant.leafMass    + 6,  0, 100);
    gs.plant.branchLength = clamp(gs.plant.branchLength + 4, 0, 100);
    gs.energy    = clamp(gs.energy    -  8, 0, 100);
    gs.water     = clamp(gs.water     -  5, 0, 100);
    gs.nitrogen  = clamp(gs.nitrogen  - 3, 0, 100);
    gs.potassium = clamp(gs.potassium - 1, 0, 100);
    addLog(gs, `Leaf cluster placed (${candidate.label}).`, 'good');
  }

  // Exit placement mode
  gs.placement.mode       = null;
  gs.placement.candidates = [];
  gs.placement.hoveredId  = null;
}
