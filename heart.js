const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: true });
const photoField = document.getElementById("photo-field");
const digitalClock = document.getElementById("digital-clock");
const loveLetterModal = document.getElementById("love-letter-modal");
const loveLetterClose = loveLetterModal?.querySelector(".love-letter__close");
const loveLetterContent = loveLetterModal?.querySelector(".love-letter__content");
const loveLetterTypeTargets = loveLetterContent
  ? Array.from(loveLetterContent.querySelectorAll(".love-letter__eyebrow, h1, p"))
  : [];
const loveLetterLines = loveLetterTypeTargets.map((el) =>
  (el.textContent || "").trim().replace(/\s+/g, " "),
);
const heartMusic = new Audio("music/nen.m4a");
const letterMusic = new Audio("music/valentine.m4a");

heartMusic.loop = true;
heartMusic.preload = "auto";
heartMusic.volume = 0;
letterMusic.loop = true;
letterMusic.preload = "auto";
letterMusic.volume = 0;

const TAU = Math.PI * 2;
const DPR = () => Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const imageFiles = [
  ...Array.from({ length: 93 }, (_, i) => `images/${i + 1}.jpg`),
  ...Array.from({ length: 4 }, (_, i) => `images/${i + 94}.heic`),
  ...Array.from({ length: 42 }, (_, i) => `images/${i + 98}.jpg`),
];

const world = {
  cx: innerWidth / 2,
  cy: innerHeight / 2,
  scale: 14,
  bpm: 62,
  bgFade: 0.22,
  coreBeatScale: 0.04,
  auraMicroScale: 0.018,
  coreCount: innerWidth < 760 ? 9600 : 18000,
  auraCount: innerWidth < 760 ? 3600 : 6200,
  sparkCount: innerWidth < 760 ? 520 : 900,
};

const scene = {
  mode: "gallery",
  morph: 0,
  transitionRaw: 0,
  transitionStart: 0,
  transitionDuration: 2300,
  photoCards: [],
  revealOrder: [],
  revealedPhotoIds: new Set(),
  toHeartOrder: [],
};

const TO_HEART_SHRINK_END = 0.38;
const TO_HEART_BATCH_SIZE = 10;
const TO_GALLERY_REVEAL_START = 0.78;
const TO_GALLERY_FLASH_END = 1;

const vignetteLayer = document.createElement("canvas");
const vignetteCtx = vignetteLayer.getContext("2d");
let loveLetterTypeFrame = 0;
let musicFadeFrame = 0;
let letterMusicFadeFrame = 0;

