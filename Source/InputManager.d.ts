/**
 * ============================================================================
 * 🎮 [UNIVERSAL INPUT ENGINE CONTRACT - MICRO-KERNEL & PLUGIN ARCHITECTURE]
 * ============================================================================
 *
 * This contract defines a zero-dependency, pull-based (snapshot) hardware
 * abstraction layer inspired by industry and modern engine standards.
 *
 * ----------------------------------------------------------------------------
 * 📖 ACTION CONSUMPTION RULES FOR GAME DEVELOPERS / CODEGEN ENGINES:
 * ----------------------------------------------------------------------------
 *
 * 🎯 1. Grid / Turn-Based / Puzzle Games (Match-3, Tetris, 2048, Cards):
 *    - Setup: `new InputManager(el).use(new InlineHammerGesturePlugin())`
 *    - Consume ONLY: `POINTER_TAP`, `SWIPE_LEFT`, `SWIPE_RIGHT`, `SWIPE_UP`, `SWIPE_DOWN`.
 *    - DO NOT consume `POINTER_DOWN` for movement/selection logic.
 *
 * 🎯 2. Instant Arcade / Reflex / Single-Touch Games (Flappy Bird, Jumpers, Rhythm):
 *    - Setup: `new InputManager(el)` (Zero plugins required!)
 *    - Consume ONLY: `POINTER_DOWN` (instant 0-latency trigger at Frame 0), `POINTER_UP`.
 *
 * 🎯 3. Continuous Analog Movement (Top-Down Action, Shooters, Racing):
 *    - Setup: `new InputManager(el).use(new InlineNippleJoystickPlugin())`
 *    - Query: `input.axis` (normalized vector {-1..1, -1..1}) and `input.joystickData`.
 *
 * 🎯 4. Continuous Drag / Slicing / Physics Drawing (Fruit Ninja, Line Draw, Air Combat):
 *    - Setup: `new InputManager(el).use(new InlineContinuousStatePlugin())`
 *    - Query: `input.trail` (for slicing) or pointer tracking values (`deltaX`, `deltaY`).
 * ============================================================================
 */

export namespace CoreInput {
  /**
   * Unified interaction event types emitted by the engine.
   */
  export type EventType =
    // --- 1. Raw Lifecycle Events (Zero-Latency Core Dispatcher) ---
    /** Fired instantaneously on physical contact touchdown (Frame 0) or Space/Enter */
    | 'POINTER_DOWN'
    /** Fired continuously as the active contact moves */
    | 'POINTER_MOVE'
    /** Fired instantaneously when contact lifts off */
    | 'POINTER_UP'
    /** Fired when contact is interrupted by the system or leaves the canvas */
    | 'POINTER_CANCEL'

    // --- 2. Discrete Arbitrated Gestures (Injected by HammerGesturePlugin) ---
    /** Short stationary touch & release (< 250ms duration, <= 12px displacement) */
    | 'POINTER_TAP'
    /** Stationary contact sustained without swiping (>= 250ms duration, <= 12px displacement) */
    | 'POINTER_HOLD'
    /** Fast directional stroke (>= 20px displacement or WASD/Arrow keys) */
    | 'SWIPE_LEFT'
    | 'SWIPE_RIGHT'
    | 'SWIPE_UP'
    | 'SWIPE_DOWN';

  /**
   * Complete physical state chain tracking a single touch/mouse contact.
   */
  export interface PointerState {
    /** Hardware pointer ID (0 for mouse, synthetic keyboard events use -1) */
    readonly id: number;
    /** Whether the physical contact is currently active on screen */
    readonly isDown: boolean;
    /** Coordinate where contact first touched down */
    readonly downX: number;
    readonly downY: number;
    /** Timestamp (ms) when contact first touched down */
    readonly downTime: number;
    /** Coordinate when contact lifted up */
    readonly upX: number;
    readonly upY: number;
    /** Timestamp (ms) when contact lifted up */
    readonly upTime: number;
    /** Current instantaneous coordinate */
    readonly x: number;
    readonly y: number;
    /** Frame-over-frame displacement */
    readonly deltaX: number;
    readonly deltaY: number;
    /** Total Euclidean distance (px) traveled from touch down origin */
    readonly distance: number;
    /** Total active duration (ms) since touchdown */
    readonly duration: number;
  }

  /**
   * Discrete action event payload dispatched to GameLogic.
   */
  export interface InputEvent {
    readonly type: EventType;
    readonly pointer: PointerState;
    readonly x: number;
    readonly y: number;
  }

  /**
   * 2D continuous directional vector.
   */
  export interface Vector2 {
    /** Horizontal axis value, normalized between -1.0 and 1.0 */
    readonly x: number;
    /** Vertical axis value, normalized between -1.0 and 1.0 */
    readonly y: number;
  }

