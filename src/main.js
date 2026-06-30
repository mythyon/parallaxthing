import { createAnimationController } from "animation";
import { createDefaultCamera } from "camera";
import { createWebMExporter } from "exporter";
import { createI18n, getDefaultLocale, persistLocale } from "i18n";
import { applyAutoDepth, moveLayer, removeLayer, updateLayer } from "layers";
import { loadLayersFromFiles } from "loader";
import { createRenderer } from "renderer";
import { createUI } from "ui";
import { clamp, roundTo, toFiniteNumber } from "utils";

const MAX_LAYERS = 24;
const MAX_DIMENSION = 4096;
const VIEWPORT_PRESETS = {
  landscape: {
    aspectRatio: "16 / 9",
    exportSizes: {
      "1080p": { width: 1920, height: 1080 },
      "720p": { width: 1280, height: 720 },
    },
  },
  portrait: {
    aspectRatio: "9 / 16",
    exportSizes: {
      "1080p": { width: 1080, height: 1920 },
      "720p": { width: 720, height: 1280 },
    },
  },
  square: {
    aspectRatio: "1 / 1",
    exportSizes: {
      "1080p": { width: 1080, height: 1080 },
      "720p": { width: 720, height: 720 },
    },
  },
};
const LAYER_LIMITS = {
  depth: { min: 0, max: 200 },
  scale: { min: 50, max: 300 },
  offset: { min: -2000, max: 2000 },
};
const CAMERA_LIMITS = {
  position: { min: -1500, max: 1500 },
  zoom: { min: 0.2, max: 3 },
  duration: { min: 1, max: 60 },
};
const CAMERA_PRESETS = {
  "move-left": {
    start: { x: -180, y: 0, zoom: 1 },
    end: { x: 180, y: 0, zoom: 1 },
    duration: 6,
    easing: "ease-in-out",
  },
  "move-right": {
    start: { x: 180, y: 0, zoom: 1 },
    end: { x: -180, y: 0, zoom: 1 },
    duration: 6,
    easing: "ease-in-out",
  },
  "zoom-in": {
    start: { x: 0, y: 0, zoom: 1 },
    end: { x: 0, y: 0, zoom: 1.28 },
    duration: 6,
    easing: "ease-in-out",
  },
  "zoom-in-out": {
    start: { x: 0, y: 0, zoom: 1 },
    end: { x: 0, y: 0, zoom: 1.28 },
    duration: 6,
    easing: "ease-in-out",
    motion: "zoom-in-pause-out",
  },
};

function isPngCandidate(file) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

const state = {
  locale: getDefaultLocale(),
  layers: [],
  selectedLayerId: null,
  cameraPreset: "move-left",
  preview: {
    backgroundColor: "#ffffff",
    fitMode: "none",
    viewportPreset: "landscape",
  },
  export: {
    quality: "1080p",
    fps: 30,
    smoothMotion: false,
    isRendering: false,
    progress: 0,
    downloadUrl: "",
    downloadFileName: "",
  },
  camera: createDefaultCamera(),
  playback: {
    isPlaying: false,
    progress: 0,
  },
  drag: {
    pointerId: null,
    isDragging: false,
    startClientX: 0,
    startClientY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    scaleX: 1,
    scaleY: 1,
  },
  status: {
    entries: [],
    tone: "neutral",
  },
};

const i18n = createI18n(state.locale);

