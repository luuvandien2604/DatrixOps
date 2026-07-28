'use client';

import { useEffect } from 'react';

const GLASS_SURFACE_SELECTOR = [
  '.glass-card',
  '.glass-panel',
  '.liquid-panel',
  '.glass-modal',
  '.glass-dropdown',
  '.glass-control',
  '.metric-card',
].join(',');

// One delegated listener and one paint per animation frame keeps pointer
// tracking constant-cost even when a dashboard contains many glass surfaces.
export function LiquidGlassPointer() {
  useEffect(() => {
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!precisePointer.matches || reducedMotion.matches) return;

    let animationFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTarget: EventTarget | null = null;
    let activeSurface: HTMLElement | null = null;

    const clearSurface = () => {
      if (!activeSurface) return;
      activeSurface.style.removeProperty('--mouse-x');
      activeSurface.style.removeProperty('--mouse-y');
      activeSurface = null;
    };

    const paintSpecular = () => {
      animationFrame = 0;
      const target = pointerTarget instanceof Element
        ? pointerTarget.closest<HTMLElement>(GLASS_SURFACE_SELECTOR)
        : null;

      if (target !== activeSurface) {
        clearSurface();
        activeSurface = target;
      }

      if (!activeSurface) return;

      const bounds = activeSurface.getBoundingClientRect();
      activeSurface.style.setProperty('--mouse-x', `${pointerX - bounds.left}px`);
      activeSurface.style.setProperty('--mouse-y', `${pointerY - bounds.top}px`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        clearSurface();
        return;
      }

      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerTarget = event.target;

      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(paintSpecular);
      }
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', clearSurface);
    window.addEventListener('blur', clearSurface);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', clearSurface);
      window.removeEventListener('blur', clearSurface);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      clearSurface();
    };
  }, []);

  return null;
}
