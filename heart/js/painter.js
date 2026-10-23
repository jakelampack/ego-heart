import { applyMessage, connectSocket, createRenderer, heatPreview } from "./render.js?v=27";

const COLORS = [
  "#ffe24a",
  "#ff4f8b",
  "#ff7a18",
  "#3dffe4",
  "#6aa7ff",
  "#c86bff",
  "#ffffff",
  "#ff3b30",
  "#7dff6a",
];

const SIZES = [
  { width: 0.006, dot: 14, label: "Smallest brush" },
  { width: 0.012, dot: 22, label: "Small brush" },
  { width: 0.02, dot: 32, label: "Medium brush" },
  { width: 0.036, dot: 42, label: "Large brush" },
  { width: 0.058, dot: 52, label: "Largest brush" },
];

const SPREADS = [
  { value: 3.2, label: "Tight spread", blur: 5 },
  { value: 6.4, label: "Medium spread", blur: 11 },
  { value: 10, label: "Wide spread", blur: 18 },
];

const SOFTNESS = [
  { value: 0, label: "Hard edge", fade: 72 },
  { value: 0.45, label: "Soft edge", fade: 42 },
  { value: 0.9, label: "Softer edge", fade: 8 },
];

const DISTANCES = [
  { value: 0.6, label: "Close to the stroke", shift: 3 },
  { value: 1.8, label: "Glass distance", shift: 7 },
  { value: 3.2, label: "Far from the stroke", shift: 12 },
];

const POSITIONS = [
  { angle: 90, label: "Glow below", x: 0, y: 6 },
  { angle: 125, label: "Glow down and right", x: 5, y: 5 },
  { angle: 200, label: "Glow down and left", x: -5, y: 4 },
  { angle: 270, label: "Glow above", x: 0, y: -6 },
];

const HEATS = [
  { value: 0, label: "Solid color", cell: 14 },
  { value: 0.62, label: "Warm", cell: 14 },
  { value: 1, label: "White hot", cell: 14 },
];

const GRAINS = [
  { value: 0.045, label: "Fine texture", cell: 7 },
  { value: 0.11, label: "Medium texture", cell: 14 },
  { value: 0.22, label: "Broad texture", cell: 24 },
];

const MIN_SPACING = 0.001;

const canvas = document.querySelector("#canvas");
const swatches = document.querySelector("#swatches");
const sizes = document.querySelector("#sizes");
const spreads = document.querySelector("#spreads");
const softnesses = document.querySelector("#softness");
const distances = document.querySelector("#distances");
const positions = document.querySelector("#positions");
const heats = document.querySelector("#heats");
const grains = document.querySelector("#grains");
const shadows = document.querySelector("#shadows");
const dock = document.querySelector("#dock");
const toolsToggle = document.querySelector("#tools-toggle");
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

let color = COLORS[COLORS.length - 1];
let width = SIZES[1].width;
let spread = SPREADS[1].value;
let softness = SOFTNESS[0].value;
let distance = DISTANCES[0].value;
let angle = POSITIONS[0].angle;
let heat = HEATS[1].value;
let grain = GRAINS[1].value;
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

function selectShadow(next) {
  shadow = next;
  markGroup(shadows, ".fx", "shadow", next);
}

function addTune(root, item, key, choose, paint) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fx";
  button.dataset[key] = String(item.value ?? item.angle);
  button.setAttribute("aria-label", item.label);
  const dot = document.createElement("span");
  dot.className = "fx-dot";
  paint(dot, item);
  button.append(dot);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    choose(item.value ?? item.angle);
  });
  root.append(button);
}

function selectSpread(next) {
  spread = next;
  markGroup(spreads, ".fx", "spread", next);
}

function selectSoftness(next) {
  softness = next;
  markGroup(softnesses, ".fx", "softness", next);
}

function paintSoftDot(dot, fade) {
  dot.style.width = "22px";
  dot.style.height = "22px";
  dot.style.background =
    fade >= 70
      ? "#ffe24a"
      : `radial-gradient(circle, #ffe24a ${fade}%, rgba(255, 226, 74, 0) 100%)`;
}

function selectDistance(next) {
  distance = next;
  markGroup(distances, ".fx", "distance", next);
}

function selectAngle(next) {
  angle = next;
  markGroup(positions, ".fx", "angle", next);
}

function selectHeat(next) {
  heat = next;
  markGroup(heats, ".fx", "heat", next);
}

function selectGrain(next) {
  grain = next;
  markGroup(grains, ".fx", "grain", next);
}

function paintHeatDot(dot, amount, cell) {
  dot.style.width = "26px";
  dot.style.height = "26px";
  dot.style.backgroundColor = "#ffe24a";
  dot.style.backgroundImage = `url(${heatPreview(52, "#ffe24a", amount, cell)})`;
  dot.style.backgroundSize = "cover";
}

for (const item of SPREADS) {
  addTune(spreads, item, "spread", selectSpread, (dot, choice) => {
    dot.style.boxShadow = `0 0 ${choice.blur}px ${Math.round(choice.blur / 2)}px rgba(255, 226, 74, 0.95)`;
  });
}
for (const item of SOFTNESS) {
  addTune(softnesses, item, "softness", selectSoftness, (dot, choice) => {
    paintSoftDot(dot, choice.fade);
  });
}
for (const item of DISTANCES) {
  addTune(distances, item, "distance", selectDistance, (dot, choice) => {
    dot.style.transform = `translate(${choice.shift}px, ${choice.shift}px)`;
  });
}
for (const item of POSITIONS) {
  addTune(positions, item, "angle", selectAngle, (dot, choice) => {
    dot.style.transform = `translate(${choice.x}px, ${choice.y}px)`;
  });
}
for (const item of HEATS) {
  addTune(heats, item, "heat", selectHeat, (dot, choice) => {
    paintHeatDot(dot, choice.value, choice.cell);
  });
}
for (const item of GRAINS) {
  addTune(grains, item, "grain", selectGrain, (dot, choice) => {
    paintHeatDot(dot, 1, choice.cell);
  });
}
for (const item of SHADOWS) {
  addEffect(shadows, item, "shadow", selectShadow);
}
selectSpread(spread);
selectSoftness(softness);
selectDistance(distance);
selectAngle(angle);
selectHeat(heat);
selectGrain(grain);
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
  renderer.begin({
    id,
    color,
    width,
    spread,
    softness,
    distance,
    angle,
    heat,
    grain,
    shadow,
    x: point.x,
    y: point.y,
  });
  socket.send({
    type: "begin",
    id,
    color,
    width,
    spread,
    softness,
    distance,
    angle,
    heat,
    grain,
    shadow,
    x: point.x,
    y: point.y,
  });
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

toolsToggle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const open = dock.classList.toggle("open");
  toolsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  toolsToggle.setAttribute("aria-label", open ? "Hide tools" : "Show tools");
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

async function lockLandscape() {
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch {
    // A phone browser only allows this for an installed app.
  }
}

lockLandscape();
window.addEventListener("orientationchange", lockLandscape);
