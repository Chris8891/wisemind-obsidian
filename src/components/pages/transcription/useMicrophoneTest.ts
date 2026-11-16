import {onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';

import {
  type AudioCaptureController,
  pcm16ChunksToWavBlob,
  startAudioCapture,
} from '../../../services/audioCapture';

type MicrophoneTestOptions = {
  /** Reloads setup (with microphone permission); resolves false when recording cannot start. */
  prepare: () => Promise<boolean>;
  deviceId: () => string;
};

/** Five-second microphone test recording with a level meter and a playback URL. */
export function useMicrophoneTest({prepare, deviceId}: MicrophoneTestOptions) {
  const {t} = useI18n();
  const status = ref<'idle' | 'recording' | 'complete' | 'error'>('idle');
  const level = ref(0);
  const seconds = ref(0);
  const url = ref('');
  const error = ref('');
  let capture: AudioCaptureController | null = null;
  let stopTimer = 0;
  let clock = 0;
  let token = 0;

  const stop = (complete = false) => {
    token += 1;
    window.clearTimeout(stopTimer);
    window.clearInterval(clock);
    stopTimer = 0;
    clock = 0;
    capture?.stop();
    capture = null;
    if (complete && status.value === 'recording') {
      status.value = 'complete';
    } else if (!complete && status.value === 'recording') {
      status.value = 'idle';
    }
    level.value = 0;
  };

  const start = async () => {
    stop();
    // A newer test, a stop click, a real recording or unmounting invalidates this run; without the
    // check a late getUserMedia would leave the microphone open.
    const runToken = ++token;
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = '';
    error.value = '';
    seconds.value = 0;
    const chunks: Uint8Array[] = [];
    try {
      const ready = await prepare();
      if (runToken !== token) return;
      if (!ready) {
        status.value = 'error';
        error.value = t('transcription.microphoneTestFailed');
        return;
      }
      status.value = 'recording';
      const nextCapture = await startAudioCapture({
        deviceId: deviceId(),
        sampleRate: 16000,
        chunkMs: 100,
        onDeviceEnded: () => {
          if (runToken !== token) return;
          error.value = t('transcription.microphoneErrors.unavailable');
          status.value = 'error';
          stop();
        },
        onChunk: (chunk, chunkLevel) => {
          chunks.push(chunk.slice());
          level.value = chunkLevel;
        },
      });
      if (runToken !== token) {
        nextCapture.stop();
        return;
      }
      capture = nextCapture;
      clock = window.setInterval(() => {
        seconds.value += 1;
      }, 1_000);
      stopTimer = window.setTimeout(() => {
        stop(true);
        url.value = URL.createObjectURL(pcm16ChunksToWavBlob(chunks));
      }, 5_000);
    } catch (caught: any) {
      if (runToken !== token) return;
      error.value = caught?.message || t('transcription.microphoneTestFailed');
      status.value = 'error';
      stop();
    }
  };

  onUnmounted(() => {
    stop();
    if (url.value) URL.revokeObjectURL(url.value);
  });

  return {status, level, seconds, url, error, start, stop};
}
