import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { stepper, type PlayButton } from "./stepper.ts";

function button() {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const b: PlayButton = {
    classList: {
      toggle(token, force) {
        if (force) classes.add(token);
        else classes.delete(token);
        return classes.has(token);
      },
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
  };
  return { b, classes, attrs };
}

test("toggle ticks every delay and marks the button, a second toggle stops", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { b, classes, attrs } = button();
    let ticks = 0;
    const s = stepper(b, 800, () => ticks++);
    s.toggle();
    assert.equal(s.playing, true);
    assert.equal(classes.has("playing"), true);
    assert.equal(attrs["aria-pressed"], "true");
    mock.timers.tick(1600);
    assert.equal(ticks, 2);
    s.toggle();
    assert.equal(s.playing, false);
    assert.equal(classes.has("playing"), false);
    assert.equal(attrs["aria-pressed"], "false");
    mock.timers.tick(1600);
    assert.equal(ticks, 2);
  } finally {
    mock.timers.reset();
  }
});

test("stop is idempotent", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { b, attrs } = button();
    const s = stepper(b, 100, () => {});
    s.stop();
    s.stop();
    assert.equal(s.playing, false);
    assert.equal(attrs["aria-pressed"], "false");
  } finally {
    mock.timers.reset();
  }
});
