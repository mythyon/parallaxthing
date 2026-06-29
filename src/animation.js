import { clamp } from "utils";

export function createAnimationController({ state, onFrame }) {
  let frameId = 0;
  let startedAt = 0;
  let initialProgress = 0;

  function stopLoop() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function renderFrame(nextProgress) {
    state.playback.progress = clamp(nextProgress, 0, 1);
    onFrame(state.playback.progress);
  }

  function tick(timestamp) {
    if (!state.playback.isPlaying) {
      return;
    }

    const durationMs = state.camera.duration * 1000;
    const elapsed = timestamp - startedAt;
    const progress = initialProgress + elapsed / durationMs;

    if (progress >= 1) {
      state.playback.isPlaying = false;
      renderFrame(1);
      stopLoop();
      return;
    }

    renderFrame(progress);
    frameId = requestAnimationFrame(tick);
  }

  return {
    play() {
      if (state.playback.isPlaying) {
        return;
      }

      if (state.playback.progress >= 1) {
        state.playback.progress = 0;
      }

      state.playback.isPlaying = true;
      initialProgress = state.playback.progress;
      startedAt = performance.now();
      frameId = requestAnimationFrame(tick);
      onFrame(state.playback.progress);
    },

    pause() {
      state.playback.isPlaying = false;
      stopLoop();
      onFrame(state.playback.progress);
    },

    stop() {
      state.playback.isPlaying = false;
      stopLoop();
      renderFrame(0);
    },

    seek(progress) {
      if (state.playback.isPlaying) {
        initialProgress = progress;
        startedAt = performance.now();
      }

      renderFrame(progress);
    },
  };
}
