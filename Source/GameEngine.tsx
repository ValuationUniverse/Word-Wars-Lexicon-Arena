/**
 * 🔒 [CORE ENGINE - READ ONLY]
 * ABSOLUTELY DO NOT MODIFY THIS FILE.
 * Viewport scaling, game loop (~60 FPS), pointer capture defense, and canvas projection.
 * Core platform infrastructure handling screen scaling and virtual design context.
 */
import React, {useEffect, useRef} from 'react';

/**
 * Standardized Viewport Context provided to the game loop on every frame.
 * Standardized on a virtual canvas resolution (750x1334 or 1334x750) with an embedded 1:1 SafeZone.
 */
export interface ViewportContext {
  /** Virtual design width (750 in portrait, 1334 in landscape) */
  width: number;
  /** Virtual design height (1334 in portrait, 750 in landscape) */
  height: number;
  /** Horizontal center coordinate of the virtual canvas (width / 2) */
  centerX: number;
  /** Vertical center coordinate of the virtual canvas (height / 2) */
  centerY: number;
  /** True when operating in 9:16 portrait orientation, false in 16:9 landscape */
  isPortrait: boolean;
  /** 1:1 square safe zone centered within the virtual canvas (ideal for grid-based games like Match-3) */
  safeZone: {x: number; y: number; width: number; height: number};
}

/**
 * Standardized pointer event projected transparently into virtual coordinates.
 */
export interface EnginePointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  x: number; // Virtual X coordinate
  y: number; // Virtual Y coordinate
  timestamp: number;
}

export interface GameEngineProps {
  /**
   * DYNAMIC RESIZE ADAPTATION FLAG:
   *
   * @default true
   * When true, automatically adjusts virtual canvas orientation (750x1334 vs 1334x750)
   * based on live window or container resize events.
   * Default orientation preference is Portrait (9:16) on mobile displays.
   */
  supportResize?: boolean;

  /**
   * Fixed fallback aspect ratio used when `supportResize` is explicitly set to false.
   * @default 'landscape' (Locks to 1334x750 Landscape if unsupplied when supportResize is false)
   */
  fallbackAspect?: 'portrait' | 'landscape';

  /** Background fill color for aspect ratio padding, replacing harsh black bars. Defaults to '#1e1e28'. */
  backgroundColor?: string;

  /** Main game logic update tick callback. */
  onUpdate: (dt: number, vp: ViewportContext) => void;

  /** Canvas rendering tick callback. */
  onRender: (ctx: CanvasRenderingContext2D, vp: ViewportContext) => void;

  /** Optional React overlay elements (HUD, Modals, Buttons). */
  children?: React.ReactNode;
}

/**
 * Minimalist, LLM-Friendly GameEngine Base Component.
 * Features uniform scaling, high-DPI Retina support, background padding, and pointer capture isolation.
 */
export const GameEngine: React.FC<GameEngineProps> = ({
  supportResize = true,
  fallbackAspect = 'landscape',
  backgroundColor = '#1e1e28',
  onUpdate,
  onRender,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    // Determine target virtual design resolution based on supportResize and window dimensions
    const getTargetDesignSize = (
      windowWidth: number,
      windowHeight: number,
    ) => {
      if (!supportResize) {
        const isPortraitFallback = fallbackAspect === 'portrait';
        return isPortraitFallback
          ? {designW: 750, designH: 1334, isPortrait: true}
          : {designW: 1334, designH: 750, isPortrait: false};
      }

      const isDeviceLandscape = windowWidth > windowHeight;
      return isDeviceLandscape
        ? {designW: 1334, designH: 750, isPortrait: false}
        : {designW: 750, designH: 1334, isPortrait: true};
    };

    // Pointer capture management on canvas element
    const onDown = (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const onUp = (e: PointerEvent) => {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    };

    const onCancel = (e: PointerEvent) => {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);

    // Immediately synchronize active design resolution to canvas dataset for InputManager
    const initialSize = getTargetDesignSize(
      window.innerWidth,
      window.innerHeight,
    );
    canvas.dataset.designWidth = String(initialSize.designW);
    canvas.dataset.designHeight = String(initialSize.designH);

    // Main Engine Loop
    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // High-DPI (Retina) display pixel alignment
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.floor(window.innerWidth * dpr);
      const targetH = Math.floor(window.innerHeight * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const {designW, designH, isPortrait} = getTargetDesignSize(
        window.innerWidth,
        window.innerHeight,
      );

      if (
        canvas.dataset.designWidth !== String(designW) ||
        canvas.dataset.designHeight !== String(designH)
      ) {
        canvas.dataset.designWidth = String(designW);
        canvas.dataset.designHeight = String(designH);
      }

      const vp: ViewportContext = {
        width: designW,
        height: designH,
        centerX: designW / 2,
        centerY: designH / 2,
        isPortrait,
        safeZone: {
          x: (designW - 750) / 2,
          y: (designH - 750) / 2,
          width: 750,
          height: 750,
        },
      };

      // Step A: Logic Update
      onUpdate(dt, vp);

      // Step B: Canvas Render
      ctx.save();

      // Fill physical background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply uniform scale transform
      const scale = Math.min(canvas.width / designW, canvas.height / designH);
      const offsetX = (canvas.width - designW * scale) / 2;
      const offsetY = (canvas.height - designH * scale) / 2;

      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      // Render Game Graphics
      onRender(ctx, vp);

      ctx.restore();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }, [supportResize, fallbackAspect, backgroundColor, onUpdate, onRender]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor,
      }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
      />
      {children}
    </div>
  );
};
