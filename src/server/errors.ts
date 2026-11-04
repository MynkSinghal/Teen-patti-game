export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EXPIRED'
  | 'ROOM_CLOSED'
  | 'INVALID_INPUT'
  | 'STALE_STATE'
  | 'CONFLICT'
  | 'NOT_ALLOWED'
  | 'INTERNAL'
  | 'NOT_YOUR_TURN'
  | 'NOT_IN_ROUND'
  | 'ALREADY_FOLDED'
  | 'ROUND_ENDED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_BET'
  | 'ALREADY_SEEN'
  | 'SIDESHOW_NOT_ALLOWED'
  | 'SIDESHOW_PENDING'
  | 'NO_PENDING_SIDESHOW'
  | 'SHOW_NOT_ALLOWED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_ACTION';

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ROOM_EXPIRED: 410,
  ROOM_CLOSED: 410,
  INVALID_INPUT: 400,
  INTERNAL: 500,
};

export class AppError extends Error {
  status: number;
  constructor(public code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.status = status ?? STATUS[code] ?? 409;
  }
}
