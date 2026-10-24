import { Peer, type DataConnection } from 'peerjs';
import { player } from './player.svelte';
import type { Song, PlaybackContext } from './types';

const PEER_PREFIX = 'vibes-jam-';

export type JamRole = 'host' | 'guest' | null;
export type JamStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type DevicePlatform = 'windows' | 'android' | 'other';

export interface JamMember {
  peerId: string;
  name: string;
  device: DevicePlatform;
  isHost: boolean;
}

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
  queue: Song[];
  queueIndex: number;
  allowGuestControls: boolean;
  targetHostTime?: number;
}

interface QueueSyncMsg {
  type: 'QUEUE_SYNC';
  queue: Song[];
  queueIndex: number;
}

interface GuestActionMsg {
  type: 'GUEST_ACTION';
  action: 'play_now' | 'add_queue' | 'toggle' | 'next' | 'prev' | 'seek';
  song?: Song;
  context?: PlaybackContext;
  position?: number;
}

interface PeerInfoMsg {
  type: 'PEER_INFO';
  peerId: string;
  name: string;
  device: DevicePlatform;
}

interface MemberListMsg {
  type: 'MEMBER_LIST';
  members: JamMember[];
}

type JamMessage =
  | ClockPingMsg
  | ClockPongMsg
  | SyncPlayMsg
  | SyncPauseMsg
  | SyncSeekMsg
  | SyncHeartbeatMsg
  | StateResponseMsg
  | QueueSyncMsg
  | GuestActionMsg
  | PeerInfoMsg
  | MemberListMsg;

function detectDevice(): { device: DevicePlatform; name: string } {
  if (typeof navigator === 'undefined') {
    return { device: 'other', name: 'Web Player' };
  }
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    return { device: 'android', name: 'Android Device' };
  }
  if (/Windows/i.test(ua)) {
    return { device: 'windows', name: 'Windows PC' };
  }
  return { device: 'other', name: 'Vibes Player' };
}

class JamStore {
  status = $state<JamStatus>('idle');
  role = $state<JamRole>(null);
  roomCode = $state<string>('');
  peerCount = $state<number>(0);
  errorMessage = $state<string>('');
  isModalOpen = $state<boolean>(false);

