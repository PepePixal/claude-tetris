'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#8b0000', // J - dark red
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca gris
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (nut)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const QUEUE_PREVIEW = 5;
const ENERGY_MAX = 100;

const GRID_COLORS = { dark: '#22222e', light: '#dde1f0' };
const THEME_KEY = 'tetris-theme';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const energyFill = document.getElementById('energy-fill');
const abilityOverlay = document.getElementById('ability-overlay');
const abilityButtons = document.querySelectorAll('.ability-btn');
const queuePanel = document.getElementById('queue-panel');
const queueCanvas = document.getElementById('queue-canvas');
const queueCtx = queueCanvas.getContext('2d');
const holdPanel = document.getElementById('hold-panel');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme, gridColor;
// Ability system state
let energy, pieceQueue, showQueue, holdPiece, holdUnlocked, holdUsed;
let lastBoardSnapshot, abilityMenuOpen, slowTimeoutId;

function applyTheme(name) {
  theme = name;
  gridColor = GRID_COLORS[theme];
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function fillQueue() {
  while (pieceQueue.length < QUEUE_PREVIEW) pieceQueue.push(randomPiece());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    energy = Math.min(ENERGY_MAX, energy + cleared * 10);
    updateHUD();
    updateEnergyBar();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  // Snapshot the board before merging so the "undo" ability can restore it.
  lastBoardSnapshot = board.map(row => [...row]);
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  holdUsed = false;
  fillQueue();
  next = pieceQueue.shift();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  if (showQueue) drawQueue();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function updateEnergyBar() {
  energyFill.style.width = energy + '%';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawQueue() {
  const QB = 20;
  const slotRows = 4;
  queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  for (let i = 0; i < QUEUE_PREVIEW && i < pieceQueue.length; i++) {
    const shape = pieceQueue[i].shape;
    const offX = Math.floor((4 - shape[0].length) / 2);
    const offY = i * slotRows + Math.floor((slotRows - shape.length) / 2);
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        drawBlock(queueCtx, offX + c, offY + r, shape[r][c], QB);
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (holdPiece === null) return;
  const HB = 30;
  const shape = PIECES[holdPiece];
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], HB);
}

// ---- Ability system ----

function openAbilityMenu() {
  if (energy < ENERGY_MAX || gameOver || paused || abilityMenuOpen) return;
  abilityMenuOpen = true;
  cancelAnimationFrame(animId);
  abilityOverlay.classList.remove('hidden');
}

function closeAbilityMenu() {
  abilityMenuOpen = false;
  abilityOverlay.classList.add('hidden');
  if (!paused && !gameOver) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function holdSwap() {
  if (!holdUnlocked || holdUsed || gameOver || paused) return;
  holdUsed = true;
  const curType = current.type;
  if (holdPiece === null) {
    holdPiece = curType;
    current = next;
    fillQueue();
    next = pieceQueue.shift();
    drawNext();
    if (showQueue) drawQueue();
  } else {
    const swapType = holdPiece;
    holdPiece = curType;
    const shape = PIECES[swapType].map(row => [...row]);
    current = { type: swapType, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
  }
  if (collide(current.shape, current.x, current.y)) endGame();
  drawHold();
}

function activateAbility(id) {
  if (!abilityMenuOpen) return;
  switch (id) {
    case 1:
      // Reveal the extended piece-queue preview panel for the rest of the game.
      showQueue = true;
      queuePanel.classList.remove('hidden');
      drawQueue();
      break;
    case 2: {
      // Swap the current piece for a different random type from the pool.
      let type;
      do {
        type = Math.floor(Math.random() * 8) + 1;
      } while (type === current.type);
      const shape = PIECES[type].map(row => [...row]);
      current.type = type;
      current.shape = shape;
      current.x = Math.floor(COLS / 2) - Math.floor(shape[0].length / 2);
      current.y = 0;
      // The swapped shape may not fit at spawn position against locked blocks.
      if (collide(current.shape, current.x, current.y)) endGame();
      break;
    }
    case 3:
      // Double the drop interval for 10 seconds, then restore it for the current level.
      // Guard against re-activating mid-effect stacking the multiplier further.
      if (slowTimeoutId) {
        clearTimeout(slowTimeoutId);
      } else {
        dropInterval *= 2;
      }
      slowTimeoutId = setTimeout(() => {
        dropInterval = Math.max(100, 1000 - (level - 1) * 90);
        slowTimeoutId = null;
      }, 10000);
      break;
    case 4:
      // Restore the board to the state right before the last piece was locked.
      // Note: score/lines/level/dropInterval are intentionally NOT reverted (kept simple);
      // only the board grid is rolled back.
      if (lastBoardSnapshot) {
        board = lastBoardSnapshot.map(row => [...row]);
        lastBoardSnapshot = null;
        // The already-spawned current piece was validated against the newer
        // (post-clear) board; re-check it against the restored one.
        if (collide(current.shape, current.x, current.y)) endGame();
      }
      break;
    case 5:
      // Unlock the hold feature (dedicated key C) and hold the current piece now.
      holdUnlocked = true;
      holdPanel.classList.remove('hidden');
      holdSwap();
      break;
  }
  energy = 0;
  updateEnergyBar();
  closeAbilityMenu();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  energy = 0;
  pieceQueue = [];
  showQueue = false;
  holdPiece = null;
  holdUnlocked = false;
  holdUsed = false;
  lastBoardSnapshot = null;
  abilityMenuOpen = false;
  if (slowTimeoutId) {
    clearTimeout(slowTimeoutId);
    slowTimeoutId = null;
  }
  fillQueue();
  next = pieceQueue.shift();
  spawn();
  updateHUD();
  updateEnergyBar();
  queuePanel.classList.add('hidden');
  holdPanel.classList.add('hidden');
  drawHold();
  overlay.classList.add('hidden');
  abilityOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (abilityMenuOpen) {
    switch (e.code) {
      case 'Digit1': case 'Numpad1': activateAbility(1); break;
      case 'Digit2': case 'Numpad2': activateAbility(2); break;
      case 'Digit3': case 'Numpad3': activateAbility(3); break;
      case 'Digit4': case 'Numpad4': activateAbility(4); break;
      case 'Digit5': case 'Numpad5': activateAbility(5); break;
      case 'Escape': closeAbilityMenu(); break;
    }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyE') { openAbilityMenu(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
      holdSwap();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

abilityButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    activateAbility(Number(btn.dataset.ability));
  });
});

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
init();
