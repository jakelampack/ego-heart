const INSIDE = "#000000";
const OUTSIDE = "#3d2918";

function traceHeart(ctx, width, height) {
  const margin = 0.045;
  const maxW = width * (1 - margin * 2);
  const maxH = height * (1 - margin * 2);
  const aspect = 0.94;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const left = (width - w) / 2;
  const top = (height - h) / 2;
  const right = left + w;
  const bottom = top + h;
  const cx = left + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, top + h * 0.3);
  ctx.bezierCurveTo(cx, top + h * 0.1, left + w * 0.16, top, left, top + h * 0.28);
  ctx.bezierCurveTo(left, top + h * 0.54, left + w * 0.22, top + h * 0.7, cx, bottom);
  ctx.bezierCurveTo(right - w * 0.22, top + h * 0.7, right, top + h * 0.54, right, top + h * 0.28);
  ctx.bezierCurveTo(right - w * 0.16, top, cx, top + h * 0.1, cx, top + h * 0.3);
  ctx.closePath();
}

const DEFAULT_WIDTH = 0.016;
const BRUSHES = new Set(["circle", "star", "diamond", "triangle"]);

function brushName(value) {
  return BRUSHES.has(value) ? value : "circle";
}

function traceStamp(ctx, brush, x, y, radius) {
  if (brush === "star") {
    const inner = radius * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const reach = i % 2 === 0 ? radius : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(angle) * reach;
      const py = y + Math.sin(angle) * reach;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    return;
  }
  if (brush === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.78, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius * 0.78, y);
    ctx.closePath();
    return;
  }
  if (brush === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.92, y + radius * 0.72);
    ctx.lineTo(x - radius * 0.92, y + radius * 0.72);
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function fillStamp(ctx, brush, x, y, pixels, color) {
  ctx.fillStyle = color;
  traceStamp(ctx, brush, x, y, pixels / 2);
  ctx.fill();
}

function level(value) {
  const number = Number(value);
  return number === 1 || number === 2 ? number : 0;
}

