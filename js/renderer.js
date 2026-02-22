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

  // ── Underground: roots ───────────────────────────────────
  _drawBelowGround(gs) {
    const ctx = this.ctx;
    const p   = gs.plant;
    const gY  = this.groundY;
    const cx  = this.cx;

    // ── SURFACE roots: thin, wide, very shallow — light tan colour
    if (p.rootSpread > 0.5) {
      const spread = p.rootSpread * 3.2;
      const arms   = Math.max(2, Math.floor(p.rootSpread / 12) + 2);
      ctx.lineCap     = 'round';
      ctx.lineWidth   = 1.2;
      ctx.globalAlpha = Math.min(0.85, 0.25 + p.rootSpread / 70);
      for (let i = -arms; i <= arms; i++) {
        if (i === 0) continue;
        // Surface roots stay very close to ground surface
        const ex = cx + (i / arms) * spread;
        const ey = gY + 10 + Math.abs(i) * 3;        // barely dips below surface
        const cpx = cx + (i / arms) * spread * 0.4;
        const cpy = gY + 6;
        ctx.strokeStyle = '#c8a060';                   // light tan — fine surface roots
        ctx.beginPath();
        ctx.moveTo(cx, gY + 4);
        ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        ctx.stroke();
        // secondary feeder rootlets
        if (p.rootSpread > 20 && Math.abs(i) <= arms - 1) {
          ctx.lineWidth = 0.6;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(ex * 0.6 + cx * 0.4, ey * 0.7 + gY * 0.3);
          ctx.lineTo(ex * 0.6 + cx * 0.4 + (i > 0 ? 10 : -10), ey + 8);
          ctx.stroke();
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = Math.min(0.85, 0.25 + p.rootSpread / 70);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── TAP root: single thick vertical plunge — dark reddish-brown
    if (p.rootDepth > 0.5) {
      const rootLen  = p.rootDepth * 2.8;
      const depth    = gY + 5 + rootLen;
      const w        = Math.max(1.5, 1.5 + p.rootDepth / 20);
      const rootGrad = ctx.createLinearGradient(cx, gY, cx, depth);
      rootGrad.addColorStop(0, '#7a3a18');             // dark reddish at top
      rootGrad.addColorStop(1, '#3a1a06');             // very dark at depth
      ctx.strokeStyle = rootGrad;
      ctx.lineWidth   = w;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, gY + 5);
      ctx.bezierCurveTo(
        cx + 5,  gY + 5 + rootLen * 0.33,
        cx - 5,  gY + 5 + rootLen * 0.66,
        cx + 2,  depth
      );
      ctx.stroke();
      // fine root hairs along the tap root
      if (p.rootDepth > 12) {
        ctx.lineWidth   = 0.5;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#8b5030';
        for (let y = gY + 25; y < depth - 10; y += 18) {
          const side = (y % 36 === 0) ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + side * 14, y + 9);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // ── STRUCTURAL roots: thick, short, diagonal buttress roots — warm orange-brown
    if (p.rootStructural > 0.5) {
      const count  = Math.max(2, Math.floor(p.rootStructural / 12) + 2);
      const len    = 12 + p.rootStructural * 1.1;
      const thick  = Math.max(2.5, p.rootStructural / 12);
      ctx.lineCap     = 'round';
      ctx.globalAlpha = Math.min(0.9, 0.3 + p.rootStructural / 50);
      for (let i = 0; i < count; i++) {
        const side  = i % 2 === 0 ? 1 : -1;
        // Buttress roots angle outward and downward — steeper than surface roots
        const hAngle = side * (0.55 + Math.floor(i / 2) * 0.3);
        const ex    = cx + Math.cos(hAngle) * len;
        const ey    = gY + 18 + Math.sin(Math.abs(hAngle)) * len * 0.7;
        // Gradient from thick orange-brown at base to thinner darker at tip
        const rootGrad = ctx.createLinearGradient(cx, gY + 8, ex, ey);
        rootGrad.addColorStop(0, '#a06030');           // warm orange-brown — clearly different
        rootGrad.addColorStop(1, '#5a3018');
        ctx.strokeStyle = rootGrad;
        ctx.lineWidth   = thick * (1 - i * 0.1);
        ctx.beginPath();
        ctx.moveTo(cx, gY + 8);
        ctx.quadraticCurveTo(
          cx + Math.cos(hAngle) * len * 0.5,
          gY + 10 + Math.sin(Math.abs(hAngle)) * len * 0.3,
          ex, ey
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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

  // ── Spatial graph: trunk segments + leaf clusters ────────
  _drawPlantGraph(gs) {
    const ctx     = this.ctx;
    const nodes   = gs.plant.nodes;
    const originX = this.cx;
    const originY = this.groundY;

    // Draw trunk segments bottom-up (parents before children)
    nodes.filter(n => n.type === 'trunk').forEach(node => {
      const { startX, startY } = this._nodeStart(node, nodes, originX, originY);
      const endX = originX + node.x;
      const endY = originY + node.y;

      const grad = ctx.createLinearGradient(startX, startY, endX, endY);
      grad.addColorStop(0, '#5c3a1e');
      grad.addColorStop(1, '#7a4a28');
      ctx.strokeStyle = grad;
      ctx.lineWidth   = Math.max(1.5, node.thickness);
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    });

    // Draw leaf clusters
    const season     = gs.season;
    const leafColors = ['#3d9a2e','#2a7a20','#c07020','#2a3a2a'];
    const leafAlpha  = season === 3 ? 0.4 : 0.85;

    nodes.filter(n => n.type === 'leaf').forEach(node => {
      const lx = originX + node.x;
      const ly = originY + node.y;
      const r  = node.size;

      ctx.globalAlpha = leafAlpha;
      const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      grad.addColorStop(0, leafColors[season]);
      grad.addColorStop(1, leafColors[season] + '55');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(lx, ly, r, r * 0.65, node.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
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
