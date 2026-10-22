'use client';
import {useEffect, useRef} from 'react';
import {useAppReducedMotion} from './motion-preferences';
import type {FintechWebGL} from '@/lib/fintech-webgl';

/** Optional decoration: finance, navigation and chart rendering never depend on it. */
export function WebGLAmbience() {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduced = useAppReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let canvas: HTMLCanvasElement | undefined;
    let engine: FintechWebGL | undefined;
    host.dataset.webglState = reduced ? 'reduced' : 'loading';
    host.dataset.webglFrame = '0';
    if (reduced) return;

    // Three.js is downloaded only for the overview and when motion is enabled.
    void import('@/lib/fintech-webgl').then(({createFintechWebGL}) => {
      if (cancelled) return;
      // A disposed/lost WebGL context cannot be reused. Every effect lifecycle
      // owns a fresh canvas, including React's development cleanup rehearsal.
      canvas = document.createElement('canvas');
      host.append(canvas);
      engine = createFintechWebGL(host, canvas, {maxPixelRatio: 1.5});
    }).catch(() => {
      if (!cancelled) host.dataset.webglState = 'fallback';
    });

    return () => {
      cancelled = true;
      engine?.dispose();
      canvas?.remove();
    };
  }, [reduced]);

  return <div ref={hostRef} className="webgl-ambience" data-webgl-host="" data-webgl-state="loading" aria-hidden="true">
    <div className="webgl-fallback"/>
  </div>;
}
