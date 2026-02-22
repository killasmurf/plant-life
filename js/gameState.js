// ============================================================
// gameState.js — Core game state and resource simulation
// ============================================================

import { RESOURCE_MAX, ROOT_TYPES } from './data.js';

export function createGameState(biome, seed) {
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
    speed: 0,

    // Resources (0–100)
    energy:    seed.startEnergy,
    water:     seed.startWater,
    o2:        50,
    co2:       50,
    nutrients: seed.startNutrients,
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
      ageInDays:      0,
      // Spatial graph — nodes are coords relative to (cx, groundY)
      nodes:      [],       // trunk + leaf node objects
      nextNodeId: 0,
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

    log: [],
  };
}

// ── Simulation tick ────────────────────────────────────────
export function simulateTick(gs) {
  gs.tick++;
  gs.day = Math.floor(gs.tick / 10) + 1;   // 10 ticks = 1 day
  gs.season = Math.floor((gs.day % 360) / 90);
  gs.plant.ageInDays = gs.day;

  updateEnvironment(gs);
  computeResourceFlows(gs);
  applyGrowth(gs);
  seedBaseNode(gs);
  checkUnlocks(gs);
  updateHealth(gs);
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
function computeResourceFlows(gs) {
  const { plant, env, seed, rootType } = gs;
  const rt = ROOT_TYPES[gs.rootType];

  // --- Photosynthesis: leaves make energy from sunlight + CO2
  const leafArea   = plant.leafMass / 100;
  const sunFactor  = env.sunlight * seed.leafEfficiency;
  const co2Factor  = clamp(gs.co2 / 60, 0.1, 1.5);
  const photoRate  = leafArea * sunFactor * co2Factor * 3.5 * (gs.activeAction === 'leaves' ? 1.3 : 1.0);

  // --- Seed energy if no leaves yet (enough to sustain early root growth)
  const seedEnergy = plant.leafMass < 5 ? 3.5 : 0;

  // --- Respiration: all living cells consume energy + O2
  const biomass      = (plant.trunkHeight + plant.branchLength + plant.leafMass + plant.rootSpread) / 100;
  const respireCost  = Math.max(0.4, biomass * 1.5);
  const transpire    = leafArea * 0.8 * seed.waterNeed; // leaves lose water

  // --- Root water uptake
  const rootTotal    = (plant.rootSpread + plant.rootDepth + plant.rootStructural) / 100;
  const rainCapture  = env.rainfall * plant.rootSpread / 100 * rt.waterBonus * 4.5;
  const tapCapture   = (5 / env.groundwaterDepth) * plant.rootDepth / 100 * rt.waterBonus * 2.0;
  const waterIn      = (rainCapture + tapCapture) * seed.rootEfficiency;

  // --- Root nutrient uptake
  const nutIn        = rootTotal * env.soilNutrients * rt.nutrientBonus * seed.rootEfficiency * 1.5;

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
  gs.energy    = clamp(gs.energy    + photoRate + seedEnergy - respireCost - growCostEnergy,      0, RESOURCE_MAX);
  gs.water     = clamp(gs.water     + waterIn   - transpire  - growCostWater,                     0, RESOURCE_MAX);
  gs.nutrients = clamp(gs.nutrients + nutIn      - growCostNutrients,                             0, RESOURCE_MAX);
  gs.o2        = clamp(gs.o2        + o2Out      - o2Consumed,                                    0, RESOURCE_MAX);
  gs.co2       = clamp(gs.co2       - co2Consumed + respireCost * 0.3,                            0, RESOURCE_MAX);

  // Store flows for HUD
  gs.flows = { photoRate, waterIn, respireCost, nutIn, transpire };
}

// ── Apply growth for active action ────────────────────────
function applyGrowth(gs) {
  if (!gs.activeAction) return;
  if (gs.energy < 5 || gs.water < 3) return;  // insufficient resources

  const { plant, seed } = gs;
  const rt  = ROOT_TYPES[gs.rootType];
  const spd = seed.growthRate * 0.6;            // growth per tick (visible per second at ×1)

  switch (gs.activeAction) {
    case 'roots': {
      if (gs.rootType === 'taproot') {
        plant.rootDepth      = clamp(plant.rootDepth      + spd * rt.waterBonus,       0, 100);
        plant.rootStructural = clamp(plant.rootStructural + spd * 0.3,                 0, 100);
      } else if (gs.rootType === 'structural') {
        plant.rootStructural = clamp(plant.rootStructural + spd * rt.structuralBonus,  0, 100);
        plant.rootSpread     = clamp(plant.rootSpread     + spd * 0.4,                 0, 100);
        plant.rootDepth      = clamp(plant.rootDepth      + spd * 0.5,                 0, 100);
      } else {
        plant.rootSpread     = clamp(plant.rootSpread     + spd * rt.nutrientBonus,    0, 100);
        plant.rootDepth      = clamp(plant.rootDepth      + spd * 0.2,                 0, 100);
      }
      break;
    }
    case 'trunk': {
      if (!gs.unlocked.trunk) break;
      // supportRatio: total anchor score vs trunk height — roots must grow
      // with the trunk or it slows. Surface spread counts here too.
      const totalAnchor  = plant.rootStructural + plant.rootDepth * 0.5 + plant.rootSpread * 0.3;
      const supportRatio = clamp(totalAnchor / Math.max(8, plant.trunkHeight * 0.8), 0, 1);
      const trunkGain    = spd * seed.trunkStrength * supportRatio;
      plant.trunkHeight  = clamp(plant.trunkHeight + trunkGain,       0, 100);
      plant.trunkGirth   = clamp(plant.trunkGirth  + trunkGain * 0.4, 0, 100);
      break;
    }
    case 'branches': {
      if (!gs.unlocked.branches) break;
      const trunkSupport = plant.trunkHeight / 20;
      const branchGain   = spd * Math.min(1, trunkSupport);
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
      plant.leafMass    = clamp(plant.leafMass + spd * branchBase * seed.leafEfficiency * rootBalance, 0, 100);
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
  if (gs.nutrients < 5)  stress += 1;
  if (gs.o2        < 15) stress += 1;

  const temp = gs.env.temperature;
  const [lo, hi] = gs.biome.tempRange;
  if (temp < lo + 2 || temp > hi - 2) stress += 1;

  if (stress === 0) gs.health = clamp(gs.health + 0.3, 0, 100);
  else              gs.health = clamp(gs.health - stress * 0.5, 0, 100);

  if (gs.health < 30 && gs.tick % 50 === 0) addLog(gs, 'The plant is struggling to survive!', 'danger');
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
    gs.nutrients = clamp(gs.nutrients - 10, 0, 100);
    gs.water     = clamp(gs.water     -  6, 0, 100);
    addLog(gs, `Trunk segment placed (${candidate.label}).`, '');
  }
  if (type === 'leaf') {
    gs.plant.leafMass    = clamp(gs.plant.leafMass    + 6,  0, 100);
    gs.plant.branchLength = clamp(gs.plant.branchLength + 4, 0, 100);
    gs.energy    = clamp(gs.energy    -  8, 0, 100);
    gs.water     = clamp(gs.water     -  5, 0, 100);
    gs.nutrients = clamp(gs.nutrients -  4, 0, 100);
    addLog(gs, `Leaf cluster placed (${candidate.label}).`, 'good');
  }

  // Exit placement mode
  gs.placement.mode       = null;
  gs.placement.candidates = [];
  gs.placement.hoveredId  = null;
}
