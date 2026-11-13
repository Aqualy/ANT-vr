/** A chapter owns everything it creates, including its GPU resources. */
export interface SceneContract<State> {
  build(): void;
  enter(state: State): void;
  update(delta: number): void;
  exit(): void;
  dispose(): void;
}

/** Only one built scene lives at a time. A failed build is disposed as well. */
export class SceneDirector<State> {
  private active: SceneContract<State> | null = null;
  private closed = false;

  show(factory: () => SceneContract<State>, state: State): void {
    if (this.closed) throw new Error('SceneDirector is disposed');
    this.release();
    const next = factory();
    try {
      next.build();
      next.enter(state);
      this.active = next;
    } catch (error) {
      next.dispose();
      throw error;
    }
  }

  update(delta: number): void {
    if (Number.isFinite(delta) && delta >= 0) this.active?.update(delta);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
  }

  private release(): void {
    const previous = this.active;
    this.active = null;
    if (!previous) return;
    try { previous.exit(); } finally { previous.dispose(); }
  }
}

export type Point3 = Readonly<{ x: number; y: number; z: number }>;

/** A generous snap region makes a paper handover reliable at real paper scale. */
export function withinDropTarget(position: Point3, target: Point3, radius = 0.16): boolean {
  if (!Number.isFinite(radius) || radius < 0) return false;
  const x = position.x - target.x;
  const y = position.y - target.y;
  const z = position.z - target.z;
  return x * x + y * y + z * z <= radius * radius;
}

/** Every unaccepted release returns home; held items are never pulled away. */
export function shouldReturnHome(held: boolean, accepted: boolean): boolean {
  return !held && !accepted;
}

/** 3 cm letters at 1 m keeps the instruction's angular size independent of distance. */
export function minimumTextHeight(distanceMetres: number): number {
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) throw new RangeError('Text distance must be positive');
  return distanceMetres * 0.03;
}

/** At least 4.4 cm (about 2.5 degrees at 1 m) of selectable surface. */
export function minimumTargetSize(distanceMetres: number): number {
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) throw new RangeError('Target distance must be positive');
  return Math.max(0.044, distanceMetres * 0.044);
}