function updateClock() {
  const now = new Date();
  const start = new Date(2024, 6, 11, 0, 0, 0);
  const pad = (value) => String(value).padStart(2, "0");
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  let hours = now.getHours() - start.getHours();
  let minutes = now.getMinutes() - start.getMinutes();
  let seconds = now.getSeconds() - start.getSeconds();

  if (seconds < 0) {
    seconds += 60;
    minutes--;
  }

  if (minutes < 0) {
    minutes += 60;
    hours--;
  }

  if (hours < 0) {
    hours += 24;
    days--;
  }

  if (days < 0) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += previousMonth.getDate();
    months--;
  }

  if (months < 0) {
    months += 12;
    years--;
  }

  digitalClock.textContent =
    `${years} năm ${months} tháng ${days} ngày ` +
    `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function resize() {
  const dpr = DPR();
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitHeart();
  rebuildVignette();
  layoutPhotos();
}

function fitHeart() {
  world.cx = innerWidth / 2;
  world.cy = innerHeight / 2 + Math.min(innerHeight * 0.01, 10);
  world.scale = Math.min(innerWidth, innerHeight) / 51;
}

window.addEventListener("resize", resize);

function rebuildVignette() {
  vignetteLayer.width = innerWidth;
  vignetteLayer.height = innerHeight;
  vignetteCtx.clearRect(0, 0, innerWidth, innerHeight);

  const vignette = vignetteCtx.createRadialGradient(
    world.cx,
    world.cy,
    innerWidth * 0.05,
    world.cx,
    world.cy,
    innerWidth * 0.75,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.15)");
  vignetteCtx.fillStyle = vignette;
  vignetteCtx.fillRect(0, 0, innerWidth, innerHeight);
}

function shuffle(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function layoutPhotos() {
  if (!scene.photoCards.length) return;

  const count = scene.photoCards.length;
  const margin = innerWidth < 760 ? 12 : 28;
  const cols = Math.ceil(Math.sqrt((count * innerWidth) / innerHeight));
  const rows = Math.ceil(count / cols);
  const cellW = (innerWidth - margin * 2) / cols;
  const cellH = (innerHeight - margin * 2) / rows;
  const cells = shuffle(
    Array.from({ length: rows * cols }, (_, i) => ({
      col: i % cols,
      row: Math.floor(i / cols),
    })),
  );

  scene.photoCards.forEach((card, index) => {
    const cell = cells[index];
    const ratio = card.ratio || 1;
    const maxW = cellW * (innerWidth < 760 ? 0.78 : 0.72);
    const maxH = cellH * (innerWidth < 760 ? 0.74 : 0.7);
    const baseW = rand(maxW * 0.72, maxW);
    const w = Math.min(baseW, maxH * ratio);
    const h = w / ratio;
    const freeX = Math.max(0, cellW - w);
    const freeY = Math.max(0, cellH - h);
    const left = margin + cell.col * cellW + rand(0, freeX);
    const top = margin + cell.row * cellH + rand(0, freeY);

    card.x = left;
    card.y = top;
    card.w = w;
    card.h = h;
    card.cx = left + w / 2;
    card.cy = top + h / 2;
    card.baseRotate = rand(-16, 16);
    card.floatPhase = rand(0, TAU);
    card.floatSpeed = rand(0.22, 0.55);
    card.floatAmpX = rand(5, innerWidth < 760 ? 12 : 20);
    card.floatAmpY = rand(4, innerWidth < 760 ? 10 : 16);
    card.el.style.left = `${left}px`;
    card.el.style.top = `${top}px`;
    card.el.style.width = `${w}px`;
  });
}

function updatePhotos(timeSec) {
  const revealStarted = scene.mode === "toGallery" && scene.transitionRaw > TO_GALLERY_REVEAL_START;
  const flashWindow =
    scene.mode === "toGallery" &&
    scene.transitionRaw > TO_GALLERY_REVEAL_START &&
    scene.transitionRaw < TO_GALLERY_FLASH_END;

  for (const card of scene.photoCards) {
    const revealed = scene.mode === "gallery" || (revealStarted && scene.revealedPhotoIds.has(card.order));
    const revealAt = card.revealAt ?? TO_GALLERY_REVEAL_START;
    const flashing = flashWindow && scene.transitionRaw >= revealAt && scene.transitionRaw < revealAt + 0.055;
    const dx = Math.sin(timeSec * card.floatSpeed + card.floatPhase) * card.floatAmpX;
    const dy = Math.cos(timeSec * (card.floatSpeed * 0.83) + card.floatPhase * 1.7) * card.floatAmpY;
    let tx = dx;
    let ty = dy;
    let scale = 1;
    let rotate = card.baseRotate + Math.sin(timeSec * 0.42 + card.floatPhase) * 3.5;
    let opacity = revealed ? 0.96 : 0;

    if (scene.mode === "toHeart") {
      const batchDuration = Math.max(0.045, TO_HEART_SHRINK_END / Math.max(1, Math.ceil(scene.photoCards.length / TO_HEART_BATCH_SIZE)));
      const localRaw = clamp((scene.transitionRaw - (card.toHeartAt ?? 0)) / batchDuration, 0, 1);
      const p = easeInOutCubic(localRaw);
      tx = lerp(dx, 0, p);
      ty = lerp(dy, 0, p);
      scale = lerp(1, 0.045, p);
      rotate += p * 88;
      opacity = scene.transitionRaw < (card.toHeartAt ?? 0) ? 0.96 : Math.pow(1 - p, 0.55);
    } else if (flashing) {
      opacity = 1;
    }

    card.el.style.opacity = opacity;
    card.el.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rotate}deg) scale(${scale})`;
    card.el.classList.toggle("is-visible", revealed);
    card.el.classList.toggle("is-flashing", flashing);
    card.el.classList.toggle("is-morphing", scene.mode === "toHeart");
  }
}

