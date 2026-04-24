const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const W = canvas.width;
const H = canvas.height;

const state = {
  running: false,
  paused: false,
  score: 0,
  lives: 3,
  level: 1,
  keys: new Set(),
  particles: [],
  impacts: [],
};

const paddle = {
  w: 140,
  h: 18,
  x: W / 2 - 70,
  y: H - 46,
  vx: 0,
  maxSpeed: 900,
  accel: 2700,
  friction: 0.84,
};

const ball = {
  r: 9,
  x: W / 2,
  y: H - 72,
  vx: 300,
  vy: -430,
  spin: 0,
  maxSpeed: 900,
};

let bricks = [];

function initBricks() {
  bricks = [];
  const rows = 7;
  const cols = 13;
  const gap = 7;
  const pad = 38;
  const bw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const bh = 24;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tier = Math.min(4, 1 + Math.floor((row + state.level - 1) / 2));
      bricks.push({
        x: pad + col * (bw + gap),
        y: 72 + row * (bh + gap),
        w: bw,
        h: bh,
        hp: tier,
        maxHp: tier,
      });
    }
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resetBall(anchorToPaddle = true) {
  ball.x = paddle.x + paddle.w / 2;
  ball.y = paddle.y - ball.r - 1;
  ball.vx = 280 * (Math.random() > 0.5 ? 1 : -1);
  ball.vy = -430;
  ball.spin = 0;
  if (!anchorToPaddle) {
    state.running = true;
    hideOverlay();
  }
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function startGame() {
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  updateHud();
  paddle.x = W / 2 - paddle.w / 2;
  paddle.vx = 0;
  initBricks();
  state.running = true;
  state.paused = false;
  state.particles.length = 0;
  state.impacts.length = 0;
  resetBall(false);
}

function updateHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  levelEl.textContent = state.level;
}

function spawnSparks(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 280;
    state.particles.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0.6 + Math.random() * 0.4,
      ttl: 0.6 + Math.random() * 0.4,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

function addImpact(x, y) {
  state.impacts.push({ x, y, r: 2, ttl: 0.22, life: 0.22 });
}

function colorForHp(hp) {
  return ["#ff8a7a", "#ffd166", "#82f7a5", "#61dbff", "#b39bff"][hp - 1] ?? "#ffffff";
}

function handlePaddle(dt) {
  let input = 0;
  if (state.keys.has("ArrowLeft") || state.keys.has("KeyA")) input -= 1;
  if (state.keys.has("ArrowRight") || state.keys.has("KeyD")) input += 1;

  paddle.vx += input * paddle.accel * dt;
  paddle.vx *= paddle.friction;
  paddle.vx = clamp(paddle.vx, -paddle.maxSpeed, paddle.maxSpeed);

  paddle.x += paddle.vx * dt;
  paddle.x = clamp(paddle.x, 0, W - paddle.w);
}

function handleBall(dt) {
  // spin adds slight Magnus-like side force for more realistic curve
  ball.vx += ball.spin * 120 * dt;

  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > ball.maxSpeed) {
    const ratio = ball.maxSpeed / speed;
    ball.vx *= ratio;
    ball.vy *= ratio;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // wall collision
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
    ball.spin *= 0.85;
    addImpact(ball.x, ball.y);
  } else if (ball.x + ball.r > W) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx);
    ball.spin *= 0.85;
    addImpact(ball.x, ball.y);
  }

  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
    addImpact(ball.x, ball.y);
  }

  if (ball.y - ball.r > H) {
    state.lives -= 1;
    updateHud();
    if (state.lives <= 0) {
      state.running = false;
      showOverlay("GAME OVER", "クリックで再スタート");
      return;
    }
    resetBall();
    state.running = false;
    showOverlay("ミス!", "クリックで続行");
    return;
  }

  // paddle collision (continuous-style from previous position is simplified)
  if (
    ball.y + ball.r >= paddle.y &&
    ball.y - ball.r <= paddle.y + paddle.h &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.w &&
    ball.vy > 0
  ) {
    const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const bounceAngle = rel * (Math.PI * 0.37);
    const speedNow = clamp(Math.hypot(ball.vx, ball.vy) * 1.02, 360, ball.maxSpeed);

    ball.vx = Math.sin(bounceAngle) * speedNow + paddle.vx * 0.25;
    ball.vy = -Math.abs(Math.cos(bounceAngle) * speedNow);
    ball.spin = clamp(rel * 4 + paddle.vx / 500, -6, 6);
    ball.y = paddle.y - ball.r - 0.5;

    spawnSparks(ball.x, ball.y, "#80d8ff", 10);
    addImpact(ball.x, ball.y);
  }

  // brick collisions
  for (const brick of bricks) {
    if (brick.hp <= 0) continue;

    const nearestX = clamp(ball.x, brick.x, brick.x + brick.w);
    const nearestY = clamp(ball.y, brick.y, brick.y + brick.h);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;

    if (dx * dx + dy * dy <= ball.r * ball.r) {
      // determine collision normal axis
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }

      brick.hp -= 1;
      state.score += brick.hp <= 0 ? 120 : 40;
      updateHud();

      const c = colorForHp(Math.max(1, brick.hp));
      spawnSparks(ball.x, ball.y, c, brick.hp <= 0 ? 22 : 10);
      addImpact(ball.x, ball.y);

      ball.vx += ball.spin * 30;
      ball.spin *= 0.94;

      break;
    }
  }

  if (bricks.every((b) => b.hp <= 0)) {
    state.level += 1;
    updateHud();
    initBricks();
    resetBall();
    state.running = false;
    showOverlay(`LEVEL ${state.level}`, "クリックで開始");
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 580 * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
  }

  for (let i = state.impacts.length - 1; i >= 0; i--) {
    const ring = state.impacts[i];
    ring.life -= dt;
    if (ring.life <= 0) {
      state.impacts.splice(i, 1);
      continue;
    }
    ring.r += 240 * dt;
  }
}

