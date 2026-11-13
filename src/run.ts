/** Deterministic journey state. Seconds are active viewing time, never frame counts. */
export const STEPS = [
  { id: 'intro', name: 'Welcome', budget: 20, actions: [{ id: 'begin', instruction: 'Settle in. Touch the green tag to begin.' }] },
  { id: 'kit', name: 'Open the kit', budget: 40, actions: [
    { id: 'open-kit', instruction: 'Lift the lid of your Blackout Communication Kit.' },
    { id: 'take-map', instruction: 'Pick up the map. Find your local Blob.' },
    { id: 'take-profile', instruction: 'Pick up your Paper Profile.' },
  ] },
  { id: 'profile', name: 'Your Paper Profile', budget: 50, actions: [
    { id: 'token-one', instruction: 'Stick an interest token into the first circle.' },
    { id: 'token-two', instruction: 'Choose another interest. Fill the second circle.' },
    { id: 'accept-name', instruction: 'Today you are Noor. Press your name to continue.' },
  ] },
  { id: 'blob', name: 'Visit the Blob', budget: 50, actions: [
    { id: 'enter-blob', instruction: 'Touch the Blob to meet its volunteer operators.' },
    { id: 'hand-profile', instruction: 'Hand your profile to the operator.' },
    { id: 'choose-visibility', instruction: 'Choose Public or Private. You decide who reads.' },
  ] },
  { id: 'public', name: 'Find a shared interest', budget: 25, actions: [
    { id: 'turn-page', instruction: 'Turn the page. Find a shared interest.' },
    { id: 'meet-neighbour', instruction: 'A shared interest. You have someone to talk to.' },
  ] },
  { id: 'private', name: 'You decide', budget: 20, actions: [
    { id: 'accept-request', instruction: 'A neighbour asks to read more. Accept their request.' },
    { id: 'read-profile', instruction: 'Request accepted. Only then does the profile open.' },
  ] },
  { id: 'symbols', name: 'Leave your mark', budget: 40, actions: [
    { id: 'draw-symbol', instruction: 'Draw a symbol for the neighbourhood garden.' },
    { id: 'post-symbol', instruction: 'Press your symbol onto the public board.' },
  ] },
  { id: 'further', name: 'Blobs reach further', budget: 25, actions: [
    { id: 'watch-network', instruction: 'Profile copies connect Blobs. With electricity, light carries data.' },
  ] },
  { id: 'outro', name: 'You are part of ANT', budget: 20, actions: [
    { id: 'done', instruction: 'People, places and paper. Your neighbourhood is connected.' },
  ] },
] as const;

export type StepDefinition = (typeof STEPS)[number];
export type StepId = StepDefinition['id'];
export type ActionDefinition = StepDefinition['actions'][number];
export type ActionId = ActionDefinition['id'];
export type CompletionReason = 'action' | 'assist' | 'skip' | 'script' | 'budget' | 'jump' | 'automatic';
export type SymbolPoint = [number, number];
export type Visibility = 'public' | 'private';
export type ActionPayload = { token?: string; visibility?: Visibility; points?: SymbolPoint[] };

export interface ResidentState {
  name: string;
  tokens: string[];
  visibility: Visibility;
  kitOpen: boolean;
  mapTaken: boolean;
  profileTaken: boolean;
  atBlob: boolean;
  submitted: boolean;
  pageTurned: boolean;
  requestAccepted: boolean;
  symbolPoints: SymbolPoint[];
  symbolPosted: boolean;
  networkReached: boolean;
  visited: StepId[];
}

export interface StepTiming {
  id: StepId;
  name: string;
  budget: number;
  seconds: number;
  reason: CompletionReason;
  assistedActions: number;
}

export interface RunSnapshot {
  step: StepId;
  stepIndex: number;
  action: ActionId | null;
  actionIndex: number;
  instruction: string;
  running: boolean;
  paused: boolean;
  finished: boolean;
  elapsed: number;
  stepElapsed: number;
  idle: number;
  assist: boolean;
  overBudget: boolean;
  debugJumped: boolean;
  state: ResidentState;
  timings: StepTiming[];
  completionReason: CompletionReason | null;
}

type Listener = (snapshot: RunSnapshot) => void;
const freshState = (): ResidentState => ({
  name: 'Noor', tokens: [], visibility: 'public', kitOpen: false,
  mapTaken: false, profileTaken: false, atBlob: false, submitted: false,
  pageTurned: false, requestAccepted: false, symbolPoints: [], symbolPosted: false,
  networkReached: false, visited: ['intro'],
});

