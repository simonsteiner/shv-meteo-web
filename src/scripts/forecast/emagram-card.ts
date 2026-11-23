// The emagram card's behaviour: which state shows (no station yet,
// loading, no sounding, the chart), the time slider with its eased steps
// and player, full screen and the info dialog. The drawing is emagram.ts.

import { must } from "../dom.ts";
import { fill } from "../i18n/text.ts";
import type { Sounding } from "../types.ts";
import {
  altitudeSvg,
  closestIndex,
  interpolateStep,
  rulerSvg,
  soundingCurves,
} from "./emagram.ts";

const PLAY_MS = 800;
const EASE_MS = 300;

export interface EmagramCard {
  /** No station chosen. */
  pick(): void;
  /** A station's sounding: undefined while loading, null when there is
   * none (upstream's ICON data can be missing). */
  show(station: string, sounding: Sounding | null | undefined): void;
  /** Rewords the card after a language change. */
  refresh(): void;
}

export function emagramCard(
  root: HTMLElement,
  say: (key: string) => string,
  locale: () => string,
  onBack: () => void,
): EmagramCard {
  const q = <T extends Element = HTMLElement>(s: string) => must<T>(root, s);
  const frame = q("[data-emagram-frame]");
  const backdrop = q("[data-emagram-backdrop]");
  const info = q("[data-emagram-info]");
  const slider = q<HTMLInputElement>("[data-emagram-slider]");
  const playButton = q("[data-emagram-play]");
  const expandButton = q("[data-emagram-expand]");
  let station: string | null = null;
  let sounding: Sounding | null | undefined;
  let position = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let easing = 0;
  let expanded = false;

  const steps = () => sounding?.timeSteps ?? [];

  function draw(at: number): void {
    const n = steps().length;
    if (n === 0) return;
    position = Math.max(0, Math.min(n - 1, at));
    const step = interpolateStep(steps(), position);
    if (!step) return;
    const when = new Date(step.timestamp);
    q("[data-emagram-time]").textContent = when.toLocaleDateString(locale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    q("[data-emagram-date]").textContent = when.toLocaleDateString(locale(), {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const time = when.toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
    q("[data-emagram-step]").textContent =
      `${time} · ${fill(say("forecast.step"), { n: Math.round(position) + 1, total: n })}`;
    if (Math.abs(Number(slider.value) - position) > 0.05)
      slider.value = String(position);
    q("[data-emagram-cursor]").style.left =
      `${(position / Math.max(1, n - 1)) * 100}%`;
    const curves = soundingCurves(step.levels);
    q("[data-emagram-dew]").setAttribute("points", curves.dew);
    q("[data-emagram-wind]").setAttribute("points", curves.wind);
    q("[data-emagram-temp]").innerHTML = curves.temp;
    q("[data-emagram-barbs]").innerHTML = curves.barbs;
    q("[data-emagram-altitudes]").innerHTML = altitudeSvg(step.levels);
  }

  function easeTo(target: number): void {
    cancelAnimationFrame(easing);
    const from = position;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / EASE_MS);
      draw(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) easing = requestAnimationFrame(tick);
    };
    easing = requestAnimationFrame(tick);
  }

  function step(delta: number): void {
    const n = steps().length;
    if (n > 0) easeTo((Math.round(position) + delta + n) % n);
  }

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    playButton.classList.remove("playing");
  }

  function setExpanded(on: boolean): void {
    expanded = on;
    frame.classList.toggle("is-expanded", on);
    backdrop.hidden = !on;
    document.body.classList.toggle("emagram-expanded-open", on);
    q("[data-emagram-fullscreen-label]").hidden = !on;
    expandButton.classList.toggle("active", on);
    expandButton.title = say(on ? "forecast.shrink" : "forecast.fullscreen");
    q("[data-emagram-back]").title = say(
      on ? "forecast.exitFullscreen" : "forecast.backToMap",
    );
  }

  function render(): void {
    const states = {
      pick: q('[data-emagram-state="pick"]'),
      status: q('[data-emagram-state="status"]'),
      chart: q('[data-emagram-state="chart"]'),
    };
    states.pick.hidden = station !== null;
    frame.hidden = station === null;
    if (station === null) {
      stop();
      setExpanded(false);
      return;
    }
    setExpanded(expanded);
    q("[data-emagram-station]").textContent = station;
    const n = steps().length;
    states.chart.hidden = n === 0;
    states.status.hidden = n > 0;
    if (n === 0) {
      stop();
      q("[data-emagram-time]").textContent = "";
      q("[data-emagram-status]").textContent = fill(
        say(
          sounding === undefined
            ? "forecast.loadingSounding"
            : "forecast.soundingUnavailable",
        ),
        { name: station },
      );
      q("[data-emagram-status-hint]").textContent =
        sounding === undefined ? "" : say("forecast.soundingUnavailableHint");
      return;
    }
    slider.max = String(n - 1);
    q("[data-emagram-ruler]").innerHTML = rulerSvg(
      steps(),
      Date.now(),
      say("forecast.now"),
      (ms) => new Date(ms).getHours(),
    );
    draw(position);
  }

  slider.addEventListener("input", () => draw(Number(slider.value)));
  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const by = target.closest<HTMLElement>("[data-emagram-step-by]");
    if (by) return step(Number(by.dataset.emagramStepBy));
    if (target.closest("[data-emagram-play]")) {
      if (timer !== null) return stop();
      timer = setInterval(() => step(1), PLAY_MS);
      playButton.classList.add("playing");
      return;
    }
    if (target.closest("[data-emagram-expand]")) return setExpanded(!expanded);
    if (target.closest("[data-emagram-back]"))
      return expanded ? setExpanded(false) : onBack();
    if (target === backdrop) return setExpanded(false);
    if (target.closest("[data-emagram-info-open]")) {
      info.hidden = false;
      return;
    }
    if (target === info || target.closest("[data-info-close]"))
      info.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!info.hidden) info.hidden = true;
    else if (expanded) setExpanded(false);
  });
  window.addEventListener("pagehide", stop);

  return {
    pick() {
      station = null;
      sounding = undefined;
      render();
    },
    show(name, data) {
      if (name !== station || data !== sounding) stop();
      station = name;
      sounding = data;
      position = data ? closestIndex(data.validTimes, Date.now()) : 0;
      render();
    },
    refresh: render,
  };
}
