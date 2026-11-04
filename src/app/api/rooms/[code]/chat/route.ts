import { chatSchema } from '@/lib/settings';
import { codeParam, handle, readJson } from '@/server/http';
import { getChat, sendChat } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => getChat(userId, await codeParam(ctx.params)));
}

export function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => {
    const code = await codeParam(ctx.params);
    const { body } = chatSchema.parse(await readJson(req));
    return sendChat(userId, code, body);
  });
}
