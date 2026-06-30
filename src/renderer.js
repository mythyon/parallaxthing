import { clamp, resolveContainScale } from "utils";
import { getCameraFrame } from "camera";

function drawEmptyState(ctx, width, height, getText) {
  ctx.save();
  ctx.fillStyle = "rgba(24, 32, 47, 0.65)";
  ctx.font = '600 24px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(getText("previewEmptyTitle"), width / 2, height / 2 - 6);
  ctx.font = '400 16px "Segoe UI", sans-serif';
  ctx.fillStyle = "rgba(24, 32, 47, 0.48)";
  ctx.fillText(getText("previewEmptyText"), width / 2, height / 2 + 24);
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
    const depthWeight = clamp(layer.depth / 100, 0, 2);
    const baseScale = state.preview.fitMode === "contain"
      ? resolveContainScale(layer.width, layer.height, width, height)
      : 1;
    const combinedScale = baseScale * (layer.scale / 100) * camera.zoom;
    const renderWidth = layer.width * combinedScale;
    const renderHeight = layer.height * combinedScale;
    const parallaxStrength = 0.1 + depthWeight * 1.2;
    const offsetX = (layer.offsetX - camera.x * parallaxStrength) * camera.zoom;
    const offsetY = (layer.offsetY - camera.y * parallaxStrength) * camera.zoom;

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
