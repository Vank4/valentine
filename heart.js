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
  bpm: 60,
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
  // ==========================
  // Sync letter-paper with heartbeat
  // ==========================

  const letterPaper = document.querySelector(".letter-paper");

  if (letterPaper && letterOverlay?.classList.contains("active")) {
    const pulseScale = 1 + beat * 0.05;

    letterPaper.style.transform = `scale(${pulseScale})`;

    letterPaper.style.boxShadow = `
    0 40px 120px rgba(0,0,0,0.55),
    0 0 ${60 + beat * 80}px rgba(255, 0, 120, ${0.2 + beat * 0.4})
  `;
  } else if (letterPaper) {
    letterPaper.style.transform = "scale(1)";
    letterPaper.style.boxShadow = `
    0 40px 120px rgba(0,0,0,0.55),
    0 0 90px rgba(255,0,120,0.18)
  `;
  } else if (letterEnvelope) {
    letterEnvelope.style.transform = "scale(1)";
    letterEnvelope.style.filter = "none";
  }

  // background fade
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(5,6,10, ${world.bgFade})`;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.restore();

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
  vg.addColorStop(1, "rgba(0,0,0,0.15)");
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

// ==========================
// Floating animation setup
// ==========================

const images = document.querySelectorAll(".bg-layer img");

function layoutImagesInLanes() {
  const lanes = 6;
  const laneHeight = window.innerHeight / lanes;

  images.forEach((img, index) => {
    const duration = 25 + Math.random() * 20; // 25–45s
    const delay = -Math.random() * duration;

    img.style.animationDuration = duration + "s";
    img.style.animationDelay = delay + "s";

    const laneIndex = index % lanes;
    const offsetY = laneIndex * laneHeight + laneHeight / 2 - 90; // 90 = nửa chiều cao ảnh
    img.style.top = offsetY + "px";
  });
}

layoutImagesInLanes();
window.addEventListener("resize", layoutImagesInLanes);

let currentExpanded = null;
const overlay = document.getElementById("imageOverlay");

images.forEach((img) => {
  img.addEventListener("click", (e) => {
    e.stopPropagation();

    // Nếu đã có ảnh đang mở thì đóng trước
    if (currentExpanded && currentExpanded !== img) {
      currentExpanded.classList.remove("expanded");
      currentExpanded.style.animationPlayState = "running";
    }

    currentExpanded = img;

    // Dừng animation chỉ ảnh này
    img.style.animationPlayState = "paused";

    img.classList.add("expanded");
    overlay.classList.add("active");
  });
});
overlay.addEventListener("click", () => {
  if (!currentExpanded) return;

  currentExpanded.classList.remove("expanded");

  // Cho ảnh chạy lại
  currentExpanded.style.animationPlayState = "running";

  overlay.classList.remove("active");
  currentExpanded = null;
});

/// ==========================
// Valentine Letter (3D Envelope) + Fireworks Words
// ==========================
const envelopeBtn = document.getElementById("envelopeBtn");
const bgAmbient = document.getElementById("bgAmbient");
const bgHighlight = document.getElementById("bgHighlight");

const letterOverlay = document.getElementById("letterOverlay");
const envelopeWrapper = document.getElementById("envelopeWrapper");
const letterEnvelope = document.getElementById("letterEnvelope");
const letterCloseBtn = document.getElementById("letterCloseBtn");
const typeTextEl = document.getElementById("typeText");
const floatingHeartsEl = document.getElementById("floatingHearts");
const floatingWords = document.getElementById("floatingWords");

// Danh sách câu để bắn ra
const WISHES = [
  "Happy Valentine’s Day ❤️",
  "Anh yêu em",
  "Cảm ơn em vì đã đến",
  "Mãi mãi bên nhau",
  "My only one",
  "Forever",
  "Thương em nhiều",
  "Bên em là nhà",
  "Hôm nay và mãi mãi",
  "You are my heart",

  // 💕 Ngọt ngào hơn
  "Em là điều đẹp nhất",
  "Yêu em hơn hôm qua",
  "Chỉ cần có em",
  "Em là bình yên",
  "Ở bên em là hạnh phúc",
  "Cảm ơn vì đã ở lại",
  "Em là định mệnh",
  "My forever girl",
  "My sunshine",
  "Always with you",

  // 💓 Lãng mạn sâu hơn
  "Nếu được chọn lại, anh vẫn chọn em",
  "Em là nhà",
  "Anh chọn em mỗi ngày",
  "Bên em mọi thứ đều dịu lại",
  "Em là lý do anh mỉm cười",
  "Cùng nhau già đi nhé",
  "Nắm tay nhau mãi nhé",
  "Em là điều anh tự hào nhất",
  "Anh thương em nhiều lắm",
  "Chỉ có em thôi",

  // 🌹 Thi vị hơn
  "Yêu em như cách tim đập",
  "Trái tim này là của em",
  "Em là ánh sáng của anh",
  "Em là điều kỳ diệu",
  "Vì em, mọi thứ đều đáng giá",
  "Love you endlessly",
  "With you, always",
  "Together forever",
  "You complete me",
  "My heart beats for you",

  // ✨ Nhẹ nhàng nhưng sâu
  "Cảm ơn vì đã chọn anh",
  "Mỗi ngày bên em là một món quà",
  "Anh trân trọng em",
  "Mãi ở cạnh nhau nhé",
  "Yêu em hơn cả những vì sao",
  "Chúng ta là của nhau",
  "Anh thuộc về em",
  "Em là giấc mơ anh giữ lại",
  "Chỉ cần em là đủ",
  "Mãi yêu em ❤️",
];

// Nội dung thư (typewriter)
const LETTER_MESSAGE =
  "Giữa hàng tỷ người ngoài kia,\n" +
  "anh vẫn tìm thấy em — và đó là điều may mắn nhất cuộc đời anh.\n\n" +
  "Cảm ơn em vì đã bước vào thế giới của anh,\n" +
  "ở lại, và làm nó trở nên dịu dàng hơn mỗi ngày.\n\n" +
  "Chỉ cần có em,\n" +
  "mọi điều còn lại đều không còn quá quan trọng.\n\n" +
  "Happy Valentine’s Day ❤️\n\n" +
  "— Người luôn yêu em";

// ===== Typewriter =====
function typeWriter(el, text, speed = 28) {
  if (!el) return;
  el.textContent = "";
  let i = 0;
  const timer = setInterval(() => {
    el.textContent += text[i] ?? "";
    i++;
    if (i >= text.length) clearInterval(timer);
  }, speed);
}

// ===== Heart reacts (boost bpm + stronger beat scale) =====
let bpmRestoreTimer = null;
function boostHeartOnOpen() {
  const originalBpm = world.bpm;
  const originalCoreBeatScale = world.coreBeatScale;

  world.bpm = 90;
  world.coreBeatScale = 0.14;

  if (bpmRestoreTimer) clearTimeout(bpmRestoreTimer);
  bpmRestoreTimer = setTimeout(() => {
    world.bpm = originalBpm;
    world.coreBeatScale = originalCoreBeatScale;
  }, 1500);
}

// ===== Popup floating hearts =====
function spawnPopupHearts() {
  if (!floatingHeartsEl) return;
  floatingHeartsEl.innerHTML = "";

  const count = 6;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.textContent = "💗";
    s.style.left = Math.random() * 100 + "%";
    s.style.bottom = (-10 - Math.random() * 40).toFixed(0) + "px";
    s.style.animationDelay = (Math.random() * 3).toFixed(2) + "s";
    s.style.animationDuration = (5.5 + Math.random() * 2.5).toFixed(2) + "s";
    floatingHeartsEl.appendChild(s);
  }
}

// ===== Open/Close letter =====
function openLetter(e) {
  e?.stopPropagation();

  if (!letterOverlay || !envelopeWrapper || !letterEnvelope) return;

  letterOverlay.classList.add("active");
  letterOverlay.setAttribute("aria-hidden", "false");
  envelopeWrapper.setAttribute("aria-hidden", "false");

  // mở nắp + trượt giấy (CSS sẽ dựa vào class "open")
  letterEnvelope.classList.add("open");

  // gõ chữ + tim phản ứng + tim rơi
  typeWriter(typeTextEl, LETTER_MESSAGE, 26);
  boostHeartOnOpen();
  spawnPopupHearts();

  // Ẩn nút phong bì nhỏ ở giữa khi mở
  if (envelopeBtn) envelopeBtn.style.opacity = "0";
}

function closeLetterAndFireworks(e) {
  e?.stopPropagation();

  if (!letterOverlay || !letterEnvelope) return;

  // đóng phong bì
  letterEnvelope.classList.remove("open");
  letterOverlay.classList.remove("active");
  letterOverlay.setAttribute("aria-hidden", "true");
  envelopeWrapper?.setAttribute("aria-hidden", "true");

  // hiện lại nút phong bì
  if (envelopeBtn) {
    envelopeBtn.style.opacity = "1";
    envelopeBtn.classList.add("pulse");
    setTimeout(() => envelopeBtn.classList.remove("pulse"), 1800);
  }
  // ==========================
  // Switch to highlight music
  // ==========================
  if (bgAmbient) {
    bgAmbient.pause();
  }

  if (bgHighlight) {
    bgHighlight.currentTime = 0;
    bgHighlight.volume = 0;
    bgHighlight.play().catch(() => {});

    // fade in highlight
    let v = 0;
    const fade = setInterval(() => {
      v += 0.05;
      if (v >= 0.7) {
        v = 0.7;
        clearInterval(fade);
      }
      bgHighlight.volume = v;
    }, 120);
  }

  // bắn pháo hoa chữ
  launchWishFireworks();
  // Sau khi bắn chữ xong -> hiện ảnh
  setTimeout(() => {
    const bgLayer = document.getElementById("bgLayer");
    if (bgLayer) bgLayer.classList.add("visible");
  }, 2500); // chờ chữ settle xong
}

// click ngoài overlay để đóng (nhưng click vào phong bì/paper thì không đóng)
if (letterOverlay) {
  letterOverlay.addEventListener("click", (e) => {
    if (e.target === letterOverlay) closeLetterAndFireworks(e);
  });
}

// nút đóng thư
if (letterCloseBtn)
  letterCloseBtn.addEventListener("click", closeLetterAndFireworks);

// click nút phong bì
if (envelopeBtn) envelopeBtn.addEventListener("click", openLetter);

// ESC to close
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && letterOverlay?.classList.contains("active")) {
    closeLetterAndFireworks(e);
  }
});

// ===== Fireworks words (giữ nguyên logic anh đang dùng) =====
function launchWishFireworks() {
  if (!floatingWords) return;

  const count = 18;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  const targetPositions = [];
  for (let i = 0; i < count; i++) {
    targetPositions.push({
      x: Math.random() * window.innerWidth * 0.9 + 20,
      y: Math.random() * window.innerHeight * 0.8 + 40,
    });
  }

  const createdWords = [];

  for (let i = 0; i < count; i++) {
    const text = WISHES[(Math.random() * WISHES.length) | 0];

    const span = document.createElement("span");
    span.className = "word burst";
    span.textContent = text;
    span.setAttribute("data-text", text);

    span.style.left = cx + "px";
    span.style.top = cy + "px";

    const ang = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 240;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;

    span.style.setProperty("--dx", dx + "px");
    span.style.setProperty("--dy", dy + "px");
    span.style.fontSize = 14 + Math.random() * 8 + "px";

    floatingWords.appendChild(span);
    createdWords.push(span);

    span.addEventListener(
      "animationend",
      () => {
        span.classList.remove("burst");
        span.classList.add("settle");

        const target = targetPositions[i];
        span.style.transform = `translate(${target.x}px, ${target.y}px)`;
      },
      { once: true },
    );
  }

  setTimeout(() => {
    createdWords.forEach((span) => {
      span.classList.remove("settle");
      span.classList.add("floating");

      const lanes = 7;
      const laneHeight = window.innerHeight / lanes;
      const laneIndex = (Math.random() * lanes) | 0;
      const y = laneIndex * laneHeight + laneHeight / 2;

      span.style.top = y + "px";
      span.style.left = "0px";
      span.style.transform = "none";

      const dur = 18 + Math.random() * 18;
      const delay = -Math.random() * dur;

      span.style.animationDuration = dur + "s";
      span.style.animationDelay = delay + "s";
    });
  }, 2000);
}

// ==========================
// Love Counter
// ==========================
const startDate = new Date("2024-07-11T00:00:00");

function updateLoveTime() {
  const now = new Date();
  const diff = now - startDate;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return {
    days,
    hours,
    minutes,
    seconds,
  };
}

const loveTimeEl = document.getElementById("loveTime");

function renderLoveTime() {
  if (!loveTimeEl) return;

  const t = updateLoveTime();
  loveTimeEl.textContent = `${t.days} ngày ${t.hours}h ${t.minutes}p ${t.seconds}s`;
}

setInterval(renderLoveTime, 1000);
renderLoveTime();

// ==========================
// When highlight ends → resume ambient
// ==========================
if (bgHighlight) {
  bgHighlight.addEventListener("ended", () => {
    if (!bgAmbient) return;

    bgAmbient.play().catch(() => {});

    let v = 0;
    const fadeBack = setInterval(() => {
      v += 0.03;
      if (v >= 0.35) {
        v = 0.35;
        clearInterval(fadeBack);
      }
      bgAmbient.volume = v;
    }, 120);
  });
}
// ==========================
// Ambient Music Controller
// ==========================

let ambientStarted = false;

function startAmbient() {
  if (ambientStarted || !bgAmbient) return;

  ambientStarted = true;

  bgAmbient.volume = 0;
  bgAmbient.loop = true;

  bgAmbient
    .play()
    .then(() => {
      let v = 0;
      const fade = setInterval(() => {
        v += 0.03;
        if (v >= 0.35) {
          v = 0.35;
          clearInterval(fade);
        }
        bgAmbient.volume = v;
      }, 120);
    })
    .catch(() => {});
}

// Browser chỉ cho play sau interaction
window.addEventListener("click", startAmbient, { once: true });
window.addEventListener("touchstart", startAmbient, { once: true });
window.addEventListener("keydown", startAmbient, { once: true });
