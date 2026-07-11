import { getCameraMotionDelta } from "camera";
import { clamp } from "utils";

const PIXI_MODULE_URL = new URL("../vendor/pixi/pixi.min.js", import.meta.url).href;
const EFFECT_KIND_SUN_FLARE = "sun-flare";
const EFFECT_KIND_GOLD_DUST = "gold-dust";
const EFFECT_KIND_CAMERA_FLARE = "camera-flare";

let pixiModule = null;
let pixiEngine = null;
let pixiEnginePromise = null;

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hexToNumber(value, fallback = 0xfff1b8) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.startsWith("#") ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRadialTexture(PIXI, {
  size,
  colorStops,
}) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const radius = size / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);

  for (const stop of colorStops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  return PIXI.Texture.from(canvas);
}

function createStreakTexture(PIXI) {
  const canvas = createCanvas(1024, 192);
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 96, 1024, 96);

  gradient.addColorStop(0, "rgba(255, 242, 198, 0)");
  gradient.addColorStop(0.18, "rgba(255, 244, 208, 0.14)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.82, "rgba(255, 244, 208, 0.14)");
  gradient.addColorStop(1, "rgba(255, 242, 198, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 192);

  return PIXI.Texture.from(canvas);
}

function createDustTexture(PIXI) {
  const canvas = createCanvas(96, 96);
  const context = canvas.getContext("2d");
  const center = 48;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);

  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.08, "rgba(255, 252, 240, 1)");
  gradient.addColorStop(0.18, "rgba(255, 233, 162, 1)");
  gradient.addColorStop(0.28, "rgba(244, 187, 67, 0.94)");
  gradient.addColorStop(0.42, "rgba(216, 144, 28, 0.48)");
  gradient.addColorStop(0.58, "rgba(216, 144, 28, 0.08)");
  gradient.addColorStop(1, "rgba(255, 194, 92, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);

  context.beginPath();
  context.fillStyle = "rgba(255, 255, 248, 0.98)";
  context.arc(center, center, 5, 0, Math.PI * 2);
  context.fill();

  return PIXI.Texture.from(canvas);
}

function createDustDiscTexture(PIXI) {
  const canvas = createCanvas(192, 192);
  const context = canvas.getContext("2d");
  const center = 96;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);

  gradient.addColorStop(0, "rgba(255, 248, 220, 0.92)");
  gradient.addColorStop(0.55, "rgba(255, 228, 148, 0.78)");
  gradient.addColorStop(0.74, "rgba(255, 214, 126, 0.58)");
  gradient.addColorStop(0.88, "rgba(255, 204, 118, 0.18)");
  gradient.addColorStop(1, "rgba(255, 204, 118, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 192, 192);

  return PIXI.Texture.from(canvas);
}

function createLensRingTexture(PIXI) {
  const canvas = createCanvas(512, 512);
  const context = canvas.getContext("2d");
  const center = 256;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);

  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.52, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.63, "rgba(255, 255, 255, 0.34)");
  gradient.addColorStop(0.69, "rgba(255, 255, 255, 0.82)");
  gradient.addColorStop(0.76, "rgba(255, 255, 255, 0.3)");
  gradient.addColorStop(0.88, "rgba(255, 255, 255, 0.08)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  return PIXI.Texture.from(canvas);
}

function createRayRig(PIXI, texture, {
  tint,
  centerX,
  centerY,
  scale,
  alpha,
  rotation,
  rayConfigs,
}) {
  const rig = new PIXI.Container();
  rig.position.set(centerX, centerY);
  rig.rotation = rotation;
  rig.alpha = alpha;

  for (const config of rayConfigs) {
    const ray = new PIXI.Sprite(texture);
    ray.anchor.set(0.5);
    ray.rotation = config.rotation;
    ray.scale.set(scale * config.length, scale * config.width);
    ray.alpha = config.alpha;
    ray.tint = tint;
    ray.blendMode = "add";
    rig.addChild(ray);
  }

  return rig;
}

function createGhostSprite(PIXI, texture, {
  x,
  y,
  scaleX,
  scaleY = scaleX,
  alpha,
  tint,
  blendMode,
  rotation = 0,
}) {
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.scale.set(scaleX, scaleY);
  sprite.alpha = alpha;
  sprite.tint = tint;
  sprite.rotation = rotation;
  sprite.blendMode = blendMode;
  return sprite;
}

function buildRayConfigs({
  count,
  baseLength,
  lengthVariance,
  baseWidth,
  widthVariance,
  alphaBase,
  alphaVariance,
}) {
  const safeCount = Math.max(1, Math.round(count));
  const configs = [];

  for (let index = 0; index < safeCount; index += 1) {
    const progress = index / safeCount;
    const lengthWave = (Math.sin(progress * Math.PI * 2 * 1.7) + 1) / 2;
    const widthWave = (Math.cos(progress * Math.PI * 2 * 2.1) + 1) / 2;
    const alphaWave = (Math.sin((progress * Math.PI * 2 * 1.3) + 0.6) + 1) / 2;

    configs.push({
      rotation: progress * Math.PI * 2,
      length: baseLength * (1 - (lengthVariance * 0.5) + (lengthWave * lengthVariance)),
      width: baseWidth * (1 - (widthVariance * 0.5) + (widthWave * widthVariance)),
      alpha: clamp(alphaBase * (1 - (alphaVariance * 0.5) + (alphaWave * alphaVariance)), 0.04, 1),
    });
  }

  return configs;
}