// An accessible suggested mark used only by assistance / scripted completion.
const suggestedSymbol = (): SymbolPoint[] => [
  [0.5, 0.85], [0.5, 0.42], [0.27, 0.25], [0.22, 0.4], [0.5, 0.58],
  [0.77, 0.36], [0.78, 0.2], [0.55, 0.3], [0.5, 0.42],
];

/** Interaction progress is the only thing that resets assistance; hovering does not. */
export class RunManager {
  private index = 0;
  private actionIndex = 0;
  private data = freshState();
  private active = false;
  private stopped = false;
  private complete = false;
  private total = 0;
  private chapterSeconds = 0;
  private idleSeconds = 0;
  private assistance = false;
  private assistedActions = 0;
  private jumped = false;
  private records: StepTiming[] = [];
  private endReason: CompletionReason | null = null;
  private readonly changes = new Set<Listener>();
  private readonly completions = new Set<Listener>();

  get step(): StepDefinition { return STEPS[this.index]; }
  get action(): ActionDefinition | undefined { return this.complete ? undefined : this.step.actions[this.actionIndex]; }
  get instruction(): string { return this.action?.instruction ?? 'Get to know your neighbours before you need them.'; }
  get state(): Readonly<ResidentState> { return this.data; }
  get running(): boolean { return this.active && !this.stopped && !this.complete; }
  get finished(): boolean { return this.complete; }
  get paused(): boolean { return this.stopped; }
  get elapsed(): number { return this.total; }
  get stepElapsed(): number { return this.chapterSeconds; }
  get idle(): number { return this.idleSeconds; }
  get assist(): boolean { return this.assistance; }

  onChange(listener: Listener): () => void {
    this.changes.add(listener);
    return () => { this.changes.delete(listener); };
  }

  onComplete(listener: Listener): () => void {
    this.completions.add(listener);
    return () => { this.completions.delete(listener); };
  }

  start(): void {
    if (this.complete || this.active) return;
    this.active = true;
    this.stopped = false;
    this.emit();
  }

  pause(): void {
    if (!this.active || this.complete || this.stopped) return;
    this.stopped = true;
    this.emit();
  }

  resume(): void {
    if (!this.stopped || this.complete) return;
    this.stopped = false;
    this.emit();
  }

  /** Reject stale/repeated input instead of letting it operate the next object. */
  act(id: string, payload: ActionPayload = {}): boolean {
    if (!this.running || id !== this.action?.id) return false;
    if (!this.apply(id as ActionId, payload)) return false;
    this.advanceAction('action');
    return true;
  }

  skip(): void {
    if (this.running) this.completeStep('skip');
  }

  /** Complete one whole chapter with valid defaults, preserving earlier choices. */
  completeStep(reason: CompletionReason = 'script'): void {
    if (!this.running) return;
    while (this.actionIndex < this.step.actions.length) {
      const action = this.step.actions[this.actionIndex];
      this.apply(action.id, {});
      this.actionIndex++;
      if (reason === 'assist' || reason === 'budget') this.assistedActions++;
    }
    this.advanceChapter(reason);
  }

  reset(): void {
    this.index = 0;
    this.actionIndex = 0;
    this.data = freshState();
    this.active = false;
    this.stopped = false;
    this.complete = false;
    this.total = 0;
    this.chapterSeconds = 0;
    this.idleSeconds = 0;
    this.assistance = false;
    this.assistedActions = 0;
    this.jumped = false;
    this.records = [];
    this.endReason = null;
    this.emit();
  }

  /** Debug navigation reconstructs prerequisites instead of retaining future state. */
  jumpTo(step: StepId | number): void {
    const next = typeof step === 'number' ? step : STEPS.findIndex((entry) => entry.id === step);
    if (!Number.isInteger(next) || next < 0 || next >= STEPS.length) throw new RangeError(`Unknown chapter: ${step}`);
    this.reset();
    this.jumped = true;
    for (let i = 0; i < next; i++) {
      for (const action of STEPS[i].actions) this.apply(action.id, {});
    }
    this.index = next;
    this.data.visited = STEPS.slice(0, next + 1).map((entry) => entry.id);
    this.active = true;
    this.emit();
  }

