'use client';

import { useEffect } from 'react';

const GLASS_SURFACE_SELECTOR = [
  '.glass-card',
  '.glass-panel',
  '.liquid-panel',
  '.glass-modal',
  '.glass-dropdown',
  '.glass-control',
  '.glass-subtle',
  '.glass-regular',
  '.glass-elevated',
  '.metric-card',
  '.liquid-nav-item',
  '.topbar-action',
  '.topbar-icon',
  '.theme-toggle',
  '.liquid-button',
  '.glass-button',
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
    let activeBounds: DOMRect | null = null;

    const clearSurface = () => {
      if (!activeSurface) return;
      activeSurface.style.setProperty('--pointer-opacity', '0');
      activeSurface.style.setProperty('--pointer-tilt-x', '0deg');
      activeSurface.style.setProperty('--pointer-tilt-y', '0deg');
      activeSurface.removeAttribute('data-liquid-active');
      activeSurface = null;
      activeBounds = null;
    };

    const paintSpecular = () => {
      animationFrame = 0;
      const target = pointerTarget instanceof Element
        ? pointerTarget.closest<HTMLElement>(GLASS_SURFACE_SELECTOR)
        : null;

      if (target !== activeSurface) {
        clearSurface();
        activeSurface = target;
        activeBounds = activeSurface?.getBoundingClientRect() ?? null;
        activeSurface?.setAttribute('data-liquid-active', '');
      }

      if (!activeSurface) return;

      const bounds = activeBounds ?? activeSurface.getBoundingClientRect();
      activeBounds = bounds;

      const localX = Math.min(Math.max(pointerX - bounds.left, 0), bounds.width);
      const localY = Math.min(Math.max(pointerY - bounds.top, 0), bounds.height);
      const normalizedX = bounds.width > 0 ? localX / bounds.width : 0.5;
      const normalizedY = bounds.height > 0 ? localY / bounds.height : 0.5;
      const centeredX = normalizedX - 0.5;
      const centeredY = normalizedY - 0.5;
      const distance = Math.min(Math.hypot(centeredX, centeredY) / Math.SQRT1_2, 1);
      const angle = Math.atan2(centeredY, centeredX) * (180 / Math.PI);

      activeSurface.style.setProperty('--pointer-x', `${normalizedX * 100}%`);
      activeSurface.style.setProperty('--pointer-y', `${normalizedY * 100}%`);
      activeSurface.style.setProperty('--pointer-distance', distance.toFixed(3));
      activeSurface.style.setProperty('--pointer-opacity', '1');
      activeSurface.style.setProperty('--pointer-angle', `${angle.toFixed(2)}deg`);
      activeSurface.style.setProperty('--pointer-tilt-x', `${(-centeredY * 0.8).toFixed(3)}deg`);
      activeSurface.style.setProperty('--pointer-tilt-y', `${(centeredX * 1.2).toFixed(3)}deg`);
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

    const invalidateBounds = () => {
      activeBounds = null;
    };

    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', clearSurface);
    window.addEventListener('resize', invalidateBounds, { passive: true });
    window.addEventListener('scroll', invalidateBounds, { passive: true, capture: true });
    window.addEventListener('blur', clearSurface);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', clearSurface);
      window.removeEventListener('resize', invalidateBounds);
      window.removeEventListener('scroll', invalidateBounds, true);
      window.removeEventListener('blur', clearSurface);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      clearSurface();
    };
  }, []);

  return null;
}
