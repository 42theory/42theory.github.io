/* 42theory landing page: statement reveal, section spy, reel control, contact form. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The statement: words darken as it scrolls into the middle of the screen. */
  var st = document.getElementById('statement');
  if (st && !reduce) {
    var words = st.textContent.trim().split(/\s+/);
    st.textContent = '';
    var spans = words.map(function (w, i) {
      var s = document.createElement('span'); s.className = 'w dim'; s.textContent = w;
      st.appendChild(s); if (i < words.length - 1) st.appendChild(document.createTextNode(' ')); return s;
    });
    var paint = function () {
      var r = st.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
      var n = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
      for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('dim', i >= n);
    };
    window.addEventListener('scroll', paint, { passive: true }); window.addEventListener('resize', paint); paint();
  }

  /* Which science section is on screen. */
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-spy]'));
  if ('IntersectionObserver' in window && links.length) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) current = e.target.id; });
      links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-spy') === current); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (a) { var t = document.getElementById(a.getAttribute('data-spy')); if (t) io.observe(t); });
  }

  /* The reel: plays muted; a button pauses it; reduced motion starts paused. */
  var reel = document.getElementById('reel'), btn = document.getElementById('reel-btn');
  if (reel && btn) {
    var set = function () { var paused = reel.paused; btn.textContent = paused ? 'Play' : 'Pause'; btn.setAttribute('aria-pressed', paused ? 'true' : 'false'); };
    if (reduce) { reel.removeAttribute('autoplay'); reel.pause(); }
    btn.addEventListener('click', function () { if (reel.paused) { var p = reel.play(); if (p && p.catch) p.catch(function () {}); } else reel.pause(); });
    reel.addEventListener('play', set); reel.addEventListener('pause', set); set();
  }

  /* Links that ask for the study prefill the message subject. */
  var subject = document.getElementById('f-subject'), msg = document.getElementById('f-message');
  Array.prototype.forEach.call(document.querySelectorAll('[data-topic]'), function (a) {
    a.addEventListener('click', function () {
      if (subject) subject.value = '42theory.com: ' + a.getAttribute('data-topic');
      if (msg && !msg.value) msg.value = 'I would like to read the Perimeter study.';
    });
  });

  /* Contact form: sends to hi@42theory.com through FormSubmit; without script it posts the normal way. */
  var form = document.getElementById('form'), status = document.getElementById('f-status'), send = document.getElementById('f-send');
  if (location.hash === '#sent' && status) { status.textContent = 'Sent. We will answer from hi@42theory.com.'; status.className = 'status m ok'; }
  if (!form || !window.fetch || !window.FormData) return;
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var bad = null;
    ['f-name', 'f-email', 'f-message'].forEach(function (id) {
      var el = document.getElementById(id), ok = el.value.trim() !== '' && (el.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
      el.setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok && !bad) bad = el;
    });
    if (bad) { status.textContent = bad.id === 'f-email' ? 'Enter an email address we can answer.' : 'Fill in your name, email and message.'; status.className = 'status m err'; bad.focus(); return; }
    var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
    if (data._honey) return;
    send.disabled = true; status.textContent = 'Sending.'; status.className = 'status m';
    fetch('https://formsubmit.co/ajax/hi@42theory.com', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        var ok = res.ok && String(res.j.success) === 'true';
        if (ok) { form.reset(); status.textContent = 'Sent. We will answer from hi@42theory.com.'; status.className = 'status m ok'; }
        else throw new Error((res.j && res.j.message) || 'not sent');
      })
      .catch(function () { status.innerHTML = 'Not sent. Write to <a href="mailto:hi@42theory.com">hi@42theory.com</a> instead.'; status.className = 'status m err'; })
      .then(function () { send.disabled = false; });
  });
})();
