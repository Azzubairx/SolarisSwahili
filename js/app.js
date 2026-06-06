/**
 * التوقيت السواحلي · Swiss Precision Edition
 * Vanilla ES2020. No build step.
 *
 * Modules: Config · Strings · Store · Dom · Errors · Loader
 *          Api · Sun · Theme · Render · Controls · App
 */
(() => {
  'use strict';

  /* ── Config ───────────────────────────────────────────────── */
  const Config = {
    CACHE_TTL: 6 * 60 * 60 * 1000,
    FETCH_TIMEOUT: 8000,
    FETCH_RETRIES: 1,
    STAR_COUNT: 140,
    STORAGE_VERSION: 'v1',
    DEFAULT_CITIES: {
      tobruk:   { name: 'طبرق',   lat: '32.0773', lng: '23.9600' },
      benghazi: { name: 'بنغازي', lat: '32.1167', lng: '20.0667' },
      tripoli:  { name: 'طرابلس', lat: '32.8892', lng: '13.1900' },
    },
  };

  /* ── Strings (i18n-ready) ─────────────────────────────────── */
  const Strings = {
    loadingInit:   'جاري التهيئة',
    loadingSolar:  'جلب بيانات الشمس',
    loadingPray:   'جلب مواقيت الصلاة',
    loadingDone:   'اكتمل',
    day:           'النهار',
    night:         'الليل',
    sunrise:       'الشروق',
    sunset:        'الغروب',
    fromDay:       'من النهار',
    fromNight:     'من الليل',
    eqDayNight:    'الاعتدال — يتساوى الليل والنهار',
    dayLonger:     'النهار أطول بـ',
    nightLonger:   'الليل أطول بـ',
    notFound:      'لم نجد المدينة. حاول بالإنجليزية.',
    network:       'تعذّر الاتصال بالشبكة.',
    addCity:       'إضافة',
    addCityBusy:   '··',
    prayers: { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
  };

  /* ── Store (versioned + TTL) ──────────────────────────────── */
  const Store = {
    k: (key) => `${Config.STORAGE_VERSION}:${key}`,
    get(key) {
      try {
        const raw = localStorage.getItem(Store.k(key));
        if (!raw) return null;
        const { t, d } = JSON.parse(raw);
        if (Date.now() - t > Config.CACHE_TTL) return null;
        return d;
      } catch { return null; }
    },
    set(key, d) {
      try { localStorage.setItem(Store.k(key), JSON.stringify({ t: Date.now(), d })); }
      catch { /* quota or disabled */ }
    },
    persist(key, d) {
      try { localStorage.setItem(Store.k(`p:${key}`), JSON.stringify(d)); } catch {}
    },
    recall(key) {
      try { const r = localStorage.getItem(Store.k(`p:${key}`)); return r ? JSON.parse(r) : null; }
      catch { return null; }
    },
  };

  /* ── Dom ──────────────────────────────────────────────────── */
  const $  = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ── State ────────────────────────────────────────────────── */
  const State = {
    cities: { ...Config.DEFAULT_CITIES },
    currentKey: null,
    solar: null,
    prayers: null,
    rafId: null,
    lastSecond: -1,
    manualTheme: Store.recall('manualTheme') || false,
    abortCtrl: null,
  };

  /* ── Errors ───────────────────────────────────────────────── */
  const Errors = {
    show(code, msg) {
      $('error-code').textContent = code;
      $('error-message').textContent = msg;
      $('error-overlay').hidden = false;
      Loader.hide();
    },
    hide() { $('error-overlay').hidden = true; },
  };

  /* ── Loader ───────────────────────────────────────────────── */
  const Loader = {
    show(text = Strings.loadingInit) { $('loader-text').textContent = text; $('loader').classList.remove('is-hidden'); },
    hide() { $('loader').classList.add('is-hidden'); },
    progress(pct, text) {
      $('loader-pct').textContent = String(Math.round(pct)).padStart(2, '0') + '%';
      if (text) $('loader-text').textContent = text;
    },
  };

  /* ── Fetch w/ timeout + retry ─────────────────────────────── */
  async function safeFetch(url, { signal } = {}) {
    let attempt = 0, lastErr;
    while (attempt <= Config.FETCH_RETRIES) {
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      signal && signal.addEventListener('abort', onAbort, { once: true });
      const to = setTimeout(() => ctrl.abort(), Config.FETCH_TIMEOUT);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        clearTimeout(to);
        lastErr = e;
        if (signal?.aborted) throw e;
        attempt += 1;
        if (attempt > Config.FETCH_RETRIES) break;
        await new Promise(r => setTimeout(r, 350 * attempt));
      } finally {
        signal && signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr || new Error('fetch failed');
  }

  /* ── Api ──────────────────────────────────────────────────── */
  const Api = {
    dateStr(offsetDays = 0) {
      return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA');
    },
    parseUTC(dateStr, timeStr, offset) {
      if (!timeStr) return 0;
      const [time, mod] = timeStr.split(' ');
      let [h, m, s] = time.split(':');
      let hours = parseInt(h, 10);
      if (hours === 12) hours = 0;
      if (mod === 'PM') hours += 12;
      const pad = (n) => String(n).padStart(2, '0');
      const iso = `${dateStr}T${pad(hours)}:${pad(m)}:${pad(s)}Z`;
      let offsetMins = (typeof offset === 'number' && Math.abs(offset) < 24) ? offset * 60 : parseInt(offset, 10);
      if (Number.isNaN(offsetMins)) offsetMins = 0;
      return new Date(iso).getTime() - offsetMins * 60000;
    },
    async solar(lat, lng, signal) {
      const ck = `solar:${lat}:${lng}:${Api.dateStr()}`;
      const cached = Store.get(ck);
      if (cached) return cached;
      Loader.progress(35, Strings.loadingSolar);
      const base = `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lng}`;
      const [y, t, m] = await Promise.all([
        safeFetch(`${base}&date=${Api.dateStr(-1)}`, { signal }),
        safeFetch(`${base}&date=${Api.dateStr(0)}`,  { signal }),
        safeFetch(`${base}&date=${Api.dateStr(1)}`,  { signal }),
      ]);
      if (t.status !== 'OK') throw new Error('SOLAR_API');
      const off = t.results.utc_offset;
      const offMins = (typeof off === 'number' && Math.abs(off) < 24) ? off * 60 : parseInt(off, 10) || 0;
      const out = {
        yesterdaySunset: Api.parseUTC(Api.dateStr(-1), y.results.sunset, off),
        todaySunrise:    Api.parseUTC(Api.dateStr(0),  t.results.sunrise, off),
        todaySunset:     Api.parseUTC(Api.dateStr(0),  t.results.sunset,  off),
        tomorrowSunrise: Api.parseUTC(Api.dateStr(1),  m.results.sunrise, off),
        todaySunriseStr: t.results.sunrise,
        todaySunsetStr:  t.results.sunset,
        utcOffsetMinutes: offMins,
      };
      Store.set(ck, out);
      return out;
    },
    async prayers(lat, lng, signal) {
      const ck = `prayers:${lat}:${lng}:${Api.dateStr()}`;
      const cached = Store.get(ck);
      if (cached) return cached;
      Loader.progress(70, Strings.loadingPray);
      const ts = Math.floor(Date.now() / 1000);
      const json = await safeFetch(`https://api.aladhan.com/v1/timings/${ts}?latitude=${lat}&longitude=${lng}&method=4`, { signal });
      if (json.code !== 200) throw new Error('PRAYERS_API');
      Store.set(ck, json.data.timings);
      return json.data.timings;
    },
    async geocode(q, signal) {
      const json = await safeFetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { signal }
      );
      if (!json.length) throw new Error('NOT_FOUND');
      return { name: json[0].display_name?.split(',')[0] || q, lat: json[0].lat, lng: json[0].lon };
    },
  };

  /* ── Sun (pure geometry/phase) ────────────────────────────── */
  const Sun = {
    phase(now, s) {
      if (now < s.todaySunrise) return { phase: Strings.night, start: s.yesterdaySunset, end: s.todaySunrise };
      if (now < s.todaySunset)  return { phase: Strings.day,   start: s.todaySunrise,    end: s.todaySunset };
      return { phase: Strings.night, start: s.todaySunset, end: s.tomorrowSunrise };
    },
    arcPoint(progress, cx = 500, cy = 300, r = 440) {
      const a = Math.PI - progress * Math.PI;
      return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
    },
  };

  /* ── Theme ────────────────────────────────────────────────── */
  const Theme = {
    pick(now, sunrise, sunset, isNight) {
      if (isNight) return 'night';
      const dS = Math.abs(now - sunrise), dT = Math.abs(now - sunset);
      if (dS < 45 * 60000 || dT < 45 * 60000) return 'golden';
      return 'day';
    },
    apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = theme === 'night' ? '#0A0A0A' : theme === 'golden' ? '#FBF6EC' : '#FAFAF7';
      const night = theme === 'night';
      $('sun-icon').hidden  = night;
      $('moon-icon').hidden = !night;
      $('theme-label').textContent = night ? 'NIGHT' : theme === 'golden' ? 'GOLDEN' : 'DAY';
    },
    setManual(isNight) {
      State.manualTheme = true;
      Store.persist('manualTheme', true);
      Theme.apply(isNight ? 'night' : 'day');
      $('theme-auto-reset').hidden = false;
    },
    clearManual() {
      State.manualTheme = false;
      Store.persist('manualTheme', false);
      $('theme-auto-reset').hidden = true;
    },
  };

  /* ── Stars + arc ticks (decorative one-offs) ──────────────── */
  function generateStars() {
    const layer = $('stars-layer');
    const bg = [];
    for (let i = 0; i < Config.STAR_COUNT; i++) {
      const x = Math.random() * 100, y = Math.random() * 100;
      const sz = Math.random() * 1.2 + 0.4;
      const op = Math.random() * 0.6 + 0.25;
      bg.push(`radial-gradient(${sz}px ${sz}px at ${x}% ${y}%, rgba(240,239,234,${op}), transparent 60%)`);
    }
    layer.style.backgroundImage = bg.join(',');
  }

  function drawArcTicks() {
    const g = $('arc-ticks');
    g.innerHTML = '';
    for (let i = 0; i <= 12; i++) {
      const p = i / 12;
      const outer = Sun.arcPoint(p, 500, 300, 440);
      const inner = Sun.arcPoint(p, 500, 300, 432);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', inner.x); ln.setAttribute('y1', inner.y);
      ln.setAttribute('x2', outer.x); ln.setAttribute('y2', outer.y);
      g.appendChild(ln);
    }
  }

  /* ── Render ───────────────────────────────────────────────── */
  const Render = {
    pad: (n) => String(n).padStart(2, '0'),
    fmtClock: (h, m, s) => `${Render.pad(h)}:${Render.pad(m)}:${Render.pad(s)}`,
    cleanTime(t) {
      const parts = t.split(':');
      return parts.length === 3 ? `${parts[0]}:${parts[1]} ${t.split(' ').pop()}` : t;
    },

    prayerMarkers(phase, startMs, endMs) {
      const c = $('prayer-markers');
      c.innerHTML = '';
      if (!State.prayers) return;
      const list = phase === Strings.day
        ? [{ k: 'Dhuhr', t: State.prayers.Dhuhr }, { k: 'Asr', t: State.prayers.Asr }]
        : [
            { k: 'Maghrib', t: State.prayers.Maghrib },
            { k: 'Isha',    t: State.prayers.Isha },
            { k: 'Fajr',    t: State.prayers.Fajr, tomorrow: true },
          ];
      list.forEach(p => {
        const dStr = Api.dateStr(p.tomorrow ? 1 : 0);
        const iso  = `${dStr}T${p.t}:00Z`;
        const off  = State.solar.utcOffsetMinutes;
        const ms   = new Date(iso).getTime() - off * 60000;
        if (ms <= startMs || ms >= endMs) return;
        const progress = (ms - startMs) / (endMs - startMs);
        const { x, y } = Sun.arcPoint(progress);
        const sq = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        sq.setAttribute('x', x - 4); sq.setAttribute('y', y - 4);
        sq.setAttribute('width', 8); sq.setAttribute('height', 8);
        sq.setAttribute('class', 'prayer-marker');
        sq.setAttribute('tabindex', '0');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `صلاة ${Strings.prayers[p.k]}`;
        sq.appendChild(title);
        $('prayer-markers').appendChild(sq);
      });
    },

    tick() {
      if (!State.solar) return;
      const now = Date.now();
      const sec = Math.floor(now / 1000);
      if (sec === State.lastSecond) { State.rafId = requestAnimationFrame(Render.tick); return; }
      State.lastSecond = sec;

      const s = State.solar;
      const { phase, start, end } = Sun.phase(now, s);
      const isNight = phase === Strings.night;

      // Theme
      if (!State.manualTheme) {
        Theme.apply(Theme.pick(now, s.todaySunrise, s.todaySunset, isNight));
      }

      // Celestial body
      $('sun-shape').hidden  = isNight;
      $('moon-shape').hidden = !isNight;

      // Relative time
      const dur = end - start;
      const progress = Math.max(0, Math.min(1, (now - start) / dur));
      const propMs = progress * (12 * 3600 * 1000);
      const pH = Math.floor(propMs / 3600000);
      const pM = Math.floor((propMs / 60000) % 60);
      const pS = Math.floor((propMs / 1000) % 60);

      $('hour-display').textContent   = Math.min(pH + 1, 12);
      $('phase-display').textContent  = isNight ? Strings.fromNight : Strings.fromDay;
      $('metric-display').textContent = Render.fmtClock(pH, pM, pS);

      // Countdown
      const nextMs = phase === Strings.day ? s.todaySunset : (now < s.todaySunrise ? s.todaySunrise : s.tomorrowSunrise);
      const diff = Math.max(0, nextMs - now);
      const cH = Math.floor(diff / 3600000);
      const cM = Math.floor((diff % 3600000) / 60000);
      const cS = Math.floor((diff % 60000) / 1000);
      $('next-event-name').textContent = phase === Strings.day ? Strings.sunset : Strings.sunrise;
      const cd = $('countdown-display');
      cd.textContent = Render.fmtClock(cH, cM, cS);
      cd.classList.toggle('is-urgent', diff > 0 && diff < 5 * 60000);

      // Standard local
      const ld = new Date(now + s.utcOffsetMinutes * 60000);
      $('standard-time').textContent = Render.fmtClock(ld.getUTCHours(), ld.getUTCMinutes(), ld.getUTCSeconds());

      // Arc
      const { x, y } = Sun.arcPoint(progress);
      $('progress-arc').setAttribute('stroke-dashoffset', 100 - progress * 100);
      $('celestial-body').setAttribute('transform', `translate(${x},${y})`);
      const nl = $('now-line');
      nl.setAttribute('x1', x); nl.setAttribute('x2', x);
      nl.setAttribute('y1', y); nl.setAttribute('y2', 300);

      State.rafId = requestAnimationFrame(Render.tick);
    },

    afterCityLoad() {
      const s = State.solar;
      $('sunrise-time').textContent = Render.cleanTime(s.todaySunriseStr);
      $('sunset-time').textContent  = Render.cleanTime(s.todaySunsetStr);

      try {
        $('hijri-date').textContent = new Intl.DateTimeFormat('ar-LY-u-ca-islamic-nu-latn', {
          day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date());
      } catch {
        $('hijri-date').textContent = new Date().toLocaleDateString('ar');
      }

      const dayL = s.todaySunset - s.todaySunrise;
      const nightL = 24 * 3600 * 1000 - dayL;
      const diff = Math.abs(dayL - nightL);
      const fmt = (ms) => `${Math.floor(ms / 3600000)} س ${Math.floor((ms % 3600000) / 60000)} د`;
      $('day-bar').style.width   = (dayL   / 86400000 * 100) + '%';
      $('night-bar').style.width = (nightL / 86400000 * 100) + '%';
      $('day-length-text').textContent   = fmt(dayL);
      $('night-length-text').textContent = fmt(nightL);
      $('comparison-text').textContent =
        diff < 5 * 60000 ? Strings.eqDayNight
        : dayL > nightL  ? `${Strings.dayLonger} ${fmt(diff)}`
        :                  `${Strings.nightLonger} ${fmt(diff)}`;

      const now = Date.now();
      const { phase, start, end } = Sun.phase(now, s);
      Render.prayerMarkers(phase, start, end);
    },
  };

  /* ── Controls ─────────────────────────────────────────────── */
  const Controls = {
    buildCityTabs() {
      const nav = $('city-selector');
      nav.innerHTML = '';
      Object.keys(State.cities).forEach(k => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'city-tab';
        b.textContent = State.cities[k].name;
        b.dataset.city = k;
        b.setAttribute('aria-label', `عرض توقيت ${State.cities[k].name}`);
        if (k === State.currentKey) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { if (State.currentKey !== k) App.loadCity(k); });
        nav.appendChild(b);
      });
    },
    bindForm() {
      const form = $('add-city-form');
      const input = $('smart-city-input');
      const btn = $('submit-btn');
      const err = $('form-error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const v = input.value.trim();
        if (!v) return;
        btn.disabled = true; btn.textContent = Strings.addCityBusy;
        try {
          const c = await Api.geocode(v);
          const k = `c_${Date.now()}`;
          State.cities[k] = c;
          input.value = '';
          App.loadCity(k);
        } catch (e2) {
          err.textContent = e2.message === 'NOT_FOUND' ? Strings.notFound : Strings.network;
        } finally {
          btn.disabled = false;
          btn.innerHTML = `${Strings.addCity} <span aria-hidden="true">←</span>`;
        }
      });
    },
    bindTheme() {
      $('theme-toggle').addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        Theme.setManual(cur !== 'night');
      });
      $('theme-auto-reset').addEventListener('click', () => {
        Theme.clearManual();
      });
    },
    bindRetry() {
      $('retry-btn').addEventListener('click', () => {
        Errors.hide();
        if (State.currentKey) App.loadCity(State.currentKey);
      });
    },
    bindParallax() {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      window.addEventListener('pointermove', (e) => {
        const x = (e.clientX / window.innerWidth  - 0.5) * 8;
        const y = (e.clientY / window.innerHeight - 0.5) * 8;
        $('stars-layer').style.transform = `translate(${x}px, ${y}px)`;
      }, { passive: true });
    },
  };

  /* ── App ──────────────────────────────────────────────────── */
  const App = {
    async loadCity(key) {
      if (State.rafId) cancelAnimationFrame(State.rafId);
      if (State.abortCtrl) State.abortCtrl.abort();
      State.abortCtrl = new AbortController();

      Errors.hide();
      Loader.show(Strings.loadingInit);
      Loader.progress(10);

      State.currentKey = key;
      const city = State.cities[key];
      $('city-name').textContent = city.name;
      Controls.buildCityTabs();

      try {
        const url = new URL(window.location.href);
        url.searchParams.set('city', city.name);
        history.replaceState(null, '', url.toString());
      } catch {}

      Store.persist('lastCity', { key, city });

      try {
        const [solar, prayers] = await Promise.all([
          Api.solar(city.lat, city.lng, State.abortCtrl.signal),
          Api.prayers(city.lat, city.lng, State.abortCtrl.signal),
        ]);
        State.solar = solar;
        State.prayers = prayers;
        Loader.progress(100, Strings.loadingDone);
        Render.afterCityLoad();
        Render.tick();
        Loader.hide();
        $('app-container').hidden = false;
        requestAnimationFrame(() => $('app-container').classList.add('is-ready'));
      } catch (e) {
        if (e?.name === 'AbortError') return;
        const code =
          /SOLAR/.test(e.message)   ? 'E_SOLAR'   :
          /PRAYERS/.test(e.message) ? 'E_PRAYERS' : 'E_NETWORK';
        Errors.show(code, Strings.network);
      }
    },

    init() {
      drawArcTicks();
      generateStars();
      Controls.buildCityTabs();
      Controls.bindForm();
      Controls.bindTheme();
      Controls.bindRetry();
      Controls.bindParallax();

      // Initial theme guess
      Theme.apply(State.manualTheme ? (document.documentElement.getAttribute('data-theme') || 'day') : 'day');
      if (State.manualTheme) $('theme-auto-reset').hidden = false;

      // Determine start city
      const params = new URLSearchParams(location.search);
      const cityParam = params.get('city');
      let startKey = 'tobruk';
      const last = Store.recall('lastCity');
      if (last?.key && State.cities[last.key]) startKey = last.key;

      if (cityParam) {
        const found = Object.keys(State.cities).find(
          k => State.cities[k].name.toLowerCase() === cityParam.toLowerCase()
        );
        if (found) {
          App.loadCity(found);
        } else {
          $('smart-city-input').value = cityParam;
          $('add-city-form').dispatchEvent(new Event('submit'));
        }
        return;
      }
      App.loadCity(startKey);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init);
  } else {
    App.init();
  }
})();
