import { createAnimationController } from "animation";
import { createDefaultCamera } from "camera";
import { ensureEffectEngine, hasEffectLayers } from "effects";
import { createWebMExporter } from "exporter";
import { createI18n, getDefaultLocale, persistLocale } from "i18n";
import { applyAutoDepth, createEffectLayer, isEffectLayer, isImageLayer, moveLayer, removeLayer, updateLayer } from "layers";
import { loadLayersFromFiles } from "loader";
import { createRenderer } from "renderer";
import { createUI } from "ui";
import { clamp, lerp, roundTo, toFiniteNumber } from "utils";

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
  scale: { min: 10, max: 300 },
  effectScale: { min: 10, max: 400 },
  opacity: { min: 0, max: 100 },
  raySpeed: { min: 0, max: 200 },
  rayLength: { min: 50, max: 220 },
  rayCount: { min: 4, max: 18 },
  rayThickness: { min: 40, max: 220 },
  rayBlur: { min: 0, max: 100 },
  rotationOffset: { min: -180, max: 180 },
  rotationSpeed: { min: 0, max: 200 },
  sunLensFlareIntensity: { min: 0, max: 100 },
  sunLensFlareCount: { min: 3, max: 10 },
  sunLensFlareSize: { min: 50, max: 180 },
  sunLensFlareBlur: { min: 0, max: 100 },
  sunLensFlareAxisLength: { min: 40, max: 180 },
  flareRingCount: { min: 4, max: 16 },
  flareAngleOffset: { min: -180, max: 180 },
  flareAxisLength: { min: 40, max: 220 },
  flareRingScale: { min: 50, max: 220 },
  flareEndpointSpeed: { min: 0, max: 200 },
  flareBlur: { min: 0, max: 100 },
  flareStreakIntensity: { min: 0, max: 200 },
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
    duration: 10,
    easing: "ease-in-out",
  },
  "move-right": {
    start: { x: 180, y: 0, zoom: 1 },
    end: { x: -180, y: 0, zoom: 1 },
    duration: 10,
    easing: "ease-in-out",
  },
  "zoom-in": {
    start: { x: 0, y: 0, zoom: 1 },
    end: { x: 0, y: 0, zoom: 1.28 },
    duration: 10,
    easing: "ease-in-out",
  },
  "zoom-in-out": {
    start: { x: 0, y: 0, zoom: 1 },
    end: { x: 0, y: 0, zoom: 1.28 },
    duration: 10,
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
    isPinching: false,
    pointerType: "",
    startClientX: 0,
    startClientY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    targetOffsetX: 0,
    targetOffsetY: 0,
    touchPoints: new Map(),
    pinchStartDistance: 0,
    pinchStartScale: 100,
    pinchStartCenterX: 0,
    pinchStartCenterY: 0,
    pinchStartOffsetX: 0,
    pinchStartOffsetY: 0,
    targetScale: 100,
    scaleX: 1,
    scaleY: 1,
    frameId: 0,
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
  addEffectButton: document.querySelector("#add-effect-button"),
  addDustButton: document.querySelector("#add-dust-button"),
  addCameraFlareButton: document.querySelector("#add-camera-flare-button"),
  layerList: document.querySelector("#layer-list"),
  previewTitle: document.querySelector("#preview-title"),
  previewPanel: document.querySelector(".preview-panel"),
  canvasFrame: document.querySelector("#canvas-frame"),
  canvas: document.querySelector("#preview-canvas"),
  timeLabel: document.querySelector("#time-label"),
  timelineInput: document.querySelector("#timeline-input"),
  playButton: document.querySelector("#play-button"),
  pauseButton: document.querySelector("#pause-button"),
  stopButton: document.querySelector("#stop-button"),
  cameraTitle: document.querySelector("#camera-title"),
  cameraMotionTypeLabel: document.querySelector("#camera-motion-type-label"),
  cameraAdvancedTitle: document.querySelector("#camera-advanced-title"),
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

function getTouchDistance(touchPoints) {
  const points = Array.from(touchPoints.values());

  if (points.length < 2) {
    return 0;
  }

  const [first, second] = points;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function getTouchCenter(touchPoints) {
  const points = Array.from(touchPoints.values());

  if (points.length < 2) {
    return null;
  }

  const [first, second] = points;
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  };
}

function beginCanvasGesture() {
  document.body.classList.add("is-layer-dragging");
}

function resetCanvasGestureState() {
  state.drag.pointerId = null;
  state.drag.isDragging = false;
  state.drag.isPinching = false;
  state.drag.pointerType = "";
  state.drag.touchPoints.clear();
  state.drag.pinchStartDistance = 0;
  state.drag.pinchStartScale = 100;
  state.drag.pinchStartCenterX = 0;
  state.drag.pinchStartCenterY = 0;
  state.drag.pinchStartOffsetX = 0;
  state.drag.pinchStartOffsetY = 0;
  state.drag.frameId = 0;
  document.body.classList.remove("is-layer-dragging");
}

function applyCameraPreset(presetId) {
  const preset = CAMERA_PRESETS[presetId];

  if (!preset) {
    return;
  }

  const currentDuration = state.camera.duration;
  state.cameraPreset = presetId;
  state.camera.start = { ...preset.start };
  state.camera.end = { ...preset.end };
  state.camera.duration = currentDuration;
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
  if (!isImageLayer(layer)) {
    return;
  }

  URL.revokeObjectURL(layer.objectUrl);

  if ("close" in layer.bitmap && typeof layer.bitmap.close === "function") {
    layer.bitmap.close();
  }
}

function getScaleLimits(layer) {
  return isEffectLayer(layer) ? LAYER_LIMITS.effectScale : LAYER_LIMITS.scale;
}

function insertLayerAfterSelection(nextLayer) {
  const selectedIndex = state.layers.findIndex((layer) => layer.id === state.selectedLayerId);

  if (selectedIndex === -1) {
    state.layers = [...state.layers, nextLayer];
    return;
  }

  const nextLayers = [...state.layers];
  nextLayers.splice(selectedIndex + 1, 0, nextLayer);
  state.layers = nextLayers;
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

function updatePreviewFrameLayout() {
  if (!elements.previewPanel || !elements.canvasFrame) {
    return;
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const maxPreviewHeight = Math.max(240, Math.round(viewportHeight * 0.6));
  const { aspectRatio } = getViewportConfig();
  const [ratioWidthRaw, ratioHeightRaw] = aspectRatio.split("/").map((value) => Number.parseFloat(value.trim()));
  const ratioWidth = Number.isFinite(ratioWidthRaw) && ratioWidthRaw > 0 ? ratioWidthRaw : 16;
  const ratioHeight = Number.isFinite(ratioHeightRaw) && ratioHeightRaw > 0 ? ratioHeightRaw : 9;
  const aspect = ratioWidth / ratioHeight;
  const previewPanelStyle = window.getComputedStyle(elements.previewPanel);
  const horizontalPadding =
    Number.parseFloat(previewPanelStyle.paddingLeft) + Number.parseFloat(previewPanelStyle.paddingRight);
  const availableWidth = Math.max(220, elements.previewPanel.clientWidth - horizontalPadding);
  const frameWidth = Math.min(availableWidth, maxPreviewHeight * aspect);
  const frameHeight = frameWidth / aspect;

  elements.canvasFrame.style.setProperty("--preview-frame-width", `${Math.round(frameWidth)}px`);
  elements.canvasFrame.style.setProperty("--preview-frame-height", `${Math.round(frameHeight)}px`);
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
  updatePreviewFrameLayout();
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
    const scaleLimits = getScaleLimits(selectedLayer);

    patch = {
      scale: clampNumber(rawValue, scaleLimits.min, scaleLimits.max, selectedLayer.scale),
    };
  } else if (field === "opacity" && isEffectLayer(selectedLayer)) {
    patch = {
      opacity: clampNumber(rawValue, LAYER_LIMITS.opacity.min, LAYER_LIMITS.opacity.max, selectedLayer.opacity),
    };
  } else if (field === "sunGlowEnabled" && isEffectLayer(selectedLayer)) {
    patch = {
      sunGlowEnabled: Boolean(rawValue),
    };
  } else if (field === "sunLensFlareEnabled" && isEffectLayer(selectedLayer)) {
    patch = {
      sunLensFlareEnabled: Boolean(rawValue),
    };
  } else if (field === "sunLensFlarePreset" && isEffectLayer(selectedLayer)) {
    patch = {
      sunLensFlarePreset: rawValue === "cool" ? "cool" : "warm",
    };
  } else if (field in LAYER_LIMITS && field.startsWith("sunLensFlare") && isEffectLayer(selectedLayer)) {
    const limits = LAYER_LIMITS[field];
    patch = {
      [field]: clampNumber(rawValue, limits.min, limits.max, selectedLayer[field] ?? limits.min),
    };
  } else if (field === "raySpeed" && isEffectLayer(selectedLayer)) {
    patch = {
      raySpeed: clampNumber(rawValue, LAYER_LIMITS.raySpeed.min, LAYER_LIMITS.raySpeed.max, selectedLayer.raySpeed),
    };
  } else if (field === "rayLength" && isEffectLayer(selectedLayer)) {
    patch = {
      rayLength: clampNumber(rawValue, LAYER_LIMITS.rayLength.min, LAYER_LIMITS.rayLength.max, selectedLayer.rayLength),
    };
  } else if (field === "rayCount" && isEffectLayer(selectedLayer)) {
    patch = {
      rayCount: clampNumber(rawValue, LAYER_LIMITS.rayCount.min, LAYER_LIMITS.rayCount.max, selectedLayer.rayCount),
    };
  } else if (field === "rayThickness" && isEffectLayer(selectedLayer)) {
    patch = {
      rayThickness: clampNumber(rawValue, LAYER_LIMITS.rayThickness.min, LAYER_LIMITS.rayThickness.max, selectedLayer.rayThickness),
    };
  } else if (field === "rayBlur" && isEffectLayer(selectedLayer)) {
    patch = {
      rayBlur: clampNumber(rawValue, LAYER_LIMITS.rayBlur.min, LAYER_LIMITS.rayBlur.max, selectedLayer.rayBlur),
    };
  } else if (field === "rotationOffset" && isEffectLayer(selectedLayer)) {
    patch = {
      rotationOffset: clampNumber(rawValue, LAYER_LIMITS.rotationOffset.min, LAYER_LIMITS.rotationOffset.max, selectedLayer.rotationOffset),
    };
  } else if (field === "rotationSpeed" && isEffectLayer(selectedLayer)) {
    patch = {
      rotationSpeed: clampNumber(rawValue, LAYER_LIMITS.rotationSpeed.min, LAYER_LIMITS.rotationSpeed.max, selectedLayer.rotationSpeed),
    };
  } else if (field === "flareColorPreset" && isEffectLayer(selectedLayer)) {
    patch = {
      flareColorPreset: rawValue === "cool" ? "cool" : "warm",
    };
  } else if (field === "flareRingCount" && isEffectLayer(selectedLayer)) {
    patch = {
      flareRingCount: clampNumber(rawValue, LAYER_LIMITS.flareRingCount.min, LAYER_LIMITS.flareRingCount.max, selectedLayer.flareRingCount),
    };
  } else if (field === "flareAngleOffset" && isEffectLayer(selectedLayer)) {
    patch = {
      flareAngleOffset: clampNumber(rawValue, LAYER_LIMITS.flareAngleOffset.min, LAYER_LIMITS.flareAngleOffset.max, selectedLayer.flareAngleOffset),
    };
  } else if (field === "flareAxisLength" && isEffectLayer(selectedLayer)) {
    patch = {
      flareAxisLength: clampNumber(rawValue, LAYER_LIMITS.flareAxisLength.min, LAYER_LIMITS.flareAxisLength.max, selectedLayer.flareAxisLength),
    };
  } else if (field === "flareRingScale" && isEffectLayer(selectedLayer)) {
    patch = {
      flareRingScale: clampNumber(rawValue, LAYER_LIMITS.flareRingScale.min, LAYER_LIMITS.flareRingScale.max, selectedLayer.flareRingScale),
    };
  } else if (field === "flareEndpointSpeed" && isEffectLayer(selectedLayer)) {
    patch = {
      flareEndpointSpeed: clampNumber(rawValue, LAYER_LIMITS.flareEndpointSpeed.min, LAYER_LIMITS.flareEndpointSpeed.max, selectedLayer.flareEndpointSpeed),
    };
  } else if (field === "flareBlur" && isEffectLayer(selectedLayer)) {
    patch = {
      flareBlur: clampNumber(rawValue, LAYER_LIMITS.flareBlur.min, LAYER_LIMITS.flareBlur.max, selectedLayer.flareBlur),
    };
  } else if (field === "flareStreakIntensity" && isEffectLayer(selectedLayer)) {
    patch = {
      flareStreakIntensity: clampNumber(rawValue, LAYER_LIMITS.flareStreakIntensity.min, LAYER_LIMITS.flareStreakIntensity.max, selectedLayer.flareStreakIntensity),
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

function handleEffectOptionsToggle(layerId, isOpen, optionsField = "effectOptionsOpen") {
  const layer = state.layers.find((item) => item.id === layerId);

  if (!isEffectLayer(layer) || !["effectOptionsOpen", "sunLensFlareOptionsOpen"].includes(optionsField)) {
    return;
  }

  state.layers = updateLayer(state.layers, layerId, {
    [optionsField]: Boolean(isOpen),
  });
  renderAll();
}

function handleCameraChange(field, rawValue) {
  if (field === "startX") {
    state.cameraPreset = "custom";
    state.camera.start.x = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.start.x);
  } else if (field === "startY") {
    state.cameraPreset = "custom";
    state.camera.start.y = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.start.y);
  } else if (field === "startZoom") {
    state.cameraPreset = "custom";
    state.camera.start.zoom = clampNumber(rawValue, CAMERA_LIMITS.zoom.min, CAMERA_LIMITS.zoom.max, state.camera.start.zoom, 2);
  } else if (field === "endX") {
    state.cameraPreset = "custom";
    state.camera.end.x = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.end.x);
  } else if (field === "endY") {
    state.cameraPreset = "custom";
    state.camera.end.y = clampNumber(rawValue, CAMERA_LIMITS.position.min, CAMERA_LIMITS.position.max, state.camera.end.y);
  } else if (field === "endZoom") {
    state.cameraPreset = "custom";
    state.camera.end.zoom = clampNumber(rawValue, CAMERA_LIMITS.zoom.min, CAMERA_LIMITS.zoom.max, state.camera.end.zoom, 2);
  } else if (field === "duration") {
    state.camera.duration = clampNumber(rawValue, CAMERA_LIMITS.duration.min, CAMERA_LIMITS.duration.max, state.camera.duration, 1);
  } else if (field === "easing") {
    state.cameraPreset = "custom";
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

function handleAddEffect(effectKind = "sun-flare") {
  if (state.export.isRendering || state.layers.length === 0) {
    return;
  }

  if (state.layers.length >= MAX_LAYERS) {
    setStatus(createStatusEntry("statusLimitReached", { count: MAX_LAYERS }), "error");
    renderAll();
    return;
  }

  const effectLayer = createEffectLayer(effectKind);
  state.layers = [effectLayer, ...state.layers];
  state.selectedLayerId = effectLayer.id;
  state.playback.isPlaying = false;
  const statusKey = effectKind === "gold-dust"
    ? "statusDustAdded"
    : effectKind === "camera-flare"
      ? "statusCameraFlareAdded"
      : "statusEffectAdded";
  setStatus(createStatusEntry(statusKey), "success");
  renderAll();

  ensureEffectEngine().then(() => {
    renderAll();
  });
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
    if (state.layers.length === 0) {
      elements.fileInput.click();
      event.preventDefault();
    }

    return;
  }

  const rect = elements.canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return;
  }

  const viewportPreset = VIEWPORT_PRESETS[state.preview.viewportPreset] ?? VIEWPORT_PRESETS.landscape;
  const referenceSize = viewportPreset.exportSizes["1080p"];
  state.drag.scaleX = referenceSize.width / rect.width;
  state.drag.scaleY = referenceSize.height / rect.height;
  elements.canvas.setPointerCapture?.(event.pointerId);

  if (event.pointerType === "touch") {
    state.drag.touchPoints.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    state.drag.pointerType = "touch";
    state.drag.targetOffsetX = selectedLayer.offsetX;
    state.drag.targetOffsetY = selectedLayer.offsetY;
    state.drag.targetScale = selectedLayer.scale;

    if (state.drag.touchPoints.size >= 2) {
      const touchCenter = getTouchCenter(state.drag.touchPoints);
      state.drag.pointerId = null;
      state.drag.isDragging = false;
      state.drag.isPinching = true;
      state.drag.pinchStartDistance = getTouchDistance(state.drag.touchPoints);
      state.drag.pinchStartScale = selectedLayer.scale;
      state.drag.pinchStartCenterX = touchCenter?.clientX ?? event.clientX;
      state.drag.pinchStartCenterY = touchCenter?.clientY ?? event.clientY;
      state.drag.pinchStartOffsetX = selectedLayer.offsetX;
      state.drag.pinchStartOffsetY = selectedLayer.offsetY;
    } else {
      state.drag.pointerId = event.pointerId;
      state.drag.isDragging = true;
      state.drag.isPinching = false;
      state.drag.startClientX = event.clientX;
      state.drag.startClientY = event.clientY;
      state.drag.startOffsetX = selectedLayer.offsetX;
      state.drag.startOffsetY = selectedLayer.offsetY;
    }
  } else {
    state.drag.pointerId = event.pointerId;
    state.drag.isDragging = true;
    state.drag.isPinching = false;
    state.drag.pointerType = event.pointerType ?? "";
    state.drag.startClientX = event.clientX;
    state.drag.startClientY = event.clientY;
    state.drag.startOffsetX = selectedLayer.offsetX;
    state.drag.startOffsetY = selectedLayer.offsetY;
    state.drag.targetOffsetX = selectedLayer.offsetX;
    state.drag.targetOffsetY = selectedLayer.offsetY;
    state.drag.targetScale = selectedLayer.scale;
  }

  beginCanvasGesture();
  event.preventDefault();
  ensureCanvasDragFrame();
  renderAll();
}

function handleCanvasPointerMove(event) {
  const selectedLayer = getSelectedLayer();

  if (!selectedLayer) {
    return;
  }

  if (event.pointerType === "touch" && state.drag.touchPoints.has(event.pointerId)) {
    state.drag.touchPoints.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (state.drag.isPinching && state.drag.touchPoints.size >= 2) {
      const scaleLimits = getScaleLimits(selectedLayer);
      const distance = getTouchDistance(state.drag.touchPoints);
      const touchCenter = getTouchCenter(state.drag.touchPoints);
      const scaleRatio = state.drag.pinchStartDistance > 0 ? distance / state.drag.pinchStartDistance : 1;

      state.drag.targetScale = clampNumber(
        state.drag.pinchStartScale * scaleRatio,
        scaleLimits.min,
        scaleLimits.max,
        selectedLayer.scale,
      );

      if (touchCenter) {
        const nextOffsetX = state.drag.pinchStartOffsetX + ((touchCenter.clientX - state.drag.pinchStartCenterX) * state.drag.scaleX);
        const nextOffsetY = state.drag.pinchStartOffsetY + ((touchCenter.clientY - state.drag.pinchStartCenterY) * state.drag.scaleY);

        state.drag.targetOffsetX = clampNumber(
          nextOffsetX,
          LAYER_LIMITS.offset.min,
          LAYER_LIMITS.offset.max,
          selectedLayer.offsetX,
        );
        state.drag.targetOffsetY = clampNumber(
          nextOffsetY,
          LAYER_LIMITS.offset.min,
          LAYER_LIMITS.offset.max,
          selectedLayer.offsetY,
        );
      }

      event.preventDefault();
      ensureCanvasDragFrame();
      return;
    }
  }

  if (!state.drag.isDragging || state.drag.pointerId !== event.pointerId) {
    return;
  }

  const nextOffsetX = state.drag.startOffsetX + ((event.clientX - state.drag.startClientX) * state.drag.scaleX);
  const nextOffsetY = state.drag.startOffsetY + ((event.clientY - state.drag.startClientY) * state.drag.scaleY);

  state.drag.targetOffsetX = clampNumber(
    nextOffsetX,
    LAYER_LIMITS.offset.min,
    LAYER_LIMITS.offset.max,
    selectedLayer.offsetX,
  );
  state.drag.targetOffsetY = clampNumber(
    nextOffsetY,
    LAYER_LIMITS.offset.min,
    LAYER_LIMITS.offset.max,
    selectedLayer.offsetY,
  );

  if (event.pointerType === "touch") {
    event.preventDefault();
  }
}

function ensureCanvasDragFrame() {
  if (state.drag.frameId) {
    return;
  }

  const tick = () => {
    state.drag.frameId = 0;

    if (!state.drag.isDragging && !state.drag.isPinching) {
      return;
    }

    const selectedLayer = getSelectedLayer();

    if (!selectedLayer) {
      stopCanvasDrag();
      return;
    }

    const smoothing = state.drag.pointerType === "touch" ? 0.22 : 0.38;
    const patch = {};

    if (state.drag.isDragging) {
      const nextOffsetX = lerp(selectedLayer.offsetX, state.drag.targetOffsetX, smoothing);
      const nextOffsetY = lerp(selectedLayer.offsetY, state.drag.targetOffsetY, smoothing);
      const shouldSnapOffset =
        Math.abs(state.drag.targetOffsetX - nextOffsetX) < 0.35 &&
        Math.abs(state.drag.targetOffsetY - nextOffsetY) < 0.35;

      patch.offsetX = shouldSnapOffset ? state.drag.targetOffsetX : roundTo(nextOffsetX, 2);
      patch.offsetY = shouldSnapOffset ? state.drag.targetOffsetY : roundTo(nextOffsetY, 2);
    }

    if (state.drag.isPinching) {
      const nextOffsetX = lerp(selectedLayer.offsetX, state.drag.targetOffsetX, smoothing);
      const nextOffsetY = lerp(selectedLayer.offsetY, state.drag.targetOffsetY, smoothing);
      const shouldSnapOffset =
        Math.abs(state.drag.targetOffsetX - nextOffsetX) < 0.35 &&
        Math.abs(state.drag.targetOffsetY - nextOffsetY) < 0.35;
      const nextScale = lerp(selectedLayer.scale, state.drag.targetScale, 0.24);
      const shouldSnapScale = Math.abs(state.drag.targetScale - nextScale) < 0.2;
      patch.offsetX = shouldSnapOffset ? state.drag.targetOffsetX : roundTo(nextOffsetX, 2);
      patch.offsetY = shouldSnapOffset ? state.drag.targetOffsetY : roundTo(nextOffsetY, 2);
      patch.scale = shouldSnapScale ? state.drag.targetScale : roundTo(nextScale, 2);
    }

    if (Object.keys(patch).length > 0) {
      state.layers = updateLayer(state.layers, selectedLayer.id, patch);
    }

    renderAll();

    if (state.drag.isDragging || state.drag.isPinching) {
      state.drag.frameId = window.requestAnimationFrame(tick);
    }
  };

  state.drag.frameId = window.requestAnimationFrame(tick);
}

function stopCanvasDrag(pointerId = null, pointerType = "") {
  if (!state.drag.isDragging && !state.drag.isPinching) {
    return;
  }

  if (pointerType === "touch") {
    state.drag.touchPoints.delete(pointerId);
  }

  if (
    !state.drag.isPinching &&
    pointerId !== null &&
    state.drag.pointerId !== pointerId
  ) {
    return;
  }

  const selectedLayer = getSelectedLayer();

  if (selectedLayer) {
    const patch = {};

    if (state.drag.isDragging) {
      patch.offsetX = state.drag.targetOffsetX;
      patch.offsetY = state.drag.targetOffsetY;
    }

    if (state.drag.isPinching) {
      patch.offsetX = state.drag.targetOffsetX;
      patch.offsetY = state.drag.targetOffsetY;
      patch.scale = state.drag.targetScale;
    }

    if (Object.keys(patch).length > 0) {
      state.layers = updateLayer(state.layers, selectedLayer.id, patch);
    }
  }

  if (state.drag.frameId) {
    window.cancelAnimationFrame(state.drag.frameId);
  }

  resetCanvasGestureState();
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
    onEffectOptionsToggle: handleEffectOptionsToggle,
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
    onAddEffect: handleAddEffect,
    onExport: handleExport,
  },
});

elements.canvas.addEventListener("pointerdown", handleCanvasPointerDown);
window.addEventListener("pointermove", handleCanvasPointerMove, { passive: false });
window.addEventListener("pointerup", (event) => stopCanvasDrag(event.pointerId, event.pointerType ?? ""));
window.addEventListener("pointercancel", (event) => stopCanvasDrag(event.pointerId, event.pointerType ?? ""));
window.addEventListener("resize", renderAll);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", renderAll);
}

window.addEventListener("beforeunload", () => {
  revokeExportDownload();

  for (const layer of state.layers) {
    releaseLayerResources(layer);
  }
});

applyCameraPreset(state.cameraPreset);

if (hasEffectLayers(state.layers)) {
  ensureEffectEngine().then(() => {
    renderAll();
  });
}

renderAll();
