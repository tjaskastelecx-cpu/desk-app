/* Hand-drawn charts on <canvas>. No chart library. devicePixelRatio aware. */
(function (global) {
  const GREEN = "#00d35a";
  const ORANGE = "#ff9f0a";
  const BLUE = "#0a84ff";
  const RED = "#ff453a";

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function lineChart(canvas, points, marks, startValue) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length === 0) {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(235,235,245,0.3)";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.6);
      ctx.lineTo(w, h * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(235,235,245,0.6)";
      ctx.font = "13px -apple-system, sans-serif";
      ctx.fillText("Waiting for the first trade", 8, h * 0.6 - 10);
      return;
    }
    const vals = points.map((p) => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (startValue != null) { min = Math.min(min, startValue); max = Math.max(max, startValue); }
    if (min === max) { min -= 1; max += 1; }
    const pad = 8;
    const x = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
    const y = (v) => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    // fill
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,211,90,0.35)");
    g.addColorStop(1, "rgba(0,211,90,0)");
    ctx.beginPath();
    points.forEach((p, i) => { i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)); });
    ctx.lineTo(x(points.length - 1), h);
    ctx.lineTo(x(0), h);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    if (startValue != null) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(235,235,245,0.35)";
      ctx.beginPath();
      ctx.moveTo(0, y(startValue));
      ctx.lineTo(w, y(startValue));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    points.forEach((p, i) => { i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)); });
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.stroke();
    // marks, later ones move up a row so they don't overlap
    if (marks && marks.length) {
      const t0 = points[0].t, t1 = points[points.length - 1].t;
      const used = [];
      marks.forEach((m) => {
        if (m.t < t0 || m.t > t1) return;
        const frac = (new Date(m.t) - new Date(t0)) / Math.max(1, new Date(t1) - new Date(t0));
        const mx = pad + frac * (w - pad * 2);
        const near = points[Math.min(points.length - 1, Math.max(0, Math.round(frac * (points.length - 1))))];
        let my = y(near.v) - 14;
        used.forEach((uy) => { if (Math.abs(uy - my) < 14) my -= 14; });
        used.push(my);
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillStyle = m.kind === "bought" ? BLUE : (m.kind === "stopped" ? RED : GREEN);
        const label = m.title || m.value || "";
        ctx.fillText(label, Math.min(w - 80, Math.max(0, mx - 20)), my);
      });
    }
  }

  function candles(canvas, rows, trailLine, stopLine) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!rows || !rows.length) return;
    const highs = rows.map((r) => r.h), lows = rows.map((r) => r.l);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (trailLine != null) { min = Math.min(min, trailLine); max = Math.max(max, trailLine); }
    if (stopLine != null) { min = Math.min(min, stopLine); max = Math.max(max, stopLine); }
    if (min === max) { min -= 1; max += 1; }
    const volH = 28;
    const pad = 6;
    const chartH = h - volH - pad;
    const y = (v) => pad + (1 - (v - min) / (max - min)) * (chartH - pad);
    const bw = Math.max(2, (w / rows.length) * 0.7);
    const maxV = Math.max(1, ...rows.map((r) => r.v || 0));
    rows.forEach((r, i) => {
      const cx = (i + 0.5) * (w / rows.length);
      const up = r.c >= r.o;
      ctx.strokeStyle = ctx.fillStyle = up ? GREEN : RED;
      ctx.beginPath();
      ctx.moveTo(cx, y(r.h));
      ctx.lineTo(cx, y(r.l));
      ctx.stroke();
      const top = y(Math.max(r.o, r.c)), bot = y(Math.min(r.o, r.c));
      ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bot - top));
      if (r.v != null) {
        ctx.globalAlpha = 0.45;
        const vh = (r.v / maxV) * (volH - 4);
        ctx.fillRect(cx - bw / 2, h - vh, bw, vh);
        ctx.globalAlpha = 1;
      }
    });
    function hline(v, color) {
      if (v == null) return;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y(v));
      ctx.lineTo(w, y(v));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    hline(trailLine, ORANGE);
    hline(stopLine, RED);
  }

  function scoreRing(canvas, score) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(84,84,88,0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const s = Math.max(0, Math.min(100, score || 0));
    ctx.strokeStyle = s >= 70 ? GREEN : "#ffd60a";
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s) / 100);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 22px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(s), cx, cy);
  }

  global.DeskCharts = { lineChart, candles, scoreRing };
})(window);
