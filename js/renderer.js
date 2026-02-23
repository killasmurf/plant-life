// ============================================================
// renderer.js — Canvas-based plant visualiser
// ============================================================

const SKY_TOP    = '#0a0f1a';
const SKY_BOTTOM = '#1a2a1a';
const SOIL_TOP   = '#2a1a0a';
const SOIL_BOT   = '#150d04';
const DEEP_WATER = '#0a1528';

// Biome sky palette
const BIOME_SKY = {
  plains:   ['#1a2e4a', '#2d4a1a'],
  forest:   ['#0d1f0d', '#1a2e1a'],
  desert:   ['#2e1a0a', '#3d2a0a'],
  wetlands: ['#0d1a1a', '#1a2e2a'],
  mountain: ['#0d0d1a', '#1a1a2e'],
  tropical: ['#0a1a0a', '#1a2e1a'],
};

export class PlantRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.camera = { zoom: 3.5, targetZoom: 3.5 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect        = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = rect.width  || 600;
    this.canvas.height = rect.height || 700;
    this.W = this.canvas.width;
    this.H = this.canvas.height;

    // Ground horizon sits at 65% down
    this.groundY   = Math.floor(this.H * 0.65);
    this.cx        = Math.floor(this.W / 2);   // horizontal plant centre
  }

  // ── Camera helpers ────────────────────────────────────────
  _computeTargetZoom(gs) {
    const p = gs.plant;
    const trunkPx  = p.trunkHeight * 2.5;
    const sproutPx = p.leafMass * 3;
    const branchPx = p.branchLength * 1.5;
    const tallest  = Math.max(sproutPx, trunkPx + branchPx * 0.5, 8);
    // Aim to keep the tallest structure in ~30% of canvas height
    const targetFraction = 0.30;
    const raw = (this.H * targetFraction) / (tallest + 24);
    return Math.max(1.0, Math.min(3.5, raw));
  }

  _applyCameraTransform() {
    const z  = this.camera.zoom;
    const fx = this.W * 0.5;         // focus at horizontal centre
    const fy = this.H * 0.65;        // focus at ground line
    this.ctx.save();
    this.ctx.translate(fx, fy);
    this.ctx.scale(z, z);
    this.ctx.translate(-this.cx, -this.groundY);
  }

  _removeCameraTransform() { this.ctx.restore(); }

  // Convert screen px → world coords (same origin as node graph: cx, groundY)
  screenToWorld(sx, sy) {
    const z  = this.camera.zoom;
    const fx = this.W * 0.5;
    const fy = this.H * 0.65;
    return {
      x: (sx - fx) / z,    // relative to cx
      y: (sy - fy) / z,    // relative to groundY
    };
  }

  render(gs) {
    this.resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Smooth zoom toward target
    this.camera.targetZoom = this._computeTargetZoom(gs);
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;

    // Background + soil fill the full canvas (no camera transform)
    this._drawBackground(gs);
    this._drawSoilLayers(gs);

    // Plant content zoomed
    this._applyCameraTransform();
    this._drawBelowGround(gs);
    this._drawPlant(gs);
    this._removeCameraTransform();

    // Weather + HUD overlay are screen-space (no zoom)
    this._drawWeatherFX(gs);
    this._drawOverlay(gs);
  }

  // ── Background sky ───────────────────────────────────────
  _drawBackground(gs) {
    const ctx   = this.ctx;
    const [top, bot] = BIOME_SKY[gs.biome.id] || [SKY_TOP, SKY_BOTTOM];

    const grad = ctx.createLinearGradient(0, 0, 0, this.groundY);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.groundY);

    this._drawSun(gs);
    this._drawClouds(gs);

    // Weather event sky tint
    if (gs.activeWeatherEvent) {
      const tints = {
        drought: 'rgba(180,100,20,0.12)',
        flood:   'rgba(20,80,160,0.15)',
        storm:   'rgba(60,60,80,0.20)',
      };
      const tint = tints[gs.activeWeatherEvent];
      if (tint) {
        this.ctx.fillStyle = tint;
        this.ctx.fillRect(0, 0, this.W, this.groundY);
      }
    }
  }

  _drawSun(gs) {
    const ctx = this.ctx;
    const season = gs.season;
    // Sun position varies by season
    const xFrac = [0.70, 0.75, 0.65, 0.55][season];
    const yFrac = [0.18, 0.12, 0.22, 0.30][season];
    const sx = this.W * xFrac, sy = this.groundY * yFrac;
    const intensity = gs.env.sunlight;

    // Glow
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 80);
    glow.addColorStop(0, `rgba(255,220,100,${0.3 * intensity})`);
    glow.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.W, this.groundY);

    // Sun disc
    ctx.beginPath();
    ctx.arc(sx, sy, 22 * intensity, 0, Math.PI * 2);
    const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
    sunGrad.addColorStop(0, '#fff8a0');
    sunGrad.addColorStop(1, `rgba(255,190,50,${intensity})`);
    ctx.fillStyle = sunGrad;
    ctx.fill();
  }

  _drawClouds(gs) {
    const ctx   = this.ctx;
    const alpha = gs.env.rainfall * 0.6;
    if (alpha < 0.05) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c8d8c0';
    const clouds = [[0.15, 0.25], [0.45, 0.15], [0.75, 0.30], [0.90, 0.10]];
    clouds.forEach(([fx, fy]) => {
      const cx = this.W * fx + (gs.tick * 0.3 % (this.W * 0.2));
      const cy = this.groundY * fy;
      this._cloudShape(cx, cy, 50 + fx * 30);
    });
    ctx.globalAlpha = 1;
  }

  _cloudShape(x, y, size) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x,       y,      size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.1, size * 0.35, 0, Math.PI * 2);
    ctx.arc(x - size * 0.3, y,      size * 0.3,  0, Math.PI * 2);
    ctx.fill();
  }

  // ── Soil layers ──────────────────────────────────────────
  _drawSoilLayers(gs) {
    const ctx  = this.ctx;
    const gY   = this.groundY;
    const H    = this.H;
    const W    = this.W;

    // Topsoil
    const soil1 = ctx.createLinearGradient(0, gY, 0, gY + 60);
    soil1.addColorStop(0, '#3d2810');
    soil1.addColorStop(1, '#2a1a08');
    ctx.fillStyle = soil1;
    ctx.fillRect(0, gY, W, 60);

    // Sub-soil
    const soil2 = ctx.createLinearGradient(0, gY + 60, 0, gY + 180);
    soil2.addColorStop(0, '#2a1a08');
    soil2.addColorStop(1, '#1a1005');
    ctx.fillStyle = soil2;
    ctx.fillRect(0, gY + 60, W, 120);

    // Deep rock/clay
    ctx.fillStyle = '#0f0a03';
    ctx.fillRect(0, gY + 180, W, H - gY - 180);

    // Groundwater table depth indicator
    const gDepth = gs.env.groundwaterDepth;
    const waterY = gY + 40 + gDepth * 30;
    if (waterY < H) {
      ctx.globalAlpha = 0.25;
      const waterGrad = ctx.createLinearGradient(0, waterY, 0, waterY + 15);
      waterGrad.addColorStop(0, '#1a4a7a');
      waterGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterY, W, 15);
      ctx.globalAlpha = 1;
    }
  }

  // ── Underground: draw persistent root graph ──────────────
  _drawBelowGround(gs) {
    const ctx = this.ctx;
    const p   = gs.plant;
    const gY  = this.groundY;
    const cx  = this.cx;
    const rg  = p.rootGraph;

    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    // Draw all three root types from their persistent segment lists
    if (p.rootSpread > 0.5 && rg.surface.length > 0) {
      const alpha = Math.min(0.85, 0.25 + p.rootSpread / 75);
      ctx.globalAlpha = alpha;
      this._drawRootSegments(rg.surface, cx, gY + 4);
      ctx.globalAlpha = 1;
    }

    if (p.rootDepth > 0.5 && rg.taproot.length > 0) {
      const alpha = Math.min(0.90, 0.30 + p.rootDepth / 75);
      ctx.globalAlpha = alpha;
      this._drawRootSegments(rg.taproot, cx, gY + 5);
      ctx.globalAlpha = 1;
    }

    if (p.rootStructural > 0.5 && rg.structural.length > 0) {
      const alpha = Math.min(0.90, 0.30 + p.rootStructural / 60);
      ctx.globalAlpha = alpha;
      this._drawRootSegments(rg.structural, cx, gY + 8);
      ctx.globalAlpha = 1;
    }

    // Mycelium network: faint white thread web below surface (Phase 3.1)
    if (gs.mycorrhizalColonisation > 0.15) {
      const alpha = gs.mycorrhizalColonisation * 0.18;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#e8f0d8';
      ctx.lineWidth = 0.4;
      ctx.setLineDash([2, 4]);
      const spread = p.rootSpread * 2.5;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const ex = cx + Math.cos(angle) * spread;
        const ey = gY + 20 + Math.abs(Math.sin(angle)) * 40;
        ctx.beginPath();
        ctx.moveTo(cx, gY + 10);
        ctx.quadraticCurveTo(
          cx + Math.cos(angle) * spread * 0.5,
          gY + 30,
          ex, ey
        );
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  /** Render a flat list of pre-computed root segments, offset by (originX, originY). */
  _drawRootSegments(segments, originX, originY) {
    const ctx = this.ctx;
    for (const s of segments) {
      const x1 = originX + s.x1, y1 = originY + s.y1;
      const x2 = originX + s.x2, y2 = originY + s.y2;
      const cx = originX + s.cpx, cy = originY + s.cpy;

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, s.colA);
      grad.addColorStop(1, s.colB);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = Math.max(0.4, s.width);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }
  }

  // ── Above-ground: plant ──────────────────────────────────
  _drawPlant(gs) {
    const ctx = this.ctx;
    const p   = gs.plant;
    const gY  = this.groundY;
    const cx  = this.cx;

    // Always draw seedling/seed dot (provides origin visual)
    this._drawSeedling(gs);

    // If the spatial graph exists, use it instead of procedural drawing
    if (p.nodes && p.nodes.length > 0) {
      this._drawPlantGraph(gs);
      this._drawPlacementCandidates(gs);
      return;
    }

    // Fallback procedural drawing (pre-graph phase)
    if (p.trunkHeight < 1 && p.branchCount < 1 && p.leafMass < 2) {
      return;  // seedling already drawn above
    }

    // Trunk
    const trunkH = p.trunkHeight * 2.5;
    const trunkW = Math.max(2, 3 + p.trunkGirth * 0.4);
    const trunkTop = gY - trunkH;

    if (trunkH > 2) {
      const trunkGrad = ctx.createLinearGradient(cx, gY, cx, trunkTop);
      trunkGrad.addColorStop(0, '#5c3a1e');
      trunkGrad.addColorStop(1, '#7a4a28');
      ctx.fillStyle = trunkGrad;
      ctx.beginPath();
      ctx.moveTo(cx - trunkW, gY);
      ctx.bezierCurveTo(
        cx - trunkW * 0.8, gY - trunkH * 0.5,
        cx - trunkW * 0.5, trunkTop + 5,
        cx, trunkTop
      );
      ctx.bezierCurveTo(
        cx + trunkW * 0.5, trunkTop + 5,
        cx + trunkW * 0.8, gY - trunkH * 0.5,
        cx + trunkW, gY
      );
      ctx.closePath();
      ctx.fill();
    }

    // Branches
    if (p.branchCount > 0) {
      this._drawBranches(gs, cx, trunkTop, trunkH);
    }

    // Leaves
    if (p.leafMass > 0) {
      this._drawLeafCanopy(gs, cx, trunkTop, trunkH);
    }
  }

  _drawSeedling(gs) {
    const ctx = this.ctx;
    const gY  = this.groundY;
    const cx  = this.cx;
    const p   = gs.plant;

    // Seed dot
    ctx.fillStyle = '#7a5535';
    ctx.beginPath();
    ctx.ellipse(cx, gY - 2, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small sprout if any leaf mass
    if (p.leafMass > 0.5) {
      const h = p.leafMass * 3;
      ctx.strokeStyle = '#4a8a2a';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(cx, gY - 3);
      ctx.lineTo(cx, gY - 3 - h);
      ctx.stroke();

      // Cotyledon leaves
      ctx.fillStyle = '#5aaa3a';
      ctx.beginPath();
      ctx.ellipse(cx - 8, gY - 3 - h * 0.7, 6, 3, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 8, gY - 3 - h * 0.7, 6, 3, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBranches(gs, cx, trunkTop, trunkH) {
    const ctx = this.ctx;
    const p   = gs.plant;
    const count   = Math.max(1, Math.floor(p.branchCount / 8) + 1);
    const bLen    = p.branchLength * 1.5;

    ctx.strokeStyle = '#6b4226';
    ctx.lineCap     = 'round';

    for (let i = 0; i < count; i++) {
      const frac   = (i + 1) / (count + 1);
      const brY    = trunkTop + trunkH * frac * 0.5;
      const side   = i % 2 === 0 ? 1 : -1;
      const angle  = side * (Math.PI * 0.3 + frac * 0.2);
      const w      = Math.max(1, 4 - i * 0.5);

      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx, brY);
      ctx.quadraticCurveTo(
        cx + Math.cos(angle) * bLen * 0.5,
        brY - bLen * 0.3,
        cx + Math.cos(angle) * bLen,
        brY - bLen * 0.5
      );
      ctx.stroke();
    }
  }

  _drawLeafCanopy(gs, cx, trunkTop, trunkH) {
    const ctx  = this.ctx;
    const p    = gs.plant;
    const mass = p.leafMass;

    // Canopy radius scales with leaf mass and branch length
    const rx = 20 + (p.branchLength * 1.8) + (mass * 0.8);
    const ry = 15 + (mass * 0.7) + (p.trunkHeight * 0.3);
    const cy = trunkTop - ry * 0.3;

    const season = gs.season;
    const leafColors = [
      ['#2d7a1e', '#3d9a2e', '#4db040'],  // Spring - fresh green
      ['#1a6010', '#2a7a20', '#3a8a30'],  // Summer - deep green
      ['#8a5510', '#c07020', '#d08030'],  // Autumn - orange/brown
      ['#2a3a2a', '#1a2a1a', '#3a4a3a'],  // Winter - dull/sparse
    ][season];

    const alpha = season === 3 ? 0.4 : 0.85;

    // Multiple overlapping leaf clusters for organic look
    const clusters = [
      [cx,             cy,              rx,     ry    ],
      [cx - rx * 0.5,  cy + ry * 0.2,  rx*0.7, ry*0.7],
      [cx + rx * 0.5,  cy + ry * 0.2,  rx*0.7, ry*0.7],
      [cx - rx * 0.3,  cy - ry * 0.4,  rx*0.6, ry*0.5],
      [cx + rx * 0.3,  cy - ry * 0.4,  rx*0.6, ry*0.5],
    ];

    clusters.forEach(([lx, ly, lrx, lry], i) => {
      ctx.globalAlpha = alpha * (i === 0 ? 1 : 0.7);
      const col = leafColors[i % leafColors.length];
      const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(lrx, lry));
      grad.addColorStop(0, col);
      grad.addColorStop(1, leafColors[0] + '88');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lrx, lry, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
  }

  // ── Spatial graph: fractal trunk + fractal leaves ────────
  _drawPlantGraph(gs) {
    const ctx     = this.ctx;
    const nodes   = gs.plant.nodes;
    const originX = this.cx;
    const originY = this.groundY;
    const season  = gs.season;

    // Biome wind: -1 (strong left) to +1 (strong right), default 0
    const wind = gs.biome.wind ?? 0;

    // Draw trunk segments with fractal side-twigs off each segment
    nodes.filter(n => n.type === 'trunk').forEach(node => {
      const { startX, startY } = this._nodeStart(node, nodes, originX, originY);
      const endX = originX + node.x;
      const endY = originY + node.y;

      // Main trunk segment
      const grad = ctx.createLinearGradient(startX, startY, endX, endY);
      const xi = gs.xylemIntegrity;
      const r1 = Math.round(92  * xi + 100 * (1 - xi));
      const g1 = Math.round(58  * xi + 90  * (1 - xi));
      const b1 = Math.round(30  * xi + 85  * (1 - xi));
      const r2 = Math.round(122 * xi + 130 * (1 - xi));
      const g2 = Math.round(74  * xi + 110 * (1 - xi));
      const b2 = Math.round(40  * xi + 100 * (1 - xi));
      grad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
      grad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = Math.max(1.5, node.thickness);
      ctx.lineCap     = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Fractal side-twigs: one left, one right — biased by wind
      const twigLen   = Math.max(0, gs.plant.branchLength * 0.4);
      const twigDepth = Math.min(3, 1 + Math.floor(gs.plant.branchLength / 22));
      if (twigLen > 3 && gs.unlocked.branches) {
        const segAngle = Math.atan2(endY - startY, endX - startX);
        const mx = (startX + endX) / 2;
        const my = (startY + endY) / 2;

        // Left twig (side = -1) and right twig (side = +1)
        // Base spread angle from trunk axis is ±0.45 rad (≈25°)
        // Wind biases each side: positive wind pushes branches left (negative canvas x = negative wind)
        // wind > 0 → branches lean right (downwind), so left branch is shorter/less prominent
        [-1, 1].forEach(side => {
          // Wind reduces the spread on the windward side, increases on the leeward side
          const windEffect  = side * wind * 0.25; // shifts angle further on leeward side
          const twigAngle   = segAngle + side * (Math.PI * 0.45) + windEffect;
          // Leeward branches slightly longer; windward shorter
          const lenScale    = 1.0 - side * wind * 0.3;
          const scaledLen   = twigLen * Math.max(0.3, lenScale);
          const alphaScale  = 1.0 - side * wind * 0.2;
          ctx.globalAlpha   = Math.max(0.2, 0.75 * alphaScale);
          this._drawFractalBranch(mx, my, twigAngle, scaledLen, twigDepth,
            Math.max(0.8, node.thickness * 0.45), season);
          ctx.globalAlpha = 1;
        });
      }
    });


    // Dormancy frost tint over the whole plant area
    if (gs.dormancyDepth > 0.3) {
      const frostAlpha = gs.dormancyDepth * 0.12;
      ctx.globalAlpha = frostAlpha;
      ctx.fillStyle = '#c8d8e8';
      const p = gs.plant;
      const trunkTopY = originY - p.trunkHeight * 2.5;
      ctx.fillRect(originX - 200, trunkTopY - 50, 400, Math.abs(trunkTopY - originY) + 100);
      ctx.globalAlpha = 1;
    }
    // Growth ring annotation on the lowest trunk segment (Phase 2.4)
    if (gs.plant.growthRings > 0 && nodes.length > 0) {
      const base = nodes.find(n => n.type === 'trunk' && n.parentId === null);
      if (base) {
        const bx = originX + base.x;
        const by = originY + base.y;
        const girth = Math.max(4, base.thickness);
        // Draw concentric arc hints at base of trunk
        for (let r = 0; r < Math.min(gs.plant.growthRings, 5); r++) {
          ctx.beginPath();
          ctx.arc(bx, by, girth + r * 2, Math.PI * 0.8, Math.PI * 1.2);
          ctx.strokeStyle = 'rgba(180,130,80,' + (0.35 - r * 0.05) + ')';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // Draw leaf clusters as fractal leaf sprays
    // Leaves can attach directly to trunk nodes (early game) or to branch tips
    const leafAlpha = season === 3 ? 0.4 : 0.85;

    nodes.filter(n => n.type === 'leaf').forEach(node => {
      const lx = originX + node.x;
      const ly = originY + node.y;
      const r  = node.size;

      ctx.globalAlpha = leafAlpha;
      this._drawFractalLeaf(lx, ly, node.angle, r, season, gs.plant.leafMass);
      ctx.globalAlpha = 1;

      // Herbivory damage: ragged brown patches on leaves
      if (gs.herbivoreEvent && gs.herbivorePressure > 0.2) {
        const dmgAlpha = gs.herbivorePressure * 0.5;
        ctx.globalAlpha = dmgAlpha;
        ctx.fillStyle = '#5a3010';
        ctx.beginPath();
        ctx.ellipse(lx + r * 0.3, ly - r * 0.2, r * 0.35, r * 0.25, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    // Draw flower indicators when in bloom
    if (gs.flowering) {
      nodes.filter(n => n.type === 'leaf').forEach(node => {
        const lx = originX + node.x;
        const ly = originY + node.y;
        // Small petal cluster
        ctx.globalAlpha = 0.85;
        const flowerColors = ['#ff9eb5', '#ffcce0', '#ff7799'];
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          const px = lx + Math.cos(pa) * 5;
          const py = ly + Math.sin(pa) * 5;
          ctx.fillStyle = flowerColors[p % flowerColors.length];
          ctx.beginPath();
          ctx.ellipse(px, py, 3, 2, pa, 0, Math.PI * 2);
          ctx.fill();
        }
        // Centre
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  }

  /**
   * Fractal branch/twig system for above-ground growth.
   * Each branch splits into smaller branches, tapering in width and length.
   */
  _drawFractalBranch(x, y, angle, length, depth, width, season) {
    if (depth <= 0 || length < 2) return;

    const ctx    = this.ctx;
    const wobble = (Math.random() - 0.5) * 0.15;
    const a      = angle + wobble;

    const ex = x + Math.cos(a) * length;
    const ey = y + Math.sin(a) * length;

    // Branch colour: darker/browner at base, lighter toward tips
    const t       = 1 - depth / 3;   // 0 at base, 1 at tips
    const r       = Math.round(92  + t * 40);
    const g       = Math.round(58  + t * 20);
    const b       = Math.round(30  + t * 10);
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth   = Math.max(0.4, width);
    ctx.lineCap     = 'round';

    // Slight curve via control point
    const cpx = (x + ex) / 2 + (Math.random() - 0.5) * length * 0.25;
    const cpy = (y + ey) / 2 - length * 0.1;  // slight upward curve
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();

    // Add a small leaf cluster at branch tip
    if (depth === 1) {
      // Leaf faces outward along branch direction (petiole continues outward)
      this._drawFractalLeaf(ex, ey, a, length * 0.9, season, 50);
      return;
    }

    // Two children per branch node
    const childLen = length * (0.58 + Math.random() * 0.12);
    [-1, 1].forEach(side => {
      const childAngle = a + side * (0.35 + Math.random() * 0.2);
      this._drawFractalBranch(
        ex, ey,
        childAngle,
        childLen,
        depth - 1,
        width * 0.62,
        season
      );
    });
  }

  /**
   * Fractal leaf cluster: draws a petiole + 3-5 individual leaf shapes
   * radiating from the attachment point. Leaf size and count scale with
   * the base radius (r).
   */
  _drawFractalLeaf(cx, cy, baseAngle, r, season, leafMass) {
    const ctx = this.ctx;

    const leafColors = [
      ['#2d7a1e', '#4db040', '#1a5a10'],  // Spring
      ['#1a6010', '#2a7a20', '#0d4a08'],  // Summer
      ['#c07020', '#d08030', '#8a4010'],  // Autumn
      ['#2a3a2a', '#3a4a3a', '#1a2a1a'],  // Winter
    ][season];

    const leafCount  = leafMass > 50 ? 5 : leafMass > 25 ? 4 : 3;
    const petioleLen = r * 0.45;

    // Petiole (leaf stalk)
    ctx.strokeStyle = '#4a7020';
    ctx.lineWidth   = 0.8;
    ctx.lineCap     = 'round';
    const petX = cx + Math.cos(baseAngle) * petioleLen;
    const petY = cy + Math.sin(baseAngle) * petioleLen;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(petX, petY);
    ctx.stroke();

    // Individual leaflets arranged radially from petiole tip
    for (let i = 0; i < leafCount; i++) {
      const fraction  = leafCount === 1 ? 0 : (i / (leafCount - 1)) - 0.5;
      const leafAngle = baseAngle + fraction * Math.PI * 0.9;
      const lx = petX + Math.cos(leafAngle) * r * 0.55;
      const ly = petY + Math.sin(leafAngle) * r * 0.55;

      const leafW = r * (0.35 + Math.abs(fraction) * 0.15);
      const leafH = leafW * 0.45;

      const col = leafColors[i % leafColors.length];
      ctx.fillStyle = col;
      ctx.globalAlpha = season === 3 ? 0.35 : (0.65 + Math.random() * 0.2);
      ctx.beginPath();
      ctx.ellipse(lx, ly, leafW, leafH, leafAngle, 0, Math.PI * 2);
      ctx.fill();

      // Midrib vein
      if (r > 6) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath();
        ctx.moveTo(lx - Math.cos(leafAngle) * leafW * 0.7, ly - Math.sin(leafAngle) * leafW * 0.7);
        ctx.lineTo(lx + Math.cos(leafAngle) * leafW * 0.7, ly + Math.sin(leafAngle) * leafW * 0.7);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  // Return the world-space start point of a node (its parent's tip, or ground)
  _nodeStart(node, nodes, originX, originY) {
    if (node.parentId === null) {
      return { startX: originX, startY: originY };
    }
    const parent = nodes.find(n => n.id === node.parentId);
    if (!parent) return { startX: originX, startY: originY };
    return {
      startX: originX + parent.x,
      startY: originY + parent.y,
    };
  }

  // ── Placement candidate overlay ───────────────────────────
  _drawPlacementCandidates(gs) {
    if (!gs.placement?.mode || !gs.placement.candidates?.length) return;
    const ctx     = this.ctx;
    const nodes   = gs.plant.nodes;
    const originX = this.cx;
    const originY = this.groundY;

    gs.placement.candidates.forEach(c => {
      const wx       = originX + c.x;
      const wy       = originY + c.y;
      const hovered  = gs.placement.hoveredId === c.id;
      const pulse    = 0.7 + 0.3 * Math.sin(Date.now() / 300); // gentle pulse

      // Ghost preview line from parent tip
      if (gs.placement.mode === 'trunk') {
        const parent = nodes.find(n => n.id === c.parentNodeId);
        if (parent) {
          const px = originX + parent.x;
          const py = originY + parent.y;
          ctx.strokeStyle = hovered ? 'rgba(180,120,60,0.8)' : 'rgba(140,90,40,0.4)';
          ctx.lineWidth   = hovered ? 3 : 1.5;
          ctx.setLineDash([5, 4]);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(wx, wy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (gs.placement.mode === 'leaf') {
        const parent = nodes.find(n => n.id === c.parentNodeId);
        if (parent) {
          const px = originX + parent.x;
          const py = originY + parent.y;
          // Ghost leaf ellipse
          ctx.globalAlpha = hovered ? 0.55 : 0.25;
          ctx.fillStyle   = '#5aaa3a';
          ctx.beginPath();
          ctx.ellipse(wx, wy, 14, 9, c.angle, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Hit-target ring
      ctx.beginPath();
      ctx.arc(wx, wy, hovered ? 14 * pulse : 10, 0, Math.PI * 2);
      ctx.strokeStyle = hovered ? '#ffffff' : 'rgba(120,220,120,0.8)';
      ctx.lineWidth   = hovered ? 2.5 : 1.5;
      ctx.stroke();

      // Centre dot
      ctx.beginPath();
      ctx.arc(wx, wy, hovered ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? 'rgba(220,255,220,0.95)' : 'rgba(100,210,100,0.6)';
      ctx.fill();

      // Label above when hovered
      if (hovered && c.label) {
        ctx.fillStyle   = '#e8ffe8';
        ctx.font        = 'bold 11px monospace';
        ctx.textAlign   = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur  = 3;
        ctx.fillText(c.label, wx, wy - 18);
        ctx.shadowBlur  = 0;
      }
    });
  }

  // ── Weather FX ───────────────────────────────────────────
  _drawWeatherFX(gs) {
    const rain = gs.env.rainfall;
    if (rain < 0.4 || gs.tick % 3 !== 0) return;

    const ctx   = this.ctx;
    const drops = Math.floor(rain * 20);
    ctx.strokeStyle = 'rgba(160,200,220,0.35)';
    ctx.lineWidth   = 0.8;
    for (let i = 0; i < drops; i++) {
      const x = Math.random() * this.W;
      const y = Math.random() * this.groundY;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y + 8);
      ctx.stroke();
    }
  }

  // ── HUD overlay ──────────────────────────────────────────
  _drawOverlay(gs) {
    // nothing extra here — HUD lives in the DOM panel
  }

  // ── Utility ──────────────────────────────────────────────
  _curvedLine(ctx, x0, y0, cx1, cy1, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx1, cy1, x1, y1);
    ctx.stroke();
  }
}