const elements = {
  topbarTitle: document.querySelector("#topbar-title"),
  langSwitch: document.querySelector(".lang-switch"),
  langEnButton: document.querySelector("#lang-en-button"),
  langRuButton: document.querySelector("#lang-ru-button"),
  dropzone: document.querySelector("#dropzone"),
  dropzoneTitle: document.querySelector("#dropzone-title"),
  dropzoneSubtitle: document.querySelector("#dropzone-subtitle"),
  fileInput: document.querySelector("#file-input"),
  statusMessage: document.querySelector("#status-message"),
  stackBlock: document.querySelector("#stack-block"),
  stackTitle: document.querySelector("#stack-title"),
  autoDepthButton: document.querySelector("#auto-depth-button"),
  layerList: document.querySelector("#layer-list"),
  previewTitle: document.querySelector("#preview-title"),
  canvasFrame: document.querySelector("#canvas-frame"),
  canvas: document.querySelector("#preview-canvas"),
  timeLabel: document.querySelector("#time-label"),
  timelineInput: document.querySelector("#timeline-input"),
  playButton: document.querySelector("#play-button"),
  pauseButton: document.querySelector("#pause-button"),
  stopButton: document.querySelector("#stop-button"),
  cameraTitle: document.querySelector("#camera-title"),
  cameraPresetTitle: document.querySelector("#camera-preset-title"),
  cameraPresetLabel: document.querySelector("#camera-preset-label"),
  cameraPresetInput: document.querySelector("#camera-preset-input"),
  cameraPresetLeft: document.querySelector("#camera-preset-left"),
  cameraPresetRight: document.querySelector("#camera-preset-right"),
  cameraPresetZoom: document.querySelector("#camera-preset-zoom"),
  cameraPresetZoomOut: document.querySelector("#camera-preset-zoom-out"),
  cameraPresetCustom: document.querySelector("#camera-preset-custom"),
  cameraStartTitle: document.querySelector("#camera-start-title"),
  cameraStartXLabel: document.querySelector("#camera-start-x-label"),
  cameraStartYLabel: document.querySelector("#camera-start-y-label"),
  cameraStartZoomLabel: document.querySelector("#camera-start-zoom-label"),
  cameraStartXInput: document.querySelector("#camera-start-x-input"),
  cameraStartYInput: document.querySelector("#camera-start-y-input"),
  cameraStartZoomInput: document.querySelector("#camera-start-zoom-input"),
  cameraEndTitle: document.querySelector("#camera-end-title"),
  cameraEndXLabel: document.querySelector("#camera-end-x-label"),
  cameraEndYLabel: document.querySelector("#camera-end-y-label"),
  cameraEndZoomLabel: document.querySelector("#camera-end-zoom-label"),
  cameraEndXInput: document.querySelector("#camera-end-x-input"),
  cameraEndYInput: document.querySelector("#camera-end-y-input"),
  cameraEndZoomInput: document.querySelector("#camera-end-zoom-input"),
  sceneTitle: document.querySelector("#scene-title"),
  viewportLabel: document.querySelector("#viewport-label"),
  viewportPicker: document.querySelector("#viewport-picker"),
  viewportLandscapeButton: document.querySelector("#viewport-landscape-button"),
  viewportPortraitButton: document.querySelector("#viewport-portrait-button"),
  viewportSquareButton: document.querySelector("#viewport-square-button"),
  bgColorLabel: document.querySelector("#bg-color-label"),
  bgColorInput: document.querySelector("#bg-color-input"),
  fitModeLabel: document.querySelector("#fit-mode-label"),
  fitModeInput: document.querySelector("#fit-mode-input"),
  fitModeContain: document.querySelector("#fit-mode-contain"),
  fitModeNone: document.querySelector("#fit-mode-none"),
  cameraDurationLabelPreview: document.querySelector("#camera-duration-label-preview"),
  cameraDurationInputPreview: document.querySelector("#camera-duration-input-preview"),
  cameraEasingLabelPreview: document.querySelector("#camera-easing-label-preview"),
  cameraEasingInputPreview: document.querySelector("#camera-easing-input-preview"),
  cameraEasingLinearPreview: document.querySelector("#camera-easing-linear-preview"),
  cameraEasingEaseInPreview: document.querySelector("#camera-easing-ease-in-preview"),
  cameraEasingEaseOutPreview: document.querySelector("#camera-easing-ease-out-preview"),
  cameraEasingEaseInOutPreview: document.querySelector("#camera-easing-ease-in-out-preview"),
  exportTitle: document.querySelector("#export-title"),
  exportQualityLabel: document.querySelector("#export-quality-label"),
  exportQualityInput: document.querySelector("#export-quality-input"),
  exportQuality1080: document.querySelector("#export-quality-1080"),
  exportQuality720: document.querySelector("#export-quality-720"),
  exportFpsLabel: document.querySelector("#export-fps-label"),
  exportFpsInput: document.querySelector("#export-fps-input"),
  exportFps30: document.querySelector("#export-fps-30"),
  exportFps60: document.querySelector("#export-fps-60"),
  exportSmoothInput: document.querySelector("#export-smooth-input"),
  exportSmoothLabel: document.querySelector("#export-smooth-label"),
  exportProgress: document.querySelector("#export-progress"),
  exportProgressBar: document.querySelector("#export-progress-bar"),
  exportProgressValue: document.querySelector("#export-progress-value"),
  exportNote: document.querySelector("#export-note"),
  exportButton: document.querySelector("#export-button"),
  exportDownload: document.querySelector("#export-download"),
  exportDownloadLabel: document.querySelector("#export-download-label"),
  exportDownloadLink: document.querySelector("#export-download-link"),
};