async function initPhotoGallery() {
  const loaded = imageFiles.map(
    (src, index) =>
      new Promise((resolve) => {
        const img = document.createElement("img");
        img.className = "memory-photo";
        img.src = src;
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        img.loading = "eager";
        photoField.appendChild(img);

        const finish = () => {
          resolve({
            el: img,
            ratio: (img.naturalWidth || 1) / (img.naturalHeight || 1),
            order: index,
          });
        };

        if (img.complete && img.naturalWidth) {
          finish();
        } else {
          img.addEventListener("load", finish, { once: true });
          img.addEventListener("error", finish, { once: true });
        }
      }),
  );

  scene.photoCards = await Promise.all(loaded);
  layoutPhotos();

  scene.photoCards.forEach((card, index) => {
    setTimeout(() => {
      if (scene.mode === "gallery") card.el.classList.add("is-visible");
    }, index * 45);
  });
}

function heartPoint(t) {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const x = 16 * s * s * s;
  const y = 13 * c - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x, y };
}

const HEART_SAMPLES = 1500;
const outline = Array.from({ length: HEART_SAMPLES }, (_, i) =>
  heartPoint((i / HEART_SAMPLES) * TAU),
);

function makeParticleSprite(colorStops) {
  const sprite = document.createElement("canvas");
  const size = 48;
  const center = size / 2;
  sprite.width = size;
  sprite.height = size;

  const sctx = sprite.getContext("2d");
  const gradient = sctx.createRadialGradient(center, center, 0, center, center, center);

  for (const stop of colorStops) {
    gradient.addColorStop(stop[0], stop[1]);
  }

  sctx.fillStyle = gradient;
  sctx.beginPath();
  sctx.arc(center, center, center, 0, TAU);
  sctx.fill();

  return sprite;
}

const particleSprites = {
  core: makeParticleSprite([
    [0, "rgba(255, 238, 248, 1)"],
    [0.16, "rgba(255, 156, 204, 0.9)"],
    [0.5, "rgba(255, 58, 157, 0.24)"],
    [1, "rgba(255, 44, 142, 0)"],
  ]),
  aura: makeParticleSprite([
    [0, "rgba(255, 232, 246, 1)"],
    [0.22, "rgba(255, 128, 196, 0.72)"],
    [0.58, "rgba(255, 42, 152, 0.18)"],
    [1, "rgba(255, 34, 144, 0)"],
  ]),
  spark: makeParticleSprite([
    [0, "rgba(255, 236, 214, 0.95)"],
    [0.3, "rgba(255, 126, 184, 0.48)"],
    [1, "rgba(255, 102, 166, 0)"],
  ]),
};

function tipCrowdingAt(t) {
  const topCrowding = topTipCrowdingAt(t);
  const bottomCrowding = bottomTipCrowdingAt(t);

  return Math.max(topCrowding, bottomCrowding);
}

function topTipCrowdingAt(t) {
  return Math.exp(-Math.pow(Math.min(t, TAU - t) / 0.36, 2));
}

function bottomTipCrowdingAt(t) {
  return Math.exp(-Math.pow(Math.abs(t - Math.PI) / 0.34, 2));
}

function randomHeartT() {
  for (let i = 0; i < 8; i++) {
    const t = rand(0, TAU);
    const topTip = topTipCrowdingAt(t);
    const bottomTip = bottomTipCrowdingAt(t);
    const keepChance =
      lerp(0.12, 1, 1 - tipCrowdingAt(t)) *
      lerp(0.38, 1, 1 - topTip) *
      lerp(0.45, 1, 1 - bottomTip);

    if (Math.random() < keepChance) return t;
  }

  return rand(0, TAU);
}

function tangentNormalAt(t) {
  const p0 = heartPoint(t);
  const p1 = heartPoint(t + 0.004);
  const tx = p1.x - p0.x;
  const ty = p1.y - p0.y;
  const len = Math.hypot(tx, ty) || 1;
  const tangent = { x: tx / len, y: ty / len };
  let normal = { x: -tangent.y, y: tangent.x };

  if (normal.x * -p0.x + normal.y * -p0.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }

  return { point: p0, tangent, normal };
}

class HeartParticle {
  constructor(layer) {
    this.layer = layer;
    this.reset(true);
  }

  reset(initial = false) {
    this.life = rand(1.2, 2.8);
    this.age = initial ? rand(0, this.life) : 0;
    this.phase = rand(0, TAU);
    this.twinkleSpeed = rand(1.2, 3.4);
    this.driftX = rand(-0.18, 0.18);
    this.driftY = rand(-0.18, 0.18);

    if (this.layer === "core") this.resetCore();
    if (this.layer === "aura") this.resetAura();
    if (this.layer === "spark") this.resetSpark();
  }

