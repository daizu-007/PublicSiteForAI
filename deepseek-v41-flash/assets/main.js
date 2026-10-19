/* ============================================================
   DeepSeek-V4.1-Flash-1017
   Vanilla JS. No dependencies, no build step.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { return t * t * (3 - 2 * t); };

  /* ---------- shared rAF loop ------------------------------ */
  var tickers = new Set();
  var rafId = null;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    var t = now / 1000;
    tickers.forEach(function (fn) { fn(t); });
  }
  function startLoop() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function syncLoop() {
    if (tickers.size && !document.hidden) startLoop(); else stopLoop();
  }
  document.addEventListener('visibilitychange', syncLoop);

  /* ---------- 1. nav, progress, closing numeral ------------ */
  function initChrome() {
    var nav = $('[data-nav]');
    var bar = $('[data-progress]');
    var fin = $('[data-fin]');
    var queued = false;

    function update() {
      queued = false;
      var y = window.pageYOffset || root.scrollTop;
      if (nav) nav.classList.toggle('is-stuck', y > 24);

      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = 'scaleX(' + (max > 8 ? clamp(y / max, 0, 1) : 0) + ')';

      if (fin) {
        var r = fin.getBoundingClientRect();
        var p = clamp((window.innerHeight * 0.95 - r.top) / (window.innerHeight * 0.7), 0, 1);
        fin.style.setProperty('--p', p.toFixed(3));
      }
    }
    function onScroll() {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', onScroll);
    update();
  }

  /* ---------- 2. mobile menu ------------------------------- */
  function initMenu() {
    var burger = $('[data-burger]');
    var menu = $('[data-menu]');
    if (!burger || !menu) return;
    var open = false;

    function set(v) {
      if (v === open) return;
      open = v;
      burger.setAttribute('aria-expanded', String(v));
      burger.setAttribute('aria-label', v ? 'メニューを閉じる' : 'メニューを開く');
      menu.setAttribute('aria-hidden', String(!v));
      menu.classList.toggle('is-open', v);
      root.classList.toggle('is-menu', v);
      document.body.style.overflow = v ? 'hidden' : '';
      if ('inert' in menu) menu.inert = !v;
      if (v) {
        var first = menu.querySelector('a');
        if (first) window.setTimeout(function () { first.focus({ preventScroll: true }); }, 70);
      } else if (document.activeElement && menu.contains(document.activeElement)) {
        burger.focus({ preventScroll: true });
      }
    }

    burger.addEventListener('click', function () { set(!open); });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) set(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') set(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) set(false);
    });

    if ('inert' in menu) menu.inert = true;
  }

  /* ---------- 3. reveal ------------------------------------ */
  function initReveal() {
    var els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduce) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    /* Scroll-driven rather than IntersectionObserver: 28 nodes is nothing,
       and this cannot be starved by a paused compositor. */
    var pending = els;
    var queued = false;

    function check() {
      queued = false;
      var vh = window.innerHeight || root.clientHeight;
      var keep = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.94 && r.bottom > -24) el.classList.add('is-in');
        else keep.push(el);
      }
      pending = keep;
    }
    function onScroll() {
      if (!queued && pending.length) { queued = true; requestAnimationFrame(check); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('load', onScroll);
    requestAnimationFrame(check);
    window.setTimeout(check, 150);
  }

  /* ---------- 4. hero light field (WebGL) ------------------ */
  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform vec2 u_mouse;',

    'float hash(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  mat2 m = mat2(0.80, 0.60, -0.60, 0.80);',
    '  for (int i = 0; i < 4; i++){',
    '    v += a * vnoise(p);',
    '    p = m * p * 2.03;',
    '    a *= 0.52;',
    '  }',
    '  return v;',
    '}',

    'void main(){',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;',
    '  float t = u_time * 0.032;',

    '  vec2 p = uv * vec2(1.06, 1.72);',
    '  p.x += 0.20 * sin(p.y * 1.30 + t * 1.7);',
    '  p += u_mouse * 0.26;',

    '  vec2 q = vec2(',
    '    fbm(p + vec2(0.0, t)),',
    '    fbm(p + vec2(5.2, 1.3) - t * 0.8)',
    '  );',
    '  float f = fbm(p + q * 1.9);',

    '  float core = exp(-length((uv - vec2(0.41, -0.17)) * vec2(0.80, 1.05)) * 2.00);',
    '  float halo = exp(-length(uv - vec2(0.34, 0.00)) * 1.12);',
    '  float silk = pow(clamp((f - 0.375) * 2.5, 0.0, 1.0), 1.45);',

    '  float light = silk * (0.52 + 0.84 * core) + core * 0.44 + halo * 0.08;',
    '  light = clamp(light, 0.0, 1.25);',

    '  vec3 deep  = vec3(0.026, 0.024, 0.029);',
    '  vec3 cool  = vec3(0.012, 0.016, 0.030);',
    '  vec3 amber = vec3(1.000, 0.598, 0.198);',
    '  vec3 gold  = vec3(1.000, 0.858, 0.640);',

    '  vec3 col = deep + cool * (1.0 - silk);',
    '  col += amber * light * 0.50;',
    '  col += gold * pow(silk, 2.2) * core * 0.32;',

    '  float d = length(uv * vec2(0.66, 1.0));',
    '  col *= smoothstep(1.60, 0.15, d) * 0.86 + 0.14;',
    '  col *= 0.34 + 0.66 * smoothstep(-1.05, -0.22, uv.x);',

    '  float g = hash(gl_FragCoord.xy + fract(u_time) * 41.0) - 0.5;',
    '  col += g * 0.026;',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function initField() {
    var canvas = $('[data-field]');
    if (!canvas) return;

    var gl = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false
      }) || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { canvas.style.display = 'none'; return; }

    function makeShader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    var vs = makeShader(gl.VERTEX_SHADER, VERT);
    var fs = makeShader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.style.display = 'none'; return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uTime = gl.getUniformLocation(prog, 'u_time');
    var uMouse = gl.getUniformLocation(prog, 'u_mouse');

    var mx = 0, my = 0, tmx = 0, tmy = 0;
    var visible = true;
    var lost = false;

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      lost = true;
      canvas.style.display = 'none';
      tickers.delete(frame);
      syncLoop();
    });

    function size() {
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      if (!w || !h) return false;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      var scale = 0.72;
      var bw = Math.max(2, Math.min(2400, Math.round(w * dpr * scale)));
      var bh = Math.max(2, Math.min(1600, Math.round(h * dpr * scale)));
      if (canvas.width === bw && canvas.height === bh) return true;
      canvas.width = bw;
      canvas.height = bh;
      gl.viewport(0, 0, bw, bh);
      gl.uniform2f(uRes, bw, bh);
      return true;
    }

    function render(t) {
      if (lost) return;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function frame(t) {
      mx += (tmx - mx) * 0.045;
      my += (tmy - my) * 0.045;
      render(t);
    }

    function sync() {
      if (!reduce && visible && !lost && !document.hidden) tickers.add(frame);
      else { tickers.delete(frame); if (!lost) render(11.0); }
      syncLoop();
    }

    window.addEventListener('pointermove', function (e) {
      tmx = (e.clientX / window.innerWidth - 0.5) * 1.6;
      tmy = (0.5 - e.clientY / window.innerHeight) * 1.2;
    }, { passive: true });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        if (size() && !tickers.has(frame)) render(11.0);
      }).observe(canvas);
    } else {
      window.addEventListener('resize', function () {
        if (size() && !tickers.has(frame)) render(11.0);
      });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(canvas);
    }

    size();
    sync();
    render(0);
  }

  /* ---------- 5. lens instrument (2D) ---------------------- */
  function initLens() {
    var box = $('[data-lens]');
    if (!box) return;
    var canvas = $('[data-lens-canvas]', box);
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var range = $('[data-ctx]', box);
    var out = $('[data-out="tokens"]', box);
    if (!canvas || !ctx || !range) return;

    var W = 0, H = 0;
    var target = parseFloat(range.value) || 0;   /* slider position 0..100 */
    var value = target;                          /* eased */
    var ptr = 0.5, tptr = 0.5;
    var visible = false;

    var X_ENC = 0.395, X_ENC2 = 0.432, X_DEC = 0.652, X_DEC2 = 0.688;
    var N = 46;

    var strands = [];
    for (var i = 0; i < N; i++) {
      strands.push({
        u: (i / (N - 1)) * 2 - 1,
        j: Math.random() * Math.PI * 2,
        s: 0.22 + Math.random() * 0.5,
        w: Math.random() < 0.16 ? 1.35 : 0.75
      });
    }

    function size() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function envelope(x, wide) {
      if (x <= X_ENC) return lerp(wide, 0.018, smooth(x / X_ENC));
      if (x <= X_DEC) return lerp(0.018, 0.014, (x - X_ENC) / (X_DEC - X_ENC));
      return lerp(0.014, 0.40, smooth((x - X_DEC) / (1 - X_DEC)));
    }

    function yAt(x, u, j, s, t, wide, cy) {
      var env = envelope(x, wide);
      var wob = Math.sin(x * 7.2 + t * s + j) * 0.0045 +
                Math.sin(x * 2.9 - t * s * 0.62 + j * 0.5) * 0.0032;
      return cy + H * (env * u + wob) * (1 - 0.16 * Math.sin(x * Math.PI));
    }

    function stroke(stride, offset, width, alpha, t, wide, cy) {
      var g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0.00, 'rgba(255,176,58,0)');
      g.addColorStop(0.05, 'rgba(255,184,84,' + (alpha * 0.55) + ')');
      g.addColorStop(0.30, 'rgba(255,196,116,' + (alpha * 0.95) + ')');
      g.addColorStop(0.55, 'rgba(255,206,146,' + alpha + ')');
      g.addColorStop(0.80, 'rgba(255,190,104,' + (alpha * 0.75) + ')');
      g.addColorStop(1.00, 'rgba(255,160,50,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (var k = offset; k < N; k += stride) {
        var st = strands[k];
        for (var n = 0; n <= 56; n++) {
          var x = n / 56;
          var y = yAt(x, st.u, st.j, st.s, t, wide, cy);
          if (n === 0) ctx.moveTo(x * W, y); else ctx.lineTo(x * W, y);
        }
      }
      ctx.stroke();
    }

    function bloom(x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,207,154,' + a + ')');
      g.addColorStop(0.45, 'rgba(255,178,70,' + (a * 0.32) + ')');
      g.addColorStop(1, 'rgba(255,160,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function element(x, halfH, strength, cy) {
      var vg = ctx.createLinearGradient(0, cy - halfH, 0, cy + halfH);
      vg.addColorStop(0.00, 'rgba(255,190,120,0)');
      vg.addColorStop(0.50, 'rgba(255,216,166,' + (0.85 * strength) + ')');
      vg.addColorStop(1.00, 'rgba(255,190,120,0)');

      ctx.strokeStyle = 'rgba(255,176,58,' + (0.10 * strength) + ')';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, cy - halfH);
      ctx.lineTo(x, cy + halfH);
      ctx.stroke();

      ctx.strokeStyle = vg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, cy - halfH);
      ctx.lineTo(x, cy + halfH);
      ctx.stroke();
    }

    function draw(t) {
      if (!W || !H) return;
      value += (target - value) * 0.12;

      var wide = lerp(0.145, 0.40, smooth(value / 100));
      var cy = H * 0.5 + (ptr - 0.5) * H * 0.05;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      /* ticks along the optical axis */
      ctx.strokeStyle = 'rgba(237,232,223,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= 32; i++) {
        var tx = Math.round((i / 32) * W) + 0.5;
        var th = i % 4 === 0 ? 6 : 3;
        ctx.moveTo(tx, H - 1.5);
        ctx.lineTo(tx, H - 1.5 - th);
      }
      ctx.stroke();

      stroke(1, 0, 0.65, 0.065, t, wide, cy);
      stroke(2, 0, 1.0, 0.095, t, wide, cy);
      stroke(7, 3, 1.3, 0.185, t, wide, cy);

      bloom(X_ENC * W, cy, H * 0.17, 0.10);
      bloom(X_DEC * W, cy, H * 0.23, 0.07);

      element(X_ENC * W, H * 0.30, 1.0, cy);
      element(X_ENC2 * W, H * 0.30, 0.45, cy);
      element(X_DEC * W, H * 0.215, 0.9, cy);
      element(X_DEC2 * W, H * 0.215, 0.4, cy);

      /* travelling pulse */
      var px = ((t * 0.135) % 1.35) - 0.12;
      if (px > 0 && px < 1) {
        var a = 0.5 * smooth(clamp(px / 0.12, 0, 1)) *
                (1 - smooth(clamp((px - 0.72) / 0.28, 0, 1)));
        for (var q = 0; q < N; q += 3) {
          var st = strands[q];
          var py = yAt(px, st.u, st.j, st.s, t, wide, cy);
          var rg = ctx.createRadialGradient(px * W, py, 0, px * W, py, 9);
          rg.addColorStop(0, 'rgba(255,228,190,' + a + ')');
          rg.addColorStop(1, 'rgba(255,176,58,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(px * W, py, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(t) {
      ptr += (tptr - ptr) * 0.06;
      draw(t);
    }

    function sync() {
      if (!reduce && visible && !document.hidden) tickers.add(frame);
      else { tickers.delete(frame); draw(performance.now() / 1000); }
      syncLoop();
    }

    function onInput() {
      target = parseFloat(range.value);
      range.style.setProperty('--fill', target + '%');
      if (out) {
        var n = Math.round(8000 * Math.pow(128, target / 100));
        out.textContent = n.toLocaleString('en-US');
      }
    }

    range.addEventListener('input', onInput);
    onInput();

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      tptr = clamp((e.clientY - r.top) / r.height, 0, 1);
    }, { passive: true });
    canvas.addEventListener('pointerleave', function () { tptr = 0.5; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(canvas);
    } else {
      visible = true;
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        size();
        if (!tickers.has(frame)) draw(performance.now() / 1000);
      }).observe(canvas);
    } else {
      window.addEventListener('resize', function () {
        size();
        if (!tickers.has(frame)) draw(performance.now() / 1000);
      });
    }

    size();
    sync();
    draw(0);
  }

  /* ---------- 6. code tabs + copy -------------------------- */
  function initCode() {
    var tabs = $$('[data-tab]');
    var copy = $('[data-copy]');
    if (!tabs.length) return;

    function select(key) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-tab') === key;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById('p-' + key);
        if (panel) panel.hidden = !on;
      });
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t.getAttribute('data-tab')); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus();
        select(next.getAttribute('data-tab'));
      });
    });

    function legacy(panel, done) {
      try {
        var r = document.createRange();
        r.selectNodeContents(panel);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('copy');
        sel.removeAllRanges();
        done();
      } catch (e) { /* ignore */ }
    }

    if (copy) {
      copy.addEventListener('click', function () {
        var panel = tabs.map(function (t) { return document.getElementById('p-' + t.getAttribute('data-tab')); })
          .filter(function (p) { return p && !p.hidden; })[0];
        if (!panel) return;
        var text = panel.textContent.replace(/\u00a0/g, ' ');
        var done = function () {
          copy.textContent = 'Copied';
          copy.classList.add('is-done');
          window.setTimeout(function () {
            copy.textContent = 'Copy';
            copy.classList.remove('is-done');
          }, 1800);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { legacy(panel, done); });
        } else {
          legacy(panel, done);
        }
      });
    }
  }

  /* ---------- boot ----------------------------------------- */
  function boot() {
    try { initChrome(); } catch (e) {}
    try { initMenu(); } catch (e) {}
    try { initReveal(); } catch (e) {}
    try { initField(); } catch (e) {}
    try { initLens(); } catch (e) {}
    try { initCode(); } catch (e) {}
    syncLoop();
    window.__dshReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
