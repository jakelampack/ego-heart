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

const DEFAULT_WIDTH = 0.012;
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

// Light on the bark behind the glass. Distances are multiples of the stroke width.
// angle: 0 is right, 90 is down.
const GLOW = {
  spread: 6.4,
  inner: 0.28,
  distance: 0.6,
  angle: 90,
  softness: 0.75,
  edge: 1,
  bloom: 5,
};

// Color texture on the stroke. amount is how white the hottest parts get.
// grain is the patch size as a fraction of the shorter canvas side.
const HEAT = {
  amount: 0.85,
  grain: 0.11,
  softness: 0.55,
};

function shadowInk(hex, mix) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${Math.round(red * mix)}, ${Math.round(green * mix)}, ${Math.round(blue * mix)}, 0.92)`;
}

function glowNumber(value, fallback, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(high, Math.max(low, number));
}

function fadeNoise(t) {
  return t * t * (3 - 2 * t);
}

function hash2(ix, iy) {
  const noise = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return noise - Math.floor(noise);
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fadeNoise(x - x0);
  const ty = fadeNoise(y - y0);
  const v00 = hash2(x0, y0);
  const v10 = hash2(x0 + 1, y0);
  const v01 = hash2(x0, y0 + 1);
  const v11 = hash2(x0 + 1, y0 + 1);
  return v00 + (v10 - v00) * tx + (v01 - v00) * ty + (v00 - v10 - v01 + v11) * tx * ty;
}

function heatField(x, y, cell) {
  const broad = valueNoise(x / cell, y / cell);
  const detail = valueNoise(x / (cell * 0.5) + 8.2, y / (cell * 0.5) - 3.4);
  return broad * 0.72 + detail * 0.28;
}

function heatMix(noise, amount, softness) {
  const blend = glowNumber(softness, HEAT.softness, 0, 1);
  const span = 0.05 + blend * 0.85;
  const start = 0.62 - span * 0.55;
  const t = Math.min(1, Math.max(0, (noise - start) / span));
  return fadeNoise(t) * amount;
}

function channels(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function heatPreview(size, color, amount, cell) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext("2d");
  const image = tileCtx.createImageData(size, size);
  const [red, green, blue] = channels(color);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const mix = amount <= 0 ? 0 : heatMix(heatField(x, y, cell), amount, HEAT.softness);
      const index = (y * size + x) * 4;
      data[index] = red + (255 - red) * mix;
      data[index + 1] = green + (255 - green) * mix;
      data[index + 2] = blue + (255 - blue) * mix;
      data[index + 3] = 255;
    }
  }
  tileCtx.putImageData(image, 0, 0);
  return tile.toDataURL();
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

  function brushTip(x, y, radius, angle, edge) {
    const amount = Math.min(2, Math.max(0, Number.isFinite(edge) ? edge : 1));
    ctx.beginPath();
    if (amount <= 0.001) {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const turn = (i / steps) * Math.PI * 2;
      const nx = Math.cos(turn) * 2.6 + x * 0.02;
      const ny = Math.sin(turn) * 2.6 + y * 0.02;
      const lump = valueNoise(nx, ny);
      const grit = valueNoise(nx * 3.4 + 6.2, ny * 3.4 - 2.5);
      const outward = Math.max(0, Math.cos(turn - angle));
      const rough = radius * (0.74 + lump * 0.38 + grit * 0.14 + outward * 0.28);
      const reach = radius + (rough - radius) * amount;
      const px = x + Math.cos(turn) * reach;
      const py = y + Math.sin(turn) * reach;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSmooth(stroke, width, color) {
    const points = stroke.points;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    const edge = glowNumber(stroke.edge, GLOW.edge, 0, 2);
    const first = [points[0][0] * canvas.width, points[0][1] * canvas.height];
    if (points.length === 1) {
      brushTip(first[0], first[1], width / 2, 0, edge);
      return;
    }
    const last = [points[points.length - 1][0] * canvas.width, points[points.length - 1][1] * canvas.height];
    const after = [points[1][0] * canvas.width, points[1][1] * canvas.height];
    const before = [
      points[points.length - 2][0] * canvas.width,
      points[points.length - 2][1] * canvas.height,
    ];
    ctx.beginPath();
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
    }
    ctx.stroke();
    brushTip(first[0], first[1], width / 2, Math.atan2(first[1] - after[1], first[0] - after[0]), edge);
    brushTip(last[0], last[1], width / 2, Math.atan2(last[1] - before[1], last[0] - before[0]), edge);
  }

  function drawShifted(stroke, width, color) {
    const shift = canvas.height + width + 80;
    ctx.save();
    ctx.shadowOffsetY += shift;
    ctx.translate(0, -shift);
    drawSmooth(stroke, width, color);
    ctx.restore();
  }

  function drawPaint(stroke, width, color) {
    const softness = glowNumber(stroke.softness, GLOW.softness, 0, 1);
    if (softness <= 0.001) {
      drawSmooth(stroke, width, color);
      return;
    }
    const blur = Math.max(1, width * softness * 1.35);
    const body = Math.max(1, width * (1 - softness * 0.45));
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    drawSmooth(stroke, body, color);
    ctx.restore();
  }

  const heatPatterns = new Map();

  function paintInk(stroke, color) {
    const amount = glowNumber(stroke.heat, HEAT.amount, 0, 1);
    if (amount <= 0.01) {
      return color;
    }
    const grain = glowNumber(stroke.grain, HEAT.grain, 0.02, 0.45);
    const heatSoft = glowNumber(stroke.heatSoft, HEAT.softness, 0, 1);
    const cell = Math.max(18, grain * Math.min(canvas.width, canvas.height));
    const key = `${color}|${amount}|${heatSoft}|${Math.round(cell)}|${canvas.width}|${canvas.height}`;
    const cached = heatPatterns.get(key);
    if (cached) {
      return cached;
    }
    const step = 4;
    const columns = Math.max(1, Math.ceil(canvas.width / step));
    const rows = Math.max(1, Math.ceil(canvas.height / step));
    const sample = document.createElement("canvas");
    sample.width = columns;
    sample.height = rows;
    const sampleCtx = sample.getContext("2d");
    const image = sampleCtx.createImageData(columns, rows);
    const [red, green, blue] = channels(color);
    const data = image.data;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const mix = heatMix(heatField(x * step, y * step, cell), amount, heatSoft);
        const index = (y * columns + x) * 4;
        data[index] = red + (255 - red) * mix;
        data[index + 1] = green + (255 - green) * mix;
        data[index + 2] = blue + (255 - blue) * mix;
        data[index + 3] = 255;
      }
    }
    sampleCtx.putImageData(image, 0, 0);
    const tile = document.createElement("canvas");
    tile.width = canvas.width;
    tile.height = canvas.height;
    const tileCtx = tile.getContext("2d");
    tileCtx.imageSmoothingEnabled = true;
    tileCtx.drawImage(sample, 0, 0, canvas.width, canvas.height);
    const pattern = ctx.createPattern(tile, "no-repeat");
    if (heatPatterns.size > 8) {
      heatPatterns.clear();
    }
    heatPatterns.set(key, pattern);
    return pattern;
  }

  function drawStroke(stroke) {
    const points = stroke.points;
    if (points.length === 0) {
      return;
    }
    const width = strokeWidth(canvas, stroke.width);
    const shadow = level(stroke.shadow);
    const spread = glowNumber(stroke.spread, GLOW.spread, 0.4, 40);
    const bloom = glowNumber(stroke.bloom, GLOW.bloom, 0, 16);
    const distance = glowNumber(stroke.distance, GLOW.distance, 0, 4);
    const angle = glowNumber(stroke.angle, GLOW.angle, 0, 360);
    const radians = (angle * Math.PI) / 180;
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
      drawSmooth(stroke, width, stroke.color);
      clearShadow();
    }
    if (bloom > 0.05) {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = width * bloom;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      drawShifted(stroke, width, stroke.color);
      clearShadow();
    }
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = width * spread;
    ctx.shadowOffsetX = Math.cos(radians) * width * distance;
    ctx.shadowOffsetY = Math.sin(radians) * width * distance;
    drawShifted(stroke, width, stroke.color);
    ctx.shadowBlur = width * spread * GLOW.inner;
    drawShifted(stroke, width, stroke.color);
    clearShadow();
    drawPaint(stroke, width, paintInk(stroke, stroke.color));
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
          spread: glowNumber(stroke.spread, GLOW.spread, 0.4, 40),
          distance: glowNumber(stroke.distance, GLOW.distance, 0, 4),
          angle: glowNumber(stroke.angle, GLOW.angle, 0, 360),
          heat: glowNumber(stroke.heat, HEAT.amount, 0, 1),
          grain: glowNumber(stroke.grain, HEAT.grain, 0.02, 0.45),
          softness: glowNumber(stroke.softness, GLOW.softness, 0, 1),
          edge: glowNumber(stroke.edge, GLOW.edge, 0, 2),
          bloom: glowNumber(stroke.bloom, GLOW.bloom, 0, 16),
          heatSoft: glowNumber(stroke.heatSoft, HEAT.softness, 0, 1),
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
        spread: glowNumber(stroke.spread, GLOW.spread, 0.4, 40),
        distance: glowNumber(stroke.distance, GLOW.distance, 0, 4),
        angle: glowNumber(stroke.angle, GLOW.angle, 0, 360),
        heat: glowNumber(stroke.heat, HEAT.amount, 0, 1),
        grain: glowNumber(stroke.grain, HEAT.grain, 0.02, 0.45),
        softness: glowNumber(stroke.softness, GLOW.softness, 0, 1),
        edge: glowNumber(stroke.edge, GLOW.edge, 0, 2),
        bloom: glowNumber(stroke.bloom, GLOW.bloom, 0, 16),
        heatSoft: glowNumber(stroke.heatSoft, HEAT.softness, 0, 1),
        shadow: level(stroke.shadow),
        trail: 0,
        points: [[stroke.x, stroke.y]],
      };
      strokes.set(stroke.id, stored);
      order.push(stroke.id);
      redraw();
    },
    point(id, x, y) {
      const stroke = strokes.get(id);
      if (!stroke) {
        return;
      }
      stroke.points.push([x, y]);
      redraw();
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
          spread: stroke.spread,
          distance: stroke.distance,
          angle: stroke.angle,
          heat: stroke.heat,
          grain: stroke.grain,
          softness: stroke.softness,
          edge: stroke.edge,
          bloom: stroke.bloom,
          heatSoft: stroke.heatSoft,
          shadow: stroke.shadow,
          points: stroke.points.map((point) => [point[0], point[1]]),
        };
      });
    },
    setMask(on) {
      mask = Boolean(on);
      redraw();
    },
    restyle(look) {
      for (const stroke of strokes.values()) {
        stroke.color = look.color;
        stroke.width = look.width;
        stroke.spread = glowNumber(look.spread, GLOW.spread, 0.4, 40);
        stroke.distance = glowNumber(look.distance, GLOW.distance, 0, 4);
        stroke.angle = glowNumber(look.angle, GLOW.angle, 0, 360);
        stroke.heat = glowNumber(look.heat, HEAT.amount, 0, 1);
        stroke.grain = glowNumber(look.grain, HEAT.grain, 0.02, 0.45);
        stroke.softness = glowNumber(look.softness, GLOW.softness, 0, 1);
        stroke.edge = glowNumber(look.edge, GLOW.edge, 0, 2);
        stroke.bloom = glowNumber(look.bloom, GLOW.bloom, 0, 16);
        stroke.heatSoft = glowNumber(look.heatSoft, HEAT.softness, 0, 1);
        stroke.shadow = level(look.shadow);
      }
      redraw();
    },
  };
}

function applyMessage(renderer, message) {
  if (message.type === "replay" || message.type === "style") {
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
