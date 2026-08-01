export type MicrophoneErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'not-found'
  | 'busy'
  | 'unavailable'
  | 'unknown';

export class MicrophoneCaptureError extends Error {
  constructor(
    public readonly code: MicrophoneErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'MicrophoneCaptureError';
  }
}

export type AudioInputDevice = {
  deviceId: string;
  groupId: string;
  label: string;
  isDefault: boolean;
};

export type AudioCaptureController = {
  stop: () => void;
};

export type AudioCaptureOptions = {
  deviceId?: string;
  sampleRate?: number;
  chunkMs?: number;
  onChunk: (chunk: Uint8Array, level: number) => void;
  onDeviceEnded?: () => void;
};

const normalizeMicrophoneError = (error: unknown) => {
  const name = String((error as any)?.name || '');
  const message = String((error as any)?.message || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicrophoneCaptureError('permission-denied', message);
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new MicrophoneCaptureError('not-found', message);
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new MicrophoneCaptureError('busy', message);
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return new MicrophoneCaptureError('unavailable', message);
  }
  return new MicrophoneCaptureError('unknown', message);
};

const getAudioConstraints = (deviceId?: string): MediaTrackConstraints => ({
  channelCount: {ideal: 1},
  echoCancellation: {ideal: true},
  noiseSuppression: {ideal: true},
  autoGainControl: {ideal: true},
  ...(deviceId && deviceId !== 'default' ? {deviceId: {exact: deviceId}} : {}),
});

const requestMicrophoneStream = async (deviceId?: string) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneCaptureError('unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({audio: getAudioConstraints(deviceId)});
  } catch (error) {
    const name = String((error as any)?.name || '');
    if (
      deviceId &&
      deviceId !== 'default' &&
      (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError')
    ) {
      try {
        return await navigator.mediaDevices.getUserMedia({audio: getAudioConstraints()});
      } catch (fallbackError) {
        throw normalizeMicrophoneError(fallbackError);
      }
    }
    throw normalizeMicrophoneError(error);
  }
};

export const checkAudioCaptureAvailability = async (deviceId?: string) => {
  const stream = await requestMicrophoneStream(deviceId);
  stream.getTracks().forEach(track => track.stop());
};

const enumerateAudioInputDevices = async (): Promise<AudioInputDevice[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let timeout = 0;
  const devices = await Promise.race([
    navigator.mediaDevices.enumerateDevices(),
    new Promise<MediaDeviceInfo[]>(resolve => {
      timeout = window.setTimeout(() => resolve([]), 2_500);
    }),
  ]);
  window.clearTimeout(timeout);
  return devices
    .filter(device => device.kind === 'audioinput')
    .map(device => ({
      deviceId: device.deviceId,
      groupId: device.groupId,
      label: device.label,
      isDefault: device.deviceId === 'default',
    }));
};

export const listAudioInputDevices = async (requestPermission = false) => {
  let devices = await enumerateAudioInputDevices();
  if (requestPermission && (devices.length === 0 || devices.some(device => !device.label))) {
    const stream = await requestMicrophoneStream();
    stream.getTracks().forEach(track => track.stop());
    devices = await enumerateAudioInputDevices();
  }
  return devices;
};

const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number) => {
  if (outputRate === inputRate) return buffer;
  const ratio = inputRate / outputRate;
  const result = new Float32Array(Math.round(buffer.length / ratio));
  let sourceOffset = 0;
  for (let resultOffset = 0; resultOffset < result.length; resultOffset += 1) {
    const nextSourceOffset = Math.round((resultOffset + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = sourceOffset; i < nextSourceOffset && i < buffer.length; i += 1) {
      sum += buffer[i];
      count += 1;
    }
    result[resultOffset] = count ? sum / count : 0;
    sourceOffset = nextSourceOffset;
  }
  return result;
};

const floatToPcm16 = (input: Float32Array) => {
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  input.forEach((value, index) => {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  });
  return bytes;
};

const getAudioLevel = (input: Float32Array) => {
  if (!input.length) return 0;
  let sum = 0;
  input.forEach(value => {
    sum += value * value;
  });
  return Math.min(1, Math.sqrt(sum / input.length) * 4);
};

export const startAudioCapture = async (
  options: AudioCaptureOptions,
): Promise<AudioCaptureController> => {
  const stream = await requestMicrophoneStream(options.deviceId);
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack || audioTrack.readyState !== 'live') {
    stream.getTracks().forEach(track => track.stop());
    throw new MicrophoneCaptureError('unavailable');
  }
  if (options.onDeviceEnded) {
    audioTrack.addEventListener('ended', options.onDeviceEnded, {once: true});
  }

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach(track => track.stop());
    throw new MicrophoneCaptureError('unsupported');
  }

  const audioContext = new AudioContextClass();
  try {
    if (audioContext.state === 'suspended') await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentOutput = audioContext.createGain();
    silentOutput.gain.value = 0.00001;
    const outputRate = options.sampleRate || 16000;
    const chunkSamples = Math.floor(outputRate * (options.chunkMs || 100) / 1000);
    let pending = new Float32Array(0);

    processor.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(input, audioContext.sampleRate, outputRate);
      const merged = new Float32Array(pending.length + downsampled.length);
      merged.set(pending);
      merged.set(downsampled, pending.length);
      let offset = 0;
      while (offset + chunkSamples <= merged.length) {
        const frame = merged.slice(offset, offset + chunkSamples);
        options.onChunk(floatToPcm16(frame), getAudioLevel(frame));
        offset += chunkSamples;
      }
      pending = merged.slice(offset);
    };

    source.connect(processor);
    processor.connect(silentOutput);
    silentOutput.connect(audioContext.destination);

    let stopped = false;
    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        processor.onaudioprocess = null;
        processor.disconnect();
        silentOutput.disconnect();
        source.disconnect();
        stream.getTracks().forEach(track => track.stop());
        void audioContext.close();
      },
    };
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    void audioContext.close();
    throw normalizeMicrophoneError(error);
  }
};

export const pcm16ChunksToWavBlob = (chunks: Uint8Array[], sampleRate = 16000) => {
  const pcmLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcmLength, true);
  const pcm = new Uint8Array(buffer, 44);
  let offset = 0;
  chunks.forEach(chunk => {
    pcm.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new Blob([buffer], {type: 'audio/wav'});
};
