import { joinRoomSchema } from '@/lib/settings';
import { codeParam, handle, readJson } from '@/server/http';
import { joinRoom } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => {
    const code = await codeParam(ctx.params);
    const body = joinRoomSchema.parse(await readJson(req));
    return joinRoom(userId, code, body.displayName);
  });
}