  // Collaborative settings
  allowGuestControls = $state<boolean>(true);
  members = $state<JamMember[]>([]);
  localDevice = detectDevice();

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
  private guestMeta: Map<string, { name: string; device: DevicePlatform }> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private clockSyncInterval: ReturnType<typeof setInterval> | null = null;
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPongHandler: ((msg: ClockPongMsg) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedCal = localStorage.getItem('vibes_jam_calibration');
      if (savedCal !== null) {
        const parsed = parseInt(savedCal, 10);
        if (!isNaN(parsed)) this.hardwareCalibrationMs = parsed;
      }

      // Hook delegate on player for guest interception and queue synchronization
      player.jamDelegate = {
        isGuest: () => this.role === 'guest' && this.status === 'connected',
        getClockOffset: () => this.clockOffset,
        getHardwareCalibration: () => this.hardwareCalibrationMs,
        onUserPlay: (song, context) => {
          if (this.allowGuestControls) {
            this.sendGuestAction({ action: 'play_now', song, context });
            return true;
          }
          return false;
        },
        onUserToggle: () => {
          if (this.allowGuestControls) {
            this.sendGuestAction({ action: 'toggle' });
            return true;
          }
          return false;
        },
        onUserNext: () => {
          if (this.allowGuestControls) {
            this.sendGuestAction({ action: 'next' });
            return true;
          }
          return false;
        },
        onUserPrev: () => {
          if (this.allowGuestControls) {
            this.sendGuestAction({ action: 'prev' });
            return true;
          }
          return false;
        },
        onUserSeek: (pos) => {
          if (this.allowGuestControls) {
            this.sendGuestAction({ action: 'seek', position: pos });
            return true;
          }
          return false;
        },
        onUserAddQueue: (song) => {
          this.sendGuestAction({ action: 'add_queue', song });
          return true;
        },
        onHostQueueChanged: () => {
          if (this.role === 'host' && this.connections.size > 0) {
            this.broadcastQueue();
          }
        },
      };

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

      window.addEventListener('beforeunload', () => {
        this.leaveJam();
      });
    }
  }

  open() {
    this.isModalOpen = true;
  }

  close() {
    this.isModalOpen = false;
  }

  toggleModal() {
    this.isModalOpen = !this.isModalOpen;
  }

  toggleGuestControls() {
    this.allowGuestControls = !this.allowGuestControls;
    if (this.role === 'host') {
      this.broadcastState();
    }
  }

  setHardwareCalibration(ms: number) {
    this.hardwareCalibrationMs = ms;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_jam_calibration', String(ms));
    }
  }

  generateRoomCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
          ],
        },
      });

      this.peer.on('open', () => {
        this.status = 'connected';
        this.peerCount = 1;
        this.updateHostMemberList();
        this.startHostHeartbeat();
      });

      this.peer.on('connection', (conn) => {
        this.handleNewGuestConnection(conn);
      });

      this.peer.on('disconnected', () => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });

      this.peer.on('error', (err: any) => {
        console.error('[Jam Host Error]', err);
        if (err.type === 'unavailable-id') {
          this.hostJam();
          return;
        }
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
      this.peerCount = this.connections.size + 1;

      // Send initial full state to newly joined guest
      const targetHostTime = player.isPlaying ? performance.now() + 450 : undefined;
      const msg: StateResponseMsg = {
        type: 'STATE_RESPONSE',
        song: player.currentSong,
        isPlaying: player.isPlaying,
        position: player.currentTime,
        context: player.currentContext,
        queue: player.queue,
        queueIndex: player.queueIndex,
        allowGuestControls: this.allowGuestControls,
        targetHostTime,
      };
      conn.send(msg);

      this.updateHostMemberList();
    });

    conn.on('data', (data) => {
      this.handleHostReceivedData(data as JamMessage, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.guestMeta.delete(conn.peer);
      this.peerCount = this.connections.size + 1;
      this.updateHostMemberList();
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.guestMeta.delete(conn.peer);
      this.peerCount = this.connections.size + 1;
      this.updateHostMemberList();
    });
  }

  private handleHostReceivedData(msg: JamMessage, conn: DataConnection) {
    if (msg.type === 'PING') {
      const pong: ClockPongMsg = {
        type: 'PONG',
        seq: msg.seq,
        clientTime: msg.clientTime,
        hostTime: performance.now(),
      };
      conn.send(pong);
    } else if (msg.type === 'PEER_INFO') {
      this.guestMeta.set(conn.peer, { name: msg.name, device: msg.device });
      this.updateHostMemberList();
    } else if (msg.type === 'GUEST_ACTION') {
      this.handleHostGuestAction(msg);
    }
  }

  private handleHostGuestAction(msg: GuestActionMsg) {
    if (!this.allowGuestControls && msg.action !== 'add_queue') return;

    if (msg.action === 'play_now' && msg.song) {
      player.play(msg.song, msg.context);
    } else if (msg.action === 'add_queue' && msg.song) {
      player.addToQueue(msg.song);
      this.broadcastQueue();
    } else if (msg.action === 'toggle') {
      player.togglePlay();
    } else if (msg.action === 'next') {
      player.next();
    } else if (msg.action === 'prev') {
      player.prev();
    } else if (msg.action === 'seek' && msg.position !== undefined) {
      player.seek(msg.position);
    }
  }

  private updateHostMemberList() {
    const list: JamMember[] = [
      {
        peerId: this.peer?.id || 'host',
        name: this.localDevice.name + ' (Host)',
        device: this.localDevice.device,
        isHost: true,
      },
    ];

    for (const [peerId] of this.connections) {
      const meta = this.guestMeta.get(peerId);
      list.push({
        peerId,
        name: meta ? meta.name : 'Guest',
        device: meta ? meta.device : 'other',
        isHost: false,
      });
    }

    this.members = list;
    this.peerCount = list.length;
    this.broadcast({
      type: 'MEMBER_LIST',
      members: list,
    });
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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
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

            // Send local device info to Host
            conn.send({
              type: 'PEER_INFO',
              peerId: this.peer?.id || '',
              name: this.localDevice.name,
              device: this.localDevice.device,
            });

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

        this.peer.on('disconnected', () => {
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          }
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

  // --- GUEST NTP CLOCK SYNC ---
  private startGuestClockSync() {
    this.calibrateClock();
    if (this.clockSyncInterval) clearInterval(this.clockSyncInterval);
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
    } else if (msg.type === 'QUEUE_SYNC') {
      player.setQueueFromSync(msg.queue, msg.queueIndex);
    } else if (msg.type === 'MEMBER_LIST') {
      this.members = msg.members;
      this.peerCount = msg.members.length;
    }
  }

  private executeInitialState(msg: StateResponseMsg) {
    this.allowGuestControls = msg.allowGuestControls;
    if (msg.queue && msg.queue.length > 0) {
      player.setQueueFromSync(msg.queue, msg.queueIndex);
    }
    if (msg.song) {
      player.play(msg.song, msg.context, undefined, true, msg.targetHostTime, msg.position);
      if (!msg.isPlaying && player.audio) {
        player.audio.pause();
        player.isPlaying = false;
      }
    }
  }

  private executeScheduledPlay(msg: SyncPlayMsg) {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    player.play(msg.song, msg.context, undefined, true, msg.targetHostTime, msg.position);

    const hostNow = performance.now() + this.clockOffset;
    const remainingMs = msg.targetHostTime - hostNow - this.hardwareCalibrationMs;

    const triggerPlay = () => {
      if (player.audio) {
        const currentHostNow = performance.now() + this.clockOffset;
        const elapsedSec = Math.max(0, (currentHostNow - msg.targetHostTime - this.hardwareCalibrationMs) / 1000);
        const targetPos = msg.position + elapsedSec;

        if (Math.abs(player.audio.currentTime - targetPos) > 0.04) {
          player.audio.currentTime = targetPos;
        }
        player.audio.playbackRate = 1.0;
        player.audio.play().catch(() => {});
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
      player.currentTime = msg.position;
      player.isPlaying = false;
    }
  }

  private executeScheduledSeek(msg: SyncSeekMsg) {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    if (player.audio) {
      player.audio.currentTime = msg.position;
      player.currentTime = msg.position;
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
    // |drift| > 140ms: Clean instant sync seek
    if (Math.abs(driftMs) <= 8) {
      if (player.audio.playbackRate !== 1.0) {
        player.audio.playbackRate = 1.0;
      }
    } else if (driftMs > 8 && driftMs <= 140) {
      player.audio.playbackRate = 0.993;
    } else if (driftMs < -8 && driftMs >= -140) {
      player.audio.playbackRate = 1.007;
    } else if (Math.abs(driftMs) > 140) {
      player.audio.currentTime = Math.max(0, expectedPosSec + (this.hardwareCalibrationMs / 1000));
      player.audio.playbackRate = 1.0;
    }
  }

  sendGuestAction(action: Omit<GuestActionMsg, 'type'>) {
    if (this.role !== 'guest' || !this.hostConnection || !this.hostConnection.open) return;
    this.hostConnection.send({ type: 'GUEST_ACTION', ...action });
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

  broadcastQueue() {
    if (this.role !== 'host' || this.connections.size === 0) return;
    const msg: QueueSyncMsg = {
      type: 'QUEUE_SYNC',
      queue: player.queue,
      queueIndex: player.queueIndex,
    };
    this.broadcast(msg);
  }

  private broadcastState() {
    if (this.role !== 'host' || this.connections.size === 0) return;
    const msg: StateResponseMsg = {
      type: 'STATE_RESPONSE',
      song: player.currentSong,
      isPlaying: player.isPlaying,
      position: player.currentTime,
      context: player.currentContext,
      queue: player.queue,
      queueIndex: player.queueIndex,
      allowGuestControls: this.allowGuestControls,
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
    this.guestMeta.clear();

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
    this.members = [];
    this.driftMs = 0;
    this.rttMs = 0;
    this.isClockSynced = false;
    this.errorMessage = '';
  }
}

export const jamStore = new JamStore();
