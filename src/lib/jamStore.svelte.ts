import PeerPkg, { type DataConnection } from 'peerjs';
// Handle both ESM named export and CommonJS default wrapper cleanly across webview/desktop
const PeerClass = (PeerPkg as any)?.Peer || (PeerPkg as any)?.default || PeerPkg;
type PeerInstance = InstanceType<typeof PeerClass>;
import { player } from './player.svelte';
import type { Song, PlaybackContext } from './types';

const PEER_PREFIX = 'vibes-jam-';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
];

export type JamRole = 'host' | 'guest' | null;
export type JamStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type DevicePlatform = 'windows' | 'android' | 'other';

export interface JamMember {
  peerId: string;
  name: string;
  device: DevicePlatform;
  isHost: boolean;
}

interface SyncPlayMsg {
  type: 'PLAY';
  song: Song;
  context?: PlaybackContext;
  position: number;
}

interface SyncPauseMsg {
  type: 'PAUSE';
  position: number;
}

interface SyncSeekMsg {
  type: 'SEEK';
  position: number;
}

interface SyncHeartbeatMsg {
  type: 'HEARTBEAT';
  songId: string;
  isPlaying: boolean;
  position: number;
  queueIndex: number;
}

interface StateRequestMsg {
  type: 'STATE_REQUEST';
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

interface PingMsg {
  type: 'PING';
  t: number;
}

interface PongMsg {
  type: 'PONG';
  t: number;
}

type JamMessage =
  | SyncPlayMsg
  | SyncPauseMsg
  | SyncSeekMsg
  | SyncHeartbeatMsg
  | StateRequestMsg
  | StateResponseMsg
  | QueueSyncMsg
  | GuestActionMsg
  | PeerInfoMsg
  | MemberListMsg
  | PingMsg
  | PongMsg;

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

  // Metrics
  rttMs = $state<number>(0);
  driftMs = $state<number>(0);

