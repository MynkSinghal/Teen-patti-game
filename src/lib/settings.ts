import { z } from 'zod';
import { defaultRules } from '@/engine/rules';
import type { RulesConfig } from '@/engine/types';

export const VARIATION_IDS = ['classic', 'muflis', 'ak47', 'joker', 'nine99', 'ten20', 'hilo', 'dealers_choice'] as const;
export const CONCRETE_IDS = ['classic', 'muflis', 'ak47', 'joker', 'nine99', 'ten20', 'hilo'] as const;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const variationOptionsSchema = z
  .object({
    jokerMode: z.enum(['single', 'double', 'lowest']).optional(),
    jokerRanks: z.array(int(2, 14)).max(2).optional(),
    hiLoMode: z.enum(['split', 'high', 'low', 'alternate']).optional(),
  })
  .strict();

export const roomSettingsSchema = z
  .object({
    startingChips: int(100, 1_000_000).default(1000),
    boot: int(1, 100_000).default(10),
    maxPlayers: int(3, 8).default(8),
    variation: z.enum(VARIATION_IDS).default('dealers_choice'),
    /** Who picks the variation each round when variation = dealers_choice. */
    variationChooser: z.enum(['dealer', 'host']).default('dealer'),
    variationOptions: variationOptionsSchema.default({}),
    turnSeconds: int(10, 180).default(45),
    // betting rules (all optional overrides of the centralised defaults)
    maxStakeMultiple: int(1, 10_000).default(64),
    blindMultiplier: z.number().min(0.5).max(5).default(1),
    seenMultiplier: z.number().min(1).max(10).default(2),
    showEligibility: z.enum(['any', 'seen_only']).default('any'),
    showCost: z.enum(['chaal', 'free']).default('chaal'),
    sideshowEnabled: z.boolean().default(true),
    sideshowWhenTwoLeft: z.boolean().default(false),
    maxSideshowRequests: int(0, 20).default(5),
    tieHandling: z.enum(['challenger_loses', 'split']).default('challenger_loses'),
    aceLowSequence: z.enum(['second', 'lowest', 'none']).default('second'),
    autoNextRound: z.boolean().default(false),
    nextRoundDelaySeconds: int(3, 60).default(10),
  })
  .strict()
  .refine((s) => s.boot * 4 <= s.startingChips, { message: 'Starting chips must be at least 4× the boot', path: ['startingChips'] });

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export function rulesFromSettings(s: RoomSettings): RulesConfig {
  return {
    ...defaultRules(s.boot),
    boot: s.boot,
    minStake: s.boot,
    maxStake: s.boot * s.maxStakeMultiple,
    blindMultiplier: s.blindMultiplier,
    seenMultiplier: s.seenMultiplier,
    showEligibility: s.showEligibility,
    showCost: s.showCost,
    sideshowEnabled: s.sideshowEnabled,
    sideshowWhenTwoLeft: s.sideshowWhenTwoLeft,
    maxSideshowRequests: s.maxSideshowRequests,
    tieHandling: s.tieHandling,
    aceLowSequence: s.aceLowSequence,
    turnSeconds: s.turnSeconds,
  };
}

export const displayNameSchema = z
  .string()
  .transform((v) => v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Enter a name').max(20, 'Name is too long (max 20)'));

export const roomCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Room codes are 6 letters/numbers'));

export const createRoomSchema = z.object({
  displayName: displayNameSchema,
  roomName: z.string().trim().max(40).optional(),
  settings: roomSettingsSchema.optional(),
});
export const joinRoomSchema = z.object({ displayName: displayNameSchema });

const key = z.string().min(8).max(80);
const gv = z.number().int().min(0);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_settings'), idempotencyKey: key, settings: roomSettingsSchema, roomName: z.string().trim().max(40).optional() }),
  z.object({ type: z.literal('ready'), idempotencyKey: key, ready: z.boolean() }),
  z.object({ type: z.literal('kick'), idempotencyKey: key, playerId: z.string().uuid() }),
  z.object({ type: z.literal('leave'), idempotencyKey: key }),
  z.object({ type: z.literal('rebuy'), idempotencyKey: key }),
  z.object({ type: z.literal('close_room'), idempotencyKey: key }),
  z.object({
    type: z.literal('start_round'),
    idempotencyKey: key,
    variation: z.enum(CONCRETE_IDS).optional(),
    variationOptions: variationOptionsSchema.optional(),
  }),
  z.object({ type: z.literal('see'), idempotencyKey: key, gameVersion: gv.optional() }),
  z.object({ type: z.literal('bet'), idempotencyKey: key, gameVersion: gv, raise: z.boolean().optional() }),
  z.object({ type: z.literal('pack'), idempotencyKey: key, gameVersion: gv }),
  z.object({ type: z.literal('show'), idempotencyKey: key, gameVersion: gv }),
  z.object({ type: z.literal('sideshow_request'), idempotencyKey: key, gameVersion: gv }),
  z.object({ type: z.literal('sideshow_respond'), idempotencyKey: key, gameVersion: gv, accept: z.boolean() }),
  z.object({ type: z.literal('reveal'), idempotencyKey: key }),
]);
export type Command = z.infer<typeof commandSchema>;

export const chatSchema = z.object({
  body: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, 'Type a message').max(200, 'Message is too long (max 200)')),
  idempotencyKey: key,
});
