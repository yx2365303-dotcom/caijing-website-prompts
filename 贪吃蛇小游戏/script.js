(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const elScore = document.getElementById("score");
  const elBest = document.getElementById("bestScore");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayHint = document.getElementById("overlayHint");

  const btnStart = document.getElementById("btnStart");
  const btnRestart = document.getElementById("btnRestart");
  const btnPause = document.getElementById("btnPause");
  const btnNew = document.getElementById("btnNew");

  const selSpeed = document.getElementById("speed");
  const selWalls = document.getElementById("walls");

  const gridSize = 28;
  const cell = Math.floor(canvas.width / gridSize);

  const STORAGE_KEY = "snake_bestScore_v1";

  /** @typedef {{x:number,y:number}} Point */

  /** @returns {number} */
  function loadBest() {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY) || "0");
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }

  /** @param {number} v */
  function saveBest(v) {
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // ignore
    }
  }

  const state = {
    running: false,
    paused: false,
    gameOver: false,

    baseTickMs: Number(selSpeed.value),
    tickMs: Number(selSpeed.value),

    walls: selWalls.value, // 'wrap' | 'solid'

    score: 0,
    bestScore: loadBest(),

    /** @type {Point[]} */
    snake: [],
    /** @type {Point} */
    food: { x: 0, y: 0 },

    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },

    lastStepAt: 0,
    rafId: 0,
  };

  elBest.textContent = String(state.bestScore);

  function showOverlay(title, hint) {
    overlayTitle.textContent = title;
    overlayHint.textContent = hint;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function randInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }

  /** @param {Point[]} snake */
  function placeFood(snake) {
    const occupied = new Set(snake.map(p => `${p.x},${p.y}`));

    // 安全兜底：最多尝试 N 次，避免极端情况下死循环
    for (let i = 0; i < 2000; i++) {
      const x = randInt(gridSize);
      const y = randInt(gridSize);
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        state.food = { x, y };
        return;
      }
    }

    // 如果真满了（理论上胜利），就放回 0,0
    state.food = { x: 0, y: 0 };
  }

  function resetGame() {
    state.running = false;
    state.paused = false;
    state.gameOver = false;

    state.baseTickMs = Number(selSpeed.value);
    state.tickMs = state.baseTickMs;

    state.walls = selWalls.value;

    state.score = 0;
    elScore.textContent = "0";

    const startX = Math.floor(gridSize / 2);
    const startY = Math.floor(gridSize / 2);

    state.snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];

    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };

    placeFood(state.snake);

    state.lastStepAt = 0;

    showOverlay("准备开始", "按 Enter 开始，空格暂停");
    draw();
  }

  function startOrResume() {
    if (state.gameOver) {
      resetGame();
    }

    state.running = true;
    state.paused = false;
    hideOverlay();

    if (!state.rafId) {
      state.lastStepAt = performance.now();
      state.rafId = requestAnimationFrame(loop);
    }
  }

  function pauseToggle() {
    if (!state.running || state.gameOver) return;

    state.paused = !state.paused;
    if (state.paused) {
      showOverlay("已暂停", "按空格继续，或点击继续");
    } else {
      hideOverlay();
      state.lastStepAt = performance.now();
    }
  }

  function gameOver(reason) {
    state.gameOver = true;
    state.running = false;
    state.paused = false;

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      elBest.textContent = String(state.bestScore);
      saveBest(state.bestScore);
    }

    showOverlay("游戏结束", reason + "  按 R 重新开始");
  }

  /** @param {{x:number,y:number}} d */
  function setNextDir(d) {
    // 禁止直接反向
    if (d.x === -state.dir.x && d.y === -state.dir.y) return;
    if (d.x === state.dir.x && d.y === state.dir.y) return;
    state.nextDir = d;
  }

  function step() {
    state.dir = state.nextDir;

    const head = state.snake[0];
    let nx = head.x + state.dir.x;
    let ny = head.y + state.dir.y;

    if (state.walls === "wrap") {
      nx = (nx + gridSize) % gridSize;
      ny = (ny + gridSize) % gridSize;
    } else {
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) {
        gameOver("撞墙了。");
        return;
      }
    }

    const nextHead = { x: nx, y: ny };

    // 自己咬自己
    for (let i = 0; i < state.snake.length; i++) {
      const p = state.snake[i];
      if (p.x === nextHead.x && p.y === nextHead.y) {
        gameOver("咬到自己了。");
        return;
      }
    }

    state.snake.unshift(nextHead);

    const ate = nextHead.x === state.food.x && nextHead.y === state.food.y;
    if (ate) {
      state.score += 10;
      elScore.textContent = String(state.score);

      // 吃到食物后轻微加速，但不突破下限
      state.tickMs = Math.max(45, Math.floor(state.tickMs * 0.98));

      placeFood(state.snake);
    } else {
      state.snake.pop();
    }
  }

  function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景渐变
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "rgba(110,231,255,0.08)");
    g.addColorStop(0.45, "rgba(167,139,250,0.06)");
    g.addColorStop(1, "rgba(251,113,133,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    for (let i = 1; i < gridSize; i++) {
      const p = i * cell;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(canvas.width, p);
      ctx.stroke();
    }
  }

  /** @param {number} x */
  function px(x) {
    return x * cell;
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawFood() {
    const x = px(state.food.x);
    const y = px(state.food.y);

    const r = Math.floor(cell * 0.33);
    const cx = x + cell / 2;
    const cy = y + cell / 2;

    // 外圈辉光
    ctx.save();
    ctx.shadowColor = "rgba(110,231,255,0.55)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(110,231,255,0.25)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 实心食物
    const g = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, r + 4);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#6ee7ff");
    g.addColorStop(1, "#a78bfa");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawSnake() {
    for (let i = state.snake.length - 1; i >= 0; i--) {
      const p = state.snake[i];
      const x = px(p.x);
      const y = px(p.y);

      const isHead = i === 0;

      const base = isHead ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.68)";
      const accent = isHead ? "rgba(110,231,255,0.95)" : "rgba(167,139,250,0.62)";

      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      g.addColorStop(0, accent);
      g.addColorStop(1, base);

      ctx.fillStyle = g;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;

      const pad = 2;
      roundRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, 10);
      ctx.fill();
      ctx.stroke();

      if (isHead) {
        // 眼睛
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const ex1 = x + cell * 0.35;
        const ex2 = x + cell * 0.65;
        const ey = y + cell * 0.42;
        ctx.beginPath();
        ctx.arc(ex1, ey, 2.6, 0, Math.PI * 2);
        ctx.arc(ex2, ey, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function draw() {
    drawBackground();
    drawFood();
    drawSnake();

    // 信息条
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0, 0, canvas.width, 34);

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "600 13px ui-sans-serif, system-ui";
    const mode = state.walls === "wrap" ? "穿墙" : "撞墙死";
    const status = state.gameOver ? "结束" : (state.paused ? "暂停" : (state.running ? "进行中" : "未开始"));
    ctx.fillText(`状态：${status}   模式：${mode}   速度(ms)：${Math.round(state.tickMs)}`, 10, 22);
  }

  /** @param {number} t */
  function loop(t) {
    state.rafId = requestAnimationFrame(loop);

    if (!state.running || state.paused || state.gameOver) {
      draw();
      return;
    }

    const dt = t - state.lastStepAt;
    if (dt >= state.tickMs) {
      // 防止长帧导致跳步过多
      state.lastStepAt = t;
      step();
    }

    draw();
  }

  function attachEvents() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();

      if (k === " " || k === "spacebar") {
        e.preventDefault();
        pauseToggle();
        return;
      }

      if (k === "enter") {
        e.preventDefault();
        startOrResume();
        return;
      }

      if (k === "r") {
        e.preventDefault();
        resetGame();
        return;
      }

      if (!state.running && !state.gameOver) {
        // 未开始时也允许按方向键，然后 Enter 开始
      }

      if (k === "arrowup" || k === "w") setNextDir({ x: 0, y: -1 });
      else if (k === "arrowdown" || k === "s") setNextDir({ x: 0, y: 1 });
      else if (k === "arrowleft" || k === "a") setNextDir({ x: -1, y: 0 });
      else if (k === "arrowright" || k === "d") setNextDir({ x: 1, y: 0 });
    });

    btnStart.addEventListener("click", () => startOrResume());
    btnRestart.addEventListener("click", () => resetGame());
    btnPause.addEventListener("click", () => pauseToggle());
    btnNew.addEventListener("click", () => resetGame());

    selSpeed.addEventListener("change", () => {
      state.baseTickMs = Number(selSpeed.value);
      // 如果正在跑，按当前档位重置 tick（但仍会在吃到食物后轻微加速）
      state.tickMs = state.baseTickMs;
    });

    selWalls.addEventListener("change", () => {
      state.walls = selWalls.value;
    });

    // 触控方向键
    document.querySelectorAll(".pad").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-dir");
        if (dir === "up") setNextDir({ x: 0, y: -1 });
        if (dir === "down") setNextDir({ x: 0, y: 1 });
        if (dir === "left") setNextDir({ x: -1, y: 0 });
        if (dir === "right") setNextDir({ x: 1, y: 0 });
      });
    });

    // 触控滑动
    let touchStart = null;
    canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < 18) return;

      if (adx > ady) {
        setNextDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      } else {
        setNextDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
      }
    }, { passive: true });
  }

  attachEvents();
  resetGame();
})();
