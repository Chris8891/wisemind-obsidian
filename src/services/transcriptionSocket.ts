import type {
  TranscriptionDetail,
  TranscriptionMarkKind,
  TranscriptionRecord,
  TranscriptionRuntimeEvent,
  TranscriptionScene,
} from '../types';

type SocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type StartPayload = {
  title?: string;
  scenario?: TranscriptionScene;
  saveAudio?: boolean;
  workspaceId?: string | null;
  providerId?: string;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type ServerMessage =
  | {type: 'event'; event: TranscriptionRuntimeEvent}
  | {type: 'response'; requestId: string; ok: boolean; data?: unknown; error?: string};

const toWebSocketUrl = (baseUrl: string) => {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/v2/transcriptions/stream';
  url.search = '';
  return url.toString();
};

export class WiseMindTranscriptionSocket {
  private socket: WebSocket | null = null;
  private recordId = '';
  private reconnectAttempt = 0;
  private reconnectTimer = 0;
  private closedByUser = false;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly bufferedAudio: ArrayBuffer[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly callbacks: {
      onEvent: (event: TranscriptionRuntimeEvent) => void;
      onConnectionChange?: (state: SocketConnectionState) => void;
      onError?: (error: Error) => void;
    },
  ) {}

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.closedByUser = false;
    this.callbacks.onConnectionChange?.(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(toWebSocketUrl(this.baseUrl));
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      const timeout = window.setTimeout(() => {
        reject(new Error('Transcription connection timed out'));
        socket.close();
      }, 10_000);
      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.reconnectAttempt = 0;
        this.callbacks.onConnectionChange?.('connected');
        resolve();
        if (this.recordId) {
          void this.request<TranscriptionDetail>({
            type: 'attach',
            recordId: this.recordId,
          })
            .then(() => this.flushBufferedAudio())
            .catch(error => this.callbacks.onError?.(error));
        }
      };
      socket.onmessage = event => this.handleMessage(event.data);
      socket.onerror = () => {
        const error = new Error('Transcription connection failed');
        this.callbacks.onError?.(error);
      };
      socket.onclose = () => {
        window.clearTimeout(timeout);
        if (this.socket === socket) this.socket = null;
        this.callbacks.onConnectionChange?.('disconnected');
        if (!this.closedByUser && this.recordId) this.scheduleReconnect();
      };
    });
  }

  async start(payload: StartPayload) {
    await this.connect();
    const record = await this.request<TranscriptionRecord>({type: 'start', payload});
    this.recordId = record.id;
    return record;
  }

  pause() {
    return this.command('pause');
  }

  resume() {
    return this.command('resume');
  }

  stop() {
    return this.command('stop');
  }

  mark(kind: TranscriptionMarkKind, text: string, timeMs: number) {
    return this.command('mark', {kind, text, timeMs});
  }

  sendAudio(chunk: Uint8Array, level: number) {
    const packet = new ArrayBuffer(chunk.byteLength + 4);
    new DataView(packet).setFloat32(0, Math.max(0, Math.min(1, level)), true);
    new Uint8Array(packet, 4).set(chunk);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(packet);
      return;
    }
    this.bufferedAudio.push(packet);
    if (this.bufferedAudio.length > 50) this.bufferedAudio.shift();
  }

  close() {
    this.closedByUser = true;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.recordId = '';
    this.bufferedAudio.splice(0);
    this.rejectPending(new Error('Transcription connection closed'));
    this.socket?.close(1000, 'Client closed');
    this.socket = null;
  }

  private command(action: 'pause' | 'resume' | 'stop' | 'mark', payload?: Record<string, unknown>) {
    if (!this.recordId) return Promise.reject(new Error('No active transcription'));
    return this.request({type: 'command', recordId: this.recordId, action, payload});
  }

  private request<T>(message: Record<string, unknown>) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Transcription connection is not ready'));
    }
    const requestId = `obsidian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Transcription request timed out'));
      }, 15_000);
      this.pending.set(requestId, {resolve, reject, timeout});
      this.socket?.send(JSON.stringify({...message, requestId}));
    });
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== 'string') return;
    try {
      const message = JSON.parse(raw) as ServerMessage;
      if (message.type === 'event') {
        this.callbacks.onEvent(message.event);
        return;
      }
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.data);
      else pending.reject(new Error(message.error || 'Transcription request failed'));
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Invalid response'));
    }
  }

  private scheduleReconnect() {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectAttempt += 1;
    const delay = Math.min(5_000, 500 * 2 ** Math.min(this.reconnectAttempt - 1, 4));
    this.callbacks.onConnectionChange?.('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      void this.connect().catch(error => {
        this.callbacks.onError?.(error);
        if (!this.closedByUser && this.recordId) this.scheduleReconnect();
      });
    }, delay);
  }

  private flushBufferedAudio() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.bufferedAudio.splice(0).forEach(packet => this.socket?.send(packet));
  }

  private rejectPending(error: Error) {
    this.pending.forEach(pending => {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pending.clear();
  }
}
