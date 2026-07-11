import { clamp, resolveContainScale } from "utils";
import { getCameraFrame } from "camera";
import { drawEffectLayer } from "effects";
import { isEffectLayer } from "layers";

const SCENE_REFERENCE_SIZES = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

function getSceneMetrics(state, width, height) {
  const reference = SCENE_REFERENCE_SIZES[state.preview.viewportPreset]
    ?? SCENE_REFERENCE_SIZES.landscape;

  return {
    referenceWidth: reference.width,
    referenceHeight: reference.height,
    coordinateScale: Math.min(width / reference.width, height / reference.height),
  };
}

function drawEmptyState(ctx, width, height, getText) {
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth ?? width;
  const isCompactViewport = viewportWidth <= 375;
  const titleText = getText("previewEmptyTitle");
  const secondaryText = getText("previewEmptyText");
  const canvasRect = typeof ctx.canvas.getBoundingClientRect === "function"
    ? ctx.canvas.getBoundingClientRect()
    : { width, height };
  const cssWidth = canvasRect.width || width;
  const pixelScale = width / cssWidth;
  const titleFontSize = isCompactViewport ? Math.round(14 * pixelScale) : 24;
  const secondaryFontSize = isCompactViewport ? Math.round(12 * pixelScale) : 16;
  const titleY = secondaryText ? height / 2 - 6 : height / 2;

  ctx.save();
  ctx.fillStyle = "rgba(24, 32, 47, 0.65)";
  ctx.font = `600 ${titleFontSize}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(titleText, width / 2, titleY);

  if (!secondaryText) {
    ctx.restore();
    return;
  }

  ctx.font = `400 ${secondaryFontSize}px "Segoe UI", sans-serif`;
  ctx.fillStyle = "rgba(24, 32, 47, 0.48)";
  ctx.fillText(secondaryText, width / 2, height / 2 + 24);
  ctx.restore();
}

export function drawScene(context, {
  width,
  height,
  state,
  progress = 0,
  t = () => "",
  showEmptyState = true,
} = {}) {
  if (!width || !height) {
    return;
  }

  const camera = getCameraFrame(state.camera, progress);
  const { referenceWidth, referenceHeight, coordinateScale } = getSceneMetrics(state, width, height);

  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = state.preview.backgroundColor;
  context.fillRect(0, 0, width, height);

  if (state.layers.length === 0) {
    if (showEmptyState) {
      drawEmptyState(context, width, height, t);
    }

    context.restore();
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;

  for (const layer of [...state.layers].reverse()) {
    if (isEffectLayer(layer)) {
      drawEffectLayer(context, layer, {
        width,
        height,
        state,
        progress,
        camera,
        coordinateScale,
      });
      continue;
    }

    const depthWeight = clamp(layer.depth / 100, 0, 2);
    const baseScale = state.preview.fitMode === "contain"
      ? resolveContainScale(layer.width, layer.height, referenceWidth, referenceHeight)
      : 1;
    const zoomStrength = 1 + ((camera.zoom - 1) * depthWeight);
    const combinedScale = baseScale * (layer.scale / 100) * zoomStrength * coordinateScale;
    const renderWidth = layer.width * combinedScale;
    const renderHeight = layer.height * combinedScale;
    const parallaxStrength = 0.1 + depthWeight * 1.2;
    const offsetX = (layer.offsetX - camera.x * parallaxStrength) * camera.zoom * coordinateScale;
    const offsetY = (layer.offsetY - camera.y * parallaxStrength) * camera.zoom * coordinateScale;

    const drawX = centerX - renderWidth / 2 + offsetX;
    const drawY = centerY - renderHeight / 2 + offsetY;

    context.drawImage(layer.bitmap, drawX, drawY, renderWidth, renderHeight);
  }

  context.restore();
}

function resizeCanvasToDisplaySize(canvas) {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * pixelRatio);
  const height = Math.round(canvas.clientHeight * pixelRatio);

  if (width === 0 || height === 0) {
    return { width: 0, height: 0 };
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return { width, height };
}

export function createRenderer(canvas, { t }) {
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  function render(state, progress = 0) {
    const { width, height } = resizeCanvasToDisplaySize(canvas);

    drawScene(context, {
      width,
      height,
      state,
      progress,
      t,
      showEmptyState: true,
    });
  }

  return { render };
}
