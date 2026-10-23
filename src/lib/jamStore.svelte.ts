import { Peer, type DataConnection } from 'peerjs';
import { player } from './player.svelte';
import type { Song, PlaybackContext } from './types';

const PEER_PREFIX = 'vibes-jam-';

export type JamRole = 'host' | 'guest' | null;
export type JamStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface ClockPingMsg {
  type: 'PING';
  seq: number;
  clientTime: number;
}

interface ClockPongMsg {
  type: 'PONG';
  seq: number;
  clientTime: number;
  hostTime: number;
}

interface SyncPlayMsg {
  type: 'PLAY';
  song: Song;
  context: PlaybackContext;
  position: number;
  targetHostTime: number;
}

interface SyncPauseMsg {
  type: 'PAUSE';
  position: number;
}

interface SyncSeekMsg {
  type: 'SEEK';
  position: number;
  targetHostTime: number;
}

interface SyncHeartbeatMsg {
  type: 'HEARTBEAT';
  hostTime: number;
  position: number;
  isPlaying: boolean;
}

interface StateResponseMsg {
  type: 'STATE_RESPONSE';
  song: Song | null;
  isPlaying: boolean;
  position: number;
  context: PlaybackContext;
}

type JamMessage =
  | ClockPingMsg
  | ClockPongMsg
  | SyncPlayMsg
  | SyncPauseMsg
  | SyncSeekMsg
  | SyncHeartbeatMsg
  | StateResponseMsg;

class JamStore {
  status = $state<JamStatus>('idle');
  role = $state<JamRole>(null);
  roomCode = $state<string>('');
  peerCount = $state<number>(0);
  errorMessage = $state<string>('');

  // Clock Synchronization Metrics
  clockOffset = $state<number>(0); // Host time - Guest time (in ms)
  rttMs = $state<number>(0); // Round trip time in ms
  driftMs = $state<number>(0); // Current audio phase drift in ms
  isClockSynced = $state<boolean>(false);

  // Hardware Delay Calibration (stored locally)
  hardwareCalibrationMs = $state<number>(0);

  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private clockSyncInterval: ReturnType<typeof setInterval> | null = null;
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedCal = localStorage.getItem('vibes_jam_calibration');
      if (savedCal !== null) {
        const parsed = parseInt(savedCal, 10);
        if (!isNaN(parsed)) this.hardwareCalibrationMs = parsed;
      }

