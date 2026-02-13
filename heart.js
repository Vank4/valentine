// heart.js (FULL)

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: true });

// ========= Utility =========
const DPR = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};
const dot = (ax, ay, bx, by) => ax * bx + ay * by;

function resize() {
  const dpr = DPR();
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  // draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ========= Heart Curve (parametric) =========
function heartPoint(t) {
  const s = Math.sin(t);
  const c = Math.cos(t);

  let x = 16 * s * s * s;
  let y = 13 * c - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);

  // --- BO GÓC DƯỚI ---
  if (y < -14) {
    const soften = (Math.abs(y) - 14) * 0.6;
    y += soften;
  }

  return { x, y };
}

// sample heart outline points
const outline = [];
const N = 1200; // tăng resolution cho normal mượt hơn
for (let i = 0; i < N; i++) {
  const t = (i / N) * Math.PI * 2;
  outline.push(heartPoint(t));
}

// ========= Particle System =========
class Particle {
  constructor(layer) {
    this.layer = layer; // "core" or "aura"
    this.reset(true);
  }

  reset(initial = false) {
    this.life = rand(0.7, 1.8);
    this.age = initial ? rand(0, this.life) : 0;

    // base size
    this.size = this.layer === "core" ? rand(0.8, 2.0) : rand(0.6, 1.6);

    // tone
    this.hue = rand(332, 355);
    this.sat = rand(72, 96);
    this.light = this.layer === "core" ? rand(56, 70) : rand(50, 64);
    this.twinkle = rand(0.7, 1.35);

    // drift
    this.vx = rand(-0.25, 0.25);
    this.vy = rand(-0.25, 0.25);

    // ---- Position ----
    if (this.layer === "core") {
      const i = (Math.random() * N) | 0;
      const t = (i / N) * Math.PI * 2;

      const p0 = heartPoint(t);
      const p1 = heartPoint(t + 0.004);

      const tx0 = p1.x - p0.x;
      const ty0 = p1.y - p0.y;
      const lenT = Math.hypot(tx0, ty0) || 1;
      const tdx = tx0 / lenT;
      const tdy = ty0 / lenT;

      let nx = -tdy;
      let ny = tdx;

      if (nx * -p0.x + ny * -p0.y < 0) {
        nx = -nx;
        ny = -ny;
      }

      const gamma = 2.6;
      const u = Math.random();
      const depthN = Math.pow(u, gamma);

      const maxDepth = rand(3, 11);
      const depth = depthN * maxDepth;

      // jitter mạnh hơn theo tangent để phá chồng
      const spread = rand(-1, 1) * (0.8 + depth * 0.25);

      this.baseX = p0.x + nx * depth + tdx * spread;
      this.baseY = p0.y + ny * depth + tdy * spread;

      this.depth01 = depth / maxDepth;
    } else {
      // Aura: viền mỏng ngoài
      const p = outline[(Math.random() * outline.length) | 0];
      const thickness = rand(0.9, 2.8);
      const ang = rand(0, Math.PI * 2);
      const jx = Math.cos(ang) * thickness;
      const jy = Math.sin(ang) * thickness;

      this.baseX = p.x + jx;
      this.baseY = p.y + jy;

      this.depth01 = 0;
    }
  }

  step(dt, beat, world) {
    this.age += dt;
    if (this.age >= this.life) this.reset();

    const t = this.age / this.life;
    const fade = Math.sin(Math.PI * t); // 0->1->0

    const coreScale = 1 + world.coreBeatScale * beat;
    const auraScale = 1 + world.auraMicroScale * beat;
    const scale = this.layer === "core" ? coreScale : auraScale;

    // flip y
    let x = this.baseX * scale;
    let y = -this.baseY * scale;

    // subtle drift
    x += this.vx * (t - 0.5) * 2;
    y += this.vy * (t - 0.5) * 2;

    const sx = world.cx + x * world.scale;
    const sy = world.cy + y * world.scale;

    // alpha:
    // Core: alpha giảm dần vào tâm theo depth01
    // Aura: alpha mạnh theo beat
    let a;
    if (this.layer === "core") {
      const edge = 1 - (this.depth01 || 0); // 1 ở viền
      const depthFade = 0.12 + 0.88 * Math.pow(edge, 0.7);
      a = (0.18 + 0.22 * beat) * fade * this.twinkle * depthFade;
    } else {
      a = (0.06 + 0.34 * beat) * fade * this.twinkle;
    }

    a = clamp(a, 0, 1);
    return { sx, sy, a };
  }

