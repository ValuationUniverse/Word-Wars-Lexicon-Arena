/**
 * 🔒 [UNIVERSAL INPUT ENGINE - MICRO-KERNEL & PLUGIN ARCHITECTURE]
 * Unified zero-dependency hardware abstraction layer.
 * Manages pointer tracking, coordinate normalization, gesture arbitration, and virtual joysticks.
 */

import type {
  CoreInput,
  InputPlugin,
  JoystickPluginOptions,
  PluginContext,
} from './InputManager.d';

export type {CoreInput, InputPlugin, JoystickPluginOptions, PluginContext};

// ============================================================================
// 1. CORE POINTER TRACKER
// ============================================================================
class PointerTracker implements CoreInput.PointerState {
  public isDown = true;
  public downX = 0;
  public downY = 0;
  public downTime = 0;
  public upX = 0;
  public upY = 0;
  public upTime = 0;
  public x = 0;
  public y = 0;
  public deltaX = 0;
  public deltaY = 0;
  public distance = 0;
  public duration = 0;

  constructor(public readonly id: number, x: number, y: number, time: number) {
    this.downX = this.x = x;
    this.downY = this.y = y;
    this.downTime = time;
  }

  public updateMove(x: number, y: number, time: number): void {
    this.deltaX = x - this.x;
    this.deltaY = y - this.y;
    this.x = x;
    this.y = y;
    this.distance = Math.hypot(this.x - this.downX, this.y - this.downY);
    this.duration = time - this.downTime;
  }

  public finish(x: number, y: number, time: number): void {
    this.isDown = false;
    this.upX = this.x = x;
    this.upY = this.y = y;
    this.upTime = time;
    this.duration = time - this.downTime;
    this.distance = Math.hypot(this.upX - this.downX, this.upY - this.downY);
  }
}

// ============================================================================
// 2. INLINED PLUGIN A: HAMMER GESTURE RECOGNIZER (Tap / Swipe / Hold)
// ============================================================================
export class InlineHammerGesturePlugin implements InputPlugin {
  public readonly name = 'HammerGesturePlugin';
  private ctx!: PluginContext;
  private readonly SWIPE_THRESHOLD = 20; // Virtual px
  private readonly TAP_MAX_DIST = 12; // Virtual px
  private readonly HOLD_DURATION = 250; // ms

  private stateMap = new Map<
    number,
    {isSwiped: boolean; isHoldFired: boolean}
  >();

  public init(ctx: PluginContext, _element: HTMLElement | Window): void {
    this.ctx = ctx;
  }

  public onPointerDownArbitrate(pointer: CoreInput.PointerState): void {
    this.stateMap.set(pointer.id, {isSwiped: false, isHoldFired: false});
  }

  public onPointerMoveArbitrate(pointer: CoreInput.PointerState): void {
    const state = this.stateMap.get(pointer.id);
    if (!state || state.isSwiped) return;

    const dx = pointer.x - pointer.downX;
    const dy = pointer.y - pointer.downY;

    // Mutually exclusive: lock into swipe upon crossing distance threshold
    if (pointer.distance >= this.SWIPE_THRESHOLD) {
      state.isSwiped = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.ctx.emit(
          dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT',
          pointer,
          pointer.x,
          pointer.y,
        );
      } else {
        this.ctx.emit(
          dy > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP',
          pointer,
          pointer.x,
          pointer.y,
        );
      }
    }
  }

  public onPointerUpArbitrate(pointer: CoreInput.PointerState): void {
    const state = this.stateMap.get(pointer.id);
    if (!state) return;

    // Mutually exclusive: Tap fires ONLY if no swipe occurred and touch was short & stationary
    if (
      !state.isSwiped &&
      !state.isHoldFired &&
      pointer.duration < this.HOLD_DURATION &&
      pointer.distance <= this.TAP_MAX_DIST
    ) {
      this.ctx.emit('POINTER_TAP', pointer, pointer.upX, pointer.upY);
    }
    this.stateMap.delete(pointer.id);
  }

  public onFrameUpdate(
    _currentTime: number,
    pointers: CoreInput.PointerState[],
  ): void {
    for (const p of pointers) {
      if (!p.isDown) continue;
      const state = this.stateMap.get(p.id);
      if (!state || state.isSwiped || state.isHoldFired) continue;

      // Arbitrate stationary sustained Hold
      if (p.duration >= this.HOLD_DURATION && p.distance <= this.TAP_MAX_DIST) {
        state.isHoldFired = true;
        this.ctx.emit('POINTER_HOLD', p, p.x, p.y);
      }
    }
  }

  public destroy(): void {
    this.stateMap.clear();
  }
}

