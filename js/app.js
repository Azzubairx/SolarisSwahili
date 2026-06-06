/**
 * تطبيق التوقيت السواحلي - هندسة برمجية (Modular Pattern)
 * نسخة مصححة بالكامل خالية من أخطاء الـ Type Cast
 */
const App = (() => {
    // --- 1. الإعدادات والحالة (State & Config) ---
    const CONFIG = {
        CACHE_TTL: 6 * 60 * 60 * 1000, // 6 ساعات
        DEFAULT_CITIES: {
            tobruk: { name: "طبرق", lat: "32.0773", lng: "23.9600" },
            benghazi: { name: "بنغازي", lat: "32.1167", lng: "20.0667" },
            tripoli: { name: "طرابلس", lat: "32.8892", lng: "13.1900" }
        }
    };

    const State = {
        cities: { ...CONFIG.DEFAULT_CITIES },
        currentCityKey: null,
        solarBounds: null,
        prayerTimes: null,
        clockInterval: null,
        manualThemeOverride: false
    };

    // --- 2. إدارة عناصر الواجهة (DOM Elements) ---
    const UI = {
        loader: document.getElementById('loader'),
        loaderText: document.getElementById('loader-text'),
        errorOverlay: document.getElementById('error-overlay'),
        errorMsg: document.getElementById('error-message'),
        appContainer: document.getElementById('app-container'),
        citySelector: document.getElementById('city-selector'),
        
        // الأرقام والنصوص
        cityName: document.getElementById('city-name'),
        hijriDate: document.getElementById('hijri-date'),
        hourDisplay: document.getElementById('hour-display'),
        phaseDisplay: document.getElementById('phase-display'),
        metricDisplay: document.getElementById('metric-display'),
        countdownDisplay: document.getElementById('countdown-display'),
        nextEventName: document.getElementById('next-event-name'),
        
        // SVG
        progressArc: document.getElementById('progress-arc'),
        celestialBody: document.getElementById('celestial-body'),
        sunShape: document.getElementById('sun-shape'),
        moonShape: document.getElementById('moon-shape'),
        prayerMarkersContainer: document.getElementById('prayer-markers'),
        
        // المقارنة والثيمات
        themeToggle: document.getElementById('theme-toggle'),
        themeReset: document.getElementById('theme-auto-reset'),
        sunIcon: document.getElementById('sun-icon'),
        moonIcon: document.getElementById('moon-icon'),
        starsLayer: document.getElementById('stars-layer'),
        
        // مساعدة
        formatMetric: (h, m, s) => [h, m, s].map(n => n.toString().padStart(2, '0')).join(':'),
        
        cleanTime: (t) => {
            const parts = t.split(':');
            return parts.length === 3 ? `${parts[0]}:${parts[1]} ${t.split(' ').pop()}` : t;
        },

        showError: (msg) => {
            UI.errorMsg.textContent = msg;
            UI.errorOverlay.classList.remove('hidden');
            setTimeout(() => UI.errorOverlay.classList.remove('opacity-0', 'pointer-events-none'), 10);
            UI.loader.classList.add('opacity-0', 'pointer-events-none');
        },
        
        hideError: () => {
            UI.errorOverlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => UI.errorOverlay.classList.add('hidden'), 500);
        },

        generateStars: () => {
            const gradients = [];
            for(let i=0; i<120; i++) {
                const x = Math.random() * 100, y = Math.random() * 100;
                const size = Math.random() * 1.5 + 0.5, op = Math.random() * 0.7 + 0.3;
                gradients.push(`radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(255,255,255,${op}), transparent)`);
            }
            UI.starsLayer.style.backgroundImage = gradients.join(',');
        }
    };

    // --- 3. إدارة التخزين المؤقت (Caching) ---
    const Storage = {
        get: (key) => {
            const cached = localStorage.getItem(key);
            if (!cached) return null;
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp > CONFIG.CACHE_TTL) return null;
            return parsed.data;
        },
        set: (key, data) => localStorage.setItem(key, JSON.stringify({timestamp: Date.now(), data}))
    };

    // --- 4. واجهات برمجة التطبيقات (API Module) ---
    const API = {
        getDateString: (offsetDays = 0) => {
            return new Date(Date.now() + (offsetDays * 86400000)).toLocaleDateString('en-CA');
        },

        // تم إصلاح الدالة وتأمين عمليات الـ Padding بشكل كامل لمنع الأخطاء
        parseAbsoluteUTC: (dateStr, timeStr, offset) => {
            if (!timeStr) return 0;
            const [time, modifier] = timeStr.split(' ');
            let [h, m, s] = time.split(':');
            
            let hours = parseInt(h, 10);
            if (hours === 12) hours = 0;
            if (modifier === 'PM') hours += 12;
            
            const pad = (n) => n.toString().padStart(2, '0');
            const iso = `${dateStr}T${pad(hours)}:${pad(m)}:${pad(s)}Z`;
            
            let offsetMins = (typeof offset === 'number' && offset < 24) ? offset * 60 : parseInt(offset);
            if(isNaN(offsetMins)) offsetMins = 0;

            return new Date(iso).getTime() - (offsetMins * 60000);
        },

        fetchSolar: async (lat, lng) => {
            const cacheKey = `solar_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;

            UI.loaderText.textContent = "جاري جلب بيانات الشمس...";
            const base = `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lng}`;
            const [yRes, tRes, tmRes] = await Promise.all([
                fetch(`${base}&date=${API.getDateString(-1)}`).then(r => r.json()),
                fetch(`${base}&date=${API.getDateString(0)}`).then(r => r.json()),
                fetch(`${base}&date=${API.getDateString(1)}`).then(r => r.json())
            ]);

            if (tRes.status !== "OK") throw new Error("API الشمس لا يستجيب");

            const offset = tRes.results.utc_offset;
            const data = {
                yesterdaySunset: API.parseAbsoluteUTC(API.getDateString(-1), yRes.results.sunset, offset),
                todaySunrise: API.parseAbsoluteUTC(API.getDateString(0), tRes.results.sunrise, offset),
                todaySunset: API.parseAbsoluteUTC(API.getDateString(0), tRes.results.sunset, offset),
                tomorrowSunrise: API.parseAbsoluteUTC(API.getDateString(1), tmRes.results.sunrise, offset),
                todaySunriseStr: tRes.results.sunrise,
                todaySunsetStr: tRes.results.sunset,
                utcOffsetMinutes: (typeof offset === 'number' && offset < 24) ? offset * 60 : parseInt(offset)
            };
            Storage.set(cacheKey, data);
            return data;
        },

        fetchPrayers: async (lat, lng) => {
            const cacheKey = `prayers_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;

            UI.loaderText.textContent = "جاري جلب مواقيت الصلاة...";
            const timestamp = Math.floor(Date.now() / 1000);
            const res = await fetch(`https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=4`);
            const json = await res.json();
            if (json.code !== 200) throw new Error("API الصلاة لا يستجيب");
            
            Storage.set(cacheKey, json.data.timings);
            return json.data.timings;
        }
    };

    // --- 5. المحرك الأساسي (Core Logic) ---
    const Core = {
        getPrayerUTC: (timeStr, isTomorrow = false) => {
            const offset = State.solarBounds.utcOffsetMinutes;
            const dStr = API.getDateString(isTomorrow ? 1 : 0);
            const iso = `${dStr}T${timeStr}:00Z`;
            return new Date(iso).getTime() - (offset * 60000);
        },

        drawPrayerMarkers: (phase, startMs, endMs) => {
            UI.prayerMarkersContainer.innerHTML = '';
            if (!State.prayerTimes) return;

            const prayers = phase === 'النهار' 
                ? [{name: 'الظهر', time: State.prayerTimes.Dhuhr}, {name: 'العصر', time: State.prayerTimes.Asr}]
                : [{name: 'المغرب', time: State.prayerTimes.Maghrib}, {name: 'العشاء', time: State.prayerTimes.Isha}, {name: 'الفجر', time: State.prayerTimes.Fajr, tomorrow: true}];

            prayers.forEach(p => {
                const pTime = Core.getPrayerUTC(p.time, p.tomorrow);
                if (pTime > startMs && pTime < endMs) {
                    const progress = (pTime - startMs) / (endMs - startMs);
                    const angle = Math.PI - (progress * Math.PI);
                    const cx = 150 + 130 * Math.cos(angle);
                    const cy = 140 - 130 * Math.sin(angle); 
                    
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
                    circle.setAttribute('r', '4'); circle.setAttribute('class', 'prayer-marker');
                    
                    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    title.textContent = `صلاة ${p.name}`;
                    circle.appendChild(title);
                    
                    UI.prayerMarkersContainer.appendChild(circle);
                }
            });
        },

        updateClock: () => {
            if (!State.solarBounds) return;
            const now = Date.now();
            const { yesterdaySunset, todaySunrise, todaySunset, tomorrowSunrise, utcOffsetMinutes } = State.solarBounds;
            
            let phase, startMs, endMs;
            if (now < todaySunrise) {
                phase = 'الليل'; startMs = yesterdaySunset; endMs = todaySunrise;
            } else if (now >= todaySunrise && now < todaySunset) {
                phase = 'النهار'; startMs = todaySunrise; endMs = todaySunset;
            } else {
                phase = 'الليل'; startMs = todaySunset; endMs = tomorrowSunrise;
            }

            // الثيمات
            if (!State.manualThemeOverride) {
                let theme = 'theme-day';
                const distSunrise = Math.abs(now - todaySunrise);
                const distSunset = Math.abs(now - todaySunset);
                
                if (phase === 'الليل') theme = 'theme-night';
                else if (distSunrise < 45*60000 || distSunset < 45*60000) theme = 'theme-golden';

                document.body.classList.remove('theme-night', 'theme-golden');
                if (theme !== 'theme-day') document.body.classList.add(theme);

                if (phase === 'الليل') {
                    UI.sunIcon.classList.add('hidden'); UI.moonIcon.classList.remove('hidden');
                    UI.starsLayer.style.opacity = '1';
                } else {
                    UI.sunIcon.classList.remove('hidden'); UI.moonIcon.classList.add('hidden');
                    UI.starsLayer.style.opacity = '0';
                }
            }

            // المؤشر السماوي
            UI.sunShape.style.opacity = phase === 'الليل' ? '0' : '1';
            UI.moonShape.style.opacity = phase === 'الليل' ? '1' : '0';

            // الحسابات النسبية
            const duration = endMs - startMs;
            const progress = Math.max(0, Math.min(1, (now - startMs) / duration));
            const propElapsedMs = progress * (12 * 3600 * 1000);
            
            const pS = Math.floor((propElapsedMs / 1000) % 60);
            const pM = Math.floor((propElapsedMs / 60000) % 60);
            const pH = Math.floor(propElapsedMs / 3600000);

            UI.hourDisplay.textContent = Math.min(pH + 1, 12);
            UI.phaseDisplay.textContent = `من ${phase}`;
            UI.metricDisplay.textContent = UI.formatMetric(pH, pM, pS);

            // حساب المتبقي للحدث القادم
            const nextEventMs = phase === 'النهار' ? todaySunset : (now < todaySunrise ? todaySunrise : tomorrowSunrise);
            const diffMs = nextEventMs - now;
            UI.nextEventName.textContent = phase === 'النهار' ? 'الغروب' : 'الشروق';
            UI.countdownDisplay.textContent = UI.formatMetric(Math.floor(diffMs/3600000), Math.floor((diffMs%3600000)/60000), Math.floor((diffMs%60000)/1000));

            // التوقيت المحلي الفعلي
            const localDate = new Date(now + (utcOffsetMinutes * 60000));
            document.getElementById('standard-time').textContent = UI.formatMetric(localDate.getUTCHours(), localDate.getUTCMinutes(), localDate.getUTCSeconds());

            // القوس (Sweep-flag is 0)
            const angle = Math.PI - (progress * Math.PI);
            const cx = 150 + 130 * Math.cos(angle);
            const cy = 140 - 130 * Math.sin(angle);

            UI.progressArc.setAttribute('stroke-dashoffset', 100 - (progress * 100));
            UI.celestialBody.setAttribute('transform', `translate(${cx}, ${cy})`);
        },

        initCity: async (key) => {
            if (State.clockInterval) clearInterval(State.clockInterval);
            UI.hideError();
            UI.loader.classList.remove('opacity-0', 'pointer-events-none');
            UI.appContainer.classList.remove('opacity-100');
            
            State.currentCityKey = key;
            const city = State.cities[key];

            document.querySelectorAll('.city-btn').forEach(b => b.classList.toggle('active', b.dataset.city === key));
            window.history.replaceState(null, '', `?city=${encodeURIComponent(city.name)}`);

            UI.cityName.textContent = city.name;

            try {
                const [solar, prayers] = await Promise.all([
                    API.fetchSolar(city.lat, city.lng),
                    API.fetchPrayers(city.lat, city.lng)
                ]);

                State.solarBounds = solar;
                State.prayerTimes = prayers;

                document.getElementById('sunrise-time').textContent = UI.cleanTime(solar.todaySunriseStr);
                document.getElementById('sunset-time').textContent = UI.cleanTime(solar.todaySunsetStr);
                
                UI.hijriDate.textContent = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date());

                const dayL = solar.todaySunset - solar.todaySunrise;
                const nightL = (24*3600*1000) - dayL;
                const diffL = Math.abs(dayL - nightL);
                
                document.getElementById('day-bar').style.width = `${(dayL/(24*3600*1000))*100}%`;
                document.getElementById('night-bar').style.width = `${(nightL/(24*3600*1000))*100}%`;
                
                const fmtDiff = (ms) => `${Math.floor(ms/3600000)} س و ${Math.floor((ms%3600000)/60000)} د`;
                document.getElementById('day-length-text').textContent = fmtDiff(dayL);
                document.getElementById('night-length-text').textContent = fmtDiff(nightL);
                
                if (diffL < 5 * 60000) {
                    document.getElementById('comparison-text').textContent = "الاعتدال: يتساوى الليل والنهار";
                } else {
                    document.getElementById('comparison-text').textContent = dayL > nightL ? `النهار أطول بـ ${fmtDiff(diffL)}` : `الليل أطول بـ ${fmtDiff(diffL)}`;
                }

                const now = Date.now();
                let pStart, pEnd, pPhase;
                if (now >= solar.todaySunrise && now < solar.todaySunset) { pPhase = 'النهار'; pStart = solar.todaySunrise; pEnd = solar.todaySunset; }
                else { pPhase = 'الليل'; pStart = now < solar.todaySunrise ? solar.yesterdaySunset : solar.todaySunset; pEnd = now < solar.todaySunrise ? solar.todaySunrise : solar.tomorrowSunrise; }
                Core.drawPrayerMarkers(pPhase, pStart, pEnd);

                Core.updateClock();
                State.clockInterval = setInterval(Core.updateClock, 1000);

                UI.loader.classList.add('opacity-0', 'pointer-events-none');
                UI.appContainer.classList.add('opacity-100');

            } catch (err) {
                console.error(err);
                UI.showError(err.message);
            }
        }
    };

    const initEvents = () => {
        const buildButtons = () => {
            UI.citySelector.innerHTML = '';
            Object.keys(State.cities).forEach(k => {
                const b = document.createElement('button');
                b.className = 'city-btn'; b.dataset.city = k; b.textContent = State.cities[k].name;
                b.setAttribute('aria-label', `عرض توقيت ${State.cities[k].name}`);
                b.onclick = () => { if(State.currentCityKey !== k) Core.initCity(k); };
                UI.citySelector.appendChild(b);
            });
        };
        buildButtons();

        document.getElementById('add-city-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-btn');
            const input = document.getElementById('smart-city-input');
            const val = input.value.trim();
            if (!val) return;

            btn.disabled = true; btn.textContent = '...';
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=1`);
                const data = await res.json();
                if (!data.length) throw new Error("لم نجد المدينة. حاول بالإنجليزية.");
                
                const k = `city_${Date.now()}`;
                State.cities[k] = { name: data[0].name || val, lat: data[0].lat, lng: data[0].lon };
                buildButtons();
                input.value = '';
                Core.initCity(k);
            } catch (err) {
                alert(err.message);
            } finally {
                btn.disabled = false; btn.textContent = 'إضافة';
            }
        };

        UI.themeToggle.onclick = () => {
            State.manualThemeOverride = true;
            document.body.classList.remove('theme-golden');
            const isNight = document.body.classList.toggle('theme-night');
            UI.sunIcon.classList.toggle('hidden', isNight);
            UI.moonIcon.classList.toggle('hidden', !isNight);
            UI.starsLayer.style.opacity = isNight ? '1' : '0';
            UI.themeReset.classList.remove('hidden', 'opacity-0', 'translate-x-4');
        };

        UI.themeReset.onclick = () => {
            State.manualThemeOverride = false;
            UI.themeReset.classList.add('opacity-0', 'translate-x-4');
            setTimeout(() => UI.themeReset.classList.add('hidden'), 300);
            Core.updateClock();
        };

        document.getElementById('retry-btn').onclick = () => Core.initCity(State.currentCityKey);

        const urlParams = new URLSearchParams(window.location.search);
        const cityParam = urlParams.get('city');
        let startKey = 'tobruk';
        
        if (cityParam) {
            const foundKey = Object.keys(State.cities).find(k => State.cities[k].name.toLowerCase() === cityParam.toLowerCase());
            if (foundKey) startKey = foundKey;
            else {
                document.getElementById('smart-city-input').value = cityParam;
                document.getElementById('submit-btn').click();
                return;
            }
        }

        UI.generateStars();
        Core.initCity(startKey);
    };

    return { init: initEvents };
})();

document.addEventListener('DOMContentLoaded', App.init);