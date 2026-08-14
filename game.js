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

// Power-up config: every POWERUP_LINE_INTERVAL cleared lines, the next
// spawned piece has POWERUP_CHANCE probability of carrying a power-up.
const POWERUP_TYPES = ['bomb', 'lightning', 'dye', 'gravity', 'freeze'];
const POWERUP_LINE_INTERVAL = 5;
const POWERUP_CHANCE = 0.2;
const POWERUP_NAMES = {
  bomb: 'BOMBA',
  lightning: 'RAYO',
  dye: 'TINTE',
  gravity: 'GRAVEDAD',
  freeze: 'CONGELAR',
};
const POWERUP_FREEZE_MS = 5000;

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
const powerupEl = document.getElementById('powerup-indicator');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme, gridColor;
let powerUpMilestone, wildcardColor, freezeRemaining;

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
  const piece = {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
    powerUp: null,
  };
  return maybeAssignPowerUp(piece);
}

// Rolls a power-up assignment once per POWERUP_LINE_INTERVAL milestone of
// cleared lines. Only fires once per milestone crossing, regardless of
// whether the roll succeeds, so pieces aren't re-rolled every spawn.
function maybeAssignPowerUp(piece) {
  const milestone = Math.floor(lines / POWERUP_LINE_INTERVAL);
  if (milestone > 0 && milestone > powerUpMilestone) {
    powerUpMilestone = milestone;
    if (Math.random() < POWERUP_CHANCE) {
      piece.powerUp = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    }
  }
  return piece;
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

// Removes a single row from the board and reinserts an empty one at the top.
function removeRow(r) {
  board.splice(r, 1);
  board.unshift(new Array(COLS).fill(0));
}

function clearLines() {
  let cleared = 0;
  let wildcardUsed = false;
  for (let r = ROWS - 1; r >= 0; r--) {
    const full = board[r].every(v => v !== 0);
    // Dye power-up: any row containing a wildcard-colored block also
    // counts as completed, even if it still has empty cells.
    const wildcardHit = wildcardColor !== null && board[r].includes(wildcardColor);
    if (full || wildcardHit) {
      if (wildcardHit && !full) wildcardUsed = true;
      removeRow(r);
      cleared++;
      r++;
    }
  }
  // Dye is a one-shot effect: once it has helped complete a line, drop the
  // wildcard marking so it doesn't trivialize every future clear forever.
  if (wildcardUsed) wildcardColor = null;
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
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
  const powerUp = current.powerUp;
  const px = current.x;
  const py = current.y;
  const pShape = current.shape;
  merge();
  if (powerUp) applyPowerUp(powerUp, px, py, pShape);
  clearLines();
  spawn();
}

// Triggers the effect for a power-up piece that just locked into the board.
// px/py/pShape describe the piece's bounding box at lock time (before merge
// mutates `current`), used by effects that need the landing position.
function applyPowerUp(type, px, py, pShape) {
  switch (type) {
    case 'bomb': {
      const cx = px + Math.floor(pShape[0].length / 2);
      const cy = py + Math.floor(pShape.length / 2);
      for (let r = cy - 1; r <= cy + 1; r++) {
        if (r < 0 || r >= ROWS) continue;
        for (let c = cx - 1; c <= cx + 1; c++) {
          if (c < 0 || c >= COLS) continue;
          board[r][c] = 0;
        }
      }
      break;
    }
    case 'lightning': {
      const targetRow = Math.min(ROWS - 1, py + pShape.length - 1);
      removeRow(targetRow);
      score += 50;
      break;
    }
    case 'dye': {
      const counts = {};
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) counts[board[r][c]] = (counts[board[r][c]] || 0) + 1;
      const colors = Object.keys(counts);
      if (colors.length) {
        wildcardColor = Number(colors.reduce((a, b) => (counts[a] >= counts[b] ? a : b)));
      }
      break;
    }
    case 'gravity': {
      for (let c = 0; c < COLS; c++) {
        const colVals = [];
        for (let r = 0; r < ROWS; r++)
          if (board[r][c]) colVals.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--)
          board[r][c] = colVals.length ? colVals.pop() : 0;
      }
      break;
    }
    case 'freeze': {
      freezeRemaining = POWERUP_FREEZE_MS;
      break;
    }
  }
  updateHUD();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  updatePowerUpIndicator();
  drawNext();
}

function updatePowerUpIndicator() {
  if (!powerupEl) return;
  const active = !!current.powerUp;
  powerupEl.textContent = active ? POWERUP_NAMES[current.powerUp] : '-';
  powerupEl.classList.toggle('active', active);
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha, powerUp) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (powerUp) {
    context.save();
    context.shadowColor = '#fff176';
    context.shadowBlur = 10;
    context.strokeStyle = '#fff176';
    context.lineWidth = 2;
    context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    context.restore();
  }
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
  canvas.classList.toggle('frozen', freezeRemaining > 0);
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
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2, !!current.powerUp);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, undefined, !!current.powerUp);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, undefined, !!next.powerUp);
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
  if (freezeRemaining > 0) {
    // Freeze power-up: suspend the drop timer, piece stays controllable.
    freezeRemaining = Math.max(0, freezeRemaining - dt);
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
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
  powerUpMilestone = 0;
  wildcardColor = null;
  freezeRemaining = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
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
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
init();
