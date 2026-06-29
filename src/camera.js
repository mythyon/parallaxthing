import { clamp, easeInOutQuad, lerp } from "utils";

export function createDefaultCamera() {
  return {
    start: { x: -180, y: 0, zoom: 1 },
    end: { x: 180, y: 0, zoom: 1 },
    duration: 6,
    easing: "ease-in-out",
  };
}

function applyEasing(progress, easing) {
  const safeProgress = clamp(progress, 0, 1);

  if (easing === "linear") {
    return safeProgress;
  }

  if (easing === "ease-in") {
    return safeProgress * safeProgress;
  }

  if (easing === "ease-out") {
    return 1 - (1 - safeProgress) ** 2;
  }

  return easeInOutQuad(safeProgress);
}

export function getCameraFrame(camera, progress) {
  const eased = applyEasing(progress, camera.easing);

  return {
    x: lerp(camera.start.x, camera.end.x, eased),
    y: lerp(camera.start.y, camera.end.y, eased),
    zoom: lerp(camera.start.zoom, camera.end.zoom, eased),
  };
}