  draw(out, world, beat) {
    const { sx, sy, a } = out;
    if (a <= 0.001) return;

    const isCore = this.layer === "core";
    let r = this.size * (0.8 + Math.random() * 0.6);

    // Core: sâu hơn -> nhỏ hơn (giống mẫu: hạt trong tâm nhỏ/mờ)
    if (isCore) {
      const edge = 1 - (this.depth01 || 0);
      r *= 0.65 + 0.55 * Math.pow(edge, 0.75);
    }

    // glow gradient
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4.2);
    const c1 = `hsla(${this.hue}, ${this.sat}%, ${this.light}%, ${a})`;
    const c2 = `hsla(${this.hue}, ${this.sat}%, ${this.light}%, ${a * 0.35})`;
    const c3 = `hsla(${this.hue}, ${this.sat}%, ${this.light}%, 0)`;
    g.addColorStop(0.0, c1);
    g.addColorStop(0.25, c2);
    g.addColorStop(1.0, c3);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 4.2, 0, Math.PI * 2);
    ctx.fill();

    // sparkle dot
    ctx.fillStyle = `hsla(${this.hue}, ${this.sat}%, ${
      this.light + 10
    }%, ${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ========= World / Params =========
const world = {
  cx: innerWidth / 2,
  cy: innerHeight / 2,
  scale: 14,
  coreBeatScale: 0.07,
  auraMicroScale: 0.004,
  bgFade: 0.1,
  coreCount: 3000, // tăng chút cho core mịn
  auraCount: 5200,
  bpm: 78,
};

function fit() {
  world.cx = innerWidth / 2;
  world.cy = innerHeight / 2;
  const minSide = Math.min(innerWidth, innerHeight);
  world.scale = minSide / 42;
}
window.addEventListener("resize", fit);
fit();

// ========= Build particles =========
const core = Array.from(
  { length: world.coreCount },
  () => new Particle("core"),
);
const aura = Array.from(
  { length: world.auraCount },
  () => new Particle("aura"),
);

// ========= Heartbeat function =========
function heartbeat(timeSec, bpm) {
  const beatsPerSec = bpm / 60;
  const phase = (timeSec * beatsPerSec) % 1;

  const peak1 = Math.exp(-Math.pow((phase - 0.1) / 0.05, 2));
  const peak2 = Math.exp(-Math.pow((phase - 0.26) / 0.08, 2)) * 0.55;

  const base = 0.05;
  const b = clamp(base + peak1 + peak2, 0, 1);
  return Math.pow(b, 0.75);
}

// ========= Render Loop =========
let last = performance.now();

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const t = now / 1000;
  const beat = heartbeat(t, world.bpm);

  // background fade
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(5,6,10, ${world.bgFade})`;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // vignette
  const vg = ctx.createRadialGradient(
    world.cx,
    world.cy,
    innerWidth * 0.05,
    world.cx,
    world.cy,
    innerWidth * 0.75,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // additive glow
  ctx.globalCompositeOperation = "lighter";

  // Aura first
  const auraVisibility = lerp(0.55, 1.0, beat);
  const auraDrawN = Math.floor(aura.length * auraVisibility);
  for (let i = 0; i < auraDrawN; i++) {
    const p = aura[i];
    const out = p.step(dt, beat, world);
    p.draw(out, world, beat);
  }

  // Core
  for (let i = 0; i < core.length; i++) {
    const p = core[i];
    const out = p.step(dt, beat, world);
    p.draw(out, world, beat);
  }

  requestAnimationFrame(tick);
}

// start
ctx.fillStyle = "#05060a";
ctx.fillRect(0, 0, innerWidth, innerHeight);
requestAnimationFrame(tick);

// click change bpm
window.addEventListener("click", () => {
  world.bpm = clamp(world.bpm + rand(-10, 10), 55, 110);
});
