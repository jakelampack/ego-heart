import { applyMessage, connectSocket, createRenderer } from "./render.js?v=17";

const COLORS = [
  "#ffffff",
  "#1c1915",
  "#c4382b",
  "#e06a1f",
  "#e2b31c",
  "#2f7d4a",
  "#1f5fbf",
  "#6a3d98",
  "#d45b86",
];

const SIZES = [
  { width: 0.006, dot: 14, label: "Smallest brush" },
  { width: 0.012, dot: 22, label: "Small brush" },
  { width: 0.02, dot: 32, label: "Medium brush" },
  { width: 0.036, dot: 42, label: "Large brush" },
  { width: 0.058, dot: 52, label: "Largest brush" },
];

const BRUSHES = [
  {
    id: "circle",
    label: "Circle brush",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
  },
  {
    id: "star",
    label: "Star brush",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2 14.7 8.4 21.4 9.1 16.3 13.6 17.8 20.2 12 16.8 6.2 20.2 7.7 13.6 2.6 9.1 9.3 8.4z"/></svg>',
  },
  {
    id: "diamond",
    label: "Diamond brush",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.4 21.2 12 12 21.6 2.8 12z"/></svg>',
  },
  {
    id: "triangle",
    label: "Triangle brush",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2 21.4 20.4H2.6z"/></svg>',
  },
];

const MIN_SPACING = 0.001;

const canvas = document.querySelector("#canvas");
const swatches = document.querySelector("#swatches");
const sizes = document.querySelector("#sizes");
const brushes = document.querySelector("#brushes");
const glows = document.querySelector("#glows");
const shadows = document.querySelector("#shadows");
const maskButton = document.querySelector("#mask");
const undoButton = document.querySelector("#undo");
const redoButton = document.querySelector("#redo");
const erase = document.querySelector("#erase");
const status = document.querySelector("#status");
const renderer = createRenderer(canvas);
const local = document.body.dataset.local === "true";
const undoStack = [];
const redoStack = [];
const HISTORY = 80;

let color = COLORS[0];
let width = SIZES[2].width;
let brush = BRUSHES[0].id;
let glow = 0;
let shadow = 0;
let active = null;

function place(event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function separated(from, to) {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return dx * dx + dy * dy >= MIN_SPACING * MIN_SPACING;
}

function selectColor(next) {
  color = next;
  for (const button of swatches.querySelectorAll(".swatch")) {
    button.setAttribute("aria-pressed", button.dataset.color === next ? "true" : "false");
  }
}

for (const value of COLORS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.dataset.color = value;
  button.style.background = value;
  button.setAttribute("aria-label", value);
  button.setAttribute("aria-pressed", value === color ? "true" : "false");
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  button.addEventListener("click", () => {
    selectColor(value);
  });
  swatches.append(button);
}

function selectSize(next) {
  width = next;
  for (const button of sizes.querySelectorAll(".size")) {
    const selected = Number(button.dataset.width) === next;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.style.boxShadow = selected
      ? "0 0 0 3px #241f1a, 0 0 0 6px #f3efe6"
      : "inset 0 0 0 1px rgba(243, 239, 230, 0.45)";
  }
}

for (const size of SIZES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "size";
  button.dataset.width = String(size.width);
  button.setAttribute("aria-label", size.label);
  button.style.width = `${size.dot}px`;
  button.style.height = `${size.dot}px`;
  button.style.borderRadius = "50%";
  button.style.background = "#f3efe6";
  button.style.border = "0";
  button.style.padding = "0";
  button.style.appearance = "none";
  button.style.webkitAppearance = "none";
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectSize(size.width);
  });
  sizes.append(button);
}
selectSize(width);

function selectBrush(next) {
  brush = next;
  for (const button of brushes.querySelectorAll(".brush")) {
    const selected = button.dataset.brush === next;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.style.boxShadow = selected ? "0 0 0 3px #241f1a, 0 0 0 6px #f3efe6" : "none";
  }
}

for (const item of BRUSHES) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "brush";
  button.dataset.brush = item.id;
  button.setAttribute("aria-label", item.label);
  button.innerHTML = item.icon;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectBrush(item.id);
  });
  brushes.append(button);
}
selectBrush(brush);

const GLOWS = [
  { level: 0, label: "No glow", glow: "none" },
  { level: 1, label: "Small glow", glow: "0 0 6px 2px rgba(243, 239, 230, 0.95)" },
  { level: 2, label: "Big glow", glow: "0 0 14px 7px rgba(243, 239, 230, 1)" },
];

const SHADOWS = [
  { level: 0, label: "No drop shadow", x: 0, blur: 0 },
  { level: 1, label: "Small drop shadow", x: 3, blur: 1.5 },
  { level: 2, label: "Big drop shadow", x: 6, blur: 3.5 },
];

function markGroup(root, selector, key, next) {
  for (const button of root.querySelectorAll(selector)) {
    const selected = Number(button.dataset[key]) === next;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function addEffect(root, item, key, choose) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fx";
  button.dataset[key] = String(item.level);
  button.setAttribute("aria-label", item.label);
  const dot = document.createElement("span");
  dot.className = "fx-dot";
  if (item.glow) {
    dot.style.boxShadow = item.glow;
  }
  if (item.x) {
    const shade = document.createElement("span");
    shade.className = "fx-shade";
    shade.style.transform = `translate(${item.x}px, ${item.x + 1}px)`;
    shade.style.filter = `blur(${item.blur}px)`;
    button.append(shade);
  }
  button.append(dot);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    choose(item.level);
  });
  root.append(button);
}

function selectGlow(next) {
  glow = next;
  markGroup(glows, ".fx", "glow", next);
}

function selectShadow(next) {
  shadow = next;
  markGroup(shadows, ".fx", "shadow", next);
}

