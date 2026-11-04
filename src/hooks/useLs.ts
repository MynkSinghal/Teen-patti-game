'use client';
import { useEffect, useState } from 'react';
import { useUI } from '@/store/ui';

const Q = '(orientation: landscape) and (max-height: 620px), (orientation: landscape) and (min-width: 900px)';

/** True when the landscape layout is in use (real landscape, wide window, or table rotated in portrait). */
export function useLs(): boolean {
  const forced = useUI((s) => s.forced);
  const [mq, setMq] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(Q);
    const on = () => setMq(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return forced || mq;
}

/** A phone-sized screen held upright. */
export function usePhonePortrait(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(orientation: portrait) and (max-width: 700px)');
    const on = () => setV(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}
