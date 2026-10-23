import { applyMessage, connectSocket, createRenderer } from "./render.js?v=19";

const canvas = document.querySelector("#canvas");
const renderer = createRenderer(canvas);

connectSocket((message) => {
  applyMessage(renderer, message);
});

async function keepAwake() {
  try {
    await navigator.wakeLock?.request("screen");
  } catch {
    // The kiosk also turns console blanking off.
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    keepAwake();
  }
});
keepAwake();

function fit() {
  renderer.resize();
}

window.addEventListener("resize", fit);
fit();
