export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

export function uid(prefix = "item") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function fileNameWithoutExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function easeInOutQuad(progress) {
  if (progress < 0.5) {
    return 2 * progress * progress;
  }

  return 1 - ((-2 * progress + 2) ** 2) / 2;
}

export function resolveContainScale(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  return Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
}

export function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function roundTo(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
