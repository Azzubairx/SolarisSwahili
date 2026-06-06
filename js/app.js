/**
 * SolarisSwahili Application
 * Professional Architecture: Modular Pattern + Event-driven State Management
 * Focus: Performance, Accessibility, User Experience
 */

const App = (() => {
    'use strict';

    // ========== CONFIG & CONSTANTS ==========
    const CONFIG = {
        CACHE_TTL: 6 * 60 * 60 * 1000,
        API_TIMEOUT: 8000,
        ANIMATION_DURATION: 1000,
        UPDATE_INTERVAL: 1000,
        DEFAULT_CITIES: {
            tobruk: { name: "طبرق", lat: "32.0773", lng: "23.9600" },
            benghazi: { name: "بنغازي", lat: "32.1167", lng: "20.0667" },
            tripoli: { name: "طرابلس", lat: "32.8892", lng: "13.1900" }
        }
    };

    // ========== STATE MANAGEMENT ==========
    const State = {
        cities: { ...CONFIG.DEFAULT_CITIES },
        currentCityKey: null,
        solarBounds: null,
        prayerTimes: null,
        clockInterval: null,
        manualThemeOverride: false,
        isLoading: false
    };

    // ========== UI ELEMENTS CACHE ==========
    const UI = {
        // Overlays
        loader: document.getElementById('loader'),
        loaderText: document.getElementById('loader-text'),
        errorOverlay: document.getElementById('error-overlay'),
        errorMsg: document.getElementById('error-message'),
        appContainer: document.getElementById('app-container'),
        
        // City selection
        citySelector: document.getElementById('city-selector'),
        cityName: document.getElementById('city-name'),
        
        // Time displays
        hijriDate: document.getElementById('hijri-date'),
        hourDisplay: document.getElementById('hour-display'),
        phaseDisplay: document.getElementById('phase-display'),
        metricDisplay: document.getElementById('metric-display'),
        countdownDisplay: document.getElementById('countdown-display'),
        nextEventName: document.getElementById('next-event-name'),
        standardTime: document.getElementById('standard-time'),
        
        // Sunrise/Sunset times
        sunriseTime: document.getElementById('sunrise-time'),
        sunsetTime: document.getElementById('sunset-time'),
        
        // SVG Elements
        progressArc: document.getElementById('progress-arc'),
        celestialBody: document.getElementById('celestial-body'),
        sunShape: document.getElementById('sun-shape'),
        moonShape: document.getElementById('moon-shape'),
        prayerMarkersContainer: document.getElementById('prayer-markers'),
        
        // Theme controls
        themeToggle: document.getElementById('theme-toggle'),
        themeReset: document.getElementById('theme-auto-reset'),
        sunIcon: document.getElementById('sun-icon'),
        moonIcon: document.getElementById('moon-icon'),
        starsLayer: document.getElementById('stars-layer'),
        
        // Day/Night comparison
        dayBar: document.getElementById('day-bar'),
        nightBar: document.getElementById('night-bar'),
        dayLengthText: document.getElementById('day-length-text'),
        nightLengthText: document.getElementById('night-length-text'),
        comparisonText: document.getElementById('comparison-text'),
        
        // Utility functions
        formatMetric: (h, m, s) => 
            [h, m, s].map(n => n.toString().padStart(2, '0')).join(':'),
        
        cleanTime: (t) => {
            const parts = t.split(':');
            return parts.length === 3 ? `${parts[0]}:${parts[1]} ${t.split(' ').pop()}` : t;
        },

        showError: (msg) => {
            UI.errorMsg.textContent = msg;
            UI.errorOverlay.classList.add('show');
            UI.loader.classList.add('opacity-0', 'pointer-events-none');
            State.isLoading = false;
        },
        
        hideError: () => {
            UI.errorOverlay.classList.remove('show');
        },

        generateStars: () => {
            const gradients = [];
            const starCount = 120;
            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const size = Math.random() * 1.5 + 0.5;
                const opacity = Math.random() * 0.7 + 0.3;
                gradients.push(
                    `radial-gradient(${size}px ${size}px at ${x}% ${y}%, 
                    rgba(255,255,255,${opacity}), transparent)`
                );
            }
            UI.starsLayer.style.backgroundImage = gradients.join(',');
        },

        setLoading: (isLoading, text = "جاري تحديث البيانات...") => {
            State.isLoading = isLoading;
            if (isLoading) {
                UI.loaderText.textContent = text;
                UI.loader.classList.remove('opacity-0', 'pointer-events-none');
            } else {
                UI.loader.classList.add('opacity-0', 'pointer-events-none');
            }
        }
    };

    // ========== STORAGE (Caching) ==========
    const Storage = {
        get: (key) => {
            try {
                const cached = localStorage.getItem(key);
                if (!cached) return null;
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp > CONFIG.CACHE_TTL) {
                    localStorage.removeItem(key);
                    return null;
                }
                return parsed.data;
            } catch (e) {
                console.warn('Storage read error:', e);
                return null;
            }
        },
        set: (key, data) => {
            try {
                localStorage.setItem(key, JSON.stringify({
                    timestamp: Date.now(),
                    data
                }));
            } catch (e) {
                console.warn('Storage write error:', e);
            }
        }
    };

    // ========== API MODULE ==========
    const API = {
        getDateString: (offsetDays = 0) => {
            return new Date(Date.now() + (offsetDays * 86400000))
                .toLocaleDateString('en-CA');
        },

        parseAbsoluteUTC: (dateStr, timeStr, offset) => {
            if (!timeStr) return 0;
            const [time, modifier] = timeStr.split(' ');
            let [h, m, s] = time.split(':');
            
            let hours = parseInt(h, 10);
            if (hours === 12) hours = 0;
            if (modifier === 'PM') hours += 12;
            
            const pad = (n) => n.toString().padStart(2, '0');
            const iso = `${dateStr}T${pad(hours)}:${pad(m)}:${pad(s)}Z`;
            
            let offsetMins = (typeof offset === 'number' && offset < 24) 
                ? offset * 60 
                : parseInt(offset);
            if (isNaN(offsetMins)) offsetMins = 0;

            return new Date(iso).getTime() - (offsetMins * 60000);
        },

        fetchWithTimeout: async (url, timeout = CONFIG.API_TIMEOUT) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { signal: controller.signal });
                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        },

        fetchSolar: async (lat, lng) => {
            const cacheKey = `solar_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;

            UI.setLoading(true, "جاري جلب بيانات الشمس...");
            const base = `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lng}`;
            
            try {
                const [yRes, tRes, tmRes] = await Promise.all([
                    API.fetchWithTimeout(`${base}&date=${API.getDateString(-1)}`)
                        .then(r => r.json()),
                    API.fetchWithTimeout(`${base}&date=${API.getDateString(0)}`)
                        .then(r => r.json()),
                    API.fetchWithTimeout(`${base}&date=${API.getDateString(1)}`)
                        .then(r => r.json())
                ]);

                if (tRes.status !== "OK") {
                    throw new Error("API الشمس لا يستجيب. يرجى التحقق من الاتصال.");
                }

                const offset = tRes.results.utc_offset;
                const data = {
                    yesterdaySunset: API.parseAbsoluteUTC(
                        API.getDateString(-1), 
                        yRes.results.sunset, 
                        offset
                    ),
                    todaySunrise: API.parseAbsoluteUTC(
                        API.getDateString(0), 
                        tRes.results.sunrise, 
                        offset
                    ),
                    todaySunset: API.parseAbsoluteUTC(
                        API.getDateString(0), 
                        tRes.results.sunset, 
                        offset
                    ),
                    tomorrowSunrise: API.parseAbsoluteUTC(
                        API.getDateString(1), 
                        tmRes.results.sunrise, 
                        offset
                    ),
                    todaySunriseStr: tRes.results.sunrise,
                    todaySunsetStr: tRes.results.sunset,
                    utcOffsetMinutes: (typeof offset === 'number' && offset < 24) 
                        ? offset * 60 
                        : parseInt(offset)
                };
                Storage.set(cacheKey, data);
                return data;
            } catch (error) {
                throw new Error(error.message || "خطأ في جلب بيانات الشمس");
            }
        },

        fetchPrayers: async (lat, lng) => {
            const cacheKey = `prayers_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;

            UI.setLoading(true, "جاري جلب مواقيت الصلاة...");
            const timestamp = Math.floor(Date.now() / 1000);
            const url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=4`;
            
            try {
                const res = await API.fetchWithTimeout(url);
                const json = await res.json();
                if (json.code !== 200) {
                    throw new Error("API الصلاة لا يستجيب");
                }
                
                Storage.set(cacheKey, json.data.timings);
                return json.data.timings;
            } catch (error) {
                throw new Error(error.message || "خطأ في جلب مواقيت الصلاة");
            }
        }
    };

    // ========== CORE LOGIC ==========
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
                ? [
                    { name: 'الظهر', time: State.prayerTimes.Dhuhr },
                    { name: 'العصر', time: State.prayerTimes.Asr }
                ]
                : [
                    { name: 'المغرب', time: State.prayerTimes.Maghrib },
                    { name: 'العشاء', time: State.prayerTimes.Isha },
                    { name: 'الفجر', time: State.prayerTimes.Fajr, tomorrow: true }
                ];

            prayers.forEach(p => {
                const pTime = Core.getPrayerUTC(p.time, p.tomorrow);
                if (pTime > startMs && pTime < endMs) {
                    const progress = (pTime - startMs) / (endMs - startMs);
                    const angle = Math.PI - (progress * Math.PI);
                    const cx = 150 + 130 * Math.cos(angle);
                    const cy = 140 - 130 * Math.sin(angle); 
                    
                    const circle = document.createElementNS(
                        'http://www.w3.org/2000/svg', 
                        'circle'
                    );
                    circle.setAttribute('cx', cx);
                    circle.setAttribute('cy', cy);
                    circle.setAttribute('r', '4');
                    circle.setAttribute('class', 'prayer-marker');
                    
                    const title = document.createElementNS(
                        'http://www.w3.org/2000/svg', 
                        'title'
                    );
                    title.textContent = "صلاة " + p.name;
                    circle.appendChild(title);
                    
                    UI.prayerMarkersContainer.appendChild(circle);
                }
            });
        },

        updateClock: () => {
            if (!State.solarBounds) return;
            
            const now = Date.now();
            const { 
                yesterdaySunset, 
                todaySunrise, 
                todaySunset, 
                tomorrowSunrise, 
                utcOffsetMinutes 
            } = State.solarBounds;
            
            // Determine phase
            let phase, startMs, endMs;
            if (now < todaySunrise) {
                phase = 'الليل';
                startMs = yesterdaySunset;
                endMs = todaySunrise;
            } else if (now >= todaySunrise && now < todaySunset) {
                phase = 'النهار';
                startMs = todaySunrise;
                endMs = todaySunset;
            } else {
                phase = 'الليل';
                startMs = todaySunset;
                endMs = tomorrowSunrise;
            }

            // Theme management
            if (!State.manualThemeOverride) {
                let theme = 'theme-day';
                const distSunrise = Math.abs(now - todaySunrise);
                const distSunset = Math.abs(now - todaySunset);
                const GOLDEN_HOUR_THRESHOLD = 45 * 60000; // 45 minutes
                
                if (phase === 'الليل') {
                    theme = 'theme-night';
                } else if (distSunrise < GOLDEN_HOUR_THRESHOLD || 
                          distSunset < GOLDEN_HOUR_THRESHOLD) {
                    theme = 'theme-golden';
                }

                document.body.classList.remove('theme-night', 'theme-golden');
                if (theme !== 'theme-day') {
                    document.body.classList.add(theme);
                }

                // Update celestial icons
                const isNight = phase === 'الليل';
                UI.sunIcon.classList.toggle('hidden', isNight);
                UI.moonIcon.classList.toggle('hidden', !isNight);
                UI.starsLayer.style.opacity = isNight ? '1' : '0';
            }

            // Celestial body visibility
            const isNight = phase === 'الليل';
            UI.sunShape.style.opacity = isNight ? '0' : '1';
            UI.moonShape.style.opacity = isNight ? '1' : '0';

            // Calculate relative time
            const duration = endMs - startMs;
            const progress = Math.max(0, Math.min(1, (now - startMs) / duration));
            const propElapsedMs = progress * (12 * 3600 * 1000);
            
            const pS = Math.floor((propElapsedMs / 1000) % 60);
            const pM = Math.floor((propElapsedMs / 60000) % 60);
            const pH = Math.floor(propElapsedMs / 3600000);

            // Update displays
            UI.hourDisplay.textContent = Math.min(pH + 1, 12);
            UI.phaseDisplay.textContent = "من " + phase;
            UI.metricDisplay.textContent = UI.formatMetric(pH, pM, pS);

            // Countdown to next event
            const nextEventMs = phase === 'النهار' 
                ? todaySunset 
                : (now < todaySunrise ? todaySunrise : tomorrowSunrise);
            const diffMs = nextEventMs - now;
            UI.nextEventName.textContent = phase === 'النهار' ? 'الغروب' : 'الشروق';
            UI.countdownDisplay.textContent = UI.formatMetric(
                Math.floor(diffMs / 3600000),
                Math.floor((diffMs % 3600000) / 60000),
                Math.floor((diffMs % 60000) / 1000)
            );

            // Standard time
            const localDate = new Date(now + (utcOffsetMinutes * 60000));
            UI.standardTime.textContent = UI.formatMetric(
                localDate.getUTCHours(),
                localDate.getUTCMinutes(),
                localDate.getUTCSeconds()
            );

            // Arc animation
            const angle = Math.PI - (progress * Math.PI);
            const cx = 150 + 130 * Math.cos(angle);
            const cy = 140 - 130 * Math.sin(angle);

            UI.progressArc.setAttribute('stroke-dashoffset', 100 - (progress * 100));
            UI.celestialBody.setAttribute('transform', `translate(${cx}, ${cy})`);

            // Update prayer markers
            Core.drawPrayerMarkers(phase, startMs, endMs);
        },

        initCity: async (key) => {
            if (State.clockInterval) clearInterval(State.clockInterval);
            UI.hideError();
            UI.setLoading(true);
            UI.appContainer.classList.remove('opacity-100');
            
            State.currentCityKey = key;
            const city = State.cities[key];

            // Update UI state
            document.querySelectorAll('.city-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.city === key);
            });
            window.history.replaceState(null, '', `?city=${encodeURIComponent(city.name)}`);

            UI.cityName.textContent = city.name;

            try {
                const [solar, prayers] = await Promise.all([
                    API.fetchSolar(city.lat, city.lng),
                    API.fetchPrayers(city.lat, city.lng)
                ]);

                State.solarBounds = solar;
                State.prayerTimes = prayers;

                // Update time displays
                UI.sunriseTime.textContent = UI.cleanTime(solar.todaySunriseStr);
                UI.sunsetTime.textContent = UI.cleanTime(solar.todaySunsetStr);
                
                // Hijri date
                UI.hijriDate.textContent = new Intl.DateTimeFormat(
                    'ar-LY-u-ca-islamic-nu-latn',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                ).format(new Date());

                // Day/Night length comparison
                const dayL = solar.todaySunset - solar.todaySunrise;
                const nightL = (24 * 3600 * 1000) - dayL;
                const diffL = Math.abs(dayL - nightL);
                
                UI.dayBar.style.width = (dayL / (24 * 3600 * 1000) * 100) + "%";
                UI.nightBar.style.width = (nightL / (24 * 3600 * 1000) * 100) + "%";
                
                const fmtDiff = (ms) => {
                    const hours = Math.floor(ms / 3600000);
                    const minutes = Math.floor((ms % 3600000) / 60000);
                    return `${hours} س و ${minutes} د`;
                };
                
                UI.dayLengthText.textContent = fmtDiff(dayL);
                UI.nightLengthText.textContent = fmtDiff(nightL);
                
                if (diffL < 5 * 60000) {
                    UI.comparisonText.textContent = "الاعتدال: يتساوى الليل والنهار";
                } else {
                    const longer = dayL > nightL ? "النهار" : "الليل";
                    UI.comparisonText.textContent = 
                        `${longer} أطول بـ ${fmtDiff(diffL)}`;
                }

                // Initial clock update
                Core.updateClock();
                
                // Start interval
                State.clockInterval = setInterval(Core.updateClock, CONFIG.UPDATE_INTERVAL);

                UI.setLoading(false);
                UI.appContainer.classList.add('opacity-100');

            } catch (err) {
                console.error('City init error:', err);
                UI.showError(err.message || "حدث خطأ غير متوقع");
            }
        }
    };

    // ========== EVENT INITIALIZATION ==========
    const initEvents = () => {
        const buildButtons = () => {
            UI.citySelector.innerHTML = '';
            Object.keys(State.cities).forEach(k => {
                const b = document.createElement('button');
                b.className = 'city-btn';
                b.dataset.city = k;
                b.textContent = State.cities[k].name;
                b.setAttribute('aria-label', `عرض توقيت ${State.cities[k].name}`);
                b.addEventListener('click', () => {
                    if (State.currentCityKey !== k) Core.initCity(k);
                });
                UI.citySelector.appendChild(b);
            });
        };
        buildButtons();

        // Add city form
        document.getElementById('add-city-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-btn');
            const input = document.getElementById('smart-city-input');
            const val = input.value.trim();
            if (!val) return;

            btn.disabled = true;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="flex items-center justify-center gap-2"><svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>جاري البحث...</span>';
            
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=1`
                );
                const data = await res.json();
                if (!data.length) {
                    throw new Error("لم نجد المدينة. يرجى المحاولة بالإنجليزية.");
                }
                
                const k = `city_${Date.now()}`;
                State.cities[k] = {
                    name: data[0].name || val,
                    lat: data[0].lat,
                    lng: data[0].lon
                };
                buildButtons();
                input.value = '';
                Core.initCity(k);
            } catch (err) {
                alert(err.message || "حدث خطأ في البحث عن المدينة");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });

        // Theme toggle
        UI.themeToggle.addEventListener('click', () => {
            State.manualThemeOverride = true;
            document.body.classList.remove('theme-golden');
            const isNight = document.body.classList.toggle('theme-night');
            UI.sunIcon.classList.toggle('hidden', isNight);
            UI.moonIcon.classList.toggle('hidden', !isNight);
            UI.starsLayer.style.opacity = isNight ? '1' : '0';
            UI.themeReset.classList.remove('hidden', 'opacity-0', 'translate-x-4');
        });

        // Theme reset
        UI.themeReset.addEventListener('click', () => {
            State.manualThemeOverride = false;
            UI.themeReset.classList.add('opacity-0', 'translate-x-4');
            setTimeout(() => UI.themeReset.classList.add('hidden'), 300);
            Core.updateClock();
        });

        // Retry button
        document.getElementById('retry-btn').addEventListener('click', () => {
            Core.initCity(State.currentCityKey);
        });

        // URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const cityParam = urlParams.get('city');
        let startKey = 'tobruk';
        
        if (cityParam) {
            const foundKey = Object.keys(State.cities).find(
                k => State.cities[k].name.toLowerCase() === cityParam.toLowerCase()
            );
            if (foundKey) {
                startKey = foundKey;
            } else {
                document.getElementById('smart-city-input').value = cityParam;
                document.getElementById('submit-btn').click();
                return;
            }
        }

        // Initialize
        UI.generateStars();
        Core.initCity(startKey);
    };

    // ========== PUBLIC API ==========
    return {
        init: initEvents
    };
})();

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', App.init);

// Handle visibility changes for performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden && State.clockInterval) {
        clearInterval(State.clockInterval);
    } else if (!document.hidden && State.currentCityKey && !State.clockInterval) {
        Core.updateClock();
        State.clockInterval = setInterval(Core.updateClock, CONFIG.UPDATE_INTERVAL);
    }
});
