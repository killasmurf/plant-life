// ============================================================
// main.js — Game controller and loop
// ============================================================

import { BIOMES, SEEDS, TICK_MS_BASE } from './data.js';
import { createGameState, simulateTick, addLog } from './gameState.js';
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
    this._speed         = 0; // ticks per second; 0 = paused

    this._init();
  }

  _init() {
    // Build UI (start screen)
    this.ui = new UI(this);

    // Wire up start-game button
    document.getElementById('btn-start-game').addEventListener('click', () => {
      this._startGame();
    });

    // Show start screen
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

    // Create state
    this.gs = createGameState(this.selectedBiome, this.selectedSeed);
    addLog(this.gs, `A ${this.selectedSeed.name} seed settles into ${this.selectedBiome.name} soil.`, 'good');
    addLog(this.gs, 'Grow roots first to gather water and anchor yourself.', '');

    // Setup renderer
    const canvas = document.getElementById('plant-canvas');
    this.renderer = new PlantRenderer(canvas);

    // Update UI
    this.ui.updateBiomeLabel(this.gs);
    this.ui.updateActionButtons(this.gs);
    this.ui.setSpeedActive(-1);

    // Default: surface roots selected
    this.ui._selectRootType('surface');

    // Switch screen
    this._showScreen('screen-game');

    // Draw first frame
    this.renderer.render(this.gs);

    // Start in paused state; user clicks speed to begin
    this.gs.paused = true;
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

    // Restart loop
    if (this._loopHandle) cancelAnimationFrame(this._loopHandle);
    if (!this.gs.paused) this._loop(performance.now());
  }

  _loop(now) {
    if (this.gs.paused) return;

    const elapsed    = now - this._lastTick;
    const tickMs     = TICK_MS_BASE / this._speed;

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

    // Reset start screen selections
    document.querySelectorAll('.biome-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.seed-card' ).forEach(c => c.classList.remove('selected'));
    document.getElementById('seed-section').style.display  = 'none';
    document.getElementById('seed-preview').style.display  = 'none';

    this._showScreen('screen-start');
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.game = new PlantGame();
});