  /**
   * Continuous trail point for slicing/drawing games (Fruit Ninja, Line Draw).
   */
  export interface TrailPoint {
    readonly phase: 'START' | 'MOVE' | 'END';
    readonly x: number;
    readonly y: number;
    readonly dx: number;
    readonly dy: number;
  }

  /**
   * Visual metadata for rendering virtual joystick UI overlays.
   */
  export interface JoystickRenderData {
    readonly baseX: number;
    readonly baseY: number;
    readonly knobX: number;
    readonly knobY: number;
    readonly radius: number;
    readonly active: boolean;
  }

  /**
   * Complete per-frame immutable input data packet passed to GameLogic.update(dt, vp).
   */
  export interface InputFrame {
    /** Queue of discrete input events triggered in the current frame */
    readonly events: InputEvent[];
    /** List of all currently active physical pointers (supports multi-touch) */
    readonly pointers: PointerState[];
    /** Primary continuous movement vector (composed from joystick or WASD/Arrow keys) */
    readonly axis: Vector2;
    /** Active joystick rendering state (null when inactive) */
    readonly joystickData: JoystickRenderData | null;
    /** Active continuous trail point (null when inactive) */
    readonly trail?: TrailPoint | null;
  }
}

/**
 * Communication context passed to plugins upon initialization.
 */
export interface PluginContext {
  /** Injects a high-level gesture event into the current frame */
  emit: (
    type: CoreInput.EventType,
    pointer?: CoreInput.PointerState,
    x?: number,
    y?: number,
  ) => void;
  /** Sets the continuous directional axis vector for the current frame */
  setAxis: (x: number, y: number) => void;
  /** Sets the active joystick render state */
  setJoystickData: (data: CoreInput.JoystickRenderData | null) => void;
  /** Sets the active continuous slicing/drawing trail point */
  setTrail: (trail: CoreInput.TrailPoint | null) => void;
}

/**
 * Standard plugin interface for modular interaction layers.
 */
export interface InputPlugin {
  readonly name: string;
  init(ctx: PluginContext, element: HTMLElement | Window): void;
  onPointerDownArbitrate?(pointer: CoreInput.PointerState): void;
  onPointerDown?(pointer: CoreInput.PointerState): void;
  onPointerMoveArbitrate?(pointer: CoreInput.PointerState): void;
  onPointerMove?(pointer: CoreInput.PointerState): void;
  onPointerUpArbitrate?(pointer: CoreInput.PointerState): void;
  onPointerUp?(pointer: CoreInput.PointerState): void;
  onFrameUpdate?(currentTime: number, pointers: CoreInput.PointerState[]): void;
  destroy?(): void;
}

export declare class InlineHammerGesturePlugin implements InputPlugin {
  public readonly name: string;
  public init(ctx: PluginContext, element: HTMLElement | Window): void;
  public onPointerDownArbitrate(pointer: CoreInput.PointerState): void;
  public onPointerMoveArbitrate(pointer: CoreInput.PointerState): void;
  public onPointerUpArbitrate(pointer: CoreInput.PointerState): void;
  public onFrameUpdate(
    currentTime: number,
    pointers: CoreInput.PointerState[],
  ): void;
  public destroy(): void;
}

export interface JoystickPluginOptions {
  zone?: 'FULL' | 'LEFT' | 'RIGHT';
  radius?: number;
  deadZone?: number;
}

export declare class InlineNippleJoystickPlugin implements InputPlugin {
  public readonly name: string;
  public readonly radius: number;
  constructor(options?: JoystickPluginOptions);
  public init(ctx: PluginContext, element: HTMLElement | Window): void;
  public onPointerDown(pointer: CoreInput.PointerState): void;
  public onPointerMove(pointer: CoreInput.PointerState): void;
  public onPointerUp(pointer: CoreInput.PointerState): void;
  public destroy(): void;
}

export declare class InlineContinuousStatePlugin implements InputPlugin {
  public readonly name: string;
  public init(ctx: PluginContext, element: HTMLElement | Window): void;
  public onPointerDown(pointer: CoreInput.PointerState): void;
  public onPointerMove(pointer: CoreInput.PointerState): void;
  public onPointerUp(pointer: CoreInput.PointerState): void;
  public destroy(): void;
}

/**
 * Hardware Input Manager Class Interface.
 */
export declare class InputManager {
  constructor(element?: HTMLElement | Window);
  /** Registers an interaction plugin into the input pipeline */
  public use(plugin: InputPlugin): this;
  /** Pulls an immutable input snapshot for the current frame */
  public processInput(currentTime?: number): CoreInput.InputFrame;
  /** Universal state query: returns true if any pointer or action key is active */
  public isPointerDown(): boolean;
  /** Destroys all event listeners and plugins */
  public destroy(): void;
}
