/* 42theory — the live lab on the home page. Draws the solver from solver.js. */
(function () {
  'use strict';
  var T42 = window.T42, lab = document.getElementById('lab');
  if (!T42 || !lab) return;
  var canvas = document.getElementById('lab-canvas'), ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('lab-status'), rcBody = $('rc-body'), rcId = $('rc-id');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var PAPER = '#F6F7F9', HAZE = '#9AA6BA', MUTE = '#7785A0', NIGHT = '#111A2C', AMBER = '#FFB000', LINE = '#2A3650';
  var STOPS = ['#0B1220', '#1A1A4B', '#4A1B7A', '#8E1F86', '#C9306F', '#EE5A4C', '#FF8A2B', '#FFB000', '#FFD86B', '#FFF3CC'];
  var LUT = (function () {
    var n = 256, out = new Uint8ClampedArray(n * 3), rgb = STOPS.map(function (h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; });
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1) * (rgb.length - 1), a = Math.floor(t), b = Math.min(rgb.length - 1, a + 1), f = t - a;
      for (var c = 0; c < 3; c++) out[i * 3 + c] = rgb[a][c] + (rgb[b][c] - rgb[a][c]) * f;
    }
    return out;
  })();
  var TMIN = 33.1, TMAX = 37.7, AMAX = 1.8;       // field range (deg C) and warming range (K)
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  var BASE = [hex('#0B1322'), hex('#161A40'), hex('#2B2264')];   // quiet ramp for the temperature itself

  var P = T42.defaults(), nx = P.nx, nz = P.nz, h = P.h;
  var bgModel = (function () { var p = T42.clone(P); p.source.q = 0; var m = new T42.Model(p); m.solve(1e-9, 20000); return m; })();
  var Tbg = bgModel.T;                                // the same tissue with no source: the baseline
  var st = { mode: 'inverse', regions: true, iso: true, truth: null, inv: null, cx: null, phase: 'idle', solveNo: 42, ms: 0, solves: 0, drag: false, fwd: null, timer: 0, W: 0, H: 0, geo: null };

  var off = document.createElement('canvas'); off.width = nx; off.height = nz;
  var octx = off.getContext('2d'), img = octx.createImageData(nx, nz);
  var strip = document.createElement('canvas'); strip.width = nx; strip.height = 1;
  var sctx = strip.getContext('2d'), simg = sctx.createImageData(nx, 1);

  /* ---------- layout ---------- */
  function layout() {
    var W = Math.max(280, Math.floor(canvas.parentNode.clientWidth)), small = W < 520;
    var padL = small ? 30 : 46, padR = small ? 8 : 14, plotH = small ? 62 : (W > 700 ? 150 : 96), plotY = 26;
    var stripY = plotY + plotH + 10, stripH = 12, secY = stripY + stripH + 16;
    var secW = W - padL - padR, secH = Math.round(secW * nz / nx), H = secY + secH + 30;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    canvas.style.aspectRatio = W + ' / ' + H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    st.W = W; st.H = H;
    st.geo = { small: small, padL: padL, plotY: plotY, plotH: plotH, stripY: stripY, stripH: stripH, secX: padL, secY: secY, secW: secW, secH: secH, sx: secW / nx, sz: secH / nz };
  }

  /* ---------- drawing ---------- */
  function shown() { return st.mode === 'inverse' && st.inv ? st.inv.model : st.truth; }
  function font(px, mono, weight) { return (weight || 400) + ' ' + px + 'px ' + (mono ? '"Commit Mono", ui-monospace, Menlo, monospace' : '"Host Grotesk", Helvetica, Arial, sans-serif'); }

  function draw() {
    var g = st.geo, m = shown(); if (!g || !m) return;
    ctx.clearRect(0, 0, st.W, st.H);
    ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, st.W, st.H);
    drawSurface(g, m); drawField(g, m);
    if (st.iso) drawIso(g, m);
    drawLayers(g);
    if (st.regions && st.cx) drawComplex(g);
    drawMarkers(g); drawAxes(g);
  }

  function drawSurface(g, m) {
    var model = m.surface(), obs = st.mode === 'inverse' && st.inv ? st.inv.obs : model, lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < nx; i++) { if (obs[i] < lo) lo = obs[i]; if (obs[i] > hi) hi = obs[i]; if (model[i] > hi) hi = model[i]; if (model[i] < lo) lo = model[i]; }
    lo -= 0.12; hi += 0.12;
    var X = function (i) { return g.secX + (i + 0.5) * g.sx; }, Y = function (t) { return g.plotY + g.plotH - (t - lo) / (hi - lo) * g.plotH; };
    ctx.font = font(g.small ? 11 : 12.5, false, 500); ctx.fillStyle = HAZE; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText(g.small ? 'Surface temperature' : 'Surface temperature, as measured', g.secX, 17);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.secX, g.plotY + g.plotH + 0.5); ctx.lineTo(g.secX + g.secW, g.plotY + g.plotH + 0.5); ctx.stroke();
    ctx.font = font(10.5, true); ctx.fillStyle = MUTE; ctx.textAlign = 'right';
    ctx.fillText(hi.toFixed(1), g.secX - 6, g.plotY + 9); ctx.fillText(lo.toFixed(1), g.secX - 6, g.plotY + g.plotH);
    if (st.mode === 'inverse' && st.inv) {
      ctx.fillStyle = 'rgba(246,247,249,0.62)';
      for (i = 0; i < nx; i++) { ctx.beginPath(); ctx.arc(X(i), Y(obs[i]), g.small ? 1 : 1.5, 0, 6.2832); ctx.fill(); }
    }
    ctx.strokeStyle = AMBER; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    for (i = 0; i < nx; i++) { if (i) ctx.lineTo(X(i), Y(model[i])); else ctx.moveTo(X(i), Y(model[i])); }
    ctx.stroke();
    if (!g.small) {
      ctx.textAlign = 'right'; ctx.font = font(11.5, false, 500);
      if (st.mode === 'inverse') { ctx.fillStyle = 'rgba(246,247,249,0.7)'; ctx.fillText('dots: the measured surface', g.secX + g.secW, 17); }
    }
    // the frame itself: one row of thermal pixels
    var slo = Infinity, shi = -Infinity; for (i = 0; i < nx; i++) { if (obs[i] < slo) slo = obs[i]; if (obs[i] > shi) shi = obs[i]; }
    for (i = 0; i < nx; i++) { var v = Math.max(0, Math.min(255, Math.round((0.18 + 0.82 * (obs[i] - slo) / (shi - slo || 1)) * 255))); simg.data[i * 4] = LUT[v * 3]; simg.data[i * 4 + 1] = LUT[v * 3 + 1]; simg.data[i * 4 + 2] = LUT[v * 3 + 2]; simg.data[i * 4 + 3] = 255; }
    sctx.putImageData(simg, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(strip, g.secX, g.stripY, g.secW, g.stripH); ctx.imageSmoothingEnabled = true;
  }

  function drawField(g, m) {
    var T = m.T, d = img.data;
    for (var c = 0, p = 0; c < T.length; c++, p += 4) {
      var t = (T[c] - TMIN) / (TMAX - TMIN); t = t < 0 ? 0 : t > 1 ? 1 : t;
      var seg = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1, A = BASE[seg], B = BASE[seg + 1];
      var r = A[0] + (B[0] - A[0]) * f, gg = A[1] + (B[1] - A[1]) * f, b = A[2] + (B[2] - A[2]) * f;
      var a = (T[c] - Tbg[c]) / AMAX; a = a < 0 ? 0 : a > 1 ? 1 : a;      // warming the source adds
      if (a > 0.004) {
        var u = Math.sqrt(a), v = Math.round((0.26 + 0.74 * u) * 255), al = Math.min(1, u * 1.9); al = al * al * (3 - 2 * al);
        r += (LUT[v * 3] - r) * al; gg += (LUT[v * 3 + 1] - gg) * al; b += (LUT[v * 3 + 2] - b) * al;
      }
      d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, g.secX, g.secY, g.secW, g.secH);
  }

  function drawIso(g, m) {
    var T = m.T, x0 = g.secX, y0 = g.secY, sx = g.sx, sz = g.sz;
    ctx.strokeStyle = 'rgba(246,247,249,0.20)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var L = 33.5; L < 37.6; L += 0.5) {
      for (var j = 0; j < nz - 1; j++) for (var i = 0; i < nx - 1; i++) {
        var c = j * nx + i, a = T[c], b = T[c + 1], cc = T[c + nx + 1], dd = T[c + nx];
        var idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (cc > L ? 2 : 0) | (dd > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        var px = x0 + (i + 0.5) * sx, py = y0 + (j + 0.5) * sz;
        var top = [px + sx * (L - a) / (b - a), py], right = [px + sx, py + sz * (L - b) / (cc - b)], bot = [px + sx * (L - dd) / (cc - dd), py + sz], left = [px, py + sz * (L - a) / (dd - a)];
        var s = null, s2 = null;
        switch (idx) {
          case 1: case 14: s = [left, bot]; break; case 2: case 13: s = [bot, right]; break;
          case 3: case 12: s = [left, right]; break; case 4: case 11: s = [top, right]; break;
          case 6: case 9: s = [top, bot]; break; case 7: case 8: s = [left, top]; break;
          case 5: s = [left, top]; s2 = [bot, right]; break; case 10: s = [left, bot]; s2 = [top, right]; break;
        }
        ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]);
        if (s2) { ctx.moveTo(s2[0][0], s2[0][1]); ctx.lineTo(s2[1][0], s2[1][1]); }
      }
    }
    ctx.stroke();
  }

  function drawLayers(g) {
    var names = ['layer 1', 'layer 2', 'layer 3'], prev = 0;
    ctx.font = font(11.5, false, 500); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var L = 0; L < P.layers.length; L++) {
      var to = Math.min(P.layers[L].to, nz * h), y = g.secY + to / h * g.sz;
      if (L < P.layers.length - 1) { ctx.strokeStyle = 'rgba(246,247,249,0.28)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.secX, y + 0.5); ctx.lineTo(g.secX + g.secW, y + 0.5); ctx.stroke(); ctx.setLineDash([]); }
      var mid = g.secY + (prev + Math.min(to, prev + 9e-3)) / 2 / h * g.sz;
      if (!(g.small && L === 0)) { ctx.fillStyle = 'rgba(246,247,249,0.62)'; ctx.fillText(names[L], g.secX + g.secW - 8, L === 2 ? g.secY + (to === nz * h ? prev / h * g.sz + 16 : mid) : mid); }
      prev = to;
    }
    ctx.textBaseline = 'alphabetic';
  }

  function drawComplex(g) {
    var lab = st.cx.label, x0 = g.secX, y0 = g.secY, sx = g.sx, sz = g.sz;
    ctx.strokeStyle = 'rgba(246,247,249,0.36)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var c = j * nx + i;
      if (i < nx - 1 && lab[c] !== lab[c + 1]) { ctx.moveTo(x0 + (i + 1) * sx, y0 + j * sz); ctx.lineTo(x0 + (i + 1) * sx, y0 + (j + 1) * sz); }
      if (j < nz - 1 && lab[c] !== lab[c + nx]) { ctx.moveTo(x0 + i * sx, y0 + (j + 1) * sz); ctx.lineTo(x0 + (i + 1) * sx, y0 + (j + 1) * sz); }
    }
    ctx.stroke();
    if (g.small) return;
    // signed borders: a short arrow across each border, pointing the way heat flows
    var bs = st.cx.borders, K = st.cx.K, max = 0, e;
    for (e = 0; e < bs.length; e++) if (bs[e].b !== K) max = Math.max(max, Math.abs(bs[e].flux));
    ctx.fillStyle = 'rgba(246,247,249,0.72)'; ctx.strokeStyle = 'rgba(246,247,249,0.72)'; ctx.lineWidth = 1.1;
    for (e = 0; e < bs.length; e++) {
      var b = bs[e]; if (b.b === K || b.len < 3) continue;
      var ax = st.cx.cx[b.a], az = st.cx.cz[b.a], bx = st.cx.cx[b.b], bz = st.cx.cz[b.b];
      var dx = (bx - ax) * sx, dz = (bz - az) * sz, n = Math.hypot(dx, dz) || 1, s = b.flux >= 0 ? 1 : -1;
      dx = dx / n * s; dz = dz / n * s;
      var len = 5 + 9 * Math.sqrt(Math.abs(b.flux) / (max || 1)), px = x0 + b.x * sx, pz = y0 + b.z * sz;
      var x1 = px - dx * len / 2, z1 = pz - dz * len / 2, x2 = px + dx * len / 2, z2 = pz + dz * len / 2;
      ctx.beginPath(); ctx.moveTo(x1, z1); ctx.lineTo(x2, z2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2 + dx * 3, z2 + dz * 3); ctx.lineTo(x2 - dz * 2.6, z2 + dx * 2.6); ctx.lineTo(x2 + dz * 2.6, z2 - dx * 2.6); ctx.closePath(); ctx.fill();
    }
  }

  function toPx(g, x, z) { return [g.secX + x / h * g.sx, g.secY + z / h * g.sz]; }

  function drawMarkers(g) {
    var rpx = P.source.r / h * g.sx * 1.15, p;
    if (st.mode === 'inverse' && st.inv) {
      var hist = st.inv.history, i;
      ctx.strokeStyle = 'rgba(255,176,0,0.55)'; ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]); ctx.beginPath();
      for (i = 0; i < hist.length; i++) { p = toPx(g, hist[i].x, hist[i].z); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,176,0,0.7)';
      for (i = 0; i < hist.length - 1; i++) { p = toPx(g, hist[i].x, hist[i].z); ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 6.2832); ctx.fill(); }
      p = toPx(g, st.inv.theta[0], st.inv.theta[1]);
      if (st.inv.done && st.inv.ci) {           // the 95% interval, drawn to scale
        var wx = st.inv.ci.x / h * g.sx, wz = st.inv.ci.z / h * g.sz;
        ctx.fillStyle = 'rgba(11,18,32,0.55)'; ctx.beginPath(); ctx.arc(p[0], p[1], rpx, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2.25; ctx.beginPath(); ctx.arc(p[0], p[1], rpx, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgba(255,176,0,0.38)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], Math.max(2, wx), Math.max(2, wz), 0, 0, 6.2832); ctx.fill();
        ctx.lineWidth = 1.5; bars(p, Math.max(2, wx), Math.max(2, wz));
        var t = toPx(g, st.truth.src.x, st.truth.src.z);
        ctx.strokeStyle = 'rgba(246,247,249,0.95)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(t[0], t[1], rpx + 5, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
        leader(g, t[0], t[1], rpx + 5, 1, 'hidden truth', 'rgba(246,247,249,0.95)');
        leader(g, p[0], p[1], rpx, -1, 'estimate \u00b1 interval', AMBER);
      } else {
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2.25; ctx.beginPath(); ctx.arc(p[0], p[1], rpx, 0, 6.2832); ctx.stroke();
      }
    } else if (st.truth) {
      p = toPx(g, st.truth.src.x, st.truth.src.z);
      ctx.strokeStyle = '#0B1220'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p[0], p[1], rpx + 3, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], rpx + 3, 0, 6.2832); ctx.stroke();
      label(g, p[0] + rpx + 12, p[1] + 4, st.drag ? '' : 'drag me', 'rgba(246,247,249,0.92)', 'left');
    }
  }
  function bars(p, wx, wz) {
    ctx.lineCap = 'butt'; ctx.beginPath();
    ctx.moveTo(p[0] - wx, p[1]); ctx.lineTo(p[0] + wx, p[1]); ctx.moveTo(p[0], p[1] - wz); ctx.lineTo(p[0], p[1] + wz);
    ctx.moveTo(p[0] - wx, p[1] - 3); ctx.lineTo(p[0] - wx, p[1] + 3); ctx.moveTo(p[0] + wx, p[1] - 3); ctx.lineTo(p[0] + wx, p[1] + 3);
    ctx.moveTo(p[0] - 3, p[1] - wz); ctx.lineTo(p[0] + 3, p[1] - wz); ctx.moveTo(p[0] - 3, p[1] + wz); ctx.lineTo(p[0] + 3, p[1] + wz);
    ctx.stroke();
  }
  function leader(g, x, y, r, dir, text, color) {
    if (g.small) return;
    var x1 = x + dir * (r + 3) * 0.72, y1 = y - (r + 3) * 0.72, x2 = x + dir * (r + 30), y2 = y - (r + 26);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + dir * 10, y2); ctx.stroke();
    label(g, x2 + dir * 15, y2 + 4, text, color, dir > 0 ? 'left' : 'right');
  }
  function label(g, x, y, text, color, align) {
    if (!text || g.small) return;
    ctx.font = font(12.5, false, 600); ctx.textAlign = align; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(11,18,32,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function drawAxes(g) {
    ctx.font = font(10.5, true); ctx.fillStyle = MUTE; ctx.textAlign = 'right';
    for (var z = 0; z <= 25; z += 5) ctx.fillText(String(z), g.secX - 6, g.secY + z * 1e-3 / h * g.sz + (z === 0 ? 9 : 4));
    ctx.textAlign = 'center';
    for (var x = 0; x <= 60; x += (g.small ? 20 : 10)) ctx.fillText(String(x), g.secX + x * 1e-3 / h * g.sx, g.secY + g.secH + 16);
    if (g.small) return;
    ctx.textAlign = 'right'; ctx.fillText('mm', g.secX + g.secW, g.secY + g.secH + 16);
    // legend: warming added by the source
    var lw = 96, lx = g.secX + 12, ly = g.secY + g.secH - 16, grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    for (var i = 0; i <= 10; i++) { var u = i / 10, v = Math.round((0.26 + 0.74 * u) * 255); grad.addColorStop(u, 'rgba(' + LUT[v * 3] + ',' + LUT[v * 3 + 1] + ',' + LUT[v * 3 + 2] + ',' + Math.min(1, 0.25 + u * 1.5).toFixed(2) + ')'); }
    ctx.fillStyle = 'rgba(11,18,32,0.55)'; ctx.fillRect(lx - 8, ly - 22, lw + 78, 36);
    ctx.fillStyle = grad; ctx.fillRect(lx, ly, lw, 6);
    ctx.font = font(10.5, true); ctx.fillStyle = 'rgba(246,247,249,0.85)'; ctx.textAlign = 'left';
    ctx.fillText('0', lx, ly - 5); ctx.textAlign = 'right'; ctx.fillText(AMAX.toFixed(1) + ' K', lx + lw, ly - 5);
    ctx.textAlign = 'left'; ctx.font = font(11.5, false, 500); ctx.fillText('warming', lx + lw + 10, ly + 7);
  }

  /* ---------- receipt ---------- */
  function sci(v) { return v.toExponential(1).replace('e-', 'e−'); }
  function row(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
  function receiptInverse() {
    var iv = st.inv, t = st.truth, done = iv.done && iv.ci, bal = iv.model.balance(), h2 = '';
    var z = iv.theta[1] * 1e3, x = iv.theta[0] * 1e3, q = Math.exp(iv.theta[2]) / 1e3;
    h2 += '<h3>Answer</h3><dl class="big">' +
      row('depth', '<b>' + z.toFixed(1) + ' mm</b>' + (done ? ' <small>± ' + (iv.ci.z * 1e3).toFixed(1) + '</small>' : '')) +
      row('position', x.toFixed(1) + ' mm' + (done ? ' <small>± ' + (iv.ci.x * 1e3).toFixed(1) + '</small>' : '')) +
      row('heat', q.toFixed(0) + ' kW/m³' + (done ? ' <small>± ' + (q * iv.ci.logq).toFixed(0) + '</small>' : '')) + '</dl>';
    h2 += '<h3>Checks</h3><dl>' +
      row('surface fit', Math.sqrt(iv.cost / iv.obs.length).toFixed(3) + ' K <small>rms</small>') +
      row('measurement noise', iv.sigma.toFixed(3) + ' K') +
      row('residual', sci(iv.model.residual())) +
      row('energy balance', sci(bal.error)) +
      (st.cx ? row('region balance', sci(st.cx.imbalance)) : '') + '</dl>';
    h2 += '<h3>Run</h3><dl>' + (st.cx ? row('regions', String(st.cx.K)) + row('signed borders', String(st.cx.innerBorders)) : '') + row('iterations', String(iv.iter)) + row('forward solves', String(iv.nsolves || 0)) + row('time, this browser', Math.round(st.ms) + ' ms') + '</dl>';
    h2 += '<p class="rule">Rule, fixed before the run: the 95% interval must contain the hidden depth.</p>';
    if (done) {
      var ok = Math.abs(iv.theta[1] - t.src.z) <= iv.ci.z;
      h2 += '<p class="verdict' + (ok ? '' : ' miss') + '"><i></i><span>' + (ok ? 'Met. ' : 'Not met. ') + 'The truth is ' + (t.src.z * 1e3).toFixed(1) + ' mm.' + (ok ? '' : ' About one run in twenty should miss.') + '</span></p>';
    } else h2 += '<p class="verdict" style="color:var(--slate);font-weight:500"><span>Solving.</span></p>';
    rcBody.innerHTML = h2;
  }
  function receiptForward() {
    var t = st.truth, bal = t.balance(), s = t.surface(), lo = Infinity, hi = -Infinity, h2 = '';
    for (var i = 0; i < s.length; i++) { if (s[i] < lo) lo = s[i]; if (s[i] > hi) hi = s[i]; }
    h2 += '<h3>You placed</h3><dl class="big">' + row('depth', '<b>' + (t.src.z * 1e3).toFixed(1) + ' mm</b>') + row('position', (t.src.x * 1e3).toFixed(1) + ' mm') + row('heat', (t.src.q / 1e3).toFixed(0) + ' kW/m³') + '</dl>';
    h2 += '<h3>The surface would show</h3><dl>' + row('warmest point', hi.toFixed(2) + ' °C') + row('contrast', (hi - lo).toFixed(2) + ' K') + '</dl>';
    h2 += '<h3>Checks</h3><dl>' + row('residual', sci(t.residual())) + row('energy balance', sci(bal.error)) +
      (st.cx ? row('region balance', sci(st.cx.imbalance)) + row('regions', String(st.cx.K)) + row('signed borders', String(st.cx.innerBorders)) : '') + '</dl>';
    h2 += '<h3>Heat budget, per meter</h3><dl>' + row('generated', bal.generated.toFixed(2) + ' W') + row('carried away', bal.perfusion.toFixed(2) + ' W') + row('through the surface', bal.surface.toFixed(2) + ' W') + row('from the core', bal.core.toFixed(2) + ' W') + '</dl>';
    h2 += '<p class="rule">Deeper sources leave a wider, fainter mark on the surface. That is what the inverse solve reads.</p>';
    rcBody.innerHTML = h2;
  }
  function receipt() { rcId.textContent = 'solve ' + ('0000' + st.solveNo).slice(-4); if (st.mode === 'inverse' && st.inv) receiptInverse(); else if (st.truth) receiptForward(); }
  function say(t) { statusEl.textContent = t; }

  /* ---------- run ---------- */
  function complex() { st.cx = new T42.Complex(shown()); }

  function startInverse(src) {
    clearTimeout(st.timer); st.phase = 'inverse'; st.mode = 'inverse';
    var p = T42.clone(P); if (src) p.source = src;
    var t0 = performance.now();
    st.truth = new T42.Model(p); st.truth.solve(1e-9, 20000);
    st.inv = new T42.Inverse(st.truth, { seed: 1 + (st.solveNo * 7919) % 100000 });
    st.ms = performance.now() - t0; st.solves = 2;
    complex(); draw(); receipt(); say('Reading the surface');
    if (reduce) { while (stepOnce()) { /* run to the end without animating */ } finishInverse(); return; }
    st.timer = setTimeout(tick, 420);
  }
  function stepOnce() { var t0 = performance.now(), more = st.inv.step(); st.ms += performance.now() - t0; return more; }
  function tick() {
    var more = stepOnce(); complex(); draw(); receipt();
    if (more) { say('Iteration ' + st.inv.iter + ': depth ' + (st.inv.theta[1] * 1e3).toFixed(1) + ' mm'); st.timer = setTimeout(tick, 170); }
    else finishInverse();
  }
  function finishInverse() {
    var t0 = performance.now(); st.inv.model.solve(1e-9, 6000); st.inv.nsolves = (st.inv.nsolves || 0) + 1; st.ms += performance.now() - t0;
    st.phase = 'idle'; complex(); draw(); receipt(); say('Solved in ' + Math.round(st.ms) + ' ms, ' + st.inv.iter + ' iterations');
  }

  function startForward() {
    clearTimeout(st.timer); st.mode = 'forward'; st.phase = 'idle';
    if (!st.truth) { st.truth = new T42.Model(T42.clone(P)); st.truth.solve(1e-9, 20000); }
    complex(); draw(); receipt(); say('Drag the source. The field solves as you move it.');
  }
  function forwardLoop() {
    if (st.mode !== 'forward') return;
    var t0 = performance.now(), res = st.truth.sweep(st.drag ? 36 : 90);
    st.fwdFrames = (st.fwdFrames || 0) + 1;
    if (st.fwdFrames % 4 === 0 || res < 4e-9) complex();
    draw();
    if (st.fwdFrames % 3 === 0 || res < 4e-9) receipt();
    say(res < 4e-9 ? 'Converged. Residual ' + sci(res) : 'Solving. Residual ' + sci(res) + ', ' + (performance.now() - t0).toFixed(0) + ' ms a frame');
    if (st.drag || res >= 4e-9) st.raf = requestAnimationFrame(forwardLoop); else st.raf = 0;
  }
  function kick() { if (!st.raf) st.raf = requestAnimationFrame(forwardLoop); }

  function pointer(e) {
    var r = canvas.getBoundingClientRect(), g = st.geo, x = (e.clientX - r.left) * (st.W / r.width), y = (e.clientY - r.top) * (st.H / r.height);
    return { x: (x - g.secX) / g.sx * h, z: (y - g.secY) / g.sz * h, inside: x >= g.secX && x <= g.secX + g.secW && y >= g.secY && y <= g.secY + g.secH };
  }
  function moveSource(pt) {
    var s = st.truth.src;
    st.truth.setSource({ x: Math.min((nx - 6) * h, Math.max(6 * h, pt.x)), z: Math.min(19e-3, Math.max(2.6e-3, pt.z)), q: s.q, r: s.r });
    kick();
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (st.mode !== 'forward') return; var pt = pointer(e); if (!pt.inside) return;
    st.drag = true; canvas.classList.add('dragging'); try { canvas.setPointerCapture(e.pointerId); } catch (err) {} moveSource(pt); e.preventDefault();
  });
  canvas.addEventListener('pointermove', function (e) { if (st.drag) moveSource(pointer(e)); });
  function endDrag() { if (st.drag) { st.drag = false; canvas.classList.remove('dragging'); kick(); } }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', function (e) {
    if (st.mode !== 'forward') return; var s = st.truth.src, d = 0.8e-3, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (m) { moveSource({ x: s.x + m[0], z: s.z + m[1] }); e.preventDefault(); }
  });

  function press(a, b, on) { a.setAttribute('aria-pressed', on ? 'true' : 'false'); if (b) b.setAttribute('aria-pressed', on ? 'false' : 'true'); }
  $('mode-inverse').addEventListener('click', function () { press($('mode-inverse'), $('mode-forward'), true); canvas.classList.remove('drag'); canvas.removeAttribute('tabindex'); st.solveNo++; startInverse(st.truth ? st.truth.src : null); });
  $('mode-forward').addEventListener('click', function () { press($('mode-inverse'), $('mode-forward'), false); canvas.classList.add('drag'); canvas.setAttribute('tabindex', '0'); st.solveNo++; startForward(); });
  $('tog-regions').addEventListener('click', function () { st.regions = !st.regions; press(this, null, st.regions); draw(); });
  $('tog-iso').addEventListener('click', function () { st.iso = !st.iso; press(this, null, st.iso); draw(); });
  $('btn-new').addEventListener('click', function () {
    st.solveNo++;
    var src = { x: (12 + Math.random() * 40) * 1e-3, z: (3.4 + Math.random() * 7.6) * 1e-3, q: (5 + Math.random() * 9) * 1e4, r: P.source.r };
    if (st.mode === 'forward') { st.truth.setSource(src); kick(); } else startInverse(src);
  });

  var resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { layout(); draw(); }, 60); }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas.parentNode); else window.addEventListener('resize', onResize);

  function boot() { layout(); startInverse(null); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
  window.__lab = st;   // for tests
})();
