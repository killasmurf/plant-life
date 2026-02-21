// ============================================================
// ui.js — DOM UI builder and updater
// ============================================================

import { BIOMES, SEEDS, ROOT_TYPES } from './data.js';

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

const RESOURCES = [
  { key: 'energy',    label: 'Energy',    icon: '☀️',  col: 'var(--energy-col)'    },
  { key: 'water',     label: 'Water',     icon: '💧',  col: 'var(--water-col)'     },
  { key: 'o2',        label: 'Oxygen',    icon: '🌬️', col: 'var(--o2-col)'        },
  { key: 'co2',       label: 'CO₂',       icon: '💨',  col: 'var(--co2-col)'       },
  { key: 'nutrients', label: 'Nutrients', icon: '🌱',  col: 'var(--nutrients-col)' },
  { key: 'health',    label: 'Health',    icon: '❤️',  col: 'var(--health-col)'    },
];

export class UI {
  constructor(game) {
    this.game = game;
    this._buildStartScreen();
    this._buildResourceBars();
    this._buildStatGrid();
    this._buildActionButtons();
    this._buildRootOptions();
    this._bindSpeedControls();
  }

  // ── Start Screen ─────────────────────────────────────────
  _buildStartScreen() {
    this._buildBiomeCards();
  }

  _buildBiomeCards() {
    const grid = document.getElementById('biome-grid');
    grid.innerHTML = '';
    Object.values(BIOMES).forEach(biome => {
      const card = document.createElement('div');
      card.className = 'biome-card';
      card.innerHTML = `
        <span class="biome-icon">${biome.icon}</span>
        <div class="biome-name">${biome.name}</div>
        <div class="biome-desc">${biome.desc}</div>
      `;
      card.addEventListener('click', () => this._selectBiome(biome, card));
      grid.appendChild(card);
    });
  }

