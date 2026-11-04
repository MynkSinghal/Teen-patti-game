import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireUserId } from './auth';
import { AppError } from './errors';
import { roomCodeSchema } from '@/lib/settings';

export async function handle(req: Request, fn: (userId: string) => Promise<unknown>): Promise<NextResponse> {
  try {
    const userId = await requireUserId(req);
    const data = await fn(userId);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
  }
  if (e instanceof ZodError) {
    const message = e.issues[0]?.message ?? 'Invalid request';
    return NextResponse.json({ error: { code: 'INVALID_INPUT', message } }, { status: 400 });
  }
  console.error('[api] unexpected error', e instanceof Error ? e.message : e);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } },
    { status: 500 },
  );
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError('INVALID_INPUT', 'Invalid request body.');
  }
}

export async function codeParam(params: Promise<{ code: string }>): Promise<string> {
  const { code } = await params;
  const r = roomCodeSchema.safeParse(code);
  if (!r.success) throw new AppError('INVALID_INPUT', 'That is not a valid room code.');
  return r.data;
}
