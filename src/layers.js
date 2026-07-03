import { clamp, fileNameWithoutExtension, uid } from "utils";

function resolveDefaultDepth(index, batchSize = 1) {
  if (batchSize <= 1) {
    return 82;
  }

  const progress = 1 - (index / (batchSize - 1));
  return Math.round(clamp(progress * 100, 0, 100));
}

export function isImageLayer(layer) {
  return layer?.type === "image";
}

export function isEffectLayer(layer) {
  return layer?.type === "effect";
}

export function createImageLayer({ file, bitmap, objectUrl, index, batchSize }) {
  return {
    id: uid("layer"),
    type: "image",
    name: fileNameWithoutExtension(file.name),
    fileName: file.name,
    bitmap,
    objectUrl,
    width: bitmap.width,
    height: bitmap.height,
    depth: resolveDefaultDepth(index, batchSize),
    scale: 100,
    offsetX: 0,
    offsetY: 0,
  };
}

export function createLayer(input) {
  return createImageLayer(input);
}

export function createEffectLayer() {
  return {
    id: uid("effect"),
    type: "effect",
    effectKind: "sun-flare",
    name: "Rays",
    fileName: "Rays",
    width: 0,
    height: 0,
    depth: 56,
    scale: 100,
    opacity: 72,
    sunGlowEnabled: false,
    raySpeed: 100,
    rayLength: 100,
    rayCount: 8,
    rayThickness: 100,
    rayBlur: 36,
    rotationOffset: 0,
    rotationSpeed: 100,
    effectOptionsOpen: false,
    offsetX: 0,
    offsetY: 0,
    tint: "#fff1b8",
  };
}

export function applyAutoDepth(layers) {
  if (layers.length === 0) {
    return layers;
  }

  return layers.map((layer, index) => ({
    ...layer,
    depth: resolveDefaultDepth(index, layers.length),
  }));
}

export function moveLayer(layers, layerId, direction) {
  const currentIndex = layers.findIndex((layer) => layer.id === layerId);

  if (currentIndex === -1) {
    return layers;
  }

  const nextIndex = clamp(currentIndex + direction, 0, layers.length - 1);

  if (nextIndex === currentIndex) {
    return layers;
  }

  const nextLayers = [...layers];
  const [layer] = nextLayers.splice(currentIndex, 1);
  nextLayers.splice(nextIndex, 0, layer);

  return nextLayers;
}

export function removeLayer(layers, layerId) {
  return layers.filter((layer) => layer.id !== layerId);
}

export function updateLayer(layers, layerId, patch) {
  return layers.map((layer) => (
    layer.id === layerId
      ? { ...layer, ...patch }
      : layer
  ));
}