  resetCore() {
    const t = randomHeartT();
    const point = heartPoint(t);
    const topTip = topTipCrowdingAt(t);
    const bottomTip = bottomTipCrowdingAt(t);
    const radiusScale = lerp(0.06, 1.04, Math.pow(Math.random(), 0.48));
    const centerFade = 1 - clamp(radiusScale, 0, 1);
    const edgeFade = clamp((radiusScale - 0.7) / 0.34, 0, 1);
    const jitter = lerp(0.78, 0.22, edgeFade);
    const edgeDust = rand(-0.28, 0.42) * edgeFade;

    this.baseX = point.x * radiusScale + rand(-jitter, jitter);
    this.baseY = point.y * (radiusScale + edgeDust * 0.025) + rand(-jitter, jitter);
    this.depth01 = centerFade;
    this.topTip = topTip;
    this.bottomTip = bottomTip;
    this.interiorFill = radiusScale < 0.82;
    this.size =
      rand(0.24, 0.76) *
      lerp(0.72, 1.12, radiusScale) *
      lerp(0.58, 1, 1 - bottomTip) *
      lerp(0.5, 1, 1 - topTip);
    this.hue = rand(338, 354);
    this.sat = rand(80, 96);
    this.light = rand(56, 74);
  }

  resetAura() {
    const t = randomHeartT();
    const p = outline[((t / TAU) * outline.length) | 0];
    const topTip = topTipCrowdingAt(t);
    const bottomTip = bottomTipCrowdingAt(t);
    const angle = rand(0, TAU);
    const radius = rand(0.35, 2.75);

    this.baseX = p.x + Math.cos(angle) * radius;
    this.baseY = p.y + Math.sin(angle) * radius;
    this.depth01 = 0;
    this.topTip = topTip;
    this.bottomTip = bottomTip;
    this.size = rand(0.26, 0.78) * lerp(0.46, 1, 1 - bottomTip) * lerp(0.42, 1, 1 - topTip);
    this.hue = rand(326, 350);
    this.sat = rand(82, 98);
    this.light = rand(58, 74);
  }

  resetSpark() {
    const angle = rand(0, TAU);
    const radius = Math.pow(Math.random(), 0.82) * 15.5;

    this.baseX = Math.cos(angle) * radius;
    this.baseY = Math.sin(angle) * radius * 0.9;
    this.depth01 = 0;
    this.topTip = 0;
    this.bottomTip = 0;
    this.size = rand(0.2, 0.5);
    this.hue = Math.random() < 0.7 ? rand(338, 356) : rand(24, 42);
    this.sat = rand(74, 98);
    this.light = rand(68, 82);
    this.life = rand(0.65, 1.45);
  }

  step(dt, beat, timeSec) {
    this.age += dt;
    if (this.age >= this.life) this.reset();

    const lifeT = this.age / this.life;
    const fade = Math.sin(Math.PI * lifeT);
    const shimmer = 0.72 + 0.28 * Math.sin(timeSec * this.twinkleSpeed + this.phase);
    const scale =
      this.layer === "core"
        ? 1 + world.coreBeatScale * beat
        : 1 + world.auraMicroScale * beat;

    let x = this.baseX * scale;
    let y = -this.baseY * scale;

    if (this.layer === "spark") {
      x += Math.sin(timeSec * 1.7 + this.phase) * 0.9;
      y += Math.cos(timeSec * 1.3 + this.phase) * 0.7;
    } else {
      x += this.driftX * (lifeT - 0.5) * 2;
      y += this.driftY * (lifeT - 0.5) * 2;
    }

    let alpha;
    if (this.layer === "core") {
      const edge = 1 - this.depth01;
      alpha = (0.21 + beat * 0.22) * fade * shimmer * lerp(0.24, 1, edge);
    } else if (this.layer === "aura") {
      alpha = (0.12 + beat * 0.38) * fade * shimmer;
    } else {
      alpha = (0.05 + beat * 0.13) * fade * shimmer;
    }

    let sx = world.cx + x * world.scale;
    let sy = world.cy + y * world.scale;

    if (scene.mode === "gallery") {
      alpha = 0;
    } else if (scene.mode === "toHeart" || scene.mode === "toGallery") {
      const originX = this.originX ?? world.cx;
      const originY = this.originY ?? world.cy;
      sx = lerp(originX, sx, scene.morph);
      sy = lerp(originY, sy, scene.morph);
      if (scene.mode === "toHeart") {
        if (scene.transitionRaw < TO_HEART_SHRINK_END) {
          if (!this.photoSpark) {
            alpha = 0;
          } else {
            const localRaw = clamp((scene.transitionRaw - (this.toHeartAt ?? 0)) / (this.toHeartDuration ?? 0.06), 0, 1);
            alpha *= scene.transitionRaw >= (this.toHeartAt ?? 0) ? lerp(0.45, 1.25, easeInOutCubic(localRaw)) : 0;
          }
        } else {
          alpha *= lerp(0.55, 1, scene.morph);
        }
      } else {
        const flash = Math.exp(-Math.pow((scene.transitionRaw - 0.82) / 0.13, 2));

        if (this.photoSpark) {
          alpha *= scene.transitionRaw < TO_GALLERY_REVEAL_START ? 1 : lerp(1, 0.12, (scene.transitionRaw - TO_GALLERY_REVEAL_START) / 0.22);
          alpha *= 1 + flash * 0.55;
        } else {
          const exitFade = clamp((scene.transitionRaw - 0.94) / 0.06, 0, 1);
          alpha *= 1 - exitFade;
        }
      }
    }

    return {
      sx,
      sy,
      alpha: clamp(alpha, 0, 1),
    };
  }