function createStatusEntry(key, params = {}) {
  return { key, params };
}

function setStatus(entries, tone = "neutral") {
  state.status = {
    entries: Array.isArray(entries) ? entries : [entries],
    tone,
  };
}

function getSelectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayerId) ?? null;
}

function ensureSelectedLayer() {
  if (state.layers.length === 0) {
    state.selectedLayerId = null;
    return;
  }

  if (!getSelectedLayer()) {
    state.selectedLayerId = state.layers[0].id;
  }
}

function clampNumber(value, min, max, fallback, decimals = 0) {
  return roundTo(clamp(toFiniteNumber(value, fallback), min, max), decimals);
}

function applyCameraPreset(presetId) {
  const preset = CAMERA_PRESETS[presetId];

  if (!preset) {
    return;
  }

  state.cameraPreset = presetId;
  state.camera.start = { ...preset.start };
  state.camera.end = { ...preset.end };
  state.camera.duration = preset.duration;
  state.camera.easing = preset.easing;
  state.camera.motion = preset.motion ?? "standard";
}

function getViewportConfig(
  preset = state.preview.viewportPreset,
  quality = state.export.quality,
) {
  const viewportPreset = VIEWPORT_PRESETS[preset] ?? VIEWPORT_PRESETS.landscape;
  const exportSize = viewportPreset.exportSizes[quality] ?? viewportPreset.exportSizes["1080p"];

  return {
    aspectRatio: viewportPreset.aspectRatio,
    exportWidth: exportSize.width,
    exportHeight: exportSize.height,
  };
}

function normalizeLoadError(error) {
  if (error?.message === "file_too_large") {
    return createStatusEntry("statusFileTooLarge", {
      name: error.fileName,
      size: error.maxDimension,
    });
  }

  if (error?.message === "decode_failed") {
    return createStatusEntry("statusDecodeFailed", {
      name: error.fileName,
    });
  }

  return { text: error?.message || i18n.t("statusLoadFailed") };
}

function normalizeExportError(error) {
  if (error?.message === "export_unsupported") {
    return createStatusEntry("statusExportUnsupported");
  }

  return createStatusEntry("statusExportFailed");
}

function releaseLayerResources(layer) {
  URL.revokeObjectURL(layer.objectUrl);

  if ("close" in layer.bitmap && typeof layer.bitmap.close === "function") {
    layer.bitmap.close();
  }
}

function createExportFileName(viewportPreset, quality, fps, smoothMotion) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const smoothSuffix = smoothMotion ? "-smooth" : "";
  return `parallax-thing-${viewportPreset}-${quality}-${fps}fps${smoothSuffix}-${stamp}.webm`;
}

function revokeExportDownload() {
  if (state.export.downloadUrl) {
    URL.revokeObjectURL(state.export.downloadUrl);
  }

  state.export.downloadUrl = "";
  state.export.downloadFileName = "";
}

