/* 42theory — bio-heat demo solver.
 * A small, real solver: steady Pennes bio-heat on a 2D tissue cross-section,
 * finite volumes, harmonic face conductivities, Robin skin boundary.
 * It also builds a cell complex (regions + signed border fluxes) over the
 * solved field and recovers a hidden heat source from the surface profile.
 * Illustrative physics for a demo. Not a clinical tool.
 */
(function (root) {
  'use strict';

  var CB = 1060 * 3770;          // blood density x specific heat, J/(m^3 K)

  function defaults() {
    return {
      nx: 160, nz: 64, h: 0.4e-3,      // 64 mm x 25.6 mm at 0.4 mm
      Ta: 37.0, Tcore: 37.0, Tamb: 22.0, hc: 10.0,
      layers: [                        // depth to (m), k W/(m K), perfusion 1/s, metabolic W/m^3
        { name: 'skin',   to: 2.0e-3, k: 0.42, w: 0.0012, qm: 400 },
        { name: 'fat',    to: 7.2e-3, k: 0.21, w: 0.0003, qm: 300 },
        { name: 'muscle', to: 1,      k: 0.50, w: 0.0008, qm: 700 }
      ],
      source: { x: 26e-3, z: 6.0e-3, q: 9.0e4, r: 1.8e-3 }  // hidden heat source
    };
  }

  function Model(p) {
    p = p || defaults();
    var nx = p.nx, nz = p.nz, n = nx * nz;
    this.p = p; this.nx = nx; this.nz = nz; this.n = n; this.h = p.h;
    this.k = new Float64Array(n); this.w = new Float64Array(n);
    this.qm = new Float64Array(n); this.layer = new Uint8Array(n);
    this.q = new Float64Array(n);       // source term
    this.T = new Float64Array(n);
    this.aE = new Float64Array(n); this.aS = new Float64Array(n); // face coefficients (east, south)
    this.aTop = new Float64Array(nx); this.aBot = new Float64Array(nx);
    this.diag = new Float64Array(n); this.rhs0 = new Float64Array(n);
    for (var j = 0; j < nz; j++) {
      var zc = (j + 0.5) * p.h, L = 0;
      while (zc > p.layers[L].to) L++;
      for (var i = 0; i < nx; i++) {
        var c = j * nx + i;
        this.k[c] = p.layers[L].k; this.w[c] = p.layers[L].w;
        this.qm[c] = p.layers[L].qm; this.layer[c] = L;
      }
    }
    this.assemble();
    for (var c2 = 0; c2 < n; c2++) this.T[c2] = p.Tcore - 3.0 * (1 - Math.floor(c2 / nx) / nz);
    this.setSource(p.source);
  }

  Model.prototype.assemble = function () {
    var nx = this.nx, nz = this.nz, h = this.h, p = this.p, k = this.k, ih2 = 1 / (h * h);
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var c = j * nx + i;
      this.aE[c] = i < nx - 1 ? ih2 * 2 * k[c] * k[c + 1] / (k[c] + k[c + 1]) : 0;
      this.aS[c] = j < nz - 1 ? ih2 * 2 * k[c] * k[c + nx] / (k[c] + k[c + nx]) : 0;
    }
    for (var i2 = 0; i2 < nx; i2++) {
      this.aTop[i2] = 1 / (h * (1 / p.hc + h / (2 * k[i2])));       // Robin: convection + half cell
      this.aBot[i2] = 2 * k[(nz - 1) * nx + i2] * ih2;                // Dirichlet core at the face
    }
    for (var j2 = 0; j2 < nz; j2++) for (var i3 = 0; i3 < nx; i3++) {
      var c3 = j2 * nx + i3, d = this.w[c3] * CB;
      if (i3 > 0) d += this.aE[c3 - 1];
      if (i3 < nx - 1) d += this.aE[c3];
      if (j2 > 0) d += this.aS[c3 - nx];
      if (j2 < nz - 1) d += this.aS[c3];
      var r = this.w[c3] * CB * p.Ta + this.qm[c3];
      if (j2 === 0) { d += this.aTop[i3]; r += this.aTop[i3] * p.Tamb; }
      if (j2 === nz - 1) { d += this.aBot[i3]; r += this.aBot[i3] * p.Tcore; }
      this.diag[c3] = d; this.rhs0[c3] = r;
    }
  };

  Model.prototype.setSource = function (s) {
    var nx = this.nx, nz = this.nz, h = this.h, q = this.q, r2 = 2 * s.r * s.r;
    this.src = { x: s.x, z: s.z, q: s.q, r: s.r };
    for (var j = 0; j < nz; j++) {
      var dz = (j + 0.5) * h - s.z;
      for (var i = 0; i < nx; i++) {
        var dx = (i + 0.5) * h - s.x;
        q[j * nx + i] = s.q * Math.exp(-(dx * dx + dz * dz) / r2);
      }
    }
  };

  /* Red-black SOR sweeps. Returns the relative residual after the sweeps. */
  Model.prototype.sweep = function (sweeps, omega) {
    var nx = this.nx, nz = this.nz, T = this.T, aE = this.aE, aS = this.aS,
        diag = this.diag, rhs0 = this.rhs0, q = this.q;
    omega = omega || 1.86;
    for (var s = 0; s < sweeps; s++) {
      for (var color = 0; color < 2; color++) {
        for (var j = 0; j < nz; j++) {
          var row = j * nx;
          for (var i = (j + color) & 1; i < nx; i += 2) {
            var c = row + i, sum = rhs0[c] + q[c];
            if (i > 0) sum += aE[c - 1] * T[c - 1];
            if (i < nx - 1) sum += aE[c] * T[c + 1];
            if (j > 0) sum += aS[c - nx] * T[c - nx];
            if (j < nz - 1) sum += aS[c] * T[c + nx];
            T[c] += omega * (sum / diag[c] - T[c]);
          }
        }
      }
    }
    return this.residual();
  };

  /* ||A T - b||_2 / ||b||_2 */
  Model.prototype.residual = function () {
    var nx = this.nx, nz = this.nz, T = this.T, aE = this.aE, aS = this.aS,
        diag = this.diag, rhs0 = this.rhs0, q = this.q, rr = 0, bb = 0;
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var c = j * nx + i, b = rhs0[c] + q[c], sum = b - diag[c] * T[c];
      if (i > 0) sum += aE[c - 1] * T[c - 1];
      if (i < nx - 1) sum += aE[c] * T[c + 1];
      if (j > 0) sum += aS[c - nx] * T[c - nx];
      if (j < nz - 1) sum += aS[c] * T[c + nx];
      rr += sum * sum; bb += b * b;
    }
    return Math.sqrt(rr / bb);
  };

  /* Solve to tolerance. Returns {sweeps, residual, ms}. */
  Model.prototype.solve = function (tol, maxSweeps) {
    tol = tol || 1e-7; maxSweeps = maxSweeps || 4000;
    var t0 = now(), done = 0, res = this.residual();
    while (res > tol && done < maxSweeps) { res = this.sweep(8); done += 8; }
    return { sweeps: done, residual: res, ms: now() - t0 };
  };

  Model.prototype.surface = function (out) {
    out = out || new Float64Array(this.nx);
    // surface temperature from the Robin balance at the skin face
    var p = this.p, h = this.h;
    for (var i = 0; i < this.nx; i++) {
      var kk = this.k[i], Tc = this.T[i];
      out[i] = (p.hc * p.Tamb + (2 * kk / h) * Tc) / (p.hc + 2 * kk / h);
    }
    return out;
  };

  /* Global energy balance per metre of depth into the page (W/m). */
  Model.prototype.balance = function () {
    var nx = this.nx, nz = this.nz, h = this.h, p = this.p, T = this.T, A = h * h;
    var gen = 0, perf = 0, top = 0, bot = 0;
    for (var c = 0; c < this.n; c++) { gen += (this.q[c] + this.qm[c]) * A; perf += this.w[c] * CB * (p.Ta - T[c]) * A; }
    for (var i = 0; i < nx; i++) {
      top += this.aTop[i] * (p.Tamb - T[i]) * A;
      bot += this.aBot[i] * (p.Tcore - T[(nz - 1) * nx + i]) * A;
    }
    var net = gen + perf + top + bot, scale = Math.abs(gen) + Math.abs(perf) + Math.abs(top) + Math.abs(bot);
    return { generated: gen, perfusion: perf, surface: top, core: bot, error: Math.abs(net) / scale };
  };

  /* ---------- cell complex: regions (SLIC) + signed border fluxes ---------- */
  function Complex(model, cols, rows, iters) {
    cols = cols || 9; rows = rows || 4; iters = iters || 4;
    var nx = model.nx, nz = model.nz, n = model.n, T = model.T, K = cols * rows;
    var lo = Infinity, hi = -Infinity;
    for (var c = 0; c < n; c++) { if (T[c] < lo) lo = T[c]; if (T[c] > hi) hi = T[c]; }
    var S = Math.sqrt(n / K), wT = 2.6 * S, wL = 0.9 * S, span = (hi - lo) || 1;
    var fT = new Float32Array(n), fL = new Float32Array(n);
    for (c = 0; c < n; c++) { fT[c] = wT * (T[c] - lo) / span; fL[c] = wL * model.layer[c]; }
    var cx = new Float32Array(K), cz = new Float32Array(K), cT = new Float32Array(K), cL = new Float32Array(K);
    for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
      var id = r * cols + q, x = Math.min(nx - 1, Math.floor((q + 0.5) * nx / cols)), z = Math.min(nz - 1, Math.floor((r + 0.5) * nz / rows));
      cx[id] = x; cz[id] = z; cT[id] = fT[z * nx + x]; cL[id] = fL[z * nx + x];
    }
    var label = new Int16Array(n), dist = new Float32Array(n), R = Math.ceil(S * 1.6);
    for (var it = 0; it < iters; it++) {
      dist.fill(1e30);
      for (id = 0; id < K; id++) {
        var x0 = Math.max(0, Math.round(cx[id]) - R), x1 = Math.min(nx - 1, Math.round(cx[id]) + R);
        var z0 = Math.max(0, Math.round(cz[id]) - R), z1 = Math.min(nz - 1, Math.round(cz[id]) + R);
        for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
          c = z * nx + x;
          var dT = fT[c] - cT[id], dL = fL[c] - cL[id], dx = x - cx[id], dz = z - cz[id];
          var d = dT * dT + dL * dL + dx * dx + dz * dz;
          if (d < dist[c]) { dist[c] = d; label[c] = id; }
        }
      }
      var sx = new Float32Array(K), sz = new Float32Array(K), sT = new Float32Array(K), sL = new Float32Array(K), cnt = new Int32Array(K);
      for (c = 0; c < n; c++) { id = label[c]; sx[id] += c % nx; sz[id] += (c / nx) | 0; sT[id] += fT[c]; sL[id] += fL[c]; cnt[id]++; }
      for (id = 0; id < K; id++) if (cnt[id]) { cx[id] = sx[id] / cnt[id]; cz[id] = sz[id] / cnt[id]; cT[id] = sT[id] / cnt[id]; cL[id] = sL[id] / cnt[id]; }
    }
    this.model = model; this.K = K; this.label = label; this.cx = cx; this.cz = cz; this.count = cnt;
    this.fluxes();
  }

  /* Signed incidence in action: add face fluxes into borders, then borders into regions. */
  Complex.prototype.fluxes = function () {
    var m = this.model, nx = m.nx, nz = m.nz, h = m.h, T = m.T, lab = this.label, K = this.K, p = m.p;
    var h2 = h * h, borders = {}, list = [], frame = K;   // the frame is one extra cell outside the regions
    function add(a, b, f, x, z) {           // f > 0 means heat flows from a to b (W per metre)
      var lo = a < b ? a : b, hi = a < b ? b : a, key = lo * 1000 + hi, e = borders[key];
      if (!e) { e = borders[key] = { a: lo, b: hi, flux: 0, len: 0, x: 0, z: 0 }; list.push(e); }
      e.flux += a === lo ? f : -f; e.len++; e.x += x; e.z += z;
    }
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var c = j * nx + i;
      if (i < nx - 1 && lab[c] !== lab[c + 1]) add(lab[c], lab[c + 1], m.aE[c] * (T[c] - T[c + 1]) * h2, i + 1, j + 0.5);
      if (j < nz - 1 && lab[c] !== lab[c + nx]) add(lab[c], lab[c + nx], m.aS[c] * (T[c] - T[c + nx]) * h2, i + 0.5, j + 1);
    }
    for (i = 0; i < nx; i++) {
      add(lab[i], frame, m.aTop[i] * (T[i] - p.Tamb) * h2, i + 0.5, 0);
      var cb = (nz - 1) * nx + i;
      add(lab[cb], frame, m.aBot[i] * (T[cb] - p.Tcore) * h2, i + 0.5, nz);
    }
    // region balance: net flux out through borders must equal what the region generates
    var out = new Float64Array(K + 1), gen = new Float64Array(K + 1);
    for (var e = 0; e < list.length; e++) { var b = list[e]; b.x /= b.len; b.z /= b.len; out[b.a] += b.flux; out[b.b] -= b.flux; }
    for (c = 0; c < m.n; c++) gen[lab[c]] += (m.q[c] + m.qm[c] + m.w[c] * CB * (p.Ta - T[c])) * h2;
    var worst = 0, scale = 0;
    for (var r = 0; r < K; r++) { var a = Math.abs(out[r]) + Math.abs(gen[r]); if (a > scale) scale = a; }
    for (r = 0; r < K; r++) { var im = Math.abs(out[r] - gen[r]) / (scale || 1); if (im > worst) worst = im; }
    this.borders = list; this.out = out; this.gen = gen; this.imbalance = worst;
    var inner = 0; for (e = 0; e < list.length; e++) if (list[e].b !== frame) inner++;
    this.innerBorders = inner; this.frame = frame;
    return this;
  };

  /* ---------- inverse: recover the source from the surface profile ---------- */
  function Inverse(truth, opts) {
    opts = opts || {};
    this.sigma = opts.sigma || 0.05;                  // camera noise, K (50 mK)
    this.truth = truth;
    var obs = truth.surface(), rng = mulberry(opts.seed || 42);
    for (var i = 0; i < obs.length; i++) obs[i] += this.sigma * gauss(rng);
    this.obs = obs;
    var p = clone(truth.p);
    // start: under the warmest surface point, mid depth, half strength
    var best = 0; for (i = 1; i < obs.length; i++) if (obs[i] > obs[best]) best = i;
    this.theta = [ (best + 0.5) * p.h, 9.0e-3, Math.log(4.0e4) ];
    p.source = { x: this.theta[0], z: this.theta[1], q: Math.exp(this.theta[2]), r: truth.src.r };
    this.model = new Model(p);
    this.model.solve(1e-7);
    this.lambda = 1e-2; this.iter = 0; this.done = false;
    this.cost = this.costOf(this.model.surface());
    this.cov = null; this.history = [this.snapshot()];
  }
  Inverse.prototype.costOf = function (s) { var c = 0; for (var i = 0; i < s.length; i++) { var d = s[i] - this.obs[i]; c += d * d; } return c; };
  Inverse.prototype.forward = function (theta, warm) {
    var m = this.model;
    this.nsolves = (this.nsolves || 0) + 1;
    if (warm) m.T.set(warm);
    m.setSource({ x: theta[0], z: theta[1], q: Math.exp(theta[2]), r: this.truth.src.r });
    m.solve(1e-7, 1600);
    return m.surface();
  };
  Inverse.prototype.snapshot = function () {
    return { iter: this.iter, x: this.theta[0], z: this.theta[1], q: Math.exp(this.theta[2]), cost: this.cost, rms: Math.sqrt(this.cost / this.obs.length) };
  };
  /* One Levenberg-Marquardt step. Returns true while still improving. */
  Inverse.prototype.step = function () {
    if (this.done) return false;
    var th = this.theta, n = this.obs.length, base = this.forward(th), T0 = new Float64Array(this.model.T);
    var r = new Float64Array(n), J = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (var i = 0; i < n; i++) r[i] = base[i] - this.obs[i];
    var steps = [0.15e-3, 0.15e-3, 0.02];
    for (var a = 0; a < 3; a++) {
      var t2 = th.slice(); t2[a] += steps[a];
      var s = this.forward(t2, T0);
      for (i = 0; i < n; i++) J[a][i] = (s[i] - base[i]) / steps[a];
    }
    var A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) { var v = 0; for (i = 0; i < n; i++) v += J[a][i] * J[b][i]; A[a][b] = v; } var w = 0; for (i = 0; i < n; i++) w += J[a][i] * r[i]; g[a] = w; }
    this.JtJ = A;
    var improved = false;
    for (var tries = 0; tries < 6 && !improved; tries++) {
      var M = [[], [], []];
      for (a = 0; a < 3; a++) for (b = 0; b < 3; b++) M[a][b] = A[a][b] + (a === b ? this.lambda * A[a][a] : 0);
      var d = solve3(M, [-g[0], -g[1], -g[2]]);
      var cand = [th[0] + d[0], Math.min(18e-3, Math.max(2.4e-3, th[1] + d[1])), th[2] + d[2]];
      cand[0] = Math.min((this.model.nx - 4) * this.model.h, Math.max(4 * this.model.h, cand[0]));
      var c2 = this.costOf(this.forward(cand, T0));
      if (c2 < this.cost) {
        var rel = (this.cost - c2) / this.cost;
        this.theta = cand; this.cost = c2; this.lambda = Math.max(1e-6, this.lambda / 3); improved = true;
        if (rel < 1e-4) this.done = true;
      } else this.lambda *= 4;
    }
    this.iter++;
    if (!improved || this.iter >= 40) { this.done = true; this.forward(this.theta, T0); }
    if (this.done) this.finish();
    this.history.push(this.snapshot());
    return !this.done;
  };
  /* Linearised 95% intervals from the Gauss-Newton covariance, sigma^2 (J^T J)^-1. */
  Inverse.prototype.finish = function () {
    var inv = inv3(this.JtJ), s2 = this.sigma * this.sigma;
    this.cov = inv.map(function (row) { return row.map(function (v) { return v * s2; }); });
    this.ci = { x: 1.96 * Math.sqrt(this.cov[0][0]), z: 1.96 * Math.sqrt(this.cov[1][1]), logq: 1.96 * Math.sqrt(this.cov[2][2]) };
  };

  /* ---------- small helpers ---------- */
  function solve3(M, v) {
    var a = M.map(function (r, i) { return [r[0], r[1], r[2], v[i]]; });
    for (var c = 0; c < 3; c++) {
      var p = c; for (var r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      var t = a[c]; a[c] = a[p]; a[p] = t;
      for (r = c + 1; r < 3; r++) { var f = a[r][c] / a[c][c]; for (var k = c; k < 4; k++) a[r][k] -= f * a[c][k]; }
    }
    var x = [0, 0, 0];
    for (c = 2; c >= 0; c--) { var s = a[c][3]; for (k = c + 1; k < 3; k++) s -= a[c][k] * x[k]; x[c] = s / a[c][c]; }
    return x;
  }
  function inv3(M) { return [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { var e = [0, 0, 0]; e[j] = 1; return solve3(M, e)[i]; }); }); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(rng) { var u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  root.T42 = { defaults: defaults, Model: Model, Complex: Complex, Inverse: Inverse, CB: CB, clone: clone };
})(typeof window !== 'undefined' ? window : globalThis);