// ============================================================================
// 3. INLINED PLUGIN B: NIPPLE VIRTUAL JOYSTICK (Polar Projection & Dead-Zone)
// ============================================================================
export class InlineNippleJoystickPlugin implements InputPlugin {
  public readonly name = 'NippleJoystickPlugin';
  private ctx!: PluginContext;
  private active = false;
  private activePointerId = -1;
  private baseX = 0;
  private baseY = 0;
  private knobX = 0;
  private knobY = 0;
  public readonly radius: number;
  private readonly deadZone: number;
  private readonly zone: 'FULL' | 'LEFT' | 'RIGHT';

  constructor(options: JoystickPluginOptions = {}) {
    this.zone = options.zone ?? 'LEFT';
    this.radius = options.radius ?? 50;
    this.deadZone = options.deadZone ?? 8;
  }

  public init(ctx: PluginContext, _element: HTMLElement | Window): void {
    this.ctx = ctx;
  }

  public onPointerDown(pointer: CoreInput.PointerState): void {
    if (!this.active) {
      let midX = 375;
      if (typeof document !== 'undefined') {
        const canvas = document.querySelector('canvas');
        if (canvas?.dataset?.designWidth) {
          midX = Number(canvas.dataset.designWidth) / 2;
        }
      }

      // Zone boundary enforcement
      if (this.zone === 'LEFT' && pointer.x >= midX) {
        return;
      }
      if (this.zone === 'RIGHT' && pointer.x < midX) {
        return;
      }

      this.active = true;
      this.activePointerId = pointer.id;
      this.baseX = this.knobX = pointer.x;
      this.baseY = this.knobY = pointer.y;
      this.updateJoystick(0, 0);
    }
  }

  public onPointerMove(pointer: CoreInput.PointerState): void {
    if (this.active && pointer.id === this.activePointerId) {
      const dx = pointer.x - this.baseX;
      const dy = pointer.y - this.baseY;
      const dist = Math.hypot(dx, dy);

      if (dist < this.deadZone) {
        this.knobX = pointer.x;
        this.knobY = pointer.y;
        this.updateJoystick(0, 0);
        return;
      }

      const angle = Math.atan2(dy, dx);
      const clampedDist = Math.min(dist, this.radius);
      this.knobX = this.baseX + Math.cos(angle) * clampedDist;
      this.knobY = this.baseY + Math.sin(angle) * clampedDist;

      const normalizedX = (this.knobX - this.baseX) / this.radius;
      const normalizedY = (this.knobY - this.baseY) / this.radius;
      this.updateJoystick(normalizedX, normalizedY);
    }
  }

  public onPointerUp(pointer: CoreInput.PointerState): void {
    if (this.active && pointer.id === this.activePointerId) {
      this.active = false;
      this.activePointerId = -1;
      this.ctx.setAxis(0, 0);
      this.ctx.setJoystickData(null);
    }
  }

  private updateJoystick(x: number, y: number): void {
    this.ctx.setAxis(x, y);
    this.ctx.setJoystickData({
      baseX: this.baseX,
      baseY: this.baseY,
      knobX: this.knobX,
      knobY: this.knobY,
      radius: this.radius,
      active: this.active,
    });
  }

  public destroy(): void {
    this.active = false;
    this.activePointerId = -1;
  }
}

// ============================================================================
// 4. INLINED PLUGIN C: CONTINUOUS STATE & TRAIL (Slicing / Dragging)
// ============================================================================
export class InlineContinuousStatePlugin implements InputPlugin {
  public readonly name = 'ContinuousStatePlugin';
  private ctx!: PluginContext;

  public init(ctx: PluginContext, _element: HTMLElement | Window): void {
    this.ctx = ctx;
  }

  public onPointerDown(pointer: CoreInput.PointerState): void {
    this.ctx.setTrail({
      phase: 'START',
      x: pointer.x,
      y: pointer.y,
      dx: 0,
      dy: 0,
    });
  }

  public onPointerMove(pointer: CoreInput.PointerState): void {
    this.ctx.setTrail({
      phase: 'MOVE',
      x: pointer.x,
      y: pointer.y,
      dx: pointer.deltaX,
      dy: pointer.deltaY,
    });
  }

  public onPointerUp(pointer: CoreInput.PointerState): void {
    this.ctx.setTrail({
      phase: 'END',
      x: pointer.upX,
      y: pointer.upY,
      dx: 0,
      dy: 0,
    });
  }

  public destroy(): void {
    this.ctx.setTrail(null);
  }
}

// ============================================================================
// 5. MICRO-KERNEL: CORE INPUT MANAGER (WITH BUILT-IN COORD NORMALIZATION)
// ============================================================================
export class InputManager {
  private pointers = new Map<number, PointerTracker>();
  private pendingEvents: CoreInput.InputEvent[] = [];
  private plugins: InputPlugin[] = [];
  private activeKeys = new Set<string>();
  private targetEl: HTMLElement | Window;
  private canvasEl: HTMLCanvasElement | null = null;

