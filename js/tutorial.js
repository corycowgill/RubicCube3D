// Algorithm tutorial mode: walks the user through the 7-step beginner method
// for solving a Rubik's cube. Each step explains the goal, shows the relevant
// algorithms in standard notation, and lets the user press Play to watch the
// moves execute on the cube.

const TUTORIAL_STEPS = [
  {
    title: 'Step 1 — The White Cross',
    intro:
      'Hold the cube with the white center on top. Our first goal is to build a white cross on top, with each white edge also matching the color of the center next to it.',
    tips: [
      'White edges have white on one side and another color on the other.',
      'Bring each edge up so its white sticker is on top AND its side color matches the adjacent center (green edge to green center, etc.).',
      'This step is intuitive — no fixed algorithm. Practice moving edges up one at a time.',
    ],
    algorithms: [
      {
        name: 'Flip an edge already on top',
        notation: "F U' R U",
        description:
          'Use this if a white edge is sitting on top but pointed sideways — it pops the edge down and re-inserts it correctly.',
      },
    ],
  },
  {
    title: 'Step 2 — The White Corners',
    intro:
      'Now fill the four white corners to finish the entire bottom (white) layer. Find a white corner in the bottom layer sitting beneath the slot it belongs in, then repeat the "right-down" trigger until it pops up in place.',
    tips: [
      'Orient the cube with the white cross on top for this step (we think of "up" as white while inserting).',
      'Position the white corner directly under its correct spot.',
      'Repeat R\' D\' R D — usually 1, 3, or 5 times — until the corner pops into place with white on top.',
    ],
    algorithms: [
      {
        name: 'Corner inserter (sexy move variant)',
        notation: "R' D' R D",
        description:
          'Repeat until the corner clicks into place. If the corner is already in its slot but twisted wrong, this same trigger fixes it.',
      },
    ],
  },
  {
    title: 'Step 3 — The Middle-Layer Edges',
    intro:
      'Flip the cube over so the solved white layer is on the bottom. Now insert the four non-yellow edges from the top layer into the middle layer. There are two mirrored algorithms depending on whether the edge goes to the right or the left.',
    tips: [
      'Find a top-layer edge that has NO yellow. Line up its side color with the matching center.',
      'If the other color points to the right, use the right-insert algorithm.',
      'If the other color points to the left, use the left-insert algorithm.',
    ],
    algorithms: [
      {
        name: 'Insert edge to the RIGHT slot',
        notation: "U R U' R' U' F' U F",
        description:
          'Hold the matched edge at front-top, with the non-yellow side color on the front face matching the front center. The edge goes into the front-right slot.',
      },
      {
        name: 'Insert edge to the LEFT slot',
        notation: "U' L' U L U F U' F'",
        description:
          'Mirror of the right insert — use when the edge needs to go to the front-left slot.',
      },
    ],
  },
  {
    title: 'Step 4 — The Yellow Cross',
    intro:
      'With the first two layers done, flip so yellow is on top. We now make a yellow cross on top (ignore corners for now). Look at only the yellow edges on top and apply the algorithm based on the shape you see.',
    tips: [
      'Dot (no yellow edges up): apply the algorithm 3 times.',
      'L-shape: position the L in the top-LEFT and back, apply once — you\'ll get a line.',
      'Line: position the line horizontal (left-right), apply once — you get the cross.',
    ],
    algorithms: [
      {
        name: 'Yellow cross (FRUR\'U\'F\')',
        notation: "F R U R' U' F'",
        description:
          'Classic OLL-edges algorithm. Repeat until the top edges form a plus sign.',
      },
    ],
  },
  {
    title: 'Step 5 — Orient the Yellow Corners (Sune)',
    intro:
      'Now get every corner on the top face to show yellow. Use the Sune algorithm repeatedly, rotating the top between applications, until all four corners are yellow-up.',
    tips: [
      '0 corners yellow: place any unsolved corner in the front-left-top position, apply Sune.',
      '1 corner yellow: hold the yellow-up corner at front-left-top, apply Sune.',
      '2 corners yellow: position depends on pattern — apply Sune and see.',
      'After each Sune, reassess and repeat. It always finishes within a few tries.',
    ],
    algorithms: [
      {
        name: 'Sune',
        notation: "R U R' U R U2 R'",
        description:
          'The workhorse of the beginner method. Keep firing it with different U-rotations until all yellows face up.',
      },
    ],
  },
  {
    title: 'Step 6 — Position the Yellow Corners',
    intro:
      'The yellow face is done. Now cycle the top corners into their correct positions (ignore edges). Find a corner already in its correct spot (it\'s OK if the edges are still wrong). If none are correct, run the algorithm once and one will end up correct.',
    tips: [
      'Hold the cube so the correctly-placed corner is in the front-right-top.',
      'Run the algorithm — it cycles the other three corners.',
      'If corners still aren\'t right, rotate so the one correct corner is front-right again and repeat.',
    ],
    algorithms: [
      {
        name: 'Corner 3-cycle',
        notation: "U R U' L' U R' U' L",
        description:
          'Cycles three top-layer corners while leaving the front-right-top corner fixed.',
      },
    ],
  },
  {
    title: 'Step 7 — Position the Yellow Edges',
    intro:
      'The final step. Corners are correct; only the top edges remain. Find an edge that\'s already solved (if any). Hold it at the back and apply the U-perm. If no edges are solved, apply once to create a solved edge, then re-position and finish.',
    tips: [
      'Hold the solved edge at the back face (top-back).',
      'Check the remaining three: if the cycle goes clockwise, use U-perm (a). Counter-clockwise, use U-perm (b).',
      'After this, the cube is solved!',
    ],
    algorithms: [
      {
        name: 'U-Perm (a) — clockwise cycle',
        notation: "R U' R U R U R U' R' U' R2",
        description:
          'Cycles the three non-back edges clockwise. Use when the front edge belongs on the left.',
      },
      {
        name: 'U-Perm (b) — counter-clockwise cycle',
        notation: "R2 U R U R' U' R' U' R' U R'",
        description:
          'The mirror — use when the front edge belongs on the right.',
      },
    ],
  },
];