for (const item of GLOWS) {
  addEffect(glows, item, "glow", selectGlow);
}
for (const item of SHADOWS) {
  addEffect(shadows, item, "shadow", selectShadow);
}
selectGlow(glow);
selectShadow(shadow);

function showMask(on) {
  maskButton.setAttribute("aria-pressed", on ? "true" : "false");
}

function showHistory(canUndo, canRedo) {
  undoButton.disabled = !canUndo;
  redoButton.disabled = !canRedo;
}

function remember() {
  undoStack.push(renderer.snapshot());
  if (undoStack.length > HISTORY) {
    undoStack.shift();
  }
  redoStack.length = 0;
  showHistory(undoStack.length > 0, redoStack.length > 0);
}

function restore(strokes) {
  const maskOn = maskButton.getAttribute("aria-pressed") === "true";
  renderer.replay(strokes, maskOn);
  showHistory(undoStack.length > 0, redoStack.length > 0);
}

const socket = local
  ? {
      send() {
        return true;
      },
      get connected() {
        return true;
      },
    }
  : connectSocket((message) => {
      applyMessage(renderer, message);
      if (message.type === "replay" || message.type === "erase") {
        active = null;
      }
      if (message.type === "replay") {
        showMask(Boolean(message.mask));
      }
      if (message.type === "mask") {
        showMask(Boolean(message.on));
      }
      if (message.undo !== undefined || message.redo !== undefined) {
        showHistory(Boolean(message.undo), Boolean(message.redo));
      }
      status.hidden = socket.connected;
    });

if (local) {
  status.hidden = true;
} else {
  window.setInterval(() => {
    status.hidden = socket.connected;
    status.textContent = socket.connected ? "" : "Connecting";
  }, 400);
}

maskButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const on = maskButton.getAttribute("aria-pressed") !== "true";
  if (!socket.send({ type: "mask", on })) {
    return;
  }
  showMask(on);
  renderer.setMask(on);
});

function newStrokeId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function beginStroke(pointerId, point) {
  if (local) {
    remember();
  }
  const id = newStrokeId();
  active = { id, pointerId, last: point };
  renderer.begin({ id, color, width, brush, glow, shadow, x: point.x, y: point.y });
  socket.send({ type: "begin", id, color, width, brush, glow, shadow, x: point.x, y: point.y });
  if (!local) {
    showHistory(true, false);
  }
}

function startStroke(event) {
  if (event.pointerType === "touch") {
    return;
  }
  if (!socket.connected) {
    return;
  }
  if (active) {
    return;
  }
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  const point = place(event);
  if (!point) {
    return;
  }
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Capture is unavailable for this pointer. The stroke still tracks moves.
  }
  beginStroke(event.pointerId, point);
}

function extendStroke(event) {
  if (!active || event.pointerId !== active.pointerId) {
    return;
  }
  const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  for (const sample of samples) {
    const point = place(sample);
    if (!point || !separated(active.last, point)) {
      continue;
    }
    active.last = point;
    renderer.point(active.id, point.x, point.y);
    socket.send({ type: "point", id: active.id, x: point.x, y: point.y });
  }
}

function finishStroke(event) {
  if (!active || event.pointerId !== active.pointerId) {
    return;
  }
  extendStroke(event);
  socket.send({ type: "end", id: active.id });
  active = null;
}

function touchById(list) {
  if (!active) {
    return null;
  }
  for (const touch of list) {
    if (touch.identifier === active.pointerId) {
      return touch;
    }
  }
  return null;
}

function startTouch(event) {
  if (!socket.connected || active) {
    return;
  }
  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }
  const point = place(touch);
  if (!point) {
    return;
  }
  event.preventDefault();
  beginStroke(touch.identifier, point);
}

function extendTouch(event) {
  const touch = touchById(event.changedTouches);
  if (!touch) {
    return;
  }
  event.preventDefault();
  const point = place(touch);
  if (!point || !separated(active.last, point)) {
    return;
  }
  active.last = point;
  renderer.point(active.id, point.x, point.y);
  socket.send({ type: "point", id: active.id, x: point.x, y: point.y });
}

function finishTouch(event) {
  const touch = touchById(event.changedTouches);
  if (!touch) {
    return;
  }
  event.preventDefault();
  extendTouch(event);
  socket.send({ type: "end", id: active.id });
  active = null;
}

canvas.addEventListener("pointerdown", startStroke, { passive: false });
canvas.addEventListener("pointermove", extendStroke, { passive: false });
canvas.addEventListener("pointerup", finishStroke);
canvas.addEventListener("pointercancel", finishStroke);
canvas.addEventListener("touchstart", startTouch, { passive: false });
canvas.addEventListener("touchmove", extendTouch, { passive: false });
canvas.addEventListener("touchend", finishTouch, { passive: false });
canvas.addEventListener("touchcancel", finishTouch, { passive: false });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function historyStep(kind) {
  const button = kind === "undo" ? undoButton : redoButton;
  if (button.disabled) {
    return;
  }
  if (!local) {
    if (!socket.send({ type: kind })) {
      return;
    }
    active = null;
    return;
  }
  const from = kind === "undo" ? undoStack : redoStack;
  const to = kind === "undo" ? redoStack : undoStack;
  if (from.length === 0) {
    return;
  }
  active = null;
  to.push(renderer.snapshot());
  restore(from.pop());
}

undoButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  historyStep("undo");
});

redoButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  historyStep("redo");
});

erase.addEventListener("click", () => {
  if (local) {
    remember();
    renderer.clear();
    active = null;
    return;
  }
  if (!socket.send({ type: "erase" })) {
    return;
  }
  renderer.clear();
  active = null;
  showHistory(true, false);
});

function fit() {
  renderer.resize();
}

window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
fit();
