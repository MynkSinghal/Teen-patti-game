'use client';
import { useEffect, useState } from 'react';
import { useRoomStore } from '@/store/room';

/** Informational only: the server owns the real deadline. */
export function useSecondsLeft(deadline: number | null): number | null {
  const skew = useRoomStore((s) => s.skew);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - (now + skew)) / 1000));
}

export function Countdown({ deadline, className = '' }: { deadline: number | null; className?: string }) {
  const left = useSecondsLeft(deadline);
  if (left === null) return null;
  return (
    <span className={`tabular-nums ${left <= 10 ? 'text-danger' : ''} ${className}`} data-testid="countdown">
      {left}s
    </span>
  );
}