// Parse Rubik's notation ("R U R' U2") into an ordered list of quarter-turn moves.
// Supports R L U D F B with optional ' (counter-clockwise) or 2 (double).
// Unknown tokens (wide moves, rotations) are silently skipped.
function parseAlg(notation) {
  const out = [];
  const re = /([RLUDFB])(['2]?)/g;
  let m;
  while ((m = re.exec(notation)) !== null) {
    const face = m[1];
    const mod = m[2];
    if (mod === '2') {
      out.push({ face, dir: 1 });
      out.push({ face, dir: 1 });
    } else if (mod === "'") {
      out.push({ face, dir: -1 });
    } else {
      out.push({ face, dir: 1 });
    }
  }
  return out;
}

export class Tutorial {
  constructor({ cube, audio, onEnter, onExit, onMoveCountChange }) {
    this.cube = cube;
    this.audio = audio;
    this.onEnter = onEnter || (() => {});
    this.onExit = onExit || (() => {});
    this.onMoveCountChange = onMoveCountChange || (() => {});

    this.active = false;
    this.stepIndex = 0;
    this.playing = false;

    this._buildUI();
  }

  _buildUI() {
    const panel = document.createElement('div');
    panel.id = 'tutorial-panel';
    panel.className = 'tutorial-panel hidden';
    panel.innerHTML = `
      <div class="tut-header">
        <div class="tut-header-left">
          <span class="tut-badge">Tutorial</span>
          <span class="tut-step-label">Step 1 / ${TUTORIAL_STEPS.length}</span>
        </div>
        <button class="tut-close" title="Exit tutorial">✕</button>
      </div>
      <div class="tut-progress"><div class="tut-progress-bar"></div></div>
      <div class="tut-body">
        <h3 class="tut-title"></h3>
        <p class="tut-intro"></p>
        <div class="tut-tips-section">
          <div class="tut-section-label">Tips</div>
          <ul class="tut-tips"></ul>
        </div>
        <div class="tut-algos-section">
          <div class="tut-section-label">Algorithms</div>
          <div class="tut-algos"></div>
        </div>
      </div>
      <div class="tut-footer">
        <button class="tut-btn tut-prev">‹ Prev</button>
        <button class="tut-btn tut-reset" title="Reset cube to solved">Reset cube</button>
        <button class="tut-btn tut-next primary">Next ›</button>
      </div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;

    this._el = {
      stepLabel: panel.querySelector('.tut-step-label'),
      progress: panel.querySelector('.tut-progress-bar'),
      title: panel.querySelector('.tut-title'),
      intro: panel.querySelector('.tut-intro'),
      tips: panel.querySelector('.tut-tips'),
      algos: panel.querySelector('.tut-algos'),
      prev: panel.querySelector('.tut-prev'),
      next: panel.querySelector('.tut-next'),
      reset: panel.querySelector('.tut-reset'),
      close: panel.querySelector('.tut-close'),
    };

    this._el.close.addEventListener('click', () => this.exit());
    this._el.prev.addEventListener('click', () => this.goto(this.stepIndex - 1));
    this._el.next.addEventListener('click', () => this.goto(this.stepIndex + 1));
    this._el.reset.addEventListener('click', () => this.resetCube());
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.panel.classList.remove('hidden');
    this.renderStep();
    this.onEnter();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.panel.classList.add('hidden');
    this.onExit();
  }

  toggle() {
    this.active ? this.exit() : this.enter();
  }

  goto(i) {
    const max = TUTORIAL_STEPS.length - 1;
    this.stepIndex = Math.max(0, Math.min(max, i));
    this.renderStep();
  }

  renderStep() {
    const s = TUTORIAL_STEPS[this.stepIndex];
    const total = TUTORIAL_STEPS.length;
    this._el.stepLabel.textContent = `Step ${this.stepIndex + 1} / ${total}`;
    this._el.progress.style.width = `${((this.stepIndex + 1) / total) * 100}%`;
    this._el.title.textContent = s.title;
    this._el.intro.textContent = s.intro;

    this._el.tips.innerHTML = '';
    for (const tip of s.tips) {
      const li = document.createElement('li');
      li.textContent = tip;
      this._el.tips.appendChild(li);
    }

    this._el.algos.innerHTML = '';
    for (const algo of s.algorithms) {
      const card = document.createElement('div');
      card.className = 'tut-algo';
      card.innerHTML = `
        <div class="tut-algo-head">
          <span class="tut-algo-name"></span>
          <button class="tut-btn tut-algo-play">▶ Play</button>
        </div>
        <code class="tut-algo-notation"></code>
        <p class="tut-algo-desc"></p>
      `;
      card.querySelector('.tut-algo-name').textContent = algo.name;
      card.querySelector('.tut-algo-notation').textContent = algo.notation;
      card.querySelector('.tut-algo-desc').textContent = algo.description;
      const playBtn = card.querySelector('.tut-algo-play');
      playBtn.addEventListener('click', () => this.playAlgorithm(algo.notation, playBtn));
      this._el.algos.appendChild(card);
    }

    this._el.prev.disabled = this.stepIndex === 0;
    this._el.next.textContent = this.stepIndex === total - 1 ? 'Finish' : 'Next ›';
  }

  async playAlgorithm(notation, btn) {
    if (this.playing || this.cube.animating) return;
    const moves = parseAlg(notation);
    if (moves.length === 0) return;

    this.playing = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '▶ Playing…';
    }

    // Save stats so the tutorial demo doesn't pollute the player's move count.
    const prevMoves = this.cube.totalMoves;
    const prevRecord = this.cube.recordHistory;
    this.cube.recordHistory = false;

    for (const m of moves) {
      if (!this.active) break;
      if (this.audio) this.audio.whoosh();
      await this.cube.move(m.face, m.dir, 280);
    }

    this.cube.totalMoves = prevMoves;
    this.cube.recordHistory = prevRecord;
    this.onMoveCountChange();

    this.playing = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '▶ Play';
    }
  }

  resetCube() {
    if (this.cube.animating || this.playing) return;
    this.cube.reset();
    this.onMoveCountChange();
  }
}