function drawBackgroundGrid() {
  ctx.save();
  ctx.strokeStyle = "#22456a44";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBackgroundGrid();

  // bricks
  for (const brick of bricks) {
    if (brick.hp <= 0) continue;
    const color = colorForHp(brick.hp);
    const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.h);
    grad.addColorStop(0, "#ffffff22");
    grad.addColorStop(1, color + "AA");

    ctx.fillStyle = grad;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 6);
    ctx.fill();
    ctx.stroke();

    if (brick.maxHp > 1) {
      ctx.fillStyle = "#eaf6ff";
      ctx.font = "12px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(String(brick.hp), brick.x + brick.w / 2, brick.y + 16);
    }
  }

  // paddle
  const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  paddleGrad.addColorStop(0, "#ecf6ff");
  paddleGrad.addColorStop(1, "#4ea8ff");
  ctx.fillStyle = paddleGrad;
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 8);
  ctx.fill();

  // ball shadow
  ctx.fillStyle = "#00000066";
  ctx.beginPath();
  ctx.ellipse(ball.x + 4, ball.y + 8, ball.r * 0.9, ball.r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();

  // ball
  const ballGrad = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 2, ball.x, ball.y, ball.r + 2);
  ballGrad.addColorStop(0, "#fff");
  ballGrad.addColorStop(0.4, "#b6fff9");
  ballGrad.addColorStop(1, "#3bc6ff");
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();

  // particles
  for (const p of state.particles) {
    const alpha = p.life / p.ttl;
    ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }

  // impact rings
  for (const ring of state.impacts) {
    const a = ring.life / ring.ttl;
    ctx.strokeStyle = `rgba(165, 220, 255, ${a * 0.7})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.paused) {
    ctx.fillStyle = "#030811aa";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W / 2, H / 2);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.018, (now - last) / 1000);
  last = now;

  if (!state.paused) {
    handlePaddle(dt);
    if (state.running) handleBall(dt);
    else {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
    }
    updateParticles(dt);
  }

  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) {
    state.keys.add(e.code);
    e.preventDefault();
  }

  if (e.code === "KeyP") {
    state.paused = !state.paused;
    if (!state.paused && !state.running && state.lives > 0) {
      showOverlay("クリックで再開", "ボールを再発射");
    }
  }
});

window.addEventListener("keyup", (e) => {
  state.keys.delete(e.code);
});

overlay.addEventListener("click", () => {
  if (state.lives <= 0 || state.score === 0 && bricks.length === 0) {
    startGame();
    return;
  }
  state.running = true;
  hideOverlay();
});

initBricks();
showOverlay("クリックで開始", "A/D または ←/→ で移動。Pで一時停止");
requestAnimationFrame(loop);
