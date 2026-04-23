import * as THREE from 'three';
import { RubiksCube, COLOR_THEMES } from './cube.js';
import { CubeControls } from './controls.js';
import { AudioEngine } from './audio.js';
import { Tutorial } from './tutorial.js';

const STORAGE_KEY = 'cubequest3d_v1';

const $ = (s) => document.querySelector(s);

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (_) { return {}; }
}
function saveState(patch) {
  const cur = loadState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }));
}

function formatTime(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

class Game {
  constructor() {
    this.canvas = $('#scene');
    this.audio = new AudioEngine();

    this._initThree();
    this._initCube();
    this._initControls();
    this._initTutorial();
    this._initUI();
    this._restoreState();
    this._loop();
  }

  _initThree() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_THEMES.classic.bg);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(5, 5, 6.5);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 25;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x88aaff, 0.4);
    rim.position.set(-6, 3, -4);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffaa66, 0.25);
    fill.position.set(0, -4, 5);
    scene.add(fill);

    // Subtle ground plane (catches shadow)
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.4;
    ground.receiveShadow = true;
    scene.add(ground);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
    onResize();
  }

  _initCube() {
    this.cube = new RubiksCube(this.scene, 'classic');
  }

  _initControls() {
    this.controls = new CubeControls({
      camera: this.camera,
      renderer: this.renderer,
      cube: this.cube,
      onMove: () => this._handleMove(),
    });
  }

  _initTutorial() {
    this.tutorial = new Tutorial({
      cube: this.cube,
      audio: this.audio,
      onEnter: () => {
        document.body.classList.add('tutorial-open');
        // Tutorial playback shouldn't count as solving — pause the timer.
        this.timerRunning = false;
      },
      onExit: () => {
        document.body.classList.remove('tutorial-open');
      },
      onMoveCountChange: () => {
        this.movesEl.textContent = String(this.cube.totalMoves);
      },
    });
  }

  _initUI() {
    // Stats
    this.timerEl = $('#timer');
    this.movesEl = $('#moves');
    this.bestEl = $('#best');

    // Buttons
    $('#btn-shuffle').addEventListener('click', () => this.shuffle());
    $('#btn-reset').addEventListener('click', () => this.reset());
    $('#btn-undo').addEventListener('click', () => this.undo());

    const musicBtn = $('#btn-music');
    musicBtn.addEventListener('click', () => {
      const next = musicBtn.dataset.on !== 'true';
      musicBtn.dataset.on = String(next);
      this.audio.init();
      this.audio.resume();
      this.audio.setMusic(next);
      saveState({ music: next });
    });

    const sfxBtn = $('#btn-sfx');
    sfxBtn.addEventListener('click', () => {
      const next = sfxBtn.dataset.on !== 'true';
      sfxBtn.dataset.on = String(next);
      this.audio.setSfx(next);
      saveState({ sfx: next });
    });

    $('#btn-zoom-in').addEventListener('click', () => { this.audio.click(); this.controls.zoom(0.85); });
    $('#btn-zoom-out').addEventListener('click', () => { this.audio.click(); this.controls.zoom(1.18); });

    $('#btn-tutorial').addEventListener('click', () => {
      this.audio.click();
      this.tutorial.toggle();
    });

    $('#btn-help').addEventListener('click', () => $('#help-modal').classList.remove('hidden'));
    $('#btn-close-help').addEventListener('click', () => $('#help-modal').classList.add('hidden'));
    $('#btn-play-again').addEventListener('click', () => {
      $('#solved-banner').classList.add('hidden');
      this.shuffle();
    });

    // Theme picker
    document.querySelectorAll('#theme-picker .swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const t = sw.dataset.theme;
        document.querySelectorAll('#theme-picker .swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        this.cube.setTheme(t);
        saveState({ theme: t });
      });
    });

    // Splash
    const splash = $('#splash');
    const dismiss = () => {
      splash.classList.add('fade');
      this.audio.init();
      this.audio.resume();
      // Honor saved music preference
      const saved = loadState();
      if (saved.music) {
        $('#btn-music').dataset.on = 'true';
        this.audio.setMusic(true);
      }
      setTimeout(() => splash.remove(), 500);
    };
    splash.addEventListener('pointerdown', dismiss, { once: true });
    window.addEventListener('keydown', (e) => {
      if (!document.body.contains(splash)) return;
      dismiss();
    }, { once: true });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if ($('#help-modal').contains(e.target)) return;
      switch (e.key.toLowerCase()) {
        case 's': this.shuffle(); break;
        case 'r': this.reset(); break;
        case 'u': this.undo(); break;
        case 't': this.tutorial.toggle(); break;
        case '?': case '/': $('#help-modal').classList.toggle('hidden'); break;
      }
      if (e.key === '+' || e.key === '=') this.controls.zoom(0.85);
      if (e.key === '-' || e.key === '_') this.controls.zoom(1.18);
    });

    // Render best time
    const saved = loadState();
    if (saved.best) {
      this.bestEl.textContent = formatTime(saved.best);
    }
  }

  _restoreState() {
    const s = loadState();
    if (s.theme && COLOR_THEMES[s.theme]) {
      this.cube.setTheme(s.theme);
      const sw = document.querySelector(`#theme-picker .swatch[data-theme="${s.theme}"]`);
      if (sw) sw.classList.add('active');
    } else {
      document.querySelector('#theme-picker .swatch[data-theme="classic"]').classList.add('active');
    }
    if (s.sfx === false) {
      $('#btn-sfx').dataset.on = 'false';
      this.audio.setSfx(false);
    }
  }

  _loop = () => {
    requestAnimationFrame(this._loop);
    // Idle camera bob disabled — feels intrusive while solving.
    this.renderer.render(this.scene, this.camera);

    if (this.timerRunning) {
      const elapsed = performance.now() - this.timerStart;
      this.timerEl.textContent = formatTime(elapsed);
    }
  };

  // ---------- Game flow ----------

  _handleMove() {
    this.audio.whoosh();
    this.movesEl.textContent = String(this.cube.totalMoves);
    if (this.cube.recordHistory && !this.timerRunning && this.cube.totalMoves > 0) {
      this._startTimer();
    }
    if (this.cube.recordHistory && this.cube.isSolved()) {
      this._handleSolved();
    }
  }

  _startTimer() {
    this.timerRunning = true;
    this.timerStart = performance.now();
  }
  _stopTimer() {
    this.timerRunning = false;
    return performance.now() - this.timerStart;
  }

  async shuffle() {
    if (this.cube.animating) return;
    this.audio.click();
    this.timerRunning = false;
    this.timerEl.textContent = formatTime(0);
    this.movesEl.textContent = '0';
    $('#solved-banner').classList.add('hidden');
    await this.cube.shuffle(25, () => this.audio.whoosh());
    this.movesEl.textContent = '0';
  }

  reset() {
    if (this.cube.animating) return;
    this.audio.click();
    this.cube.reset();
    this.timerRunning = false;
    this.timerEl.textContent = formatTime(0);
    this.movesEl.textContent = '0';
    $('#solved-banner').classList.add('hidden');
  }

  async undo() {
    if (this.cube.animating) return;
    if (!this.cube.history.length) return;
    this.audio.click();
    await this.cube.undo();
    this.movesEl.textContent = String(this.cube.totalMoves);
  }

  _handleSolved() {
    const elapsed = this._stopTimer();
    const moves = this.cube.totalMoves;
    this.audio.win();

    const saved = loadState();
    const isBest = !saved.best || elapsed < saved.best;
    if (isBest) {
      saveState({ best: Math.floor(elapsed) });
      this.bestEl.textContent = formatTime(elapsed);
    }
    const stats = $('#solved-stats');
    stats.innerHTML = `Time: <strong>${formatTime(elapsed)}</strong> &middot; Moves: <strong>${moves}</strong>` + (isBest ? '<br><span style="color:var(--accent)">New best time!</span>' : '');
    $('#solved-banner').classList.remove('hidden');
    this.cube.recordHistory = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