  // Bound handler references for clean removal
  private boundOnPointerDown = (e: any) => this.handlePointerDown(e);
  private boundOnPointerMove = (e: any) => this.handlePointerMove(e);
  private boundOnPointerUp = (e: any) => this.handlePointerUp(e);
  private boundOnPointerCancel = (e: any) => this.handlePointerCancel(e);
  private boundOnKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  private boundOnKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);

  // Frame output caches
  private frameAxis: CoreInput.Vector2 = {x: 0, y: 0};
  private frameJoystickData: CoreInput.JoystickRenderData | null = null;
  private frameTrail: CoreInput.TrailPoint | null = null;

  constructor(
    element: HTMLElement | Window = typeof window !== 'undefined'
      ? window
      : ({} as any),
  ) {
    this.targetEl = element;
    if (
      typeof HTMLCanvasElement !== 'undefined' &&
      element instanceof HTMLCanvasElement
    ) {
      this.canvasEl = element;
    }
    this.bindDOMEvents();
  }

  /**
   * 🎯 BUILT-IN COORDINATE PROJECTION:
   * Maps raw browser viewport (clientX, clientY) directly to Canvas internal virtual design space
   * (750x1334 portrait / 1334x750 landscape).
   * Eliminates CSS letterbox offsets, responsive scaling distortion, and DPR multiplier issues.
   */
  private normalizeCoords(
    clientX: number,
    clientY: number,
  ): {x: number; y: number} {
    let canvas = this.canvasEl;
    if (!canvas && typeof document !== 'undefined') {
      canvas = document.querySelector('canvas');
    }
    if (!canvas) {
      return {x: clientX, y: clientY};
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return {x: clientX, y: clientY};
    }

    // 1. Determine virtual design resolution based on GameEngine canvas attributes or aspect ratio
    let designW: number;
    let designH: number;

    if (canvas.dataset?.designWidth && canvas.dataset?.designHeight) {
      designW = Number(canvas.dataset.designWidth);
      designH = Number(canvas.dataset.designHeight);
    } else {
      const isLandscape = rect.width > rect.height;
      designW = isLandscape ? 1334 : 750;
      designH = isLandscape ? 750 : 1334;
    }

    // 2. Uniform aspect ratio scale & centered letterbox/pillarbox padding
    const scale = Math.min(rect.width / designW, rect.height / designH);
    const offsetX = (rect.width - designW * scale) / 2;
    const offsetY = (rect.height - designH * scale) / 2;

    // 3. Project client coordinates directly into virtual design space
    const virtX = (clientX - rect.left - offsetX) / scale;
    const virtY = (clientY - rect.top - offsetY) / scale;

    return {x: virtX, y: virtY};
  }

  /**
   * Registers an interaction plugin into the micro-kernel pipeline.
   */
  public use(plugin: InputPlugin): this {
    this.plugins.push(plugin);

    const context: PluginContext = {
      emit: (type, pointer, x = 0, y = 0) => {
        const dummy =
          pointer || new PointerTracker(-1, x, y, performance.now());
        this.pendingEvents.push({type, pointer: dummy, x, y});
      },
      setAxis: (x, y) => {
        this.frameAxis = {x, y};
      },
      setJoystickData: (data) => {
        this.frameJoystickData = data;
      },
      setTrail: (trail) => {
        this.frameTrail = trail;
      },
    };

    plugin.init(context, this.targetEl);
    return this;
  }

  private handlePointerDown(e: any): void {
    const {x, y} = this.normalizeCoords(e.clientX, e.clientY);
    const now = performance.now();
    const tracker = new PointerTracker(e.pointerId ?? 0, x, y, now);
    this.pointers.set(tracker.id, tracker);

    this.pendingEvents.push({
      type: 'POINTER_DOWN',
      pointer: tracker,
      x,
      y,
    });

    for (const p of this.plugins) {
      if (p.onPointerDownArbitrate) p.onPointerDownArbitrate(tracker);
      if (p.onPointerDown) p.onPointerDown(tracker);
    }
  }

  private handlePointerMove(e: any): void {
    const id = e.pointerId ?? 0;
    const tracker = this.pointers.get(id);
    if (!tracker) return;

    const {x, y} = this.normalizeCoords(e.clientX, e.clientY);
    const now = performance.now();
    tracker.updateMove(x, y, now);

    this.pendingEvents.push({
      type: 'POINTER_MOVE',
      pointer: tracker,
      x,
      y,
    });

    for (const p of this.plugins) {
      if (p.onPointerMoveArbitrate) p.onPointerMoveArbitrate(tracker);
      if (p.onPointerMove) p.onPointerMove(tracker);
    }
  }

  private handlePointerUp(e: any): void {
    const id = e.pointerId ?? 0;
    const tracker = this.pointers.get(id);
    if (!tracker) return;

    const {x, y} = this.normalizeCoords(e.clientX, e.clientY);
    const now = performance.now();
    tracker.finish(x, y, now);

    this.pendingEvents.push({
      type: 'POINTER_UP',
      pointer: tracker,
      x,
      y,
    });

    for (const p of this.plugins) {
      if (p.onPointerUpArbitrate) p.onPointerUpArbitrate(tracker);
      if (p.onPointerUp) p.onPointerUp(tracker);
    }

    this.pointers.delete(id);
  }

  private handlePointerCancel(e: any): void {
    const id = e.pointerId ?? 0;
    const tracker = this.pointers.get(id);
    if (tracker) {
      this.pendingEvents.push({
        type: 'POINTER_CANCEL',
        pointer: tracker,
        x: tracker.x,
        y: tracker.y,
      });

      for (const p of this.plugins) {
        if (p.onPointerUpArbitrate) p.onPointerUpArbitrate(tracker);
        if (p.onPointerUp) p.onPointerUp(tracker);
      }

      this.pointers.delete(id);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.activeKeys.add(k);

    // Raw action buttons (Space/Enter) dispatch zero-latency POINTER_DOWN with synthetic pointer ID -1
    if (k === ' ' || k === 'enter') {
      const dummy = new PointerTracker(-1, 0, 0, performance.now());
      this.pendingEvents.push({
        type: 'POINTER_DOWN',
        pointer: dummy,
        x: 0,
        y: 0,
      });
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.activeKeys.delete(k);
    if (k === ' ' || k === 'enter') {
      const dummy = new PointerTracker(-1, 0, 0, performance.now());
      this.pendingEvents.push({
        type: 'POINTER_UP',
        pointer: dummy,
        x: 0,
        y: 0,
      });
    }
  }

  private bindDOMEvents(): void {
    const el = this.targetEl;
    if (typeof window === 'undefined' || !el.addEventListener) return;

    el.addEventListener('pointerdown', this.boundOnPointerDown);
    el.addEventListener('pointermove', this.boundOnPointerMove);
    el.addEventListener('pointerup', this.boundOnPointerUp);
    el.addEventListener('pointercancel', this.boundOnPointerCancel);

    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
  }

  private unbindDOMEvents(): void {
    const el = this.targetEl;
    if (typeof window === 'undefined' || !el.removeEventListener) return;

    el.removeEventListener('pointerdown', this.boundOnPointerDown);
    el.removeEventListener('pointermove', this.boundOnPointerMove);
    el.removeEventListener('pointerup', this.boundOnPointerUp);
    el.removeEventListener('pointercancel', this.boundOnPointerCancel);

    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
  }

  /**
   * Frame-by-frame snapshot retrieval.
   */
  public processInput(currentTime = performance.now()): CoreInput.InputFrame {
    const activePointers = Array.from(this.pointers.values());

    for (const p of activePointers) {
      if (p.isDown) {
        p.duration = currentTime - p.downTime;
      }
    }
    for (const plugin of this.plugins) {
      plugin.onFrameUpdate?.(currentTime, activePointers);
    }

    const frameEvents = [...this.pendingEvents];
    this.pendingEvents = [];

    // Keyboard WASD fallback when analog joystick axis is idle
    let axis: CoreInput.Vector2 = {...this.frameAxis};
    if (axis.x === 0 && axis.y === 0) {
      let kx = 0;
      let ky = 0;
      if (this.activeKeys.has('a') || this.activeKeys.has('arrowleft')) kx -= 1;
      if (this.activeKeys.has('d') || this.activeKeys.has('arrowright'))
        kx += 1;
      if (this.activeKeys.has('w') || this.activeKeys.has('arrowup')) ky -= 1;
      if (this.activeKeys.has('s') || this.activeKeys.has('arrowdown')) ky += 1;

      if (kx !== 0 && ky !== 0) {
        kx *= 0.7071;
        ky *= 0.7071;
      }
      axis = {x: kx, y: ky};
    }

    const frame: CoreInput.InputFrame = {
      events: frameEvents,
      pointers: activePointers,
      axis,
      joystickData: this.frameJoystickData,
      trail: this.frameTrail,
    };

    if (this.frameTrail && this.frameTrail.phase === 'END') {
      this.frameTrail = null;
    }

    return frame;
  }

  public isPointerDown(): boolean {
    return this.pointers.size > 0 || this.activeKeys.size > 0;
  }

  public destroy(): void {
    this.unbindDOMEvents();
    for (const p of this.plugins) {
      p.destroy?.();
    }
    this.plugins = [];
    this.pointers.clear();
    this.pendingEvents = [];
    this.activeKeys.clear();
  }
}