function createFlareContainer(PIXI, textures, filters, layer, scene) {
  const { width, height, camera, progress, coordinateScale = 1 } = scene;
  const depthWeight = clamp(layer.depth / 100, 0, 2);
  const parallaxStrength = 0.08 + (depthWeight * 0.85);
  const zoomStrength = 1 + ((camera.zoom - 1) * (0.28 + depthWeight * 0.25));
  const raySpeed = clamp((layer.raySpeed ?? 100) / 100, 0, 2);
  const rayLength = clamp((layer.rayLength ?? 100) / 100, 0.5, 2.2);
  const rayCount = Math.round(clamp(layer.rayCount ?? 8, 4, 18));
  const rayThickness = clamp((layer.rayThickness ?? 100) / 100, 0.4, 2.2);
  const rayBlur = clamp((layer.rayBlur ?? 36) / 100, 0, 1);
  const rotationOffset = ((layer.rotationOffset ?? 0) * Math.PI) / 180;
  const rotationSpeed = clamp((layer.rotationSpeed ?? 100) / 100, 0, 2);
  const scale = (Math.min(width, height) / 960) * (layer.scale / 100) * zoomStrength;
  const offsetX = (layer.offsetX - camera.x * parallaxStrength) * camera.zoom * coordinateScale;
  const offsetY = (layer.offsetY - camera.y * parallaxStrength) * camera.zoom * coordinateScale;
  const centerX = (width * 0.1) + offsetX;
  const centerY = (height * 0.1) + offsetY;
  const tint = hexToNumber(layer.tint);
  const alpha = clamp(layer.opacity / 100, 0, 1);
  const sunGlowEnabled = Boolean(layer.sunGlowEnabled);
  const sunLensFlareEnabled = Boolean(layer.sunLensFlareEnabled);
  const sunLensFlarePreset = layer.sunLensFlarePreset === "cool" ? "cool" : "warm";
  const sunLensFlareIntensity = clamp((layer.sunLensFlareIntensity ?? 55) / 100, 0, 1);
  const sunLensFlareCount = Math.round(clamp(layer.sunLensFlareCount ?? 5, 3, 10));
  const sunLensFlareSize = clamp((layer.sunLensFlareSize ?? 100) / 100, 0.5, 1.8);
  const sunLensFlareBlur = clamp(layer.sunLensFlareBlur ?? 10, 0, 100);
  const sunLensFlareAxisLength = clamp((layer.sunLensFlareAxisLength ?? 100) / 100, 0.4, 1.8);
  const container = new PIXI.Container();
  const addBlendMode = "add";
  const primaryRotation = rotationOffset + (progress * Math.PI * 2 * 0.14 * rotationSpeed) + (depthWeight * 0.08);
  const secondaryRotation = (rotationOffset * 0.82) + (-progress * Math.PI * 2 * 0.08 * rotationSpeed) + 0.4;
  const pulse = 0.97 + (Math.sin(progress * Math.PI * 2 * (0.24 + (raySpeed * 0.16))) * 0.03);
  const lensAngle = (-Math.PI / 6) + rotationOffset + (Math.sin(progress * Math.PI * 2 * 0.12) * 0.03);
  const blurSpread = 1 + (rayBlur * 1.4);
  const glowSpread = 1 + (rayBlur * 0.65);
  const primaryRayConfigs = buildRayConfigs({
    count: rayCount,
    baseLength: 3.05 * rayLength,
    lengthVariance: 0.55,
    baseWidth: 0.09 * rayThickness,
    widthVariance: 0.8,
    alphaBase: 0.58,
    alphaVariance: 0.45,
  });
  const softPrimaryRayConfigs = buildRayConfigs({
    count: rayCount,
    baseLength: 3.85 * rayLength,
    lengthVariance: 0.62,
    baseWidth: 0.12 * rayThickness * blurSpread,
    widthVariance: 1,
    alphaBase: 0.3,
    alphaVariance: 0.5,
  });
  const secondaryRayConfigs = buildRayConfigs({
    count: Math.max(4, Math.round(rayCount * 0.65)),
    baseLength: 3.7 * rayLength,
    lengthVariance: 0.5,
    baseWidth: 0.05 * rayThickness,
    widthVariance: 0.9,
    alphaBase: 0.42,
    alphaVariance: 0.4,
  });
  const softSecondaryRayConfigs = buildRayConfigs({
    count: Math.max(4, Math.round(rayCount * 0.65)),
    baseLength: 4.45 * rayLength,
    lengthVariance: 0.58,
    baseWidth: 0.08 * rayThickness * blurSpread,
    widthVariance: 1,
    alphaBase: 0.24,
    alphaVariance: 0.42,
  });

  container.alpha = alpha;

  if (sunGlowEnabled) {
    const ambientWash = createGhostSprite(PIXI, textures.glow, {
      x: centerX - (scale * 26),
      y: centerY + (scale * 14),
      scaleX: scale * (7.2 + (rayBlur * 2.4)),
      scaleY: scale * (5.5 + (rayBlur * 1.8)),
      alpha: (0.16 + (rayBlur * 0.05)) * pulse,
      tint,
      blendMode: addBlendMode,
      rotation: lensAngle * 0.14,
    });
    container.addChild(ambientWash);

    const sunBloom = createGhostSprite(PIXI, textures.glow, {
      x: centerX + (scale * 18),
      y: centerY - (scale * 10),
      scaleX: scale * (5.8 + (rayBlur * 1.6)),
      scaleY: scale * (4.7 + (rayBlur * 1.3)),
      alpha: (0.1 + (rayBlur * 0.04)) * pulse,
      tint,
      blendMode: addBlendMode,
    });
    container.addChild(sunBloom);

    const lightVeil = createGhostSprite(PIXI, textures.streak, {
      x: centerX - (scale * 10),
      y: centerY,
      scaleX: scale * 8.8,
      scaleY: scale * (1.12 + (rayThickness * 0.0022) + (rayBlur * 0.3)),
      alpha: (0.05 + (rayBlur * 0.03)) * pulse,
      tint,
      blendMode: addBlendMode,
      rotation: lensAngle * 0.2,
    });
    container.addChild(lightVeil);
  }

  const atmosphere = createGhostSprite(PIXI, textures.glow, {
    x: centerX,
    y: centerY,
    scaleX: scale * (3.2 + (rayBlur * 1.2)),
    alpha: (0.12 + (rayBlur * 0.04)) * pulse,
    tint,
    blendMode: addBlendMode,
  });
  container.addChild(atmosphere);

  const warmVeil = createGhostSprite(PIXI, textures.glow, {
    x: centerX - (scale * 18),
    y: centerY + (scale * 10),
    scaleX: scale * (2.4 + (rayBlur * 0.9)),
    scaleY: scale * (2.05 + (rayBlur * 0.7)),
    alpha: (0.15 + (rayBlur * 0.03)) * pulse,
    tint,
    blendMode: addBlendMode,
  });
  container.addChild(warmVeil);

  const softPrimaryRays = createRayRig(PIXI, textures.streak, {
    tint,
    centerX,
    centerY,
    scale,
    alpha: (0.08 + (rayBlur * 0.08)) * pulse,
    rotation: primaryRotation - 0.03,
    rayConfigs: softPrimaryRayConfigs,
  });
  container.addChild(softPrimaryRays);

  const primaryRays = createRayRig(PIXI, textures.streak, {
    tint,
    centerX,
    centerY,
    scale,
    alpha: 0.34 * pulse,
    rotation: primaryRotation,
    rayConfigs: primaryRayConfigs,
  });
  container.addChild(primaryRays);

  const softSecondaryRays = createRayRig(PIXI, textures.streak, {
    tint,
    centerX,
    centerY,
    scale,
    alpha: (0.06 + (rayBlur * 0.06)) * pulse,
    rotation: secondaryRotation,
    rayConfigs: softSecondaryRayConfigs,
  });
  container.addChild(softSecondaryRays);

  const secondaryRays = createRayRig(PIXI, textures.streak, {
    tint,
    centerX,
    centerY,
    scale,
    alpha: 0.18 * pulse,
    rotation: secondaryRotation,
    rayConfigs: secondaryRayConfigs,
  });
  container.addChild(secondaryRays);

  const anamorphicGlow = createGhostSprite(PIXI, textures.streak, {
    x: centerX,
    y: centerY,
    scaleX: scale * 4.8,
    scaleY: scale * 0.28 * rayThickness * (1 + (rayBlur * 0.35)),
    alpha: (0.08 + (rayBlur * 0.03)) * pulse,
    tint,
    blendMode: addBlendMode,
    rotation: (primaryRotation * 0.12) + (rotationOffset * 0.18),
  });
  container.addChild(anamorphicGlow);

  const glow = new PIXI.Sprite(textures.glow);
  glow.anchor.set(0.5);
  glow.position.set(centerX, centerY);
  glow.scale.set(scale * (1.85 + (rayBlur * 0.45)));
  glow.tint = tint;
  glow.blendMode = addBlendMode;
  glow.alpha = 0.56;
  container.addChild(glow);

  const halo = new PIXI.Sprite(textures.halo);
  halo.anchor.set(0.5);
  halo.position.set(centerX, centerY);
  halo.scale.set(scale * (1.05 + (rayBlur * 0.28)));
  halo.tint = tint;
  halo.blendMode = addBlendMode;
  halo.alpha = 0.48;
  container.addChild(halo);

  const core = new PIXI.Sprite(textures.core);
  core.anchor.set(0.5);
  core.position.set(centerX, centerY);
  core.scale.set(scale * 0.62);
  core.tint = tint;
  core.blendMode = addBlendMode;
  core.alpha = 0.88;
  container.addChild(core);

  const streak = new PIXI.Sprite(textures.streak);
  streak.anchor.set(0.5);
  streak.position.set(centerX, centerY);
  streak.scale.set(scale * (2.7 + (rayBlur * 0.55)), scale * 0.16 * rayThickness * glowSpread);
  streak.rotation = (primaryRotation * 0.7) + (rotationOffset * 0.16);
  streak.tint = tint;
  streak.blendMode = addBlendMode;
  streak.alpha = 0.22 * pulse;
  container.addChild(streak);

  if (sunLensFlareEnabled) {
    const opticalCenterX = width / 2;
    const opticalCenterY = height / 2;
    const sourceToCenterX = opticalCenterX - centerX;
    const sourceToCenterY = opticalCenterY - centerY;
    const sourceDistance = Math.hypot(sourceToCenterX, sourceToCenterY);
    const proximity = clamp(sourceDistance / (Math.hypot(width, height) * 0.35), 0, 1);
    const smoothProximity = proximity * proximity * (3 - (2 * proximity));
    const flareVisibility = 0.08 + (smoothProximity * 0.92);
    const proximityScale = 0.65 + (smoothProximity * 0.35);
    const endpointX = opticalCenterX + (sourceToCenterX * sunLensFlareAxisLength);
    const endpointY = opticalCenterY + (sourceToCenterY * sunLensFlareAxisLength);
    const flareLineX = endpointX - centerX;
    const flareLineY = endpointY - centerY;
    const flareAngle = Math.atan2(flareLineY, flareLineX);
    const palette = getCameraFlarePalette({ flareColorPreset: sunLensFlarePreset }, tint);
    const flareLayer = new PIXI.Container();
    const ghostConfigs = Array.from({ length: sunLensFlareCount }, (_, index) => {
      const ratio = (index + 1) / (sunLensFlareCount + 1);
      const focusWeight = Math.exp(-(((ratio - 0.72) / 0.2) ** 2));
      const sizeWave = (Math.sin((ratio * Math.PI * 3.4) + 0.8) + 1) / 2;
      const alphaWave = (Math.cos((ratio * Math.PI * 4.2) + 0.3) + 1) / 2;

      return {
        offset: 0.06 + (ratio * 1.14) + (Math.sin((index + 1) * 4.7) * 0.018),
        size: (0.07 + (sizeWave * 0.08) + (focusWeight * 0.2)) * sunLensFlareSize * proximityScale,
        alpha: (0.22 + (alphaWave * 0.08) + (focusWeight * 0.1))
          * sunLensFlareIntensity
          * flareVisibility,
        tint: palette.rings[index % palette.rings.length],
        edgeTint: palette.fringes[index % palette.fringes.length],
      };
    });

    if (sunLensFlareBlur > 0) {
      filters.cameraFlareGhost.strength = sunLensFlareBlur * 0.045;
      flareLayer.filters = [filters.cameraFlareGhost];
    }

    for (const config of ghostConfigs) {
      const x = centerX + (flareLineX * config.offset);
      const y = centerY + (flareLineY * config.offset);
      const discScale = scale * config.size;
      const ghost = createGhostSprite(PIXI, textures.lensDisc, {
        x,
        y,
        scaleX: discScale,
        scaleY: discScale,
        alpha: config.alpha * pulse,
        tint: config.tint,
        blendMode: "screen",
      });
      flareLayer.addChild(ghost);

      const edge = createGhostSprite(PIXI, textures.lensRing, {
        x,
        y,
        scaleX: discScale,
        scaleY: discScale,
        alpha: config.alpha * 0.12 * pulse,
        tint: config.edgeTint,
        blendMode: "screen",
        rotation: flareAngle * 0.3,
      });
      flareLayer.addChild(edge);
    }

    container.addChild(flareLayer);
  }

  return container;
}

