import { drawScene } from "renderer";
import { ensureEffectEngine, hasEffectLayers } from "effects";

const BITRATE = 12_000_000;
const RECORDER_WARMUP_MS = 120;
const RECORDER_FLUSH_MS = 220;
const SMOOTH_SAMPLE_COUNT = 4;
const MAX_ENCODER_QUEUE_SIZE = 8;
const ENCODER_YIELD_INTERVAL = 2;
const TIME_CODE_SCALE_NS = 100_000;
const TIME_CODE_SCALE_US = TIME_CODE_SCALE_NS / 1000;
const MAX_CLUSTER_TIMECODE = 30_000;
const MUXER_APP = "Parallax Thing";
const textEncoder = new TextEncoder();

const IDS = {
  ebml: bytes(0x1A, 0x45, 0xDF, 0xA3),
  ebmlVersion: bytes(0x42, 0x86),
  ebmlReadVersion: bytes(0x42, 0xF7),
  ebmlMaxIdLength: bytes(0x42, 0xF2),
  ebmlMaxSizeLength: bytes(0x42, 0xF3),
  docType: bytes(0x42, 0x82),
  docTypeVersion: bytes(0x42, 0x87),
  docTypeReadVersion: bytes(0x42, 0x85),
  segment: bytes(0x18, 0x53, 0x80, 0x67),
  info: bytes(0x15, 0x49, 0xA9, 0x66),
  timecodeScale: bytes(0x2A, 0xD7, 0xB1),
  duration: bytes(0x44, 0x89),
  muxingApp: bytes(0x4D, 0x80),
  writingApp: bytes(0x57, 0x41),
  tracks: bytes(0x16, 0x54, 0xAE, 0x6B),
  trackEntry: bytes(0xAE),
  trackNumber: bytes(0xD7),
  trackUid: bytes(0x73, 0xC5),
  trackType: bytes(0x83),
  flagLacing: bytes(0x9C),
  codecId: bytes(0x86),
  codecName: bytes(0x25, 0x86, 0x88),
  defaultDuration: bytes(0x23, 0xE3, 0x83),
  video: bytes(0xE0),
  pixelWidth: bytes(0xB0),
  pixelHeight: bytes(0xBA),
  cluster: bytes(0x1F, 0x43, 0xB6, 0x75),
  timecode: bytes(0xE7),
  simpleBlock: bytes(0xA3),
};