  draw(out) {
    if (out.alpha <= 0.002) return;

    const topTip = this.topTip || 0;
    const bottomTip = this.bottomTip || 0;
    const topDimming = lerp(0.36, 1, 1 - topTip);
    const bottomDimming = lerp(0.42, 1, 1 - bottomTip);

    out.alpha *= topDimming * bottomDimming;
    if (out.alpha <= 0.002) return;

    const edge = 1 - (this.depth01 || 0);
    const sizeBoost = this.layer === "aura" ? 1.12 : this.layer === "spark" ? 0.82 : 1;
    const r = this.size * sizeBoost * lerp(0.8, 1.2, edge);
    const glow = this.layer === "aura" ? 3.35 : this.layer === "spark" ? 2.2 : 2.9;
    const sprite = particleSprites[this.layer];
    const diameter = r * glow * 2;
    const { sx, sy, alpha } = out;

    const trailActive =
      this.trailSpark &&
      (scene.mode === "toGallery" || (scene.mode === "toHeart" && scene.transitionRaw >= TO_HEART_SHRINK_END));

    if (trailActive) {
      const originX = this.originX ?? sx;
      const originY = this.originY ?? sy;
      const dirX = scene.mode === "toHeart" ? sx - originX : originX - sx;
      const dirY = scene.mode === "toHeart" ? sy - originY : originY - sy;
      const len = Math.hypot(dirX, dirY);

      if (len > 2) {
        const ux = dirX / len;
        const uy = dirY / len;
        const trail = clamp(len * 0.16, 12, this.photoSpark ? 54 : 36);

        ctx.globalAlpha = alpha * (this.photoSpark ? 0.68 : 0.48);
        ctx.strokeStyle = this.photoSpark ? "rgba(255, 238, 248, 0.96)" : "rgba(255, 186, 224, 0.86)";
        ctx.lineWidth = this.photoSpark ? Math.max(1.25, r * 1.55) : Math.max(0.9, r * 1.18);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx - ux * trail, sy - uy * trail);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, sx - diameter / 2, sy - diameter / 2, diameter, diameter);
    ctx.globalAlpha = 1;
  }
}

function heartbeat(timeSec, bpm) {
  const phase = (timeSec * (bpm / 60)) % 1;
  const first = Math.exp(-Math.pow((phase - 0.08) / 0.035, 2));
  const second = Math.exp(-Math.pow((phase - 0.23) / 0.075, 2)) * 0.62;
  const afterglow = Math.exp(-Math.pow((phase - 0.42) / 0.18, 2)) * 0.18;

  return Math.pow(clamp(0.035 + first + second + afterglow, 0, 1), 0.72);
}