  private peer: any = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private guestMeta: Map<string, { name: string; device: DevicePlatform }> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastCatchUpSeek = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      // Hook delegate on player for guest interception and queue synchronization
      player.jamDelegate = {
        isGuest: () => this.role === 'guest' && this.status === 'connected',
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
      this.peer = new PeerClass(fullId, {
        config: {
          iceServers: ICE_SERVERS,
        },
      });

      this.peer.on('open', () => {
        this.status = 'connected';
        this.peerCount = 1;
        this.updateHostMemberList();
        this.startHostHeartbeat();
      });

      this.peer.on('connection', (conn: any) => {
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

      // Send initial full state immediately to newly joined guest
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
      conn.send({
        type: 'PONG',
        t: msg.t,
      });
    } else if (msg.type === 'PEER_INFO') {
      this.guestMeta.set(conn.peer, { name: msg.name, device: msg.device });
      this.updateHostMemberList();
    } else if (msg.type === 'STATE_REQUEST') {
      const resp: StateResponseMsg = {
        type: 'STATE_RESPONSE',
        song: player.currentSong,
        isPlaying: player.isPlaying,
        position: player.currentTime,
        context: player.currentContext,
        queue: player.queue,
        queueIndex: player.queueIndex,
        allowGuestControls: this.allowGuestControls,
      };
      conn.send(resp);
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
      this.peer = new PeerClass({
        config: {
          iceServers: ICE_SERVERS,
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

            // Request immediate state from Host
            conn.send({
              type: 'STATE_REQUEST',
            });

            this.startPingInterval();
            resolve(true);
          });

          conn.on('data', (data: any) => {
            this.handleGuestReceivedData(data as JamMessage);
          });

          conn.on('close', () => {
            this.leaveJam();
          });

          conn.on('error', (err: any) => {
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

        this.peer.on('error', (err: any) => {
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

  private startPingInterval() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.role === 'guest' && this.hostConnection?.open) {
        this.hostConnection.send({
          type: 'PING',
          t: performance.now(),
        });
      }
    }, 8000);
  }

  // --- GUEST MESSAGE DISPATCHER ---
  private handleGuestReceivedData(msg: JamMessage) {
    if (msg.type === 'PONG') {
      this.rttMs = Math.round(performance.now() - msg.t);
      return;
    }

    if (msg.type === 'PLAY') {
      this.executePlay(msg);
    } else if (msg.type === 'PAUSE') {
      this.executePause(msg);
    } else if (msg.type === 'SEEK') {
      this.executeSeek(msg);
    } else if (msg.type === 'HEARTBEAT') {
      this.executeHeartbeatSync(msg);
    } else if (msg.type === 'STATE_RESPONSE') {
      this.executeStateResponse(msg);
    } else if (msg.type === 'QUEUE_SYNC') {
      player.setQueueFromSync(msg.queue, msg.queueIndex);
    } else if (msg.type === 'MEMBER_LIST') {
      this.members = msg.members;
      this.peerCount = msg.members.length;
    }
  }

  private executeStateResponse(msg: StateResponseMsg) {
    this.allowGuestControls = msg.allowGuestControls;
    if (msg.queue && msg.queue.length > 0) {
      player.setQueueFromSync(msg.queue, msg.queueIndex);
    }
    if (msg.song) {
      player.play(
        msg.song,
        msg.context,
        msg.queueIndex,
        true,
        msg.position,
        msg.isPlaying
      );
    }
  }

  private executePlay(msg: SyncPlayMsg) {
    // If we're already on this exact song, ensure play state without re-fetching stream
    if (player.currentSong?.id === msg.song.id && player.audio?.src) {
      if (Math.abs(player.currentTime - msg.position) > 4) {
        player.audio.currentTime = msg.position;
        player.currentTime = msg.position;
      }
      player.resume(true);
      return;
    }

    // New song - start playback cleanly from host position
    player.play(msg.song, msg.context, undefined, true, msg.position, true);
  }

  private executePause(msg: SyncPauseMsg) {
    player.pause(true);
    if (Math.abs(player.currentTime - msg.position) > 4 && player.audio) {
      player.audio.currentTime = msg.position;
      player.currentTime = msg.position;
    }
  }

  private executeSeek(msg: SyncSeekMsg) {
    player.seek(msg.position, true);
  }

  private executeHeartbeatSync(msg: SyncHeartbeatMsg) {
    // 1. Song identity verification
    if (msg.songId && player.currentSong?.id !== msg.songId) {
      const matchingSong = player.queue.find((s) => s.id === msg.songId);
      if (matchingSong) {
        const idx = player.queue.indexOf(matchingSong);
        player.play(matchingSong, undefined, idx, true, msg.position, msg.isPlaying);
      } else {
        this.requestHostState();
      }
      return;
    }

    if (!player.audio || player.isLoading) return;

    // 2. Strict Play/Pause matching (Host and Guest must always match!)
    if (msg.isPlaying && !player.isPlaying) {
      player.resume(true);
    } else if (!msg.isPlaying && player.isPlaying) {
      player.pause(true);
      return;
    }

    if (!player.isPlaying) return;

    // 3. Strictly maintain 1.0x playback rate (no audio resampling glitches or pitch wobbles)
    if (player.audio.playbackRate !== 1.0) {
      player.audio.playbackRate = 1.0;
    }

    // 4. Remote smooth playback - zero stuttering!
    // Never seek or disrupt the audio buffer for minor timing differences.
    const diff = player.currentTime - msg.position;
    this.driftMs = Math.round(diff * 1000);

    // Only catch up if there was a severe gap (> 5 seconds) from e.g. network stall or call,
    // with a minimum 10-second cooldown so it never stutters in a loop.
    const now = Date.now();
    if (Math.abs(diff) >= 5 && now - this.lastCatchUpSeek > 10000) {
      this.lastCatchUpSeek = now;
      player.audio.currentTime = msg.position;
      player.currentTime = msg.position;
    }
  }

  requestHostState() {
    if (this.role === 'guest' && this.hostConnection?.open) {
      this.hostConnection.send({ type: 'STATE_REQUEST' });
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
        songId: player.currentSong.id,
        position: player.currentTime,
        isPlaying: player.isPlaying,
        queueIndex: player.queueIndex,
      };
      this.broadcast(msg);
    }, 2500);
  }

  broadcastPlay(song: Song, context?: PlaybackContext, position = 0) {
    if (this.role !== 'host' || this.connections.size === 0) return;
    const msg: SyncPlayMsg = {
      type: 'PLAY',
      song,
      context,
      position,
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
    const msg: SyncSeekMsg = {
      type: 'SEEK',
      position,
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
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
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
    this.errorMessage = '';
  }
}

export const jamStore = new JamStore();
