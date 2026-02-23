// ============================================================
// main.js — Game controller and loop
// ============================================================

import { BIOMES, SEEDS, TICK_MS_BASE } from './data.js';
import { createGameState, simulateTick, addLog,
         computePlacementCandidates, commitPlacement } from './gameState.js';
import { PlantRenderer } from './renderer.js';
import { UI } from './ui.js';

class PlantGame {
  constructor() {
    this.gs             = null;
    this.selectedBiome  = null;
    this.selectedSeed   = null;
    this.renderer       = null;
    this.ui             = null;
    this._loopHandle    = null;
    this._lastTick      = 0;
    this._speed         = 0;

    this._init();
  }

  _init() {
    this.ui = new UI(this);
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this._startGame();
    });
    this._showScreen('screen-start');
  }

  // ── Screen management ─────────────────────────────────────
  _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  // ── Start game ────────────────────────────────────────────
  _startGame() {
    if (!this.selectedBiome || !this.selectedSeed) {
      alert('Please select a biome and a seed first!');
      return;
    }

    this.gs = createGameState(this.selectedBiome, this.selectedSeed, { ...this.ui.settings });
    addLog(this.gs, `A ${this.selectedSeed.name} seed settles into ${this.selectedBiome.name} soil.`, 'good');
    addLog(this.gs, 'Grow roots first to gather water and anchor yourself.', '');

    const canvas = document.getElementById('plant-canvas');
    this.renderer = new PlantRenderer(canvas);

    // Wire canvas interaction
    canvas.addEventListener('click',     e => this._handleCanvasClick(e));
    canvas.addEventListener('mousemove', e => this._handleCanvasMouseMove(e));

    this.ui.updateBiomeLabel(this.gs);
    this.ui.updateActionButtons(this.gs);
    this.ui.setSpeedActive(-1);
    this.ui._selectRootType('surface');

    this._showScreen('screen-game');
    this.renderer.render(this.gs);
    this.gs.paused = true;
    this._lifecompleteShown = false;
  }

  // ── Placement mode ────────────────────────────────────────
  enterPlacementMode(type) {
    const gs = this.gs;
    if (!gs) return;

    const candidates = computePlacementCandidates(gs, type);
    if (!candidates.length) {
      addLog(gs, `No valid spots to place a ${type} right now.`, 'warn');
      return;
    }

    gs.placement.mode       = type;
    gs.placement.candidates = candidates;
    gs.placement.hoveredId  = null;
    gs.activeAction         = null;  // pause auto-growth

    addLog(gs, `Click a glowing spot to place a ${type} segment.`, '');
    this.ui.updateActionButtons(gs);
    this.renderer.render(gs);
  }

  _handleCanvasClick(e) {
    const gs = this.gs;
    if (!gs || !gs.placement.mode) return;

    const rect   = this.renderer.canvas.getBoundingClientRect();
    const scaleX = this.renderer.canvas.width  / rect.width;
    const scaleY = this.renderer.canvas.height / rect.height;
    const world  = this.renderer.screenToWorld(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top)  * scaleY,
    );

    // Find closest candidate within hit radius (world-space)
    const HIT = 28;
    let best = null, bestDist = Infinity;
    for (const c of gs.placement.candidates) {
      const dist = Math.hypot(world.x - c.x, world.y - c.y);
      if (dist < HIT && dist < bestDist) { best = c; bestDist = dist; }
    }

    if (best) {
      commitPlacement(gs, best, gs.placement.mode);
      this._updateUI();
    }
  }

  _handleCanvasMouseMove(e) {
    const gs = this.gs;
    if (!gs || !gs.placement.mode) {
      if (this.renderer) this.renderer.canvas.style.cursor = 'default';
      return;
    }

    const rect   = this.renderer.canvas.getBoundingClientRect();
    const scaleX = this.renderer.canvas.width  / rect.width;
    const scaleY = this.renderer.canvas.height / rect.height;
    const world  = this.renderer.screenToWorld(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top)  * scaleY,
    );

    const HIT = 32;
    let hovered = null, bestDist = Infinity;
    for (const c of gs.placement.candidates) {
      const dist = Math.hypot(world.x - c.x, world.y - c.y);
      if (dist < HIT && dist < bestDist) { hovered = c.id; bestDist = dist; }
    }

    this.renderer.canvas.style.cursor = hovered ? 'pointer' : 'crosshair';

    if (gs.placement.hoveredId !== hovered) {
      gs.placement.hoveredId = hovered;
      this.renderer.render(gs);  // re-render to update highlight without a tick
    }
  }

  // ── Game loop ─────────────────────────────────────────────
  setSpeed(speed) {
    this._speed = speed;
    if (!this.gs) return;

    if (speed === -1) {
      this.gs.paused = true;
      this.gs.speed  = 0;
      this.ui.setSpeedActive(-1);
    } else {
      this.gs.paused = false;
      this.gs.speed  = speed;
      this.ui.setSpeedActive(speed);
    }

    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
    if (!this.gs.paused) this._loop(performance.now());
  }

  _loop(now) {
    if (this.gs.paused) return;

    const elapsed = now - this._lastTick;
    const tickMs  = TICK_MS_BASE / this._speed;

    if (elapsed >= tickMs) {
      this._lastTick = now;
      simulateTick(this.gs);
      this._updateUI();
    }

    this._loopHandle = requestAnimationFrame(t => this._loop(t));
  }

  _updateUI() {
    if (!this.gs || !this.renderer || !this.ui) return;
    this.renderer.render(this.gs);

    if (this.gs.lifeComplete && !this._lifecompleteShown) {
      this._lifecompleteShown = true;
      this.setSpeed(-1);
    }
    this.ui.updateResourceBars(this.gs);
    this.ui.updateStats(this.gs);
    this.ui.updateLog(this.gs);
    this.ui.updateActionButtons(this.gs);
  }

  // ── Restart ───────────────────────────────────────────────
  restart() {
    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
    this._loopHandle   = null;
    this.gs            = null;
    this.selectedBiome = null;
    this.selectedSeed  = null;

    document.querySelectorAll('.biome-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.seed-card' ).forEach(c => c.classList.remove('selected'));
    document.getElementById('seed-section').style.display = 'none';
    document.getElementById('seed-preview').style.display = 'none';

    this._showScreen('screen-start');
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.game = new PlantGame();
});
