import { formatTime } from "utils";

function getIconMarkup(name) {
  const icons = {
    play: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10-6.5z"/></svg>',
    pause: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
    stop: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 7h10v10H7z"/></svg>',
    export: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 7.5 7.5 9 9l2-2v7h2V7l2 2 1.5-1.5zM5 15h2v4h10v-4h2v6H5z"/></svg>',
    up: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 6 6 8h-4v4h-4v-4H6z"/></svg>',
    down: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 6h4v4h4l-6 8-6-8h4z"/></svg>',
    remove: '<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4zm1 6h2v8h-2zm4 0h2v8h-2zM7 9h2v8H7z"/></svg>',
    "viewport-landscape": '<svg class="button-icon viewport-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    "viewport-portrait": '<svg class="button-icon viewport-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    "viewport-square": '<svg class="button-icon viewport-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };

  return icons[name] ?? "";
}

function createLayerCardMarkup(layer, index, total, t, isSelected) {
  const isTop = index === 0;
  const isBottom = index === total - 1;
  const selectedClass = isSelected ? " is-selected" : "";

  return `
    <article class="layer-card${selectedClass}" data-layer-id="${layer.id}">
      <img class="layer-thumb" src="${layer.objectUrl}" alt="${layer.fileName}">
      <div class="layer-meta">
        <p class="layer-name">${layer.name}</p>
        <p class="layer-details">${t("layerDetails", { depth: layer.depth, width: layer.width, height: layer.height })}</p>
      </div>
      <div class="layer-actions">
        <button class="icon-button danger" type="button" data-action="remove" aria-label="${t("remove")}" title="${t("remove")}">${getIconMarkup("remove")}</button>
        <button class="icon-button" type="button" data-action="move-down" aria-label="${t("moveDown")}" title="${t("moveDown")}" ${isBottom ? "disabled" : ""}>${getIconMarkup("down")}</button>
        <button class="icon-button" type="button" data-action="move-up" aria-label="${t("moveUp")}" title="${t("moveUp")}" ${isTop ? "disabled" : ""}>${getIconMarkup("up")}</button>
      </div>
    </article>
  `;
}

function resolveSelectedLayer(state) {
  return state.layers.find((layer) => layer.id === state.selectedLayerId) ?? null;
}

function getViewportMeta(preset, quality = "1080p") {
  if (preset === "portrait") {
    return {
      aspectRatio: "9 / 16",
      sizeLabel: quality === "720p" ? "720x1280" : "1080x1920",
      translationKey: "viewportPortrait",
    };
  }

  if (preset === "square") {
    return {
      aspectRatio: "1 / 1",
      sizeLabel: quality === "720p" ? "720x720" : "1080x1080",
      translationKey: "viewportSquare",
    };
  }

  return {
    aspectRatio: "16 / 9",
    sizeLabel: quality === "720p" ? "1280x720" : "1920x1080",
    translationKey: "viewportLandscape",
  };
}

