const LOCALE_STORAGE_KEY = "parallax-locale";

const translations = {
  en: {
    docTitle: "Parallax Thing",
    topbarTitle: "Parallax Thing",
    langLabel: "Language",
    langSwitcherAria: "Language switcher",
    workspaceTabsAria: "Workspace sections",
    dropzoneTitle: "Drop PNG layers here",
    dropzoneSubtitle: "or click to choose files",
    autoDepthButton: "Auto speed",
    layerCount: "Layers loaded: {count}",
    sceneSizeSummary: "{viewport} | {placement}",
    stackTitle: "Layers",
    layerListEmpty: "No layers yet.",
    previewTitle: "Preview",
    previewCanvasAria: "Preview canvas",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    layerEditorTitle: "Layer",
    layerEditorEmptyTitle: "Select a layer",
    layerEditorEmptyText: "Load PNG files and click a layer card to edit speed, scale, and X/Y.",
    selectedLayerLabel: "Selected Layer",
    selectedLayerMeta: "{width}x{height} px",
    layerDepthLabel: "Speed",
    layerScaleLabel: "Scale",
    layerOffsetXLabel: "X",
    layerOffsetYLabel: "Y",
    cameraTitle: "Motion",
    cameraPresetTitle: "Animation Preset",
    cameraPresetLabel: "Preset",
    presetMoveLeft: "Move Left",
    presetMoveRight: "Move Right",
    presetZoomIn: "Zoom In",
    presetCustom: "Custom",
    cameraStartTitle: "Start",
    cameraEndTitle: "End",
    cameraMotionTitle: "Timing",
    cameraStartXLabel: "X",
    cameraStartYLabel: "Y",
    cameraStartZoomLabel: "Zoom",
    cameraEndXLabel: "X",
    cameraEndYLabel: "Y",
    cameraEndZoomLabel: "Zoom",
    cameraDurationLabel: "Duration, sec",
    cameraEasingLabel: "Easing",
    easingLinear: "Linear",
    easingEaseIn: "Ease In",
    easingEaseOut: "Ease Out",
    easingEaseInOut: "Ease In Out",
    sceneTitle: "Settings",
    viewportLabel: "Viewport",
    viewportPickerAria: "Viewport format",
    viewportLandscape: "Landscape",
    viewportPortrait: "Portrait",
    viewportSquare: "Square",
    bgColorLabel: "Background",
    fitModeLabel: "Layer Placement",
    fitModeContain: "Auto fit",
    fitModeNone: "Original size",
    exportTitle: "Export",
    exportQualityLabel: "Quality",
    exportQuality1080: "1080p",
    exportQuality720: "720p",
    exportFpsLabel: "FPS",
    exportFps30: "30 FPS",
    exportFps60: "60 FPS",
    exportSmoothLabel: "More smooth",
    exportProgressLabel: "Rendering {value}%",
    exportNote: "WebM | {size} | {fps} FPS",
    exportButton: "Export WebM",
    exportingButton: "Exporting...",
    exportDownloadLabel: "Direct blob link",
    exportDownloadLink: "Download exported file",
    layerDetails: "Speed {depth} | {width}x{height}",
    moveUp: "Up",
    moveDown: "Down",
    remove: "Remove",
    previewEmptyTitle: "Load PNG layers to preview motion",
    previewEmptyText: "Configure motion and export a WebM from the preview tab.",
    statusInitial: "Load PNG files to start editing layers.",
    statusLimitReached: "Layer limit reached ({count}). Remove a layer before loading more.",
    statusNonPngOnly: "Only PNG files are supported.",
    statusLoaded: "Loaded PNG layers: {count}.",
    statusLimitSkipped: "Skipped due to layer limit: {count}.",
    statusNonPngIgnored: "Ignored non-PNG files: {count}.",
    statusRemoved: "Removed {name}.",
    statusLayerOrderUpdated: "Layer order updated.",
    statusAutoDepthApplied: "Auto speed applied to all layers.",
    statusFileTooLarge: "{name} exceeds the {size}px limit.",
    statusDecodeFailed: "Could not decode {name}.",
    statusLoadFailed: "Failed to load selected files.",
    statusExportStarted: "Exporting WebM...",
    statusExportDone: "Saved {name}.",
    statusExportUnsupported: "WebM export is not supported in this browser.",
    statusExportFailed: "WebM export failed.",
  },
  ru: {
    docTitle: "Parallax Thing",
    topbarTitle: "Parallax Thing",
    langLabel: "Язык",
    langSwitcherAria: "Переключатель языка",
    workspaceTabsAria: "Разделы рабочей области",
    dropzoneTitle: "Перетащите PNG-слои сюда",
    dropzoneSubtitle: "или нажмите для выбора файлов",
    autoDepthButton: "Авто скорость",
    layerCount: "Загружено слоев: {count}",
    sceneSizeSummary: "{viewport} | {placement}",
    stackTitle: "Слои",
    layerListEmpty: "Слои еще не загружены.",
    previewTitle: "Просмотр",
    previewCanvasAria: "Холст предпросмотра",
    play: "Старт",
    pause: "Пауза",
    stop: "Стоп",
    layerEditorTitle: "Слой",
    layerEditorEmptyTitle: "Выберите слой",
    layerEditorEmptyText: "Загрузите PNG и нажмите на карточку слоя, чтобы настроить скорость, масштаб и X/Y.",
    selectedLayerLabel: "Выбранный слой",
    selectedLayerMeta: "{width}x{height} px",
    layerDepthLabel: "Скорость",
    layerScaleLabel: "Масштаб",
    layerOffsetXLabel: "X",
    layerOffsetYLabel: "Y",
    cameraTitle: "Движение",
    cameraPresetTitle: "Пресет анимации",
    cameraPresetLabel: "Пресет",
    presetMoveLeft: "Движение влево",
    presetMoveRight: "Движение вправо",
    presetZoomIn: "Увеличение",
    presetCustom: "Своя",
    cameraStartTitle: "Старт",
    cameraEndTitle: "Финиш",
    cameraMotionTitle: "Тайминг",
    cameraStartXLabel: "X",
    cameraStartYLabel: "Y",
    cameraStartZoomLabel: "Масштаб",
    cameraEndXLabel: "X",
    cameraEndYLabel: "Y",
    cameraEndZoomLabel: "Масштаб",
    cameraDurationLabel: "Длительность, сек",
    cameraEasingLabel: "Плавность",
    easingLinear: "Линейно",
    easingEaseIn: "Ускорение",
    easingEaseOut: "Замедление",
    easingEaseInOut: "Ускорение / замедление",
    sceneTitle: "Настройки",
    viewportLabel: "Вьюпорт",
    viewportPickerAria: "Формат вьюпорта",
    viewportLandscape: "Альбом",
    viewportPortrait: "Портрет",
    viewportSquare: "Квадрат",
    bgColorLabel: "Фон",
    fitModeLabel: "Размещение слоев",
    fitModeContain: "Автоподгонка",
    fitModeNone: "Оригинальный размер",
    exportTitle: "Экспорт",
    exportQualityLabel: "Качество",
    exportQuality1080: "1080p",
    exportQuality720: "720p",
    exportFpsLabel: "FPS",
    exportFps30: "30 FPS",
    exportFps60: "60 FPS",
    exportSmoothLabel: "Более плавно",
    exportProgressLabel: "Создание {value}%",
    exportNote: "WebM | {size} | {fps} FPS",
    exportButton: "Экспорт WebM",
    exportingButton: "Экспорт...",
    exportDownloadLabel: "Прямая blob-ссылка",
    exportDownloadLink: "Скачать готовый файл",
    layerDetails: "Скорость {depth} | {width}x{height}",
    moveUp: "Вверх",
    moveDown: "Вниз",
    remove: "Удалить",
    previewEmptyTitle: "Загрузите PNG-слои для проверки параллакса",
    previewEmptyText: "Настройте движение и экспортируйте WebM из вкладки просмотра.",
    statusInitial: "Загрузите PNG-файлы, чтобы начать настройку слоев.",
    statusLimitReached: "Достигнут лимит слоев ({count}). Удалите слой перед новой загрузкой.",
    statusNonPngOnly: "Поддерживаются только PNG-файлы.",
    statusLoaded: "Загружено PNG-слоев: {count}.",
    statusLimitSkipped: "Пропущено из-за лимита слоев: {count}.",
    statusNonPngIgnored: "Пропущено не-PNG файлов: {count}.",
    statusRemoved: "Удален файл {name}.",
    statusLayerOrderUpdated: "Порядок слоев обновлен.",
    statusAutoDepthApplied: "Авто-скорость применена ко всем слоям.",
    statusFileTooLarge: "{name} превышает лимит {size}px.",
    statusDecodeFailed: "Не удалось декодировать {name}.",
    statusLoadFailed: "Не удалось загрузить выбранные файлы.",
    statusExportStarted: "Идет экспорт WebM...",
    statusExportDone: "Сохранен файл {name}.",
    statusExportUnsupported: "Экспорт WebM не поддерживается в этом браузере.",
    statusExportFailed: "Не удалось экспортировать WebM.",
  },
};

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

function isSupportedLocale(locale) {
  return Object.hasOwn(translations, locale);
}

function readStoredLocale() {
  try {
    const locale = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(locale) ? locale : null;
  } catch {
    return null;
  }
}

export function getDefaultLocale() {
  const storedLocale = readStoredLocale();

  if (storedLocale) {
    return storedLocale;
  }

  const language = navigator.language?.toLowerCase() ?? "en";
  return language.startsWith("ru") ? "ru" : "en";
}

export function persistLocale(locale) {
  if (!isSupportedLocale(locale)) {
    return;
  }

  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
  }
}

export function createI18n(initialLocale = "en") {
  let locale = isSupportedLocale(initialLocale) ? initialLocale : "en";

  return {
    getLocale() {
      return locale;
    },
    setLocale(nextLocale) {
      locale = translations[nextLocale] ? nextLocale : "en";
      return locale;
    },
    t(key, params) {
      const dictionary = translations[locale] ?? translations.en;
      const fallback = translations.en[key] ?? key;
      const template = dictionary[key] ?? fallback;
      return interpolate(template, params);
    },
  };
}
