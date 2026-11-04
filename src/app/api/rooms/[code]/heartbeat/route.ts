import { codeParam, handle } from '@/server/http';
import { heartbeat } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => heartbeat(userId, await codeParam(ctx.params)));
}