function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createDustContainer(PIXI, textures, layer, scene) {
  const { width, height, camera, progress, coordinateScale = 1 } = scene;
  const depthWeight = clamp(layer.depth / 100, 0, 2);
  const parallaxStrength = 0.05 + (depthWeight * 0.45);
  const zoomStrength = 1 + ((camera.zoom - 1) * (0.14 + depthWeight * 0.1));
  const scale = (Math.min(width, height) / 960) * (layer.scale / 100) * zoomStrength;
  const offsetX = (layer.offsetX - camera.x * parallaxStrength) * camera.zoom * coordinateScale;
  const offsetY = (layer.offsetY - camera.y * parallaxStrength) * camera.zoom * coordinateScale;
  const centerX = (width / 2) + offsetX;
  const centerY = (height / 2) + offsetY;
  const spreadX = width * 0.54 * Math.max(0.75, layer.scale / 100);
  const spreadY = height * 0.42 * Math.max(0.75, layer.scale / 100);
  const alpha = clamp(layer.opacity / 100, 0, 1);
  const tint = hexToNumber(layer.tint, 0xf2d27a);
  const seed = Number.isFinite(layer.patternSeed) ? layer.patternSeed : 0;
  const orbitTime = progress * Math.PI * 2;
  const particleCount = 42;
  const container = new PIXI.Container();
  const dustDiscBlendMode = "overlay";
  const dustParticleBlendMode = "normal";

  container.alpha = alpha;

  for (let glowIndex = 0; glowIndex < 4; glowIndex += 1) {
    const anchorX = (hash01(seed + 100 + (glowIndex * 13.1)) - 0.5) * spreadX * 0.92;
    const anchorY = (hash01(seed + 200 + (glowIndex * 17.3)) - 0.5) * spreadY * 0.82;
    const glowScale = scale * (1.8 + (hash01(seed + 300 + (glowIndex * 11.7)) * 1.8));
    const glowAlpha = 0.05 + (hash01(seed + 400 + (glowIndex * 9.9)) * 0.08);
    const driftPhase = hash01(seed + 500 + (glowIndex * 7.1)) * Math.PI * 2;
    const driftSpeed = 0.04 + (hash01(seed + 600 + (glowIndex * 5.3)) * 0.05);
    const driftX = Math.cos((orbitTime * driftSpeed) + driftPhase) * scale * 9;
    const driftY = Math.sin((orbitTime * driftSpeed * 0.9) + driftPhase) * scale * 7;
    const glow = createGhostSprite(PIXI, textures.dustDisc, {
      x: centerX + anchorX + driftX,
      y: centerY + anchorY + driftY,
      scaleX: glowScale * 1.6,
      scaleY: glowScale * 1.6,
      alpha: glowAlpha * 0.78,
      tint,
      blendMode: dustDiscBlendMode,
      rotation: driftPhase * 0.2,
    });
    container.addChild(glow);
  }

  for (let index = 0; index < particleCount; index += 1) {
    const anchorX = (hash01(seed + 1000 + (index * 17.7)) - 0.5) * spreadX;
    const anchorY = (hash01(seed + 2000 + (index * 19.3)) - 0.5) * spreadY;
    const orbitPhase = hash01(seed + 3000 + (index * 23.9)) * Math.PI * 2;
    const orbitSpeed = 0.2 + (hash01(seed + 4000 + (index * 29.1)) * 0.42);
    const orbitRadiusX = scale * (10 + (hash01(seed + 5000 + (index * 31.7)) * 34));
    const orbitRadiusY = scale * (7 + (hash01(seed + 6000 + (index * 37.3)) * 26));
    const sparkleSize = scale * (0.05 + (hash01(seed + 7000 + (index * 41.9)) * 0.08));
    const sparkleAlpha = 0.7 + (hash01(seed + 8000 + (index * 43.7)) * 0.28);
    const twinkle = 0.86 + (Math.sin((orbitTime * (0.42 + orbitSpeed)) + orbitPhase) * 0.14);
    const driftX = Math.cos((orbitTime * orbitSpeed) + orbitPhase) * orbitRadiusX;
    const driftY = Math.sin((orbitTime * (orbitSpeed * 0.88)) + orbitPhase) * orbitRadiusY;
    const wobbleX = Math.sin((orbitTime * (orbitSpeed * 1.9)) + (orbitPhase * 1.3)) * scale * 3.2;
    const wobbleY = Math.cos((orbitTime * (orbitSpeed * 1.6)) + (orbitPhase * 0.9)) * scale * 2.4;
    const particleX = centerX + anchorX + driftX + wobbleX;
    const particleY = centerY + anchorY + driftY + wobbleY;

    const halo = createGhostSprite(PIXI, textures.glow, {
      x: particleX,
      y: particleY,
      scaleX: sparkleSize * 1.35,
      scaleY: sparkleSize * 1.35,
      alpha: sparkleAlpha * twinkle * 0.045,
      tint,
      blendMode: dustDiscBlendMode,
      rotation: orbitPhase * 0.18,
    });
    container.addChild(halo);

    const particle = createGhostSprite(PIXI, textures.dust, {
      x: particleX,
      y: particleY,
      scaleX: sparkleSize,
      scaleY: sparkleSize,
      alpha: sparkleAlpha * twinkle,
      tint,
      blendMode: dustParticleBlendMode,
      rotation: orbitPhase * 0.24,
    });
    container.addChild(particle);
  }

  const haze = createGhostSprite(PIXI, textures.dustDisc, {
    x: centerX,
    y: centerY,
    scaleX: scale * 2.8,
    scaleY: scale * 2.8,
    alpha: 0.008,
    tint,
    blendMode: dustDiscBlendMode,
  });
  container.addChild(haze);

  return container;
}

