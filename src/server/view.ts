import { privateView, publicView, type PrivateGameView, type PublicGameView } from '@/engine/game';
import type { EngineState } from '@/engine/types';
import type { RoomSettings } from '@/lib/settings';

export interface RoomRow {
  id: string;
  room_code: string;
  host_player_id: string | null;
  name: string | null;
  status: 'lobby' | 'playing' | 'between' | 'closed';
  settings: RoomSettings;
  round_number: number;
  dealer_seat: number;
  state_version: number;
  expires_at: Date;
}
export interface PlayerRow {
  id: string;
  room_id: string;
  auth_user_id: string;
  display_name: string;
  seat_number: number;
  chip_balance: number;
  is_host: boolean;
  is_connected: boolean;
  is_ready: boolean;
  is_folded: boolean;
  player_status: 'active' | 'sitting_out';
}
export interface GameRow {
  id: string;
  room_id: string;
  round_number: number;
  variation: string;
  status: 'active' | 'ended';
  game_version: number;
  ended_at: Date | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  balance: number;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  inRound: boolean;
}
export interface PublicRoomState {
  v: number;
  code: string;
  name: string | null;
  status: RoomRow['status'];
  round: number;
  hostId: string | null;
  settings: RoomSettings;
  players: PublicPlayer[];
  game: (PublicGameView & { version: number }) | null;
  nextRoundAt: number | null;
  /** The player who deals (and, in dealer mode, picks the variation) next round. */
  nextDealerId: string | null;
  /** After this time the host may pick on behalf of a slow dealer. */
  chooseDeadline: number | null;
}
export interface MeState {
  playerId: string;
  isHost: boolean;
  private: PrivateGameView | null;
}
export interface ClientView {
  room: PublicRoomState;
  me: MeState;
  serverTime: number;
}

/** Next dealer: the host for the first round, then the next funded, ready seat after the previous dealer. */
export function computeNextDealer(room: RoomRow, players: PlayerRow[]): PlayerRow | null {
  const parts = players
    .filter((p) => (p.is_ready || p.id === room.host_player_id) && p.chip_balance >= room.settings.boot)
    .sort((a, b) => a.seat_number - b.seat_number);
  if (!parts.length) return null;
  if (room.round_number === 0) return parts.find((p) => p.id === room.host_player_id) ?? parts[0]!;
  return parts.find((p) => p.seat_number > room.dealer_seat) ?? parts[0]!;
}

export function buildPublicRoom(
  room: RoomRow,
  players: PlayerRow[],
  game: GameRow | null,
  engine: EngineState | null,
  version: number,
): PublicRoomState {
  const inRound = new Set(engine?.players.map((p) => p.id) ?? []);
  const bal = new Map(engine?.players.map((p) => [p.id, p.balance]) ?? []);
  const gameView = game && engine ? { ...publicView(engine), version: game.game_version } : null;
  const nextRoundAt =
    room.status === 'between' && room.settings.autoNextRound && game?.ended_at
      ? game.ended_at.getTime() + room.settings.nextRoundDelaySeconds * 1000
      : null;
  return {
    v: version,
    code: room.room_code,
    name: room.name,
    status: room.status,
    round: room.round_number,
    hostId: room.host_player_id,
    settings: room.settings,
    players: [...players]
      .sort((a, b) => a.seat_number - b.seat_number)
      .map((p) => ({
        id: p.id,
        name: p.display_name,
        seat: p.seat_number,
        balance: bal.get(p.id) ?? Number(p.chip_balance),
        isHost: p.id === room.host_player_id,
        connected: p.is_connected,
        ready: p.is_ready || p.id === room.host_player_id,
        inRound: inRound.has(p.id),
      })),
    game: gameView,
    nextRoundAt,
    nextDealerId: room.status === 'playing' ? null : computeNextDealer(room, players)?.id ?? null,
    chooseDeadline: room.status === 'between' && game?.ended_at ? game.ended_at.getTime() + 30_000 : null,
  };
}

export function buildMe(room: PublicRoomState, me: PlayerRow, engine: EngineState | null): MeState {
  return {
    playerId: me.id,
    isHost: me.id === room.hostId,
    private: engine ? privateView(engine, me.id) : null,
  };
}
