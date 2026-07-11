import { createLayer } from "layers";

function isPngFile(file) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

function loadImageElement(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      const error = new Error("decode_failed");
      reject(error);
    };
    image.src = objectUrl;
  });
}

async function decodeBitmap(file, objectUrl) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch (error) {
      console.warn("createImageBitmap failed, falling back to HTMLImageElement.", error);
    }
  }

  return loadImageElement(objectUrl);
}

function releaseLayer(layer) {
  URL.revokeObjectURL(layer.objectUrl);

  if ("close" in layer.bitmap && typeof layer.bitmap.close === "function") {
    layer.bitmap.close();
  }
}

export async function loadLayersFromFiles(files, { maxDimension = 4096 } = {}) {
  const acceptedFiles = Array.from(files).filter(isPngFile);
  const rejectedCount = files.length - acceptedFiles.length;
  const batchSize = acceptedFiles.length;
  const loaded = [];

  try {
    for (const [index, file] of acceptedFiles.entries()) {
      const objectUrl = URL.createObjectURL(file);
      let bitmap = null;

      try {
        bitmap = await decodeBitmap(file, objectUrl);

        if (Math.max(bitmap.width, bitmap.height) > maxDimension) {
          if ("close" in bitmap && typeof bitmap.close === "function") {
            bitmap.close();
          }
          bitmap = null;

          const error = new Error("file_too_large");
          error.fileName = file.name;
          error.maxDimension = maxDimension;
          throw error;
        }

        loaded.push(
          createLayer({
            file,
            bitmap,
            objectUrl,
            index,
            batchSize,
          }),
        );
        bitmap = null;
      } catch (error) {
        URL.revokeObjectURL(objectUrl);

        if (bitmap && "close" in bitmap && typeof bitmap.close === "function") {
          bitmap.close();
        }

        error.fileName ??= file.name;
        throw error;
      }
    }
  } catch (error) {
    loaded.forEach(releaseLayer);
    throw error;
  }

  return {
    layers: loaded,
    rejectedCount,
  };
}