function prepareExportDownload(blob, fileName) {
  revokeExportDownload();
  state.export.downloadUrl = URL.createObjectURL(blob);
  state.export.downloadFileName = fileName;
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

const renderer = createRenderer(elements.canvas, {
  t: (key, params) => i18n.t(key, params),
});

const exporter = createWebMExporter({
  t: (key, params) => i18n.t(key, params),
});
let lastRenderedExportPercent = -1;

function renderAll() {
  ui.render();
  renderer.render(state, state.playback.progress);
}

function updateExportProgressUI(force = false) {
  const progressPercent = Math.round(state.export.progress * 100);

  if (!force && progressPercent === lastRenderedExportPercent) {
    return;
  }

  lastRenderedExportPercent = progressPercent;
  elements.exportProgress.hidden = !state.export.isRendering;
  elements.exportProgressBar.value = progressPercent;
  elements.exportProgressValue.textContent = `${progressPercent}%`;
  elements.exportProgressValue.setAttribute(
    "aria-label",
    i18n.t("exportProgressLabel", { value: progressPercent }),
  );
}

function resolveExportProgressValue(update) {
  if (typeof update === "number") {
    return clamp(update, 0, 1);
  }

  if (update && typeof update.value === "number") {
    return clamp(update.value, 0, 1);
  }

  return 0;
}

const animation = createAnimationController({
  state,
  onFrame() {
    renderAll();
  },
});

async function handleFilesSelected(fileList) {
  const files = Array.from(fileList ?? []);

  if (files.length === 0) {
    return;
  }

  const availableSlots = MAX_LAYERS - state.layers.length;

  if (availableSlots <= 0) {
    setStatus(createStatusEntry("statusLimitReached", { count: MAX_LAYERS }), "error");
    renderAll();
    return;
  }

  const pngFiles = files.filter(isPngCandidate);

  if (pngFiles.length === 0) {
    setStatus(createStatusEntry("statusNonPngOnly"), "error");
    renderAll();
    return;
  }

  const acceptedFiles = pngFiles.slice(0, availableSlots);

  try {
    const { layers } = await loadLayersFromFiles(acceptedFiles, {
      maxDimension: MAX_DIMENSION,
    });

    state.layers = [...state.layers, ...layers];
    state.playback.progress = 0;
    state.playback.isPlaying = false;

    if (!state.selectedLayerId && layers.length > 0) {
      state.selectedLayerId = layers[0].id;
    }

    ensureSelectedLayer();

    const messages = [];

    if (pngFiles.length > acceptedFiles.length) {
      messages.push(createStatusEntry("statusLimitSkipped", { count: pngFiles.length - acceptedFiles.length }));
    }

    const ignoredNonPng = files.length - pngFiles.length;

    if (ignoredNonPng > 0) {
      messages.push(createStatusEntry("statusNonPngIgnored", { count: ignoredNonPng }));
    }

    setStatus(messages, messages.length > 0 ? "success" : "neutral");
    renderAll();
  } catch (error) {
    console.error(error);
    setStatus(normalizeLoadError(error), "error");
    renderAll();
  }
}

function handleLayerRemove(layerId) {
  const layerIndex = state.layers.findIndex((item) => item.id === layerId);
  const layer = state.layers[layerIndex];

  if (!layer) {
    return;
  }

  releaseLayerResources(layer);
  state.layers = removeLayer(state.layers, layerId);
  state.playback.isPlaying = false;
  state.playback.progress = 0;

  if (state.selectedLayerId === layerId) {
    const fallbackLayer = state.layers[layerIndex] ?? state.layers[layerIndex - 1] ?? null;
    state.selectedLayerId = fallbackLayer?.id ?? null;
  }

  ensureSelectedLayer();
  setStatus(createStatusEntry("statusRemoved", { name: layer.fileName }), "neutral");
  renderAll();
}

function handleLayerMove(layerId, direction) {
  state.layers = moveLayer(state.layers, layerId, direction);
  ensureSelectedLayer();
  setStatus(createStatusEntry("statusLayerOrderUpdated"), "neutral");
  renderAll();
}

function handleLayerSelect(layerId) {
  state.selectedLayerId = layerId;
  renderAll();
}

function handleLayerChange(field, rawValue) {
  const selectedLayer = getSelectedLayer();

  if (!selectedLayer) {
    return;
  }

  let patch;

  if (field === "depth") {
    patch = {
      depth: clampNumber(rawValue, LAYER_LIMITS.depth.min, LAYER_LIMITS.depth.max, selectedLayer.depth),
    };
  } else if (field === "scale") {
    patch = {
      scale: clampNumber(rawValue, LAYER_LIMITS.scale.min, LAYER_LIMITS.scale.max, selectedLayer.scale),
    };
  } else if (field === "offsetX") {
    patch = {
      offsetX: clampNumber(rawValue, LAYER_LIMITS.offset.min, LAYER_LIMITS.offset.max, selectedLayer.offsetX),
    };
  } else if (field === "offsetY") {
    patch = {
      offsetY: clampNumber(rawValue, LAYER_LIMITS.offset.min, LAYER_LIMITS.offset.max, selectedLayer.offsetY),
    };
  } else {
    return;
  }

  state.layers = updateLayer(state.layers, selectedLayer.id, patch);
  renderAll();
}

function handleCameraChange(field, rawValue) {
  state.cameraPreset = "custom";

  if (field === "startX") {
    state.camera.start.x = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.start.x);
  } else if (field === "startY") {
    state.camera.start.y = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.start.y);
  } else if (field === "startZoom") {
    state.camera.start.zoom = clampNumber(rawValue, CAMERA_LIMITS.zoom.min, CAMERA_LIMITS.zoom.max, state.camera.start.zoom, 2);
  } else if (field === "endX") {
    state.camera.end.x = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.end.x);
  } else if (field === "endY") {
    state.camera.end.y = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.end.y);
  } else if (field === "endZoom") {
    state.camera.end.zoom = clampNumber(rawValue, CAMERA_LIMITS.zoom.min, CAMERA_LIMITS.zoom.max, state.camera.end.zoom, 2);
  } else if (field === "duration") {
    state.camera.duration = clampNumber(rawValue, CAMERA_LIMITS.duration.min, CAMERA_LIMITS.duration.max, state.camera.duration, 1);
  } else if (field === "easing") {
    state.camera.easing = rawValue;
  } else {
    return;
  }

  renderAll();
}