function bytes(...values) {
  return Uint8Array.from(values);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clampProgress(value) {
  return Math.min(1, Math.max(0, value));
}

function reportProgress(onProgress, update) {
  if (typeof onProgress !== "function") {
    return;
  }

  if (typeof update === "number") {
    onProgress(clampProgress(update));
    return;
  }

  onProgress({
    ...update,
    value: clampProgress(update?.value ?? 0),
  });
}

async function ensureEffectsReady(state) {
  if (!hasEffectLayers(state.layers)) {
    return;
  }

  const engine = await ensureEffectEngine();

  if (!engine) {
    throw new Error("effect_engine_unavailable");
  }
}

function renderExportFrame(context, scratchContext, {
  width,
  height,
  state,
  progress,
  frameDurationProgress,
  smoothMotion,
  t,
}) {
  if (!smoothMotion) {
    drawScene(context, {
      width,
      height,
      state,
      progress,
      t,
      showEmptyState: false,
    });
    return;
  }

  context.save();
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 1 / SMOOTH_SAMPLE_COUNT;

  for (let sampleIndex = 0; sampleIndex < SMOOTH_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleOffset = ((sampleIndex + 0.5) / SMOOTH_SAMPLE_COUNT) - 0.5;
    const sampleProgress = clampProgress(progress + (sampleOffset * frameDurationProgress));

    drawScene(scratchContext, {
      width,
      height,
      state,
      progress: sampleProgress,
      t,
      showEmptyState: false,
    });

    context.drawImage(scratchContext.canvas, 0, 0);
  }

  context.restore();
}

function concatBytes(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function encodeUnsignedInt(value) {
  let numeric = BigInt(Math.max(0, Math.floor(value)));

  if (numeric === 0n) {
    return bytes(0);
  }

  const output = [];

  while (numeric > 0n) {
    output.push(Number(numeric & 0xffn));
    numeric >>= 8n;
  }

  return Uint8Array.from(output.reverse());
}

function encodeFloat64(value) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  return new Uint8Array(buffer);
}

function encodeString(value) {
  return textEncoder.encode(value);
}

function encodeEbmlSize(value) {
  const size = BigInt(value);

  for (let width = 1; width <= 8; width += 1) {
    const maxValue = (1n << BigInt(width * 7)) - 1n;

    if (size <= maxValue) {
      const output = new Uint8Array(width);
      let remaining = size;

      for (let index = width - 1; index >= 0; index -= 1) {
        output[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
      }

      output[0] |= 1 << (8 - width);
      return output;
    }
  }

  throw new Error("ebml_size_too_large");
}

function createElement(id, data) {
  return concatBytes([id, encodeEbmlSize(data.length), data]);
}

function createMasterElement(id, children) {
  return createElement(id, concatBytes(children));
}

function createUnsignedIntElement(id, value) {
  return createElement(id, encodeUnsignedInt(value));
}

function createFloatElement(id, value) {
  return createElement(id, encodeFloat64(value));
}

function createStringElement(id, value) {
  return createElement(id, encodeString(value));
}

function createSimpleBlock({ relativeTimecode, payload, keyFrame }) {
  const trackNumber = bytes(0x81);
  const timecodeBuffer = new ArrayBuffer(2);
  const timecodeView = new DataView(timecodeBuffer);
  timecodeView.setInt16(0, relativeTimecode, false);
  const flags = bytes(keyFrame ? 0x80 : 0x00);

  return createElement(
    IDS.simpleBlock,
    concatBytes([
      trackNumber,
      new Uint8Array(timecodeBuffer),
      flags,
      payload,
    ]),
  );
}

function buildWebM({
  width,
  height,
  fps,
  durationUs,
  codecId,
  codecName,
  chunks,
  onMuxProgress = () => {},
}) {
  const ebmlHeader = createMasterElement(IDS.ebml, [
    createUnsignedIntElement(IDS.ebmlVersion, 1),
    createUnsignedIntElement(IDS.ebmlReadVersion, 1),
    createUnsignedIntElement(IDS.ebmlMaxIdLength, 4),
    createUnsignedIntElement(IDS.ebmlMaxSizeLength, 8),
    createStringElement(IDS.docType, "webm"),
    createUnsignedIntElement(IDS.docTypeVersion, 2),
    createUnsignedIntElement(IDS.docTypeReadVersion, 2),
  ]);

  const info = createMasterElement(IDS.info, [
    createUnsignedIntElement(IDS.timecodeScale, TIME_CODE_SCALE_NS),
    createFloatElement(IDS.duration, durationUs / TIME_CODE_SCALE_US),
    createStringElement(IDS.muxingApp, MUXER_APP),
    createStringElement(IDS.writingApp, MUXER_APP),
  ]);

  const trackEntry = createMasterElement(IDS.trackEntry, [
    createUnsignedIntElement(IDS.trackNumber, 1),
    createUnsignedIntElement(IDS.trackUid, 1),
    createUnsignedIntElement(IDS.trackType, 1),
    createUnsignedIntElement(IDS.flagLacing, 0),
    createStringElement(IDS.codecId, codecId),
    createStringElement(IDS.codecName, codecName),
    createUnsignedIntElement(IDS.defaultDuration, Math.round(1_000_000_000 / fps)),
    createMasterElement(IDS.video, [
      createUnsignedIntElement(IDS.pixelWidth, width),
      createUnsignedIntElement(IDS.pixelHeight, height),
    ]),
  ]);

  const tracks = createMasterElement(IDS.tracks, [trackEntry]);
  const clusters = [];
  let clusterStartTimecode = null;
  let clusterBlocks = [];

  function flushCluster() {
    if (clusterStartTimecode === null || clusterBlocks.length === 0) {
      return;
    }

    clusters.push(
      createMasterElement(IDS.cluster, [
        createUnsignedIntElement(IDS.timecode, clusterStartTimecode),
        ...clusterBlocks,
      ]),
    );

    clusterStartTimecode = null;
    clusterBlocks = [];
  }

  chunks.forEach((chunk, index) => {
    const timestampUnits = Math.round(chunk.timestampUs / TIME_CODE_SCALE_US);

    if (
      clusterStartTimecode === null
      || timestampUnits - clusterStartTimecode > MAX_CLUSTER_TIMECODE
    ) {
      flushCluster();
      clusterStartTimecode = timestampUnits;
    }

    clusterBlocks.push(
      createSimpleBlock({
        relativeTimecode: timestampUnits - clusterStartTimecode,
        payload: chunk.data,
        keyFrame: chunk.keyFrame,
      }),
    );

    onMuxProgress((index + 1) / chunks.length);
  });

  flushCluster();

  const segment = createElement(
    IDS.segment,
    concatBytes([info, tracks, ...clusters]),
  );

  return new Blob([ebmlHeader, segment], { type: "video/webm" });
}

function pickMediaRecorderMimeType() {
  if (!("MediaRecorder" in window) || typeof MediaRecorder.isTypeSupported !== "function") {
    return "video/webm";
  }

  const candidates = [
    "video/webm;codecs=vp8",
    "video/webm",
    "video/webm;codecs=vp9",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

async function pickVideoEncoderProfile(width, height, fps) {
  if (!("VideoEncoder" in window) || !("VideoFrame" in window)) {
    return null;
  }

  const candidates = [
    {
      config: {
        codec: "vp8",
        width,
        height,
        bitrate: BITRATE,
        framerate: fps,
      },
      codecId: "V_VP8",
      codecName: "VP8",
    },
    {
      config: {
        codec: "vp09.00.10.08",
        width,
        height,
        bitrate: BITRATE,
        framerate: fps,
      },
      codecId: "V_VP9",
      codecName: "VP9",
    },
  ];

  for (const candidate of candidates) {
    try {
      if (typeof VideoEncoder.isConfigSupported === "function") {
        const support = await VideoEncoder.isConfigSupported(candidate.config);

        if (support?.supported) {
          return candidate;
        }
      } else {
        return candidate;
      }
    } catch {
    }
  }

  return null;
}

async function exportWithMediaRecorder(state, {
  width,
  height,
  fps,
  smoothMotion,
  onProgress,
  t,
}) {
  if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("export_unsupported");
  }

  await ensureEffectsReady(state);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const scratchContext = scratchCanvas.getContext("2d", { alpha: false });
  scratchContext.imageSmoothingEnabled = true;
  scratchContext.imageSmoothingQuality = "high";

  const stream = canvas.captureStream(fps);
  let recorder = null;

  try {
    const mimeType = pickMediaRecorderMimeType();
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE })
      : new MediaRecorder(stream, { videoBitsPerSecond: BITRATE });
    const chunks = [];
    let recorderError = null;
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        recorderError = event.error ?? new Error("export_failed");
        reject(recorderError);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
      };
    });
    void stopped.catch(() => {});

    renderExportFrame(context, scratchContext, {
      width,
      height,
      state,
      progress: 0,
      frameDurationProgress: state.camera.duration > 0 ? 1 / (state.camera.duration * fps) : 0,
      smoothMotion,
      t,
    });

    recorder.start();
    reportProgress(onProgress, {
      mode: "mediarecorder",
      stage: "warmup",
      value: 0,
    });
    await wait(RECORDER_WARMUP_MS);

    const frameCount = Math.max(1, Math.ceil(state.camera.duration * fps));
    const frameDelay = 1000 / fps;
    const frameDurationProgress = state.camera.duration > 0 ? 1 / (state.camera.duration * fps) : 0;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const progress = frameCount === 1 ? 1 : frameIndex / (frameCount - 1);

      renderExportFrame(context, scratchContext, {
        width,
        height,
        state,
        progress,
        frameDurationProgress,
        smoothMotion,
        t,
      });

      reportProgress(onProgress, {
        mode: "mediarecorder",
        stage: "render",
        value: ((frameIndex + 1) / frameCount) * 0.9,
      });
      await wait(frameDelay);

      if (recorderError) {
        throw recorderError;
      }
    }

    reportProgress(onProgress, {
      mode: "mediarecorder",
      stage: "finalize",
      value: 0.95,
    });
    await wait(Math.max(RECORDER_FLUSH_MS, frameDelay * 2));
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    const blob = await stopped;

    if (blob.size === 0) {
      throw new Error("export_failed");
    }

    reportProgress(onProgress, {
      mode: "mediarecorder",
      stage: "done",
      value: 1,
    });
    return blob;
  } finally {
    if (recorder?.state && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
      }
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

async function exportWithVideoEncoder(state, {
  width,
  height,
  fps,
  smoothMotion,
  onProgress,
  t,
}) {
  const profile = await pickVideoEncoderProfile(width, height, fps);

  if (!profile) {
    throw new Error("webcodecs_unavailable");
  }

  await ensureEffectsReady(state);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = width;
  scratchCanvas.height = height;
  const scratchContext = scratchCanvas.getContext("2d", { alpha: false });
  scratchContext.imageSmoothingEnabled = true;
  scratchContext.imageSmoothingQuality = "high";

  const chunks = [];
  let encoderError = null;
  let encoder = null;

  try {
    encoder = new VideoEncoder({
      output(chunk) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push({
          timestampUs: Number(chunk.timestamp),
          keyFrame: chunk.type === "key",
          data,
        });
      },
      error(error) {
        encoderError = error;
      },
    });
    encoder.configure(profile.config);

    const frameCount = Math.max(1, Math.ceil(state.camera.duration * fps));
    const frameDurationUs = Math.round(1_000_000 / fps);
    const frameDurationProgress = state.camera.duration > 0 ? 1 / (state.camera.duration * fps) : 0;
    const durationUs = frameCount * frameDurationUs;
    const keyFrameInterval = Math.max(1, Math.round(fps));

    reportProgress(onProgress, {
      mode: "webcodecs",
      stage: "render",
      value: 0,
    });

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const progress = frameCount === 1 ? 1 : frameIndex / (frameCount - 1);

      renderExportFrame(context, scratchContext, {
        width,
        height,
        state,
        progress,
        frameDurationProgress,
        smoothMotion,
        t,
      });

      const timestampUs = frameIndex * frameDurationUs;
      const frame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });

      try {
        encoder.encode(frame, {
          keyFrame: frameIndex === 0 || (frameIndex % keyFrameInterval) === 0,
        });
      } finally {
        frame.close();
      }

      if (encoderError) {
        throw encoderError;
      }

      while (encoder.encodeQueueSize > MAX_ENCODER_QUEUE_SIZE) {
        await wait(0);

        if (encoderError) {
          throw encoderError;
        }

        if (encoder.state !== "configured") {
          throw new Error("export_failed");
        }
      }

      reportProgress(onProgress, {
        mode: "webcodecs",
        stage: "render",
        value: ((frameIndex + 1) / frameCount) * 0.82,
      });

      if ((frameIndex + 1) % ENCODER_YIELD_INTERVAL === 0) {
        await wait(0);
      }
    }

    reportProgress(onProgress, {
      mode: "webcodecs",
      stage: "flush",
      value: 0.9,
    });
    await encoder.flush();

    if (encoderError) {
      throw encoderError;
    }

    if (chunks.length === 0) {
      throw new Error("export_failed");
    }

    chunks.sort((left, right) => left.timestampUs - right.timestampUs);
    reportProgress(onProgress, {
      mode: "webcodecs",
      stage: "mux",
      value: 0.92,
    });

    const blob = buildWebM({
      width,
      height,
      fps,
      durationUs,
      codecId: profile.codecId,
      codecName: profile.codecName,
      chunks,
      onMuxProgress(progress) {
        reportProgress(onProgress, {
          mode: "webcodecs",
          stage: "mux",
          value: 0.92 + (progress * 0.08),
        });
      },
    });

    reportProgress(onProgress, {
      mode: "webcodecs",
      stage: "done",
      value: 1,
    });
    return blob;
  } finally {
    if (encoder && encoder.state !== "closed") {
      try {
        encoder.close();
      } catch {
      }
    }
  }
}

export function createWebMExporter({ t }) {
  return {
    async export(state, {
      width,
      height,
      fps = 30,
      smoothMotion = false,
      onProgress = () => {},
    }) {
      try {
        return await exportWithVideoEncoder(state, {
          width,
          height,
          fps,
          smoothMotion,
          onProgress,
          t,
        });
      } catch (error) {
        if (error?.message === "effect_engine_unavailable") {
          throw error;
        }

        reportProgress(onProgress, {
          mode: "mediarecorder",
          stage: "fallback",
          value: 0,
        });
        return exportWithMediaRecorder(state, {
          width,
          height,
          fps,
          smoothMotion,
          onProgress,
          t,
        });
      }
    },
  };
}
