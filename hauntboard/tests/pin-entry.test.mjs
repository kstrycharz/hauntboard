import test from "node:test";
import assert from "node:assert/strict";
import { PinEntry } from "../web/pin-entry.mjs";

// Minimal event adapter for the controller. Browser/layout behavior is tested
// separately in newgui.mjs with actual inputs, buttons, and encrypted wallets.
function element() {
  const classes = new Set();
  return {
    value: "", textContent: "", disabled: false, hidden: false, events: {},
    classList: {
      remove(value) { classes.delete(value); },
      toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
    },
    addEventListener(name, handler) { this.events[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    focus() { this.focused = true; },
    closest() { return null; },
  };
}
function fixture(onComplete = async () => {}) {
  const dialog = { ...element(), open: true }, input = element(), label = element(), status = element(), back = element();
  const dots = Array.from({ length: 6 }, element);
  const buttons = Array.from({ length: 12 }, () => ({ ...element(), dataset: { pinKey: "0" } }));
  const entry = new PinEntry({ dialog, input, label, status, back, dots: { querySelectorAll: () => dots }, keypad: { querySelectorAll: () => buttons }, onComplete });
  return { entry, dialog, input, label, status, back };
}
const type = (entry, value) => { for (const digit of value) entry.key(digit); };
const flush = () => new Promise(setImmediate);

test("setup advances automatically; mismatch stays on confirmation; saving happens once", async () => {
  let calls = 0, release;
  const f = fixture(async () => { calls++; await new Promise((resolve) => { release = resolve; }); });
  f.entry.start({ purpose: "create", setup: true });
  type(f.entry, "004281");
  assert.equal(f.label.textContent, "Confirm your PIN");
  assert.equal(f.input.value, "");
  assert.equal(calls, 0);
  type(f.entry, "999999");
  assert.match(f.status.textContent, /don’t match/);
  assert.equal(f.input.value, "");
  assert.equal(calls, 0);
  type(f.entry, "004281");
  f.entry.key("1");
  f.entry.keydown({ target: f.input, key: "Enter", code: "Enter", preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(f.input.disabled, true);
  release(); await flush();
  assert.equal(f.input.value, "");
});
test("failed authentication clears input and makes retry immediately usable", async () => {
  const f = fixture(async () => { throw new Error("Incorrect PIN. Try again."); });
  f.entry.start({ purpose: "unlock" });
  type(f.entry, "123456"); await flush();
  assert.match(f.status.textContent, /Incorrect PIN/);
  assert.equal(f.input.value, "");
  assert.equal(f.input.disabled, false);
  assert.equal(f.input.focused, true);
  f.entry.key("0"); assert.equal(f.input.value, "0");
});
test("Back chooses a new PIN; paste cannot span two steps", () => {
  const f = fixture(); f.entry.start({ purpose: "create", setup: true });
  f.input.events.paste({ preventDefault() {}, clipboardData: { getData: () => "123456123456" } });
  assert.match(f.status.textContent, /Paste a six-digit PIN/);
  assert.equal(f.input.value, "");
  f.input.events.paste({ preventDefault() {}, clipboardData: { getData: () => " 004281 " } });
  assert.equal(f.label.textContent, "Confirm your PIN");
  assert.equal(f.input.value, "");
  f.back.events.click();
  assert.match(f.label.textContent, /Create/);
  type(f.entry, "654321");
  assert.equal(f.label.textContent, "Confirm your PIN");
});
test("cancelled completion cannot overwrite a new PIN task", async () => {
  let release;
  const f = fixture(async () => await new Promise((resolve) => { release = resolve; }));
  f.entry.start({ purpose: "unlock" }); type(f.entry, "123456");
  f.entry.cancel(); f.entry.start({ purpose: "create", setup: true }); f.entry.key("0");
  release(); await flush();
  assert.match(f.label.textContent, /Create/);
  assert.equal(f.input.value, "0");
  assert.equal(f.input.disabled, false);
});
test("hardware input works from keypad focus; shortcuts, held keys and other fields are untouched", () => {
  const f = fixture(); f.entry.start({ purpose: "unlock" });
  const key = (target, overrides) => f.entry.keydown({ target, key: "1", code: "Digit1", preventDefault() {}, ...overrides });
  key(f.input, { repeat: true }); assert.equal(f.input.value, "");
  key(f.input, { ctrlKey: true }); assert.equal(f.input.value, "");
  key({ closest: () => ({}) }, {}); assert.equal(f.input.value, "");
  key({ closest: () => null }, { code: "Numpad0", key: "Insert" }); assert.equal(f.input.value, "0");
  key(f.input, { code: "Backspace", key: "Backspace" }); assert.equal(f.input.value, "");
  let prevented = false;
  key({ closest: () => null }, { code: "Enter", key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "Enter must still activate a focused button");
});
