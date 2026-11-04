import { commandSchema } from '@/lib/settings';
import { codeParam, handle, readJson } from '@/server/http';
import { runCommand } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, async (userId) => {
    const code = await codeParam(ctx.params);
    const cmd = commandSchema.parse(await readJson(req));
    return runCommand(userId, code, cmd);
  });
}