function getMotionAxis(scene) {
  const motion = getCameraMotionDelta(scene.state.camera, scene.progress, 0.016);
  const sceneMotionX = -(motion.x * scene.camera.zoom);
  const sceneMotionY = -(motion.y * scene.camera.zoom);
  const magnitude = Math.hypot(sceneMotionX, sceneMotionY);

  if (magnitude < 0.001) {
    const pathX = scene.state.camera.start.x - scene.state.camera.end.x;
    const pathY = scene.state.camera.start.y - scene.state.camera.end.y;
    const pathMagnitude = Math.hypot(pathX, pathY);

    if (pathMagnitude >= 0.001) {
      return {
        angle: Math.atan2(pathY, pathX),
        strength: 0,
        x: pathX / pathMagnitude,
        y: pathY / pathMagnitude,
      };
    }

    return {
      angle: -Math.PI / 7,
      strength: 0,
      x: Math.cos(-Math.PI / 7),
      y: Math.sin(-Math.PI / 7),
    };
  }

  const angle = Math.atan2(sceneMotionY, sceneMotionX);
  return {
    angle,
    strength: clamp(magnitude / 90, 0, 1),
    x: sceneMotionX / magnitude,
    y: sceneMotionY / magnitude,
  };
}

function getCameraFlarePalette(layer, tint) {
  if (layer.flareColorPreset === "cool") {
    return {
      sourceGlow: 0x438aa7,
      sourceRing: 0x4c5ca0,
      sourceCore: 0xccefff,
      streak: 0x8dddf0,
      rings: [0x3e7ea6, 0x554c9c, 0x39a49f, 0x70c7cf, 0xa6dff2, 0x5f74b2, 0x76559c, 0x4c9fc0],
      fringes: [0x64d1d0, 0x7d6bb5],
      focusGlow: 0x73c8e7,
      focusCore: 0xe4f8ff,
      terminalRing: 0x62529a,
      terminalGhost: 0x3c849f,
    };
  }

  return {
    sourceGlow: 0xbca333,
    sourceRing: 0x72507d,
    sourceCore: tint,
    streak: 0xffdf9b,
    rings: [0x3e8174, 0x72507d, 0x76a33e, 0xb7bc38, 0xffd071, 0x7f993a, 0x76537d, 0xa9b43b],
    fringes: [0x55a38e, 0x8a5f84],
    focusGlow: 0xf1c557,
    focusCore: 0xfff0a0,
    terminalRing: 0x765378,
    terminalGhost: 0x778f35,
  };
}