function drawHeartGlow(beat) {
  ctx.globalCompositeOperation = "lighter";
  const radius = world.scale * lerp(6.5, 9.5, beat);
  const glow = ctx.createRadialGradient(world.cx, world.cy, 0, world.cx, world.cy, radius);
  glow.addColorStop(0, `rgba(255, 54, 147, ${0.025 + beat * 0.045})`);
  glow.addColorStop(0.42, `rgba(255, 20, 125, ${0.018 + beat * 0.04})`);
  glow.addColorStop(1, "rgba(255, 0, 120, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
}

resize();

const core = Array.from({ length: world.coreCount }, () => new HeartParticle("core"));
const aura = Array.from({ length: world.auraCount }, () => new HeartParticle("aura"));
const sparks = Array.from({ length: world.sparkCount }, () => new HeartParticle("spark"));
const allParticles = [...aura, ...core, ...sparks];

function randomEdgePoint() {
  const pad = Math.max(80, Math.min(innerWidth, innerHeight) * 0.12);
  const side = (Math.random() * 4) | 0;

  if (side === 0) return { x: rand(-pad, innerWidth + pad), y: -pad };
  if (side === 1) return { x: innerWidth + pad, y: rand(-pad, innerHeight + pad) };
  if (side === 2) return { x: rand(-pad, innerWidth + pad), y: innerHeight + pad };
  return { x: -pad, y: rand(-pad, innerHeight + pad) };
}

function assignParticleOrigins() {
  const cards = scene.photoCards.length ? scene.photoCards : [{ cx: world.cx, cy: world.cy, w: 100, h: 100 }];

  for (let i = 0; i < allParticles.length; i++) {
    const particle = allParticles[i];

    if (i < cards.length) {
      const card = cards[i];
      particle.originX = card.cx + rand(-card.w * 0.16, card.w * 0.16);
      particle.originY = card.cy + rand(-card.h * 0.16, card.h * 0.16);
      particle.photoSpark = true;
      particle.trailSpark = true;
      particle.toHeartAt = card.toHeartAt ?? 0;
      particle.toHeartDuration = card.toHeartDuration ?? 0.06;
    } else {
      const edge = randomEdgePoint();
      particle.originX = edge.x;
      particle.originY = edge.y;
      particle.photoSpark = false;
      particle.trailSpark = Math.random() < 0.16;
    }
  }
}

function startToHeart() {
  if (scene.mode !== "gallery") return;

  playHeartMusic();
  scene.mode = "toHeart";
  scene.transitionStart = performance.now();
  scene.transitionRaw = 0;
  scene.morph = 0;
  scene.toHeartOrder = shuffle(scene.photoCards.map((card) => card.order));
  const shrinkSpan = TO_HEART_SHRINK_END;
  const batchCount = Math.max(1, Math.ceil(scene.toHeartOrder.length / TO_HEART_BATCH_SIZE));
  const shrinkByOrder = new Map();

  scene.toHeartOrder.forEach((order, index) => {
    const batch = Math.floor(index / TO_HEART_BATCH_SIZE);
    shrinkByOrder.set(order, (batch / batchCount) * shrinkSpan);
  });

  scene.photoCards.forEach((card) => {
    card.toHeartAt = shrinkByOrder.get(card.order) ?? 0;
    card.toHeartDuration = Math.max(0.045, shrinkSpan / batchCount);
    card.el.classList.remove("is-flashing");
    card.el.classList.add("is-morphing");
    card.el.classList.remove("is-visible");
  });
  assignParticleOrigins();
}

function startToGallery() {
  if (scene.mode !== "heart") return;

  stopHeartMusic();
  layoutPhotos();
  assignParticleOrigins();
  scene.mode = "toGallery";
  scene.transitionStart = performance.now();
  scene.transitionRaw = 0;
  scene.morph = 1;
  scene.revealOrder = shuffle(scene.photoCards.map((card) => card.order));
  scene.revealedPhotoIds = new Set();
  const revealSpan = 1 - TO_GALLERY_REVEAL_START;
  const batchSize = 10;
  const batchCount = Math.max(1, Math.ceil(scene.revealOrder.length / batchSize));
  const revealByOrder = new Map();

  scene.revealOrder.forEach((order, index) => {
    const batch = Math.floor(index / batchSize);
    revealByOrder.set(order, TO_GALLERY_REVEAL_START + (batch / batchCount) * revealSpan);
  });

  scene.photoCards.forEach((card) => {
    card.revealAt = revealByOrder.get(card.order) ?? TO_GALLERY_REVEAL_START;
    card.el.classList.remove("is-morphing");
    card.el.classList.remove("is-visible");
    card.el.classList.remove("is-flashing");
  });
}

function toggleScene() {
  if (loveLetterModal?.classList.contains("is-open")) return;
  if (scene.mode === "gallery") startToHeart();
  if (scene.mode === "heart") startToGallery();
}

function fadeAudio(audio, targetVolume, duration, pauseWhenSilent, frameStore) {
  cancelAnimationFrame(frameStore.value);

  const startVolume = audio.volume;
  const start = performance.now();

  function render(now) {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = easeInOutCubic(progress);

    audio.volume = clamp(lerp(startVolume, targetVolume, eased), 0, 1);

    if (progress < 1) {
      frameStore.value = requestAnimationFrame(render);
      return;
    }

    if (pauseWhenSilent && targetVolume === 0) {
      audio.pause();
    }
  }

  frameStore.value = requestAnimationFrame(render);
}

function fadeHeartMusic(targetVolume, duration = 900, pauseWhenSilent = false) {
  fadeAudio(heartMusic, targetVolume, duration, pauseWhenSilent, {
    get value() {
      return musicFadeFrame;
    },
    set value(frame) {
      musicFadeFrame = frame;
    },
  });
}

function fadeLetterMusic(targetVolume, duration = 900, pauseWhenSilent = false) {
  fadeAudio(letterMusic, targetVolume, duration, pauseWhenSilent, {
    get value() {
      return letterMusicFadeFrame;
    },
    set value(frame) {
      letterMusicFadeFrame = frame;
    },
  });
}

function playHeartMusic() {
  const playPromise = heartMusic.play();

  if (playPromise) {
    playPromise.catch(() => {
      heartMusic.volume = 0;
    });
  }

  fadeHeartMusic(0.52, 1200);
}

function stopHeartMusic() {
  fadeHeartMusic(0, 800, true);
}

function playLetterMusic() {
  letterMusic.currentTime = 0;
  const playPromise = letterMusic.play();

  if (playPromise) {
    playPromise.catch(() => {
      letterMusic.volume = 0;
    });
  }

  fadeHeartMusic(0.16, 600);
  fadeLetterMusic(0.68, 900);
}

function stopLetterMusic() {
  fadeLetterMusic(0, 600, true);
  if (scene.mode === "heart") fadeHeartMusic(0.52, 700);
}

function resetLoveLetterTypewriter() {
  cancelAnimationFrame(loveLetterTypeFrame);
  loveLetterContent?.classList.remove("is-typing");

  loveLetterTypeTargets.forEach((target) => {
    target.textContent = "";
    target.classList.remove("typewriter-active");
  });
}

function finishLoveLetterTypewriter() {
  cancelAnimationFrame(loveLetterTypeFrame);
  loveLetterContent?.classList.remove("is-typing");

  loveLetterTypeTargets.forEach((target, index) => {
    target.textContent = loveLetterLines[index];
    target.classList.remove("typewriter-active");
  });
}

function startLoveLetterTypewriter() {
  if (!loveLetterTypeTargets.length) return;

  resetLoveLetterTypewriter();
  loveLetterContent?.classList.add("is-typing");

  const charMs = innerWidth < 560 ? 16 : 14;
  const linePauseChars = 10;
  const lineLengths = loveLetterLines.map((text) => text.length + linePauseChars);
  const totalSteps = lineLengths.reduce((sum, length) => sum + length, 0);
  const start = performance.now();

  function render(now) {
    let remaining = Math.min(totalSteps, Math.floor((now - start) / charMs));
    let activeIndex = loveLetterTypeTargets.length - 1;

    loveLetterTypeTargets.forEach((target, index) => {
      const text = loveLetterLines[index];
      const visibleCount = clamp(remaining, 0, text.length);

      target.textContent = text.slice(0, visibleCount);
      target.classList.remove("typewriter-active");

      if (remaining <= text.length + linePauseChars && activeIndex === loveLetterTypeTargets.length - 1) {
        activeIndex = index;
      }

      remaining -= text.length + linePauseChars;
    });

    loveLetterTypeTargets[activeIndex]?.classList.add("typewriter-active");

    if (now - start < totalSteps * charMs) {
      loveLetterTypeFrame = requestAnimationFrame(render);
    } else {
      finishLoveLetterTypewriter();
    }
  }

  loveLetterTypeFrame = requestAnimationFrame(render);
}

function openLoveLetter() {
  if (!loveLetterModal || scene.mode !== "heart") return;

  loveLetterModal.classList.add("is-open");
  loveLetterModal.setAttribute("aria-hidden", "false");
  startLoveLetterTypewriter();
  playLetterMusic();
}

function closeLoveLetter() {
  if (!loveLetterModal) return;

  finishLoveLetterTypewriter();
  stopLetterMusic();
  loveLetterModal.classList.remove("is-open");
  loveLetterModal.setAttribute("aria-hidden", "true");
}

function handleSceneClick(event) {
  if (loveLetterModal?.classList.contains("is-open")) return;
  if (event.target.closest?.(".love-letter")) return;

  clearTimeout(singleClickTimer);
  singleClickTimer = window.setTimeout(() => {
    openLoveLetter();
  }, 230);
}

function handleSceneDoubleClick() {
  clearTimeout(singleClickTimer);
  toggleScene();
}

function drawParticleLayer(layer, count, dt, beat, timeSec, stride = 1) {
  if (stride <= 1) {
    for (let i = 0; i < count; i++) {
      const p = layer[i];
      p.draw(p.step(dt, beat, timeSec));
    }

    return;
  }

  for (let i = 0; i < count; i++) {
    const p = layer[i];

    if (p.photoSpark || i % stride === 0) {
      p.draw(p.step(dt, beat, timeSec));
    }
  }
}

function drawPhotoSparks(dt, beat, timeSec) {
  const photoCount = scene.photoCards.length;

  for (let i = 0; i < photoCount && i < aura.length; i++) {
    const p = aura[i];
    p.draw(p.step(dt, beat, timeSec));
  }
}

let last = performance.now();
let singleClickTimer = 0;

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  const t = now / 1000;
  const beat = heartbeat(t, world.bpm);

  if (scene.mode === "toHeart" || scene.mode === "toGallery") {
    const raw = clamp((now - scene.transitionStart) / scene.transitionDuration, 0, 1);
    const eased = easeInOutCubic(raw);
    scene.transitionRaw = raw;

    if (scene.mode === "toHeart") {
      const flightRaw = clamp((raw - TO_HEART_SHRINK_END) / (1 - TO_HEART_SHRINK_END), 0, 1);
      scene.morph = easeInOutCubic(flightRaw);
    } else {
      scene.morph = 1 - eased;
      if (raw > TO_GALLERY_REVEAL_START) {
        for (const card of scene.photoCards) {
          if (raw >= (card.revealAt ?? TO_GALLERY_REVEAL_START)) {
            scene.revealedPhotoIds.add(card.order);
          }
        }
      }
    }

    if (raw >= 1) {
      scene.mode = scene.mode === "toHeart" ? "heart" : "gallery";
      scene.morph = scene.mode === "heart" ? 1 : 0;

      if (scene.mode === "gallery") {
        scene.revealedPhotoIds = new Set(scene.photoCards.map((card) => card.order));
        scene.photoCards.forEach((card) => {
          card.el.classList.remove("is-flashing");
          card.el.classList.add("is-visible");
        });
      }
    }
  }

  updatePhotos(t);

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(5, 6, 10, ${world.bgFade})`;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  ctx.drawImage(vignetteLayer, 0, 0, innerWidth, innerHeight);

  if (scene.mode !== "gallery") {
    ctx.globalCompositeOperation = "lighter";
    const transitioning = scene.mode === "toHeart" || scene.mode === "toGallery";
    const shrinkingToHeart = scene.mode === "toHeart" && scene.transitionRaw < TO_HEART_SHRINK_END;

    if (shrinkingToHeart) {
      drawPhotoSparks(dt, beat, t);
      requestAnimationFrame(tick);
      return;
    }

    const coreStride = transitioning ? (innerWidth < 760 ? 4 : 6) : 1;
    const auraStride = transitioning ? 4 : 1;
    const sparkStride = transitioning ? 3 : 1;

    const auraDrawN = Math.floor(aura.length * lerp(0.55, 1, beat));
    drawParticleLayer(aura, auraDrawN, dt, beat, t, auraStride);

    drawParticleLayer(core, core.length, dt, beat, t, coreStride);

    const sparkDrawN = Math.floor(sparks.length * lerp(0.45, 1, beat));
    drawParticleLayer(sparks, sparkDrawN, dt, beat, t, sparkStride);
  }

  requestAnimationFrame(tick);
}

ctx.fillStyle = "#05060a";
ctx.fillRect(0, 0, innerWidth, innerHeight);
updateClock();
setInterval(updateClock, 1000);
initPhotoGallery();
requestAnimationFrame(tick);

window.addEventListener("click", handleSceneClick);
window.addEventListener("dblclick", handleSceneDoubleClick);

loveLetterClose?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeLoveLetter();
});

loveLetterModal?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (event.target === loveLetterModal) closeLoveLetter();
});

loveLetterModal?.addEventListener("dblclick", (event) => {
  event.stopPropagation();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLoveLetter();
});
