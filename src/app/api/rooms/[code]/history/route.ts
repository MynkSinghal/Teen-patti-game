import { codeParam, handle } from '@/server/http';
import { getHistory } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => getHistory(userId, await codeParam(ctx.params)));
}