export function createUI({ state, elements, callbacks, i18n }) {
  function t(key, params) {
    return i18n.t(key, params);
  }

  function renderStaticText() {
    const viewportMeta = getViewportMeta(state.preview.viewportPreset, state.export.quality);
    const exportLabel = state.export.isRendering ? t("exportingButton") : t("exportButton");

    document.title = t("docTitle");
    document.documentElement.lang = state.locale;
    elements.canvas.setAttribute("aria-label", t("previewCanvasAria"));
    elements.langSwitch.setAttribute("aria-label", t("langSwitcherAria"));
    elements.workspaceTabs.setAttribute("aria-label", t("workspaceTabsAria"));
    elements.viewportPicker.setAttribute("aria-label", t("viewportPickerAria"));

    elements.topbarTitle.textContent = t("topbarTitle");
    elements.langLabel.textContent = t("langLabel");
    elements.tabPreview.textContent = t("previewTitle");
    elements.tabLayer.textContent = t("layerEditorTitle");
    elements.tabMotion.textContent = t("cameraTitle");
    elements.dropzoneTitle.textContent = t("dropzoneTitle");
    elements.dropzoneSubtitle.textContent = t("dropzoneSubtitle");
    elements.stackTitle.textContent = t("stackTitle");
    elements.autoDepthButton.textContent = t("autoDepthButton");
    elements.previewTitle.textContent = t("previewTitle");
    elements.playButton.innerHTML = getIconMarkup("play");
    elements.pauseButton.innerHTML = getIconMarkup("pause");
    elements.stopButton.innerHTML = getIconMarkup("stop");
    elements.playButton.setAttribute("aria-label", t("play"));
    elements.playButton.title = t("play");
    elements.pauseButton.setAttribute("aria-label", t("pause"));
    elements.pauseButton.title = t("pause");
    elements.stopButton.setAttribute("aria-label", t("stop"));
    elements.stopButton.title = t("stop");
    elements.layerEditorTitle.textContent = t("layerEditorTitle");
    elements.layerEditorEmptyTitle.textContent = t("layerEditorEmptyTitle");
    elements.layerEditorEmptyText.textContent = t("layerEditorEmptyText");
    elements.selectedLayerLabel.textContent = t("selectedLayerLabel");
    elements.layerDepthLabel.textContent = t("layerDepthLabel");
    elements.layerScaleLabel.textContent = t("layerScaleLabel");
    elements.layerOffsetXLabel.textContent = t("layerOffsetXLabel");
    elements.layerOffsetYLabel.textContent = t("layerOffsetYLabel");
    elements.cameraTitle.textContent = t("cameraTitle");
    elements.cameraPresetTitle.textContent = t("cameraPresetTitle");
    elements.cameraPresetLabel.textContent = t("cameraPresetLabel");
    elements.cameraPresetLeft.textContent = t("presetMoveLeft");
    elements.cameraPresetRight.textContent = t("presetMoveRight");
    elements.cameraPresetZoom.textContent = t("presetZoomIn");
    elements.cameraPresetCustom.textContent = t("presetCustom");
    elements.cameraStartTitle.textContent = t("cameraStartTitle");
    elements.cameraEndTitle.textContent = t("cameraEndTitle");
    elements.cameraMotionTitle.textContent = t("cameraMotionTitle");
    elements.cameraStartXLabel.textContent = t("cameraStartXLabel");
    elements.cameraStartYLabel.textContent = t("cameraStartYLabel");
    elements.cameraStartZoomLabel.textContent = t("cameraStartZoomLabel");
    elements.cameraEndXLabel.textContent = t("cameraEndXLabel");
    elements.cameraEndYLabel.textContent = t("cameraEndYLabel");
    elements.cameraEndZoomLabel.textContent = t("cameraEndZoomLabel");
    elements.cameraDurationLabel.textContent = t("cameraDurationLabel");
    elements.cameraEasingLabel.textContent = t("cameraEasingLabel");
    elements.cameraEasingLinear.textContent = t("easingLinear");
    elements.cameraEasingEaseIn.textContent = t("easingEaseIn");
    elements.cameraEasingEaseOut.textContent = t("easingEaseOut");
    elements.cameraEasingEaseInOut.textContent = t("easingEaseInOut");
    elements.sceneTitle.textContent = t("sceneTitle");
    elements.viewportLabel.textContent = t("viewportLabel");
    elements.viewportLandscapeButton.innerHTML = getIconMarkup("viewport-landscape");
    elements.viewportPortraitButton.innerHTML = getIconMarkup("viewport-portrait");
    elements.viewportSquareButton.innerHTML = getIconMarkup("viewport-square");
    elements.viewportLandscapeButton.title = t("viewportLandscape");
    elements.viewportPortraitButton.title = t("viewportPortrait");
    elements.viewportSquareButton.title = t("viewportSquare");
    elements.viewportLandscapeButton.setAttribute("aria-label", t("viewportLandscape"));
    elements.viewportPortraitButton.setAttribute("aria-label", t("viewportPortrait"));
    elements.viewportSquareButton.setAttribute("aria-label", t("viewportSquare"));
    elements.bgColorLabel.textContent = t("bgColorLabel");
    elements.fitModeLabel.textContent = t("fitModeLabel");
    elements.fitModeContain.textContent = t("fitModeContain");
    elements.fitModeNone.textContent = t("fitModeNone");
    elements.cameraDurationLabelPreview.textContent = t("cameraDurationLabel");
    elements.cameraEasingLabelPreview.textContent = t("cameraEasingLabel");
    elements.cameraEasingLinearPreview.textContent = t("easingLinear");
    elements.cameraEasingEaseInPreview.textContent = t("easingEaseIn");
    elements.cameraEasingEaseOutPreview.textContent = t("easingEaseOut");
    elements.cameraEasingEaseInOutPreview.textContent = t("easingEaseInOut");
    elements.exportTitle.textContent = t("exportTitle");
    elements.exportQualityLabel.textContent = t("exportQualityLabel");
    elements.exportQuality1080.textContent = t("exportQuality1080");
    elements.exportQuality720.textContent = t("exportQuality720");
    elements.exportFpsLabel.textContent = t("exportFpsLabel");
    elements.exportFps30.textContent = t("exportFps30");
    elements.exportFps60.textContent = t("exportFps60");
    elements.exportSmoothLabel.textContent = t("exportSmoothLabel");
    elements.exportDownloadLabel.textContent = t("exportDownloadLabel");
    elements.exportDownloadLink.textContent = t("exportDownloadLink");
    elements.exportNote.textContent = t("exportNote", {
      size: viewportMeta.sizeLabel,
      fps: state.export.fps,
    });
    elements.exportButton.innerHTML = `${getIconMarkup("export")}<span class="button-label">${exportLabel}</span>`;
    elements.exportButton.title = exportLabel;
  }

  function renderStatus() {
    const lines = state.status.entries.map((entry) => (
      entry.text ?? t(entry.key, entry.params)
    ));
    const hasLines = lines.length > 0 && state.status.tone !== "neutral";

    elements.statusMessage.textContent = lines.join(" ");
    elements.statusMessage.dataset.tone = state.status.tone;
    elements.statusMessage.hidden = !hasLines;
  }

  function renderLayerList() {
    if (state.layers.length === 0) {
      elements.stackBlock.hidden = true;
      elements.stackBlock.style.display = "none";
      elements.layerList.classList.add("empty");
      elements.layerList.innerHTML = `<p class="empty-state">${t("layerListEmpty")}</p>`;
      return;
    }

    elements.stackBlock.hidden = false;
    elements.stackBlock.style.display = "";
    elements.layerList.classList.remove("empty");
    elements.layerList.innerHTML = state.layers
      .map((layer, index) => createLayerCardMarkup(layer, index, state.layers.length, t, layer.id === state.selectedLayerId))
      .join("");
  }

  function renderLayerEditor() {
    const selectedLayer = resolveSelectedLayer(state);
    const hasSelection = Boolean(selectedLayer);

    elements.layerEditorEmpty.hidden = hasSelection;
    elements.layerEditorForm.hidden = !hasSelection;

    if (!selectedLayer) {
      return;
    }

    elements.layerEditorName.textContent = selectedLayer.fileName;
    elements.selectedLayerMeta.textContent = t("selectedLayerMeta", {
      width: selectedLayer.width,
      height: selectedLayer.height,
    });
    elements.layerDepthInput.value = String(selectedLayer.depth);
    elements.layerDepthValue.textContent = String(selectedLayer.depth);
    elements.layerScaleInput.value = String(selectedLayer.scale);
    elements.layerScaleValue.textContent = `${selectedLayer.scale}%`;
    elements.layerOffsetXInput.value = String(selectedLayer.offsetX);
    elements.layerOffsetYInput.value = String(selectedLayer.offsetY);
  }

  function renderCamera() {
    elements.cameraStartXInput.value = String(state.camera.start.x);
    elements.cameraStartYInput.value = String(state.camera.start.y);
    elements.cameraStartZoomInput.value = String(state.camera.start.zoom);
    elements.cameraEndXInput.value = String(state.camera.end.x);
    elements.cameraEndYInput.value = String(state.camera.end.y);
    elements.cameraEndZoomInput.value = String(state.camera.end.zoom);
    elements.cameraDurationInput.value = String(state.camera.duration);
    elements.cameraDurationInputPreview.value = String(state.camera.duration);
    elements.cameraEasingInput.value = state.camera.easing;
    elements.cameraEasingInputPreview.value = state.camera.easing;
    elements.cameraPresetInput.value = state.cameraPreset;
  }

  function renderPlayback() {
    const currentTime = state.playback.progress * state.camera.duration;
    const duration = state.camera.duration;

    elements.timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    elements.timelineInput.value = String(Math.round(state.playback.progress * 1000));
    elements.playButton.disabled = state.layers.length === 0 || state.playback.isPlaying || state.export.isRendering;
    elements.pauseButton.disabled = !state.playback.isPlaying || state.export.isRendering;
    elements.stopButton.disabled = state.layers.length === 0 || state.export.isRendering || (state.playback.progress === 0 && !state.playback.isPlaying);
  }

  function renderMeta() {
    const selectedLayer = resolveSelectedLayer(state);
    const viewportMeta = getViewportMeta(state.preview.viewportPreset, state.export.quality);
    const progressPercent = Math.round(state.export.progress * 100);

    elements.canvasFrame.style.setProperty("--viewport-ratio", viewportMeta.aspectRatio);
    elements.bgColorInput.value = state.preview.backgroundColor;
    elements.fitModeInput.value = state.preview.fitMode;
    elements.exportQualityInput.value = state.export.quality;
    elements.exportFpsInput.value = String(state.export.fps);
    elements.exportSmoothInput.checked = state.export.smoothMotion;
    elements.exportSmoothInput.disabled = state.layers.length === 0 || state.export.isRendering;
    elements.autoDepthButton.disabled = state.layers.length === 0 || state.export.isRendering;
    elements.exportButton.disabled = state.layers.length === 0 || state.export.isRendering;
    elements.exportProgress.hidden = !state.export.isRendering;
    elements.exportProgressBar.value = progressPercent;
    elements.exportProgressValue.textContent = `${progressPercent}%`;
    elements.exportProgressValue.className = "export-progress-value";
    elements.exportProgressValue.setAttribute("aria-label", t("exportProgressLabel", { value: progressPercent }));
    elements.exportDownload.hidden = true;
    elements.exportDownloadLink.href = state.export.downloadUrl || "#";
    elements.exportDownloadLink.download = state.export.downloadFileName || "";

    elements.canvasFrame.classList.toggle("is-draggable", Boolean(selectedLayer) && !state.export.isRendering);
    elements.canvasFrame.classList.toggle("is-dragging", state.drag.isDragging);

    elements.viewportLandscapeButton.classList.toggle("is-active", state.preview.viewportPreset === "landscape");
    elements.viewportPortraitButton.classList.toggle("is-active", state.preview.viewportPreset === "portrait");
    elements.viewportSquareButton.classList.toggle("is-active", state.preview.viewportPreset === "square");
    elements.viewportLandscapeButton.setAttribute("aria-pressed", String(state.preview.viewportPreset === "landscape"));
    elements.viewportPortraitButton.setAttribute("aria-pressed", String(state.preview.viewportPreset === "portrait"));
    elements.viewportSquareButton.setAttribute("aria-pressed", String(state.preview.viewportPreset === "square"));

    elements.langEnButton.classList.toggle("is-active", state.locale === "en");
    elements.langRuButton.classList.toggle("is-active", state.locale === "ru");
    elements.langEnButton.setAttribute("aria-pressed", String(state.locale === "en"));
    elements.langRuButton.setAttribute("aria-pressed", String(state.locale === "ru"));
  }

  function renderTabs() {
    const tabs = [
      ["preview", elements.tabPreview, elements.previewPanel],
      ["layer", elements.tabLayer, elements.layerPanel],
      ["motion", elements.tabMotion, elements.motionPanel],
    ];

    for (const [tabId, button, panel] of tabs) {
      const isActive = state.activeTab === tabId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      panel.hidden = !isActive;
    }
  }

  function render() {
    renderStaticText();
    renderTabs();
    renderStatus();
    renderLayerList();
    renderLayerEditor();
    renderCamera();
    renderMeta();
    renderPlayback();
  }

  elements.dropzone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", async (event) => {
    await callbacks.onFilesSelected(event.target.files);
    elements.fileInput.value = "";
  });

  for (const eventName of ["dragenter", "dragover"]) {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("is-dragover");
    });
  }

  for (const eventName of ["dragleave", "dragend"]) {
    elements.dropzone.addEventListener(eventName, () => {
      elements.dropzone.classList.remove("is-dragover");
    });
  }

  elements.dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove("is-dragover");
    await callbacks.onFilesSelected(event.dataTransfer?.files ?? []);
  });

  elements.layerList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-layer-id]");

    if (!card) {
      return;
    }

    const layerId = card.dataset.layerId;
    const button = event.target.closest("button[data-action]");

    if (!button) {
      callbacks.onLayerSelect(layerId);
      return;
    }

    const action = button.dataset.action;

    if (action === "remove") {
      callbacks.onLayerRemove(layerId);
      return;
    }

    if (action === "move-down") {
      callbacks.onLayerMove(layerId, 1);
      return;
    }

    if (action === "move-up") {
      callbacks.onLayerMove(layerId, -1);
    }
  });

  elements.playButton.addEventListener("click", () => callbacks.onPlay());
  elements.pauseButton.addEventListener("click", () => callbacks.onPause());
  elements.stopButton.addEventListener("click", () => callbacks.onStop());
  elements.timelineInput.addEventListener("input", (event) => callbacks.onSeek(Number(event.target.value) / 1000));
  elements.bgColorInput.addEventListener("input", (event) => callbacks.onBackgroundChange(event.target.value));
  elements.fitModeInput.addEventListener("change", (event) => callbacks.onFitModeChange(event.target.value));
  elements.exportQualityInput.addEventListener("change", (event) => callbacks.onExportQualityChange(event.target.value));
  elements.exportFpsInput.addEventListener("change", (event) => callbacks.onExportFpsChange(event.target.value));
  elements.exportSmoothInput.addEventListener("change", (event) => callbacks.onExportSmoothChange(event.target.checked));
  elements.exportButton.addEventListener("click", () => callbacks.onExport());
  elements.langEnButton.addEventListener("click", () => callbacks.onLanguageChange("en"));
  elements.langRuButton.addEventListener("click", () => callbacks.onLanguageChange("ru"));
  elements.autoDepthButton.addEventListener("click", () => callbacks.onAutoDepth());
  elements.tabPreview.addEventListener("click", () => callbacks.onTabChange("preview"));
  elements.tabLayer.addEventListener("click", () => callbacks.onTabChange("layer"));
  elements.tabMotion.addEventListener("click", () => callbacks.onTabChange("motion"));
  elements.viewportLandscapeButton.addEventListener("click", () => callbacks.onViewportPresetChange("landscape"));
  elements.viewportPortraitButton.addEventListener("click", () => callbacks.onViewportPresetChange("portrait"));
  elements.viewportSquareButton.addEventListener("click", () => callbacks.onViewportPresetChange("square"));
  elements.cameraPresetInput.addEventListener("change", (event) => callbacks.onCameraPresetChange(event.target.value));

  elements.layerDepthInput.addEventListener("input", (event) => callbacks.onLayerChange("depth", event.target.value));
  elements.layerScaleInput.addEventListener("input", (event) => callbacks.onLayerChange("scale", event.target.value));
  elements.layerOffsetXInput.addEventListener("input", (event) => callbacks.onLayerChange("offsetX", event.target.value));
  elements.layerOffsetYInput.addEventListener("input", (event) => callbacks.onLayerChange("offsetY", event.target.value));

  elements.cameraStartXInput.addEventListener("input", (event) => callbacks.onCameraChange("startX", event.target.value));
  elements.cameraStartYInput.addEventListener("input", (event) => callbacks.onCameraChange("startY", event.target.value));
  elements.cameraStartZoomInput.addEventListener("input", (event) => callbacks.onCameraChange("startZoom", event.target.value));
  elements.cameraEndXInput.addEventListener("input", (event) => callbacks.onCameraChange("endX", event.target.value));
  elements.cameraEndYInput.addEventListener("input", (event) => callbacks.onCameraChange("endY", event.target.value));
  elements.cameraEndZoomInput.addEventListener("input", (event) => callbacks.onCameraChange("endZoom", event.target.value));
  elements.cameraDurationInput.addEventListener("input", (event) => callbacks.onCameraChange("duration", event.target.value));
  elements.cameraDurationInputPreview.addEventListener("input", (event) => callbacks.onCameraChange("duration", event.target.value));
  elements.cameraEasingInput.addEventListener("change", (event) => callbacks.onCameraChange("easing", event.target.value));
  elements.cameraEasingInputPreview.addEventListener("change", (event) => callbacks.onCameraChange("easing", event.target.value));

  return { render };
}
