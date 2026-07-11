import { clamp, easeInOutQuad, lerp } from "utils";

const CAMERA_MOTION_STANDARD = "standard";
const CAMERA_MOTION_ZOOM_IN_PAUSE_OUT = "zoom-in-pause-out";

export function createDefaultCamera() {
  return {
    start: { x: -180, y: 0, zoom: 1 },
    end: { x: 180, y: 0, zoom: 1 },
    duration: 10,
    easing: "ease-in-out",
    motion: CAMERA_MOTION_STANDARD,
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

function getStandardCameraFrame(camera, progress) {
  const eased = applyEasing(progress, camera.easing);

  return {
    x: lerp(camera.start.x, camera.end.x, eased),
    y: lerp(camera.start.y, camera.end.y, eased),
    zoom: lerp(camera.start.zoom, camera.end.zoom, eased),
  };
}

function getZoomInPauseOutFrame(camera, progress) {
  const safeProgress = clamp(progress, 0, 1);
  const zoomInAccelEnd = 0.26;
  const zoomInBrakeEnd = 0.48;
  const peakDriftEnd = 0.62;
  const zoomOutAccelEnd = 0.84;
  const moveProgress = applyEasing(safeProgress, camera.easing);
  const zoomInCruise = lerp(camera.start.zoom, camera.end.zoom, 0.72);
  const prePeakZoom = lerp(camera.start.zoom, camera.end.zoom, 0.96);
  const preFinishZoom = lerp(camera.start.zoom, camera.end.zoom, 0.18);
  let zoom = camera.start.zoom;

  if (safeProgress < zoomInAccelEnd) {
    zoom = lerp(
      camera.start.zoom,
      zoomInCruise,
      applyEasing(safeProgress / zoomInAccelEnd, "ease-in"),
    );
  } else if (safeProgress < zoomInBrakeEnd) {
    zoom = lerp(
      zoomInCruise,
      prePeakZoom,
      applyEasing(
        (safeProgress - zoomInAccelEnd) / (zoomInBrakeEnd - zoomInAccelEnd),
        "ease-out",
      ),
    );
  } else if (safeProgress < peakDriftEnd) {
    zoom = lerp(
      prePeakZoom,
      camera.end.zoom,
      applyEasing(
        (safeProgress - zoomInBrakeEnd) / (peakDriftEnd - zoomInBrakeEnd),
        "ease-out",
      ),
    );
  } else if (safeProgress < zoomOutAccelEnd) {
    const zoomOutProgress = (safeProgress - peakDriftEnd) / (zoomOutAccelEnd - peakDriftEnd);

    zoom = lerp(
      camera.end.zoom,
      preFinishZoom,
      applyEasing(zoomOutProgress, "ease-in"),
    );
  } else {
    const finishSettleProgress = (safeProgress - zoomOutAccelEnd) / (1 - zoomOutAccelEnd);

    zoom = lerp(
      preFinishZoom,
      camera.start.zoom,
      applyEasing(finishSettleProgress, "ease-out"),
    );
  }

  return {
    x: lerp(camera.start.x, camera.end.x, moveProgress),
    y: lerp(camera.start.y, camera.end.y, moveProgress),
    zoom,
  };
}

export function getCameraFrame(camera, progress) {
  if ((camera.motion ?? CAMERA_MOTION_STANDARD) === CAMERA_MOTION_ZOOM_IN_PAUSE_OUT) {
    return getZoomInPauseOutFrame(camera, progress);
  }

  return getStandardCameraFrame(camera, progress);
}

export function getCameraMotionDelta(camera, progress, sampleOffset = 0.01) {
  const safeOffset = clamp(sampleOffset, 0.001, 0.1);
  const previousFrame = getCameraFrame(camera, clamp(progress - safeOffset, 0, 1));
  const nextFrame = getCameraFrame(camera, clamp(progress + safeOffset, 0, 1));

  return {
    x: nextFrame.x - previousFrame.x,
    y: nextFrame.y - previousFrame.y,
    zoom: nextFrame.zoom - previousFrame.zoom,
  };
}