  _selectBiome(biome, card) {
    document.querySelectorAll('.biome-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    this.game.selectedBiome = biome;

    const seedSection = document.getElementById('seed-section');
    seedSection.style.display = 'block';
    this._buildSeedCards(biome);

    document.getElementById('seed-preview').style.display = 'none';
    this.game.selectedSeed = null;
  }

  _buildSeedCards(biome) {
    const grid = document.getElementById('seed-grid');
    grid.innerHTML = '';
    biome.seeds.forEach(sid => {
      const seed = SEEDS[sid];
      if (!seed) return;
      const card = document.createElement('div');
      card.className = 'seed-card';
      card.innerHTML = `
        <span class="seed-icon">${seed.icon}</span>
        <div class="seed-name">${seed.name}</div>
        <span class="seed-rarity rarity-${seed.rarity}">${seed.rarity}</span>
      `;
      card.addEventListener('click', () => this._selectSeed(seed, card));
      grid.appendChild(card);
    });
  }

  _selectSeed(seed, card) {
    document.querySelectorAll('.seed-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    this.game.selectedSeed = seed;
    this._showSeedPreview(seed);
  }

  _showSeedPreview(seed) {
    const preview = document.getElementById('seed-preview');
    preview.style.display = 'block';
    document.getElementById('preview-name').textContent = `${seed.icon} ${seed.name}`;
    document.getElementById('preview-desc').textContent = seed.desc;

    const stats = [
      { label: 'Growth Rate',     val: seed.growthRate  / 2,   col: '#3fb950' },
      { label: 'Root Efficiency', val: seed.rootEfficiency,    col: '#4fc3f7' },
      { label: 'Leaf Efficiency', val: seed.leafEfficiency,    col: '#81c784' },
      { label: 'Water Need',      val: seed.waterNeed / 2,     col: '#90caf9' },
      { label: 'Trunk Strength',  val: seed.trunkStrength / 2, col: '#a1887f' },
      { label: 'Max Height',      val: Math.min(1, seed.maxHeight / 120), col: '#ffb74d' },
    ];

    const container = document.getElementById('preview-stats');
    container.innerHTML = '';
    stats.forEach(s => {
      const pct = Math.round(Math.min(1, Math.max(0, s.val)) * 100);
      const div = document.createElement('div');
      div.className = 'preview-stat';
      div.innerHTML = `
        <div class="stat-label">${s.label}</div>
        <div class="stat-bar-wrap">
          <div class="stat-bar" style="width:${pct}%;background:${s.col}"></div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  // ── Resource Bars ─────────────────────────────────────────
  _buildResourceBars() {
    const container = document.getElementById('resource-bars');
    container.innerHTML = '';
    RESOURCES.forEach(res => {
      const row = document.createElement('div');
      row.className = 'resource-bar-row';
      row.innerHTML = `
        <span class="res-icon">${res.icon}</span>
        <span class="res-label">${res.label}</span>
        <div class="res-bar-wrap">
          <div class="res-bar" id="bar-${res.key}" style="width:50%;background:${res.col}"></div>
        </div>
        <span class="res-value" id="val-${res.key}">50</span>
      `;
      container.appendChild(row);
    });
  }

  updateResourceBars(gs) {
    RESOURCES.forEach(res => {
      const val  = gs[res.key];
      const bar  = document.getElementById(`bar-${res.key}`);
      const span = document.getElementById(`val-${res.key}`);
      if (bar)  bar.style.width = `${Math.round(val)}%`;
      if (span) span.textContent = Math.round(val);
    });
  }

  // ── Stat Grid ─────────────────────────────────────────────
  _buildStatGrid() {
    const container = document.getElementById('stat-grid');
    container.innerHTML = '';
    const stats = [
      { id: 'stat-trunk',    label: 'Trunk Height' },
      { id: 'stat-roots',    label: 'Root Depth'   },
      { id: 'stat-leaves',   label: 'Leaf Mass'    },
      { id: 'stat-branches', label: 'Branches'     },
      { id: 'stat-sun',      label: 'Sunlight'     },
      { id: 'stat-rain',     label: 'Rainfall'     },
      { id: 'stat-temp',     label: 'Temperature'  },
      { id: 'stat-day',      label: 'Day'          },
    ];
    stats.forEach(s => {
      const div = document.createElement('div');
      div.className = 'stat-item';
      div.innerHTML = `
        <div class="stat-name">${s.label}</div>
        <div class="stat-val" id="${s.id}">—</div>
      `;
      container.appendChild(div);
    });
  }

  updateStats(gs) {
    const p = gs.plant;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    const maxH = gs.seed.maxHeight;
    set('stat-trunk',    `${Math.round(p.trunkHeight / 100 * maxH)}m`);
    set('stat-roots',    `${Math.round((p.rootDepth + p.rootSpread) / 2)}%`);
    set('stat-leaves',   `${Math.round(p.leafMass)}%`);
    set('stat-branches', Math.floor(p.branchCount / 8) + (p.branchCount > 0 ? 1 : 0));
    set('stat-sun',      `${Math.round(gs.env.sunlight * 100)}%`);
    set('stat-rain',     `${Math.round(gs.env.rainfall * 100)}%`);
    set('stat-temp',     `${Math.round(gs.env.temperature)}°C`);
    set('stat-day',      gs.day);

    const timeEl = document.getElementById('time-display');
    if (timeEl) timeEl.textContent = `Day ${gs.day} · ${SEASONS[gs.season]}`;
  }

  // ── Action Buttons ────────────────────────────────────────
  _buildActionButtons() {
    const container = document.getElementById('action-buttons');
    container.innerHTML = '';

    const actions = [
      { id: 'roots',    icon: '🌿', name: 'Grow Roots',    cost: 'Energy + Water' },
      { id: 'trunk',    icon: '🪵', name: 'Grow Trunk',    cost: 'Energy + Nutrients', needsUnlock: 'trunk' },
      { id: 'branches', icon: '🌿', name: 'Grow Branches', cost: 'Energy + Nutrients', needsUnlock: 'branches' },
      { id: 'leaves',   icon: '🍃', name: 'Grow Leaves',   cost: 'Energy + Water',     needsUnlock: 'leaves' },
    ];

    actions.forEach(act => {
      const btn = document.createElement('button');
      btn.className  = 'action-btn';
      btn.id         = `act-${act.id}`;
      btn.innerHTML  = `
        <span class="act-icon">${act.icon}</span>
        <div class="act-info">
          <div class="act-name">${act.name}</div>
          <div class="act-cost">${act.cost}</div>
        </div>
      `;
      btn.addEventListener('click', () => this._toggleAction(act.id));
      container.appendChild(btn);
    });
  }

  _toggleAction(actionId) {
    const gs = this.game.gs;
    if (!gs) return;

    // Check unlock
    const unlockMap = { trunk: 'trunk', branches: 'branches', leaves: 'leaves' };
    if (unlockMap[actionId] && !gs.unlocked[unlockMap[actionId]]) return;

    gs.activeAction = (gs.activeAction === actionId) ? null : actionId;

    // Show root panel only when 'roots' active
    const rootPanel = document.getElementById('root-panel');
    rootPanel.style.display = gs.activeAction === 'roots' ? 'block' : 'none';

    this.updateActionButtons(gs);
  }

  updateActionButtons(gs) {
    ['roots', 'trunk', 'branches', 'leaves'].forEach(id => {
      const btn = document.getElementById(`act-${id}`);
      if (!btn) return;

      const unlockMap = { trunk: 'trunk', branches: 'branches', leaves: 'leaves' };
      const locked    = unlockMap[id] && !gs.unlocked[unlockMap[id]];
      btn.disabled    = locked;

      btn.classList.toggle('active-action', gs.activeAction === id);

      const costEl = btn.querySelector('.act-cost');
      if (costEl && locked) costEl.textContent = '🔒 Locked';
    });
  }

  // ── Root Options ──────────────────────────────────────────
  _buildRootOptions() {
    const container = document.getElementById('root-options');
    container.innerHTML = '';
    Object.values(ROOT_TYPES).forEach(rt => {
      const btn = document.createElement('button');
      btn.className = 'root-btn';
      btn.id        = `root-${rt.id}`;
      btn.innerHTML = `<strong>${rt.icon} ${rt.name}</strong><span>${rt.desc}</span>`;
      btn.addEventListener('click', () => this._selectRootType(rt.id));
      container.appendChild(btn);
    });
  }

  _selectRootType(id) {
    if (!this.game.gs) return;
    this.game.gs.rootType = id;
    document.querySelectorAll('.root-btn').forEach(b => b.classList.remove('selected-root'));
    document.getElementById(`root-${id}`)?.classList.add('selected-root');
  }

  // ── Log ───────────────────────────────────────────────────
  updateLog(gs) {
    const container = document.getElementById('log-entries');
    if (!container) return;
    container.innerHTML = '';
    gs.log.slice(0, 12).forEach(entry => {
      const div = document.createElement('div');
      div.className = `log-entry log-${entry.type}`;
      div.innerHTML = `<span class="log-day">Day ${entry.day}</span>${entry.msg}`;
      container.appendChild(div);
    });
  }

  // ── Speed Controls ────────────────────────────────────────
  _bindSpeedControls() {
    const map = {
      'btn-pause':  -1,
      'btn-slow':    1,
      'btn-normal':  2,
      'btn-fast':    5,
    };
    Object.entries(map).forEach(([id, speed]) => {
      document.getElementById(id)?.addEventListener('click', () => {
        this.game.setSpeed(speed);
      });
    });
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      this.game.restart();
    });
  }

  setSpeedActive(speed) {
    const map = { '-1': 'btn-pause', 1: 'btn-slow', 2: 'btn-normal', 5: 'btn-fast' };
    document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
    const id = map[speed];
    if (id) document.getElementById(id)?.classList.add('active');
  }

  // ── Biome label ───────────────────────────────────────────
  updateBiomeLabel(gs) {
    const el = document.getElementById('biome-label');
    if (el) el.textContent = `${gs.biome.icon} ${gs.biome.name} · ${gs.seed.name}`;
  }
}
