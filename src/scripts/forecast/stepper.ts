// The forecast play buttons' timer: one interval, the playing state and the
// button's marking (the `playing` class and aria-pressed). Each view keeps
// its own frame index and hands in what one step does.

/** What a play button needs; an HTMLElement satisfies it. */
export interface PlayButton {
  classList: { toggle(token: string, force?: boolean): boolean };
  setAttribute(name: string, value: string): void;
}

export interface Stepper {
  /** Starts stepping, or stops when already playing. */
  toggle(): void;
  /** Stops and unmarks the button; safe when not playing. */
  stop(): void;
  readonly playing: boolean;
}

export function stepper(
  button: PlayButton,
  delayMs: number,
  onTick: () => void,
): Stepper {
  let timer: ReturnType<typeof setInterval> | null = null;

  function mark(): void {
    const on = timer !== null;
    button.classList.toggle("playing", on);
    button.setAttribute("aria-pressed", String(on));
  }

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    mark();
  }

  return {
    toggle() {
      if (timer !== null) return stop();
      timer = setInterval(onTick, delayMs);
      mark();
    },
    stop,
    get playing() {
      return timer !== null;
    },
  };
}