function handleCameraPresetChange(presetId) {
  applyCameraPreset(presetId);
  renderAll();
}

function handleBackgroundChange(color) {
  state.preview.backgroundColor = color;
  renderAll();
}

function handleFitModeChange(mode) {
  state.preview.fitMode = mode;
  renderAll();
}

function handleViewportPresetChange(preset) {
  if (!VIEWPORT_PRESETS[preset]) {
    return;
  }

  state.preview.viewportPreset = preset;
  renderAll();
}

function handleExportFpsChange(rawValue) {
  const fps = rawValue === "60" ? 60 : 30;
  state.export.fps = fps;
  renderAll();
}

function handleExportQualityChange(rawValue) {
  state.export.quality = rawValue === "720p" ? "720p" : "1080p";
  renderAll();
}

function handleExportSmoothChange(checked) {
  state.export.smoothMotion = Boolean(checked);
  renderAll();
}

function handleLanguageChange(locale) {
  state.locale = i18n.setLocale(locale);
  persistLocale(state.locale);
  renderAll();
}

function handleAutoDepth() {
  if (state.layers.length === 0) {
    return;
  }

  state.layers = applyAutoDepth(state.layers);
  setStatus(createStatusEntry("statusAutoDepthApplied"), "success");
  renderAll();
}

async function handleExport() {
  if (state.layers.length === 0 || state.export.isRendering) {
    return;
  }

  animation.pause();
  revokeExportDownload();
  state.export.isRendering = true;
  state.export.progress = 0;
  lastRenderedExportPercent = -1;
  setStatus(createStatusEntry("statusExportStarted"), "neutral");
  renderAll();
  updateExportProgressUI(true);

  try {
    const { exportWidth, exportHeight } = getViewportConfig();
    const blob = await exporter.export(state, {
      width: exportWidth,
      height: exportHeight,
      fps: state.export.fps,
      smoothMotion: state.export.smoothMotion,
      onProgress(update) {
        state.export.progress = resolveExportProgressValue(update);
        updateExportProgressUI();
      },
    });
    const fileName = createExportFileName(
      state.preview.viewportPreset,
      state.export.quality,
      state.export.fps,
      state.export.smoothMotion,
    );
    prepareExportDownload(blob, fileName);
    triggerDownload(state.export.downloadUrl, fileName);
    setStatus(createStatusEntry("statusExportDone", { name: fileName }), "success");
  } catch (error) {
    console.error(error);
    setStatus(normalizeExportError(error), "error");
  } finally {
    state.export.isRendering = false;
    state.export.progress = 0;
    lastRenderedExportPercent = -1;
    renderAll();
  }
}

