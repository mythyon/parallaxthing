import { clamp } from "utils";

const PIXI_MODULE_URL = new URL("../vendor/pixi/pixi.min.js", import.meta.url).href;
const EFFECT_KIND_SUN_FLARE = "sun-flare";

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

function createFlareContainer(PIXI, textures, layer, scene) {
  const { width, height, camera, progress } = scene;
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
  const offsetX = (layer.offsetX - camera.x * parallaxStrength) * camera.zoom;
  const offsetY = (layer.offsetY - camera.y * parallaxStrength) * camera.zoom;
  const trailOffset = Math.sin(progress * Math.PI * 2 * (0.36 + (raySpeed * 0.18))) * 8 * depthWeight;
  const centerX = (width / 2) + offsetX;
  const centerY = (height / 2) + offsetY;
  const tint = hexToNumber(layer.tint);
  const alpha = clamp(layer.opacity / 100, 0, 1);
  const sunGlowEnabled = Boolean(layer.sunGlowEnabled);
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

  const ghostConfigs = [
    { offset: -0.34, radius: 0.34, alpha: 0.2, texture: textures.halo, scaleX: 0.34, scaleY: 0.3 },
    { offset: 0.42, radius: 0.24, alpha: 0.15, texture: textures.core, scaleX: 0.22, scaleY: 0.22 },
    { offset: 0.86, radius: 0.42, alpha: 0.14, texture: textures.halo, scaleX: 0.42, scaleY: 0.34 },
    { offset: 1.28, radius: 0.18, alpha: 0.11, texture: textures.core, scaleX: 0.14, scaleY: 0.14 },
  ];

  for (const config of ghostConfigs) {
    const distance = scale * 260 * config.offset;
    const x = centerX + (Math.cos(lensAngle) * distance) + (trailOffset * config.offset * 0.7);
    const y = centerY + (Math.sin(lensAngle) * distance);
    const ghost = createGhostSprite(PIXI, config.texture, {
      x,
      y,
      scaleX: scale * config.radius * rayLength * config.scaleX * 3.1,
      scaleY: scale * config.radius * config.scaleY * 3.1,
      alpha: config.alpha,
      tint,
      blendMode: addBlendMode,
      rotation: lensAngle * 0.45,
    });
    container.addChild(ghost);
  }

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

  const { app, PIXI, textures } = pixiEngine;
  const { width, height } = scene;

  resizeEngine(app, width, height);
  app.stage.removeChildren();

  const container = createFlareContainer(PIXI, textures, layer, scene);
  app.stage.addChild(container);
  app.render();
  context.drawImage(app.canvas, 0, 0, width, height);

  app.stage.removeChildren();
  container.destroy({ children: true });
  return true;
}
