// One numeric credential surface. No credentials leave transient controller state.
export class PinEntry {
  constructor({ dialog, input, label, dots, status, keypad, back, onComplete, onPhase }) {
    Object.assign(this, { dialog, input, label, dots, status, keypad, back, onComplete, onPhase });
    this.generation = 0;
    this.active = false;
    dialog.addEventListener("keydown", (event) => this.keydown(event));
    input.addEventListener("input", () => {
      if (this.active) this.replace(input.value);
    });
    input.addEventListener("paste", (event) => {
      if (!this.active) return;
      event.preventDefault();
      const value = (event.clipboardData.getData("text/plain") || event.clipboardData.getData("text")).trim();
      if (!/^\d{6}$/.test(value)) {
        this.message = "Paste a six-digit PIN using numbers only.";
        this.render();
        return;
      }
      this.replace(value);
    });
    keypad.querySelectorAll("[data-pin-key]").forEach((button) => {
      button.addEventListener("click", () => this.key(button.dataset.pinKey));
    });
    back.addEventListener("click", () => {
      if (!this.active || this.busy) return;
      this.generation++;
      this.phase = "create";
      this.entry = this.candidate = this.message = "";
      this.render();
      this.focus();
    });
  }
  start({ purpose, setup = false }) {
    this.generation++;
    Object.assign(this, { active: true, purpose, setup, phase: setup ? "create" : "verify", entry: "", candidate: "", message: "", busy: false });
    this.render();
    this.focus();
  }
  cancel() {
    this.generation++;
    this.active = false;
    this.busy = false;
    this.entry = this.candidate = this.message = "";
    this.input.value = "";
    this.input.disabled = false;
    this.dots.querySelectorAll("span").forEach((dot) => dot.classList.remove("filled"));
    this.status.textContent = "";
  }
  focus() {
    if (this.active && this.dialog.open && !this.busy) this.input.focus({ preventScroll: true });
  }
  keydown(event) {
    if (!this.active || !this.dialog.open || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    // Recovery fields and other editable controls own their keystrokes.
    if (event.target !== this.input && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    const digit = /^Numpad[0-9]$/.test(event.code) ? event.code.slice(-1) : /^\d$/.test(event.key) ? event.key : null;
    if (digit !== null || event.key === "Backspace" || (event.key === "Enter" && event.target === this.input)) {
      event.preventDefault();
      if (event.repeat) return;
      if (digit !== null) this.key(digit);
      else if (event.key === "Backspace") this.key("backspace");
      // Completion already runs on the sixth digit. Enter cannot repeat it.
    }
  }
  key(value) {
    if (!this.active || this.busy || !this.dialog.open) return;
    if (value === "clear") this.replace("");
    else if (value === "backspace") this.replace(this.entry.slice(0, -1));
    else if (/^\d$/.test(value) && this.entry.length < 6) this.replace(this.entry + value);
  }
  replace(value) {
    if (!this.active || this.busy) {
      this.input.value = this.entry ?? "";
      return;
    }
    if (!/^\d{0,6}$/.test(value)) {
      this.message = "Enter six digits using numbers only.";
      this.render();
      return;
    }
    const previous = this.entry.length;
    this.entry = value;
    this.message = "";
    this.render();
    if (previous < 6 && value.length === 6) this.complete();
  }
  async complete() {
    if (this.setup && this.phase === "create") {
      this.candidate = this.entry;
      this.phase = "confirm";
      this.entry = "";
      this.render();
      this.focus();
      return;
    }
    if (this.setup && this.entry !== this.candidate) {
      this.entry = "";
      this.message = "PINs don’t match. Try again, or go back to choose a different PIN.";
      this.render();
      this.focus();
      return;
    }
    this.busy = true;
    const generation = this.generation;
    const pin = this.entry;
    this.message = this.setup ? "Saving your PIN…" : "Checking your PIN…";
    this.render();
    try {
      await this.onComplete(pin, this.purpose);
    } catch (error) {
      if (generation !== this.generation || !this.active) return;
      this.entry = "";
      this.busy = false;
      this.message = error.message;
      this.render();
      this.focus();
      return;
    }
    if (generation !== this.generation || !this.active) return;
    this.entry = this.candidate = "";
    this.busy = false;
    this.message = "";
    this.render();
  }
  render() {
    const title = this.phase === "confirm" ? "Confirm your PIN" : this.phase === "create" ? "Create a six-digit PIN" : this.purpose === "show-phrase" ? "Enter PIN to view recovery phrase" : this.purpose === "fund" ? "Enter PIN to authorize local funding" : "Enter your six-digit PIN";
    this.label.textContent = title;
    this.input.value = this.entry;
    this.input.disabled = this.busy;
    this.input.setAttribute("aria-invalid", String(Boolean(this.message && !this.busy)));
    this.dots.querySelectorAll("span").forEach((dot, index) => dot.classList.toggle("filled", index < this.entry.length));
    this.status.textContent = this.message || (this.phase === "confirm" ? "Enter the same PIN again. " : "") + `${this.entry.length} of 6 digits entered.`;
    this.status.classList.toggle("error", Boolean(this.message && !this.busy));
    this.keypad.querySelectorAll("button").forEach((button) => { button.disabled = this.busy; });
    this.back.hidden = this.phase !== "confirm";
    this.back.disabled = this.busy;
    this.onPhase?.(this.phase, this.purpose);
  }
}