      player.onPlaybackChange = (type, payload) => {
        if (this.role === 'host' && this.connections.size > 0) {
          if (type === 'play') {
            this.broadcastPlay(payload.song, payload.context, payload.position);
          } else if (type === 'pause') {
            this.broadcastPause(payload.position);
          } else if (type === 'seek') {
            this.broadcastSeek(payload.position);
          }
        }
      };
    }
  }

  setHardwareCalibration(ms: number) {
    this.hardwareCalibrationMs = ms;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_jam_calibration', String(ms));
    }
  }

  generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous chars
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // --- HOST A JAM ---
  async hostJam(): Promise<string> {
    this.leaveJam();
    this.status = 'connecting';
    this.role = 'host';
    this.errorMessage = '';

    const code = this.generateRoomCode();
    this.roomCode = code;
    const fullId = `${PEER_PREFIX}${code.toLowerCase()}`;

    try {
      this.peer = new Peer(fullId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      this.peer.on('open', () => {
        this.status = 'connected';
        this.peerCount = 1;
        this.startHostHeartbeat();
      });

      this.peer.on('connection', (conn) => {
        this.handleNewGuestConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[Jam Host Error]', err);
        this.status = 'error';
        this.errorMessage = err.message || 'Connection error';
      });

      return code;
    } catch (err: any) {
      this.status = 'error';
      this.errorMessage = err?.message || 'Failed to start Jam session';
      return '';
    }
  }

  private handleNewGuestConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.peerCount = this.connections.size + 1; // including host

      // Send current state to newly joined guest
      if (player.currentSong) {
        const msg: StateResponseMsg = {
          type: 'STATE_RESPONSE',
          song: player.currentSong,
          isPlaying: player.isPlaying,
          position: player.currentTime,
          context: player.currentContext,
        };
        conn.send(msg);
      }
    });

    conn.on('data', (data) => {
      this.handleHostReceivedData(data as JamMessage, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.peerCount = this.connections.size + 1;
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.peerCount = this.connections.size + 1;
    });
  }

  private handleHostReceivedData(msg: JamMessage, conn: DataConnection) {
    if (msg.type === 'PING') {
      // Instant NTP Clock Response
      const pong: ClockPongMsg = {
        type: 'PONG',
        seq: msg.seq,
        clientTime: msg.clientTime,
        hostTime: performance.now(),
      };
      conn.send(pong);
    }
  }

  // --- JOIN A JAM ---
  async joinJam(code: string): Promise<boolean> {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return false;

    this.leaveJam();
    this.status = 'connecting';
    this.role = 'guest';
    this.roomCode = cleanCode;
    this.errorMessage = '';

    const hostFullId = `${PEER_PREFIX}${cleanCode.toLowerCase()}`;

    try {
      this.peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      return new Promise<boolean>((resolve) => {
        if (!this.peer) return resolve(false);

        this.peer.on('open', () => {
          if (!this.peer) return resolve(false);

          const conn = this.peer.connect(hostFullId, { reliable: true });
          this.hostConnection = conn;

          conn.on('open', () => {
            this.status = 'connected';
            this.peerCount = 2;
            this.startGuestClockSync();
            resolve(true);
          });

          conn.on('data', (data) => {
            this.handleGuestReceivedData(data as JamMessage);
          });

          conn.on('close', () => {
            this.leaveJam();
          });

          conn.on('error', (err) => {
            console.error('[Guest Connection Error]', err);
            this.status = 'error';
            this.errorMessage = 'Failed to connect to host room';
            resolve(false);
          });
        });

        this.peer.on('error', (err) => {
          console.error('[Peer Error]', err);
          this.status = 'error';
          this.errorMessage = 'Room not found or network unavailable';
          resolve(false);
        });
      });
    } catch (err: any) {
      this.status = 'error';
      this.errorMessage = err?.message || 'Failed to join Jam';
      return false;
    }
  }

  // --- CRISTIAN'S NTP CLOCK CALIBRATION (GUEST) ---
  private startGuestClockSync() {
    this.calibrateClock();
    if (this.clockSyncInterval) clearInterval(this.clockSyncInterval);
    // Periodically re-calibrate to prevent crystal clock skew
    this.clockSyncInterval = setInterval(() => {
      this.calibrateClock();
    }, 25000);
  }

  private calibrateClock() {
    if (!this.hostConnection || !this.hostConnection.open) return;

    const samples: { rtt: number; offset: number }[] = [];
    let pingsSent = 0;
    const totalPings = 8;

    const pingNext = () => {
      if (pingsSent >= totalPings || !this.hostConnection?.open) {
        if (samples.length > 0) {
          // Sort by lowest RTT (lowest latency jitter gives most accurate offset)
          samples.sort((a, b) => a.rtt - b.rtt);
          const best = samples.slice(0, Math.min(3, samples.length));
          const avgOffset = best.reduce((sum, s) => sum + s.offset, 0) / best.length;
          this.clockOffset = avgOffset;
          this.rttMs = Math.round(samples[0].rtt * 10) / 10;
          this.isClockSynced = true;
        }
        return;
      }

      pingsSent++;
      const pingMsg: ClockPingMsg = {
        type: 'PING',
        seq: pingsSent,
        clientTime: performance.now(),
      };
      this.hostConnection.send(pingMsg);
    };

    const handlePong = (msg: ClockPongMsg) => {
      const now = performance.now();
      const rtt = now - msg.clientTime;
      const oneWay = rtt / 2;
      const offset = msg.hostTime - (now - oneWay);
      samples.push({ rtt, offset });
      setTimeout(pingNext, 35);
    };

    this.pendingPongHandler = handlePong;
    pingNext();
  }

  private pendingPongHandler: ((msg: ClockPongMsg) => void) | null = null;

  // --- GUEST MESSAGE DISPATCHER ---
  private handleGuestReceivedData(msg: JamMessage) {
    if (msg.type === 'PONG') {
      if (this.pendingPongHandler) {
        this.pendingPongHandler(msg);
      }
      return;
    }

    if (msg.type === 'PLAY') {
      this.executeScheduledPlay(msg);
    } else if (msg.type === 'PAUSE') {
      this.executePause(msg);
    } else if (msg.type === 'SEEK') {
      this.executeScheduledSeek(msg);
    } else if (msg.type === 'HEARTBEAT') {
      this.executeHeartbeatPhaseLock(msg);
    } else if (msg.type === 'STATE_RESPONSE') {
      this.executeInitialState(msg);
    }
  }

  private executeInitialState(msg: StateResponseMsg) {
    if (msg.song) {
      player.play(msg.song, msg.context, undefined, true);
      if (msg.isPlaying) {
        player.seek(msg.position);
      } else {
        player.seek(msg.position);
        player.audio?.pause();
      }
    }
  }

  private executeScheduledPlay(msg: SyncPlayMsg) {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    // Load and prepare song immediately
    player.play(msg.song, msg.context, undefined, true);

    // Calculate exact local time to trigger audio play
    // targetHostTime = guestNow + clockOffset + delay
    // delay = targetHostTime - (performance.now() + clockOffset) - hardwareCalibrationMs
    const hostNow = performance.now() + this.clockOffset;
    const remainingMs = msg.targetHostTime - hostNow - this.hardwareCalibrationMs;

    const triggerPlay = () => {
      if (player.audio) {
        if (Math.abs(player.audio.currentTime - msg.position) > 0.05) {
          player.audio.currentTime = msg.position;
        }
        player.audio.playbackRate = 1.0;
        player.audio.play().catch((e) => console.log('Autoplay deferred:', e));
      }
    };

    if (remainingMs <= 4) {
      triggerPlay();
    } else {
      this.scheduledTimer = setTimeout(triggerPlay, remainingMs);
    }
  }

  private executePause(msg: SyncPauseMsg) {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    if (player.audio) {
      player.audio.pause();
      player.audio.currentTime = msg.position;
    }
  }

  private executeScheduledSeek(msg: SyncSeekMsg) {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    if (player.audio) {
      player.audio.currentTime = msg.position;
    }

    const hostNow = performance.now() + this.clockOffset;
    const remainingMs = msg.targetHostTime - hostNow - this.hardwareCalibrationMs;

    const resume = () => {
      if (player.audio) {
        player.audio.currentTime = msg.position;
        player.audio.playbackRate = 1.0;
        player.audio.play().catch(() => {});
      }
    };

    if (remainingMs <= 4) {
      resume();
    } else {
      this.scheduledTimer = setTimeout(resume, remainingMs);
    }
  }

  // --- CONTINUOUS PHASE-LOCK DRIFT CORRECTION ENGINE ---
  private executeHeartbeatPhaseLock(msg: SyncHeartbeatMsg) {
    if (!player.audio || !msg.isPlaying || player.isLoading) return;

    const hostNow = performance.now() + this.clockOffset;
    const elapsedSec = Math.max(0, (hostNow - msg.hostTime) / 1000);
    const expectedPosSec = msg.position + elapsedSec;
    const actualPosSec = player.audio.currentTime - (this.hardwareCalibrationMs / 1000);

    const driftSec = actualPosSec - expectedPosSec;
    const driftMs = driftSec * 1000;
    this.driftMs = Math.round(driftMs * 10) / 10;

    // Phase-Lock Thresholds:
    // |drift| <= 8ms: Perfect acoustic lock! (zero rate adjustment needed)
    // 8ms < drift <= 140ms: Micro-adjust rate by 0.7% (completely inaudible, zero glitch)
    // |drift| > 140ms: Hard seek fallback
    if (Math.abs(driftMs) <= 8) {
      if (player.audio.playbackRate !== 1.0) {
        player.audio.playbackRate = 1.0;
      }
    } else if (driftMs > 8 && driftMs <= 140) {
      // Guest is slightly ahead -> decelerate by 0.7%
      player.audio.playbackRate = 0.993;
    } else if (driftMs < -8 && driftMs >= -140) {
      // Guest is slightly behind -> accelerate by 0.7%
      player.audio.playbackRate = 1.007;
    } else if (Math.abs(driftMs) > 140) {
      // Large drift (buffer stall / network hiccup) -> clean hard seek
      player.audio.currentTime = Math.max(0, expectedPosSec + (this.hardwareCalibrationMs / 1000));
      player.audio.playbackRate = 1.0;
    }
  }

  // --- HOST BROADCASTING ---
  private startHostHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.role !== 'host' || this.connections.size === 0 || !player.currentSong) return;

      const msg: SyncHeartbeatMsg = {
        type: 'HEARTBEAT',
        hostTime: performance.now(),
        position: player.currentTime,
        isPlaying: player.isPlaying,
      };
      this.broadcast(msg);
    }, 1500);
  }

  broadcastPlay(song: Song, context: PlaybackContext, position = 0) {
    if (this.role !== 'host' || this.connections.size === 0) return;

    // 450ms future target: allows both machines to prepare and fire at exact same millisecond
    const targetHostTime = performance.now() + 450;
    const msg: SyncPlayMsg = {
      type: 'PLAY',
      song,
      context,
      position,
      targetHostTime,
    };
    this.broadcast(msg);
  }

  broadcastPause(position: number) {
    if (this.role !== 'host' || this.connections.size === 0) return;
    const msg: SyncPauseMsg = {
      type: 'PAUSE',
      position,
    };
    this.broadcast(msg);
  }

  broadcastSeek(position: number) {
    if (this.role !== 'host' || this.connections.size === 0) return;
    const targetHostTime = performance.now() + 400;
    const msg: SyncSeekMsg = {
      type: 'SEEK',
      position,
      targetHostTime,
    };
    this.broadcast(msg);
  }

  private broadcast(msg: JamMessage) {
    for (const [_, conn] of this.connections) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  // --- LEAVE / DISCONNECT ---
  leaveJam() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
      this.clockSyncInterval = null;
    }
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    for (const [_, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();

    if (this.hostConnection) {
      this.hostConnection.close();
      this.hostConnection = null;
    }

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    if (player.audio && player.audio.playbackRate !== 1.0) {
      player.audio.playbackRate = 1.0;
    }

    this.status = 'idle';
    this.role = null;
    this.roomCode = '';
    this.peerCount = 0;
    this.driftMs = 0;
    this.rttMs = 0;
    this.isClockSynced = false;
    this.errorMessage = '';
  }
}

export const jamStore = new JamStore();