function handleCanvasPointerDown(event) {
  if (state.export.isRendering || event.button !== 0) {
    return;
  }

  const selectedLayer = getSelectedLayer();

  if (!selectedLayer) {
    return;
  }

  const rect = elements.canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return;
  }

  state.drag.pointerId = event.pointerId;
  state.drag.isDragging = true;
  state.drag.startClientX = event.clientX;
  state.drag.startClientY = event.clientY;
  state.drag.startOffsetX = selectedLayer.offsetX;
  state.drag.startOffsetY = selectedLayer.offsetY;
  state.drag.scaleX = elements.canvas.width / rect.width;
  state.drag.scaleY = elements.canvas.height / rect.height;

  elements.canvas.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  renderAll();
}

function handleCanvasPointerMove(event) {
  if (!state.drag.isDragging || state.drag.pointerId !== event.pointerId) {
    return;
  }

  const selectedLayer = getSelectedLayer();

  if (!selectedLayer) {
    return;
  }

  const nextOffsetX = state.drag.startOffsetX + ((event.clientX - state.drag.startClientX) * state.drag.scaleX);
  const nextOffsetY = state.drag.startOffsetY + ((event.clientY - state.drag.startClientY) * state.drag.scaleY);

  state.layers = updateLayer(state.layers, selectedLayer.id, {
    offsetX: clampNumber(nextOffsetX, LAYER_LIMITS.offset.min, LAYER_LIMITS.offset.max, selectedLayer.offsetX),
    offsetY: clampNumber(nextOffsetY, LAYER_LIMITS.offset.min, LAYER_LIMITS.offset.max, selectedLayer.offsetY),
  });
  renderAll();
}

function stopCanvasDrag(pointerId = null) {
  if (!state.drag.isDragging) {
    return;
  }

  if (pointerId !== null && state.drag.pointerId !== pointerId) {
    return;
  }

  state.drag.pointerId = null;
  state.drag.isDragging = false;
  renderAll();
}

const ui = createUI({
  state,
  elements,
  i18n,
  callbacks: {
    onFilesSelected: handleFilesSelected,
    onLayerRemove: handleLayerRemove,
    onLayerMove: handleLayerMove,
    onLayerSelect: handleLayerSelect,
    onLayerChange: handleLayerChange,
    onCameraChange: handleCameraChange,
    onPlay: () => animation.play(),
    onPause: () => animation.pause(),
    onStop: () => animation.stop(),
    onSeek: (progress) => animation.seek(progress),
    onBackgroundChange: handleBackgroundChange,
    onFitModeChange: handleFitModeChange,
    onViewportPresetChange: handleViewportPresetChange,
    onExportQualityChange: handleExportQualityChange,
    onExportFpsChange: handleExportFpsChange,
    onExportSmoothChange: handleExportSmoothChange,
    onLanguageChange: handleLanguageChange,
    onCameraPresetChange: handleCameraPresetChange,
    onAutoDepth: handleAutoDepth,
    onExport: handleExport,
  },
});

elements.canvas.addEventListener("pointerdown", handleCanvasPointerDown);
window.addEventListener("pointermove", handleCanvasPointerMove);
window.addEventListener("pointerup", (event) => stopCanvasDrag(event.pointerId));
window.addEventListener("pointercancel", (event) => stopCanvasDrag(event.pointerId));
window.addEventListener("resize", renderAll);

window.addEventListener("beforeunload", () => {
  revokeExportDownload();

  for (const layer of state.layers) {
    releaseLayerResources(layer);
  }
});

applyCameraPreset(state.cameraPreset);
renderAll();