function createCameraFlareContainer(PIXI, textures, filters, layer, scene) {
  const { width, height, camera, progress, coordinateScale = 1 } = scene;
  const depthWeight = clamp(layer.depth / 100, 0, 2);
  const zoomStrength = 1 + ((camera.zoom - 1) * (0.2 + depthWeight * 0.14));
  const scale = (Math.min(width, height) / 960) * (layer.scale / 100) * zoomStrength;
  const viewportDiagonal = Math.hypot(width, height);
  const anchorX = (width * 0.12) + (layer.offsetX * coordinateScale);
  const anchorY = -(height * 0.08) + (layer.offsetY * coordinateScale);
  const tint = hexToNumber(layer.tint, 0xffe6a8);
  const palette = getCameraFlarePalette(layer, tint);
  const alpha = clamp(layer.opacity / 100, 0, 1);
  const pulse = 0.98 + (Math.sin(progress * Math.PI * 2 * 0.12) * 0.02);
  const axis = getMotionAxis(scene);
  const ringCount = Math.round(clamp(layer.flareRingCount ?? 12, 4, 16));
  const angleOffset = ((layer.flareAngleOffset ?? 0) * Math.PI) / 180;
  const axisLength = clamp((layer.flareAxisLength ?? 145) / 100, 0.4, 2.2);
  const ringScale = clamp((layer.flareRingScale ?? 110) / 100, 0.5, 2.2);
  const endpointSpeed = clamp((layer.flareEndpointSpeed ?? 100) / 100, 0, 2);
  const flareBlur = clamp(layer.flareBlur ?? 10, 0, 100);
  const streakIntensity = clamp((layer.flareStreakIntensity ?? 18) / 100, 0, 2);
  const axisAngle = angleOffset;
  const axisVectorX = Math.cos(axisAngle);
  const axisVectorY = Math.sin(axisAngle);
  const normalVectorX = -axisVectorY;
  const normalVectorY = axisVectorX;
  const baseLength = viewportDiagonal * (0.7 + (axis.strength * 0.05)) * axisLength;
  const endpointPhase = (progress * Math.PI * 2 * (0.04 + (endpointSpeed * 0.12))) + (axisAngle * 0.35);
  const alongOscillation = Math.cos(endpointPhase + 0.3)
    * viewportDiagonal
    * (0.012 + (axis.strength * 0.012))
    * (0.15 + (endpointSpeed * 0.42));
  const lateralOscillation = Math.sin(endpointPhase)
    * viewportDiagonal
    * (0.026 + (axis.strength * 0.024))
    * (0.2 + (endpointSpeed * 0.65));
  const sceneAlongShift = clamp(
    ((-camera.x * axisVectorX) + (-camera.y * axisVectorY))
      * coordinateScale
      * (0.45 + (depthWeight * 0.2)),
    -(viewportDiagonal * 0.12),
    viewportDiagonal * 0.12,
  );
  const sceneLateralShift = clamp(
    ((-camera.x * normalVectorX) + (-camera.y * normalVectorY))
      * coordinateScale
      * (0.7 + (depthWeight * 0.24)),
    -(viewportDiagonal * 0.14),
    viewportDiagonal * 0.14,
  );
  const endpointDistance = Math.max(scale * 42, baseLength + sceneAlongShift + alongOscillation);
  const endX = anchorX + (axisVectorX * endpointDistance) + (normalVectorX * (sceneLateralShift + lateralOscillation));
  const endY = anchorY + (axisVectorY * endpointDistance) + (normalVectorY * (sceneLateralShift + lateralOscillation));
  const lineDeltaX = endX - anchorX;
  const lineDeltaY = endY - anchorY;
  const lineLength = Math.max(scale * 42, Math.hypot(lineDeltaX, lineDeltaY));
  const lineAngle = Math.atan2(lineDeltaY, lineDeltaX);
  const lineUnitX = lineDeltaX / lineLength;
  const lineUnitY = lineDeltaY / lineLength;
  const lineNormalX = -lineUnitY;
  const lineNormalY = lineUnitX;
  const lineMidX = anchorX + (lineDeltaX / 2);
  const lineMidY = anchorY + (lineDeltaY / 2);
  const container = new PIXI.Container();
  const softLayer = new PIXI.Container();
  const ghostLayer = new PIXI.Container();
  const sharpLayer = new PIXI.Container();
  const normalizedCenterDistance = Math.hypot(
    (anchorX - (width / 2)) / Math.max(width / 2, 1),
    (anchorY - (height / 2)) / Math.max(height / 2, 1),
  );
  const sourceVisibility = clamp(1.08 - (normalizedCenterDistance * 0.12), 0.72, 1);

  container.alpha = alpha;
  container.addChild(softLayer, ghostLayer, sharpLayer);
  if (flareBlur > 0) {
    filters.cameraFlareSoft.strength = flareBlur * 0.2;
    filters.cameraFlareGhost.strength = flareBlur * 0.045;
    softLayer.filters = [filters.cameraFlareSoft];
    ghostLayer.filters = [filters.cameraFlareGhost];
  }

  const sourceGlow = createGhostSprite(PIXI, textures.lensGlow, {
    x: anchorX,
    y: anchorY,
    scaleX: scale * 2.35,
    scaleY: scale * 2.35,
    alpha: 0.055 * pulse * sourceVisibility,
    tint: palette.sourceGlow,
    blendMode: "screen",
    rotation: lineAngle * 0.16,
  });
  softLayer.addChild(sourceGlow);

  const sourceRing = createGhostSprite(PIXI, textures.lensRing, {
    x: anchorX,
    y: anchorY,
    scaleX: scale * 0.64,
    scaleY: scale * 0.64,
    alpha: 0.16 * pulse * sourceVisibility,
    tint: palette.sourceRing,
    blendMode: "screen",
    rotation: lineAngle * 0.32,
  });
  ghostLayer.addChild(sourceRing);

  const sourceCore = createGhostSprite(PIXI, textures.lensCore, {
    x: anchorX,
    y: anchorY,
    scaleX: scale * 0.18,
    scaleY: scale * 0.18,
    alpha: 0.72 * pulse * sourceVisibility,
    tint: palette.sourceCore,
    blendMode: "screen",
  });
  sharpLayer.addChild(sourceCore);

  const streak = createGhostSprite(PIXI, textures.streak, {
    x: lineMidX,
    y: lineMidY,
    scaleX: Math.max(scale * 1.4, lineLength / 190) * (1.2 + (axis.strength * 0.8)),
    scaleY: scale * 0.055,
    alpha: 0.012 * pulse * streakIntensity * sourceVisibility,
    tint: palette.streak,
    blendMode: "screen",
    rotation: lineAngle,
  });
  softLayer.addChild(streak);

  const ringConfigs = Array.from({ length: ringCount }, (_, index) => {
    const progressRatio = (index + 1) / (ringCount + 1);
    const spacingJitter = Math.sin((index + 1) * 4.73) * 0.026;
    const offset = -0.08 + (progressRatio * 1.3) + spacingJitter;
    const wave = (Math.sin((progressRatio * Math.PI * 2 * 1.7) + 0.6) + 1) / 2;
    const scaleWave = (Math.cos((progressRatio * Math.PI * 2 * 1.2) + 0.4) + 1) / 2;
    const focusWeight = Math.exp(-(((offset - 0.68) / 0.16) ** 2));
    const edgeWeight = Math.exp(-(((offset - 1.02) / 0.18) ** 2));
    const tintPalette = palette.rings;

    return {
      offset,
      ringScale: (0.09 + (focusWeight * 0.38) + (edgeWeight * 0.24) + (scaleWave * 0.08)) * ringScale,
      discScale: (0.08 + (focusWeight * 0.54) + (edgeWeight * 0.4) + (wave * 0.1)) * ringScale,
      alpha: (0.28 + (focusWeight * 0.22) + (edgeWeight * 0.1) + (wave * 0.06)) * sourceVisibility,
      normalOffset: Math.sin((index + 1) * 5.31) * viewportDiagonal * (0.006 + (axis.strength * 0.002)),
      tint: tintPalette[index % tintPalette.length],
      fringeTint: palette.fringes[index % palette.fringes.length],
    };
  });

  for (const config of ringConfigs) {
    const drift = lineLength * config.offset;
    const ringX = anchorX + (lineUnitX * drift) + (lineNormalX * config.normalOffset);
    const ringY = anchorY + (lineUnitY * drift) + (lineNormalY * config.normalOffset);

    const ghostDisc = createGhostSprite(PIXI, textures.lensDisc, {
      x: ringX,
      y: ringY,
      scaleX: scale * config.discScale,
      scaleY: scale * config.discScale,
      alpha: config.alpha * pulse,
      tint: config.tint,
      blendMode: "screen",
    });
    ghostLayer.addChild(ghostDisc);

    const ring = createGhostSprite(PIXI, textures.lensRing, {
      x: ringX,
      y: ringY,
      scaleX: scale * config.ringScale,
      scaleY: scale * config.ringScale,
      alpha: config.alpha * 0.2 * pulse,
      tint: config.tint,
      blendMode: "screen",
      rotation: lineAngle * (0.35 + (config.offset * 0.08)),
    });
    ghostLayer.addChild(ring);

    const chromaticFringe = createGhostSprite(PIXI, textures.lensRing, {
      x: ringX + (lineNormalX * scale * 2.2),
      y: ringY + (lineNormalY * scale * 2.2),
      scaleX: scale * config.ringScale * 1.018,
      scaleY: scale * config.ringScale * 1.018,
      alpha: config.alpha * 0.08 * pulse,
      tint: config.fringeTint,
      blendMode: "screen",
      rotation: lineAngle * (0.35 + (config.offset * 0.08)),
    });
    ghostLayer.addChild(chromaticFringe);

  }

  const focusDistance = lineLength * 0.72;
  const focusX = anchorX + (lineUnitX * focusDistance) + (lineNormalX * scale * 8);
  const focusY = anchorY + (lineUnitY * focusDistance) + (lineNormalY * scale * 8);
  const focusGlow = createGhostSprite(PIXI, textures.lensGlow, {
    x: focusX + (lineNormalX * scale * 10),
    y: focusY + (lineNormalY * scale * 10),
    scaleX: scale * 0.24 * ringScale,
    scaleY: scale * 0.24 * ringScale,
    alpha: 0.16 * pulse * sourceVisibility,
    tint: palette.focusGlow,
    blendMode: "screen",
  });
  softLayer.addChild(focusGlow);

  const focusCore = createGhostSprite(PIXI, textures.lensCore, {
    x: focusX + (lineNormalX * scale * 13),
    y: focusY + (lineNormalY * scale * 13),
    scaleX: scale * 0.1 * ringScale,
    scaleY: scale * 0.1 * ringScale,
    alpha: 0.82 * pulse * sourceVisibility,
    tint: palette.focusCore,
    blendMode: "screen",
  });
  sharpLayer.addChild(focusCore);

  const terminalRing = createGhostSprite(PIXI, textures.lensRing, {
    x: endX,
    y: endY,
    scaleX: scale * 0.56 * ringScale,
    scaleY: scale * 0.56 * ringScale,
    alpha: 0.1 * pulse * sourceVisibility,
    tint: palette.terminalRing,
    blendMode: "screen",
    rotation: lineAngle * 0.44,
  });
  ghostLayer.addChild(terminalRing);

  const terminalGhost = createGhostSprite(PIXI, textures.lensDisc, {
    x: endX,
    y: endY,
    scaleX: scale * 0.72 * ringScale,
    scaleY: scale * 0.72 * ringScale,
    alpha: 0.28 * pulse * sourceVisibility,
    tint: palette.terminalGhost,
    blendMode: "screen",
  });
  ghostLayer.addChild(terminalGhost);

  return container;
}

