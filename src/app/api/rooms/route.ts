import { createRoomSchema } from '@/lib/settings';
import { handle, readJson } from '@/server/http';
import { createRoom } from '@/server/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function POST(req: Request) {
  return handle(req, async (userId) => {
    const body = createRoomSchema.parse(await readJson(req));
    return createRoom(userId, body);
  });
}