  /** Handles large deltas at their real boundaries; no lost or double-counted time. */
  update(seconds: number): void {
    if (!this.running || !Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = seconds;
    while (remaining > 0 && this.running) {
      const idleBoundary = this.assistance ? 20 : 10;
      const automaticAt = this.step.id === 'further' ? 3 : Infinity;
      const slice = Math.min(
        remaining, Math.max(0, idleBoundary - this.idleSeconds),
        Math.max(0, this.step.budget * 1.2 - this.chapterSeconds),
        Math.max(0, 300 - this.total), Math.max(0, automaticAt - this.chapterSeconds),
      );
      this.total += slice;
      this.chapterSeconds += slice;
      this.idleSeconds += slice;
      remaining -= slice;

      if (this.total >= 300 - 1e-8) {
        // This only changes scene data. It must never move the tracked camera.
        while (this.running) this.completeStep('budget');
      } else if (this.chapterSeconds >= this.step.budget * 1.2 - 1e-8) {
        this.completeStep('budget');
      } else if (this.step.id === 'further' && this.chapterSeconds >= automaticAt - 1e-8) {
        this.apply('watch-network', {});
        this.advanceAction('automatic');
      } else if (this.idleSeconds >= 20 - 1e-8) {
        const action = this.action;
        if (action) {
          this.apply(action.id, {});
          this.assistedActions++;
          this.advanceAction('assist');
        }
      } else if (this.idleSeconds >= 10 - 1e-8 && !this.assistance) {
        this.assistance = true;
        this.emit();
      } else if (slice <= 0) {
        break;
      }
    }
  }

  snapshot(): RunSnapshot {
    return {
      step: this.step.id, stepIndex: this.index, action: this.action?.id ?? null,
      actionIndex: this.actionIndex, instruction: this.instruction,
      running: this.running, paused: this.paused, finished: this.finished,
      elapsed: this.total, stepElapsed: this.chapterSeconds, idle: this.idleSeconds,
      assist: this.assistance, overBudget: this.total > 300, debugJumped: this.jumped,
      state: { ...this.data, tokens: [...this.data.tokens], symbolPoints: this.data.symbolPoints.map(([x, y]) => [x, y]), visited: [...this.data.visited] },
      timings: this.records.map((record) => ({ ...record })), completionReason: this.endReason,
    };
  }

  private apply(id: ActionId, payload: ActionPayload): boolean {
    switch (id) {
      case 'begin': break;
      case 'open-kit': this.data.kitOpen = true; break;
      case 'take-map': this.data.mapTaken = true; break;
      case 'take-profile': this.data.profileTaken = true; break;
      case 'token-one':
      case 'token-two': {
        const fallback = this.data.tokens.includes('gardening') ? 'music' : 'gardening';
        const token = payload.token?.trim() || fallback;
        if (token.length > 40 || this.data.tokens.includes(token) || this.data.tokens.length >= 2) return false;
        this.data.tokens.push(token);
        break;
      }
      case 'accept-name': this.data.name = 'Noor'; break;
      case 'enter-blob': this.data.atBlob = true; break;
      case 'hand-profile': this.data.submitted = true; break;
      case 'choose-visibility':
        if (payload.visibility && payload.visibility !== 'public' && payload.visibility !== 'private') return false;
        this.data.visibility = payload.visibility ?? 'public';
        break;
      case 'turn-page': this.data.pageTurned = true; break;
      case 'meet-neighbour': break;
      case 'accept-request': this.data.requestAccepted = true; break;
      case 'read-profile': break;
      case 'draw-symbol': {
        const points = payload.points ?? suggestedSymbol();
        if (points.length < 2 || points.length > 512 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)) return false;
        this.data.symbolPoints = points.map(([x, y]) => [x, y]);
        break;
      }
      case 'post-symbol': this.data.symbolPosted = true; break;
      case 'watch-network': this.data.networkReached = true; break;
      case 'done': break;
    }
    return true;
  }

  private advanceAction(reason: CompletionReason): void {
    this.actionIndex++;
    this.idleSeconds = 0;
    this.assistance = false;
    if (this.actionIndex >= this.step.actions.length) this.advanceChapter(reason);
    else this.emit();
  }

  private advanceChapter(reason: CompletionReason): void {
    this.records.push({ id: this.step.id, name: this.step.name, budget: this.step.budget, seconds: this.chapterSeconds, reason, assistedActions: this.assistedActions });
    if (this.index === STEPS.length - 1) {
      this.complete = true;
      this.active = false;
      this.endReason = reason;
      this.emit();
      const snapshot = this.snapshot();
      for (const listener of this.completions) listener(snapshot);
      return;
    }
    this.index++;
    this.actionIndex = 0;
    this.chapterSeconds = 0;
    this.idleSeconds = 0;
    this.assistance = false;
    this.assistedActions = 0;
    this.data.visited.push(this.step.id);
    this.emit();
  }

  private emit(): void {
    if (!this.changes.size) return;
    const snapshot = this.snapshot();
    for (const listener of this.changes) listener(snapshot);
  }
}