async function loadPixiModule() {
  if (pixiModule) {
    return pixiModule;
  }

  pixiModule = await import(PIXI_MODULE_URL);
  return pixiModule;
}

async function createPixiEngine() {
  const PIXI = await loadPixiModule();
  const app = new PIXI.Application();

  await app.init({
    width: 1,
    height: 1,
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    sharedTicker: false,
    clearBeforeRender: true,
  });

  return {
    PIXI,
    app,
    filters: {
      cameraFlareSoft: new PIXI.BlurFilter({ strength: 1, quality: 3 }),
      cameraFlareGhost: new PIXI.BlurFilter({ strength: 1, quality: 2 }),
    },
    textures: {
      glow: createRadialTexture(PIXI, {
        size: 1024,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 0.95)" },
          { offset: 0.12, color: "rgba(255, 248, 214, 0.94)" },
          { offset: 0.42, color: "rgba(255, 233, 160, 0.38)" },
          { offset: 0.74, color: "rgba(255, 228, 145, 0.08)" },
          { offset: 1, color: "rgba(255, 228, 145, 0)" },
        ],
      }),
      halo: createRadialTexture(PIXI, {
        size: 768,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 0)" },
          { offset: 0.56, color: "rgba(255, 250, 222, 0)" },
          { offset: 0.72, color: "rgba(255, 244, 193, 0.24)" },
          { offset: 0.88, color: "rgba(255, 239, 179, 0.12)" },
          { offset: 1, color: "rgba(255, 239, 179, 0)" },
        ],
      }),
      core: createRadialTexture(PIXI, {
        size: 512,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 1)" },
          { offset: 0.2, color: "rgba(255, 248, 214, 0.96)" },
          { offset: 0.5, color: "rgba(255, 238, 170, 0.38)" },
          { offset: 1, color: "rgba(255, 230, 145, 0)" },
        ],
      }),
      lensGlow: createRadialTexture(PIXI, {
        size: 1024,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 0.94)" },
          { offset: 0.14, color: "rgba(255, 255, 255, 0.82)" },
          { offset: 0.42, color: "rgba(255, 255, 255, 0.32)" },
          { offset: 0.74, color: "rgba(255, 255, 255, 0.1)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      }),
      lensDisc: createRadialTexture(PIXI, {
        size: 512,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 0.82)" },
          { offset: 0.72, color: "rgba(255, 255, 255, 0.8)" },
          { offset: 0.86, color: "rgba(255, 255, 255, 0.7)" },
          { offset: 0.94, color: "rgba(255, 255, 255, 0.34)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      }),
      lensCore: createRadialTexture(PIXI, {
        size: 512,
        colorStops: [
          { offset: 0, color: "rgba(255, 255, 255, 1)" },
          { offset: 0.18, color: "rgba(255, 255, 255, 0.98)" },
          { offset: 0.5, color: "rgba(255, 255, 255, 0.44)" },
          { offset: 1, color: "rgba(255, 255, 255, 0)" },
        ],
      }),
      dust: createDustTexture(PIXI),
      dustDisc: createDustDiscTexture(PIXI),
      lensRing: createLensRingTexture(PIXI),
      streak: createStreakTexture(PIXI),
    },
  };
}

function queuePixiEngine() {
  if (pixiEngine) {
    return Promise.resolve(pixiEngine);
  }

  if (!pixiEnginePromise) {
    pixiEnginePromise = createPixiEngine()
      .then((engine) => {
        pixiEngine = engine;
        return engine;
      })
      .catch((error) => {
        console.error("PixiJS effect engine failed to initialize.", error);
        pixiEnginePromise = null;
        return null;
      });
  }

  return pixiEnginePromise;
}

function resizeEngine(app, width, height) {
  if (app.renderer.width !== width || app.renderer.height !== height) {
    app.renderer.resize(width, height);
  }
}

export function ensureEffectEngine() {
  return queuePixiEngine();
}

export function hasEffectLayers(layers = []) {
  return layers.some((layer) => layer?.type === "effect");
}

export function drawEffectLayer(context, layer, scene) {
  if (!pixiEngine) {
    queuePixiEngine();
    return false;
  }

  const { app, PIXI, filters, textures } = pixiEngine;
  const { width, height } = scene;

  resizeEngine(app, width, height);
  app.stage.removeChildren();

  const container = layer.effectKind === EFFECT_KIND_GOLD_DUST
    ? createDustContainer(PIXI, textures, layer, scene)
    : layer.effectKind === EFFECT_KIND_CAMERA_FLARE
      ? createCameraFlareContainer(PIXI, textures, filters, layer, scene)
      : createFlareContainer(PIXI, textures, filters, layer, scene);
  app.stage.addChild(container);

  try {
    app.render();
    context.save();

    try {
      context.globalCompositeOperation = layer.effectKind === EFFECT_KIND_SUN_FLARE
        ? "screen"
        : "source-over";
      context.drawImage(app.canvas, 0, 0, width, height);
    } finally {
      context.restore();
    }

    return true;
  } finally {
    app.stage.removeChildren();
    container.destroy({ children: true });
  }
}