function shadowInk(hex, mix) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${Math.round(red * mix)}, ${Math.round(green * mix)}, ${Math.round(blue * mix)}, 0.92)`;
}

function strokeWidth(canvas, width) {
  const fraction = Number.isFinite(width) ? width : DEFAULT_WIDTH;
  return Math.max(2, fraction * Math.min(canvas.width, canvas.height));
}

function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const strokes = new Map();
  const order = [];
  let mask = false;

  function placeStamp(brush, x, y, pixels, color) {
    fillStamp(ctx, brush, x, y, pixels, color);
  }

  function walkStamps(from, to, step, trail, visit) {
    const x0 = from[0] * canvas.width;
    const y0 = from[1] * canvas.height;
    const x1 = to[0] * canvas.width;
    const y1 = to[1] * canvas.height;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return trail;
    }
    let cursor = step - trail;
    while (cursor <= length) {
      const t = cursor / length;
      visit(x0 + dx * t, y0 + dy * t);
      cursor += step;
    }
    return (trail + length) % step;
  }

  function drawInk(stroke, width, brush) {
    const points = stroke.points;
    if (brush !== "circle") {
      placeStamp(brush, points[0][0] * canvas.width, points[0][1] * canvas.height, width, stroke.color);
      const step = Math.max(width * 0.85, 1);
      let trail = 0;
      for (let i = 1; i < points.length; i += 1) {
        trail = walkStamps(points[i - 1], points[i], step, trail, (x, y) => {
          placeStamp(brush, x, y, width, stroke.color);
        });
      }
      return;
    }
    ctx.fillStyle = stroke.color;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0][0] * canvas.width, points[0][1] * canvas.height, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0] * canvas.width, points[0][1] * canvas.height);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
    }
    ctx.stroke();
  }

  function drawStroke(stroke) {
    const points = stroke.points;
    if (points.length === 0) {
      return;
    }
    const width = strokeWidth(canvas, stroke.width);
    const brush = brushName(stroke.brush);
    const glow = level(stroke.glow);
    const shadow = level(stroke.shadow);
    const paint = () => drawInk(stroke, width, brush);
    if (!glow && !shadow) {
      paint();
      return;
    }
    ctx.save();
    const clearShadow = () => {
      ctx.shadowColor = "rgba(0, 0, 0, 0)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };
    if (shadow) {
      const offset = width * (shadow === 1 ? 0.08 : 0.16);
      ctx.shadowColor = shadowInk(stroke.color, shadow === 1 ? 0.2 : 0.28);
      ctx.shadowBlur = width * (shadow === 1 ? 0.1 : 0.18);
      ctx.shadowOffsetX = offset;
      ctx.shadowOffsetY = offset * 1.15;
      paint();
      clearShadow();
    }
    if (glow) {
      const spread = glow === 1 ? 1.15 : 2.15;
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = width * spread;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      paint();
      ctx.shadowBlur = width * spread * 0.42;
      paint();
      clearShadow();
    }
    clearShadow();
    paint();
    ctx.restore();
  }

  function clipped(draw) {
    if (!mask) {
      draw();
      return;
    }
    ctx.save();
    traceHeart(ctx, canvas.width, canvas.height);
    ctx.clip();
    draw();
    ctx.restore();
  }

  function paintSegment(stroke, from, to) {
    clipped(() => {
      const pixels = strokeWidth(canvas, stroke.width);
      const brush = brushName(stroke.brush);
      if (brush !== "circle") {
        const step = Math.max(pixels * 0.85, 1);
        stroke.trail = walkStamps(from, to, step, stroke.trail || 0, (x, y) => {
          placeStamp(brush, x, y, pixels, stroke.color);
        });
        return;
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = pixels;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(from[0] * canvas.width, from[1] * canvas.height);
      ctx.lineTo(to[0] * canvas.width, to[1] * canvas.height);
      ctx.stroke();
    });
  }

  function paintDot(stroke) {
    clipped(() => {
      const pixels = strokeWidth(canvas, stroke.width);
      const brush = brushName(stroke.brush);
      const x = stroke.points[0][0] * canvas.width;
      const y = stroke.points[0][1] * canvas.height;
      if (brush !== "circle") {
        placeStamp(brush, x, y, pixels, stroke.color);
        return;
      }
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(x, y, pixels / 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function paintField() {
    if (!mask) {
      ctx.fillStyle = INSIDE;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.fillStyle = OUTSIDE;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    traceHeart(ctx, canvas.width, canvas.height);
    ctx.fillStyle = INSIDE;
    ctx.fill();
  }

  function redraw() {
    paintField();
    clipped(() => {
      for (const id of order) {
        drawStroke(strokes.get(id));
      }
    });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    redraw();
  }

  return {
    resize,
    replay(list, maskOn) {
      if (typeof maskOn === "boolean") {
        mask = maskOn;
      }
      strokes.clear();
      order.length = 0;
      for (const stroke of list) {
        strokes.set(stroke.id, {
          id: stroke.id,
          color: stroke.color,
          width: stroke.width,
          brush: brushName(stroke.brush),
          glow: level(stroke.glow),
          shadow: level(stroke.shadow),
          points: stroke.points.map((point) => [point[0], point[1]]),
        });
        order.push(stroke.id);
      }
      redraw();
    },
    begin(stroke) {
      if (strokes.has(stroke.id)) {
        return;
      }
      const stored = {
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        brush: brushName(stroke.brush),
        glow: level(stroke.glow),
        shadow: level(stroke.shadow),
        trail: 0,
        points: [[stroke.x, stroke.y]],
      };
      strokes.set(stroke.id, stored);
      order.push(stroke.id);
      if (stored.glow || stored.shadow) {
        redraw();
        return;
      }
      paintDot(stored);
    },
    point(id, x, y) {
      const stroke = strokes.get(id);
      if (!stroke) {
        return;
      }
      const previous = stroke.points[stroke.points.length - 1];
      const next = [x, y];
      stroke.points.push(next);
      if (stroke.glow || stroke.shadow) {
        redraw();
        return;
      }
      paintSegment(stroke, previous, next);
    },
    clear() {
      strokes.clear();
      order.length = 0;
      redraw();
    },
    snapshot() {
      return order.map((id) => {
        const stroke = strokes.get(id);
        return {
          id: stroke.id,
          color: stroke.color,
          width: stroke.width,
          brush: stroke.brush,
          glow: stroke.glow,
          shadow: stroke.shadow,
          points: stroke.points.map((point) => [point[0], point[1]]),
        };
      });
    },
    setMask(on) {
      mask = Boolean(on);
      redraw();
    },
  };
}

function applyMessage(renderer, message) {
  if (message.type === "replay") {
    renderer.replay(message.strokes || [], Boolean(message.mask));
    return;
  }
  if (message.type === "mask") {
    renderer.setMask(message.on);
    return;
  }
  if (message.type === "erase") {
    renderer.clear();
    return;
  }
  if (message.type === "begin") {
    renderer.begin(message);
    return;
  }
  if (message.type === "point") {
    renderer.point(message.id, message.x, message.y);
  }
}

function connectSocket(onMessage) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws`;
  let delay = 400;
  let socket = null;
  let stopped = false;

  function connect() {
    if (stopped) {
      return;
    }
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      delay = 400;
    });
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      onMessage(message, socket);
    });
    socket.addEventListener("close", () => {
      socket = null;
      window.setTimeout(connect, delay);
      delay = Math.min(delay * 2, 3000);
    });
  }

  connect();

  return {
    send(message) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      return false;
    },
    get connected() {
      return socket !== null && socket.readyState === WebSocket.OPEN;
    },
  };
}

export { applyMessage, connectSocket, createRenderer };
