/**
 * SOLARIS SWAHILI - Professional Solar Time Application
 * 
 * A sophisticated, psychologically engaging time system based on the sun's actual movement.
 * Features: Real-time solar tracking, prayer times, dynamic theming, and accessibility compliance.
 * 
 * Architecture: Modular pattern with State management, API layer, Core logic, and UI handlers
 */

const App = (() => {
    // =========================================================================
    // 1. CONFIGURATION & STATE MANAGEMENT
    // =========================================================================
    
    const CONFIG = {
        CACHE_TTL: 6 * 60 * 60 * 1000, // 6 hours
        DEFAULT_CITIES: {
            tobruk: { name: "طبرق", lat: "32.0773", lng: "23.9600" },
            benghazi: { name: "بنغازي", lat: "32.1167", lng: "20.0667" },
            tripoli: { name: "طرابلس", lat: "32.8892", lng: "13.1900" }
        },
        ANIMATION_DURATION: 1000,
        THEME_TRANSITION_DURATION: 1500,
        GOLDEN_HOUR_THRESHOLD: 45 * 60000 // 45 minutes before/after sunrise/sunset
    };

    const State = {
        cities: { ...CONFIG.DEFAULT_CITIES },
        currentCityKey: null,
        solarBounds: null,
        prayerTimes: null,
        clockInterval: null,
        manualThemeOverride: false,
        isLoading: false,
        lastError: null
    };

    // =========================================================================
    // 2. DOM ELEMENTS & UI REFERENCES
    // =========================================================================
    
    const UI = {
        // Overlays
        loader: document.getElementById('loader'),
        loaderText: document.getElementById('loader-text'),
        errorOverlay: document.getElementById('error-overlay'),
        errorMsg: document.getElementById('error-message'),
        appContainer: document.getElementById('app-container'),
        
        // Main sections
        citySelector: document.getElementById('city-selector'),
        addCityForm: document.getElementById('add-city-form'),
        smartCityInput: document.getElementById('smart-city-input'),
        submitBtn: document.getElementById('submit-btn'),
        
        // Display elements
        cityName: document.getElementById('city-name'),
        hijriDate: document.getElementById('hijri-date'),
        hourDisplay: document.getElementById('hour-display'),
        phaseDisplay: document.getElementById('phase-display'),
        metricDisplay: document.getElementById('metric-display'),
        countdownDisplay: document.getElementById('countdown-display'),
        nextEventName: document.getElementById('next-event-name'),
        
        // SVG elements
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
        
        // Time displays
        sunriseTime: document.getElementById('sunrise-time'),
        sunsetTime: document.getElementById('sunset-time'),
        standardTime: document.getElementById('standard-time'),
        dayBar: document.getElementById('day-bar'),
        nightBar: document.getElementById('night-bar'),
        dayLengthText: document.getElementById('day-length-text'),
        nightLengthText: document.getElementById('night-length-text'),
        comparisonText: document.getElementById('comparison-text'),
        retryBtn: document.getElementById('retry-btn'),
        
        // =====================================================================
        // Utility Functions
        // =====================================================================
        
        /**
         * Format time as HH:MM:SS with zero-padding
         */
        formatMetric: (h, m, s) => {
            const pad = (n) => n.toString().padStart(2, '0');
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        },
        
        /**
         * Clean time string (remove AM/PM if present)
         */
        cleanTime: (t) => {
            if (!t) return '--:--';
            const parts = t.split(':');
            return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
        },
        
        /**
         * Format duration as "X hours Y minutes"
         */
        formatDuration: (ms) => {
            const hours = Math.floor(ms / 3600000);
            const minutes = Math.floor((ms % 3600000) / 60000);
            return `${hours} س و ${minutes} د`;
        },
        
        /**
         * Show error overlay with message
         */
        showError: (msg) => {
            console.error('Error:', msg);
            State.lastError = msg;
            UI.errorMsg.textContent = msg;
            UI.errorOverlay.classList.remove('hidden');
            
            // Trigger reflow for animation
            setTimeout(() => {
                UI.errorOverlay.classList.remove('opacity-0', 'pointer-events-none');
            }, 10);
            
            UI.loader.classList.add('opacity-0', 'pointer-events-none');
        },
        
        /**
         * Hide error overlay
         */
        hideError: () => {
            UI.errorOverlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                UI.errorOverlay.classList.add('hidden');
            }, 500);
        },
        
        /**
         * Generate procedural stars for night mode
         */
        generateStars: () => {
            const starCount = 120;
            const gradients = [];
            
            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const size = Math.random() * 1.5 + 0.5;
                const opacity = Math.random() * 0.7 + 0.3;
                
                gradients.push(
                    `radial-gradient(${size}px ${size}px at ${x}% ${y}%, rgba(255,255,255,${opacity}), transparent)`
                );
            }
            
            UI.starsLayer.style.backgroundImage = gradients.join(',');
        },
        
        /**
         * Set loading state
         */
        setLoading: (isLoading, message = 'جاري تهيئة النظام…') => {
            State.isLoading = isLoading;
            if (isLoading) {
                UI.loaderText.textContent = message;
                UI.loader.classList.remove('opacity-0', 'pointer-events-none');
            } else {
                UI.loader.classList.add('opacity-0', 'pointer-events-none');
            }
        },
        
        /**
         * Show app container with fade-in animation
         */
        showApp: () => {
            UI.appContainer.classList.add('opacity-100');
        }
    };

    // =========================================================================
    // 3. LOCAL STORAGE & CACHING
    // =========================================================================
    
    const Storage = {
        /**
         * Get cached data if not expired
         */
        get: (key) => {
            try {
                const cached = localStorage.getItem(key);
                if (!cached) return null;
                
                const parsed = JSON.parse(cached);
                const isExpired = Date.now() - parsed.timestamp > CONFIG.CACHE_TTL;
                
                return isExpired ? null : parsed.data;
            } catch (e) {
                console.warn('Cache read error:', e);
                return null;
            }
        },
        
        /**
         * Set cached data with timestamp
         */
        set: (key, data) => {
            try {
                localStorage.setItem(key, JSON.stringify({
                    timestamp: Date.now(),
                    data
                }));
            } catch (e) {
                console.warn('Cache write error:', e);
            }
        },
        
        /**
         * Clear all cache
         */
        clear: () => {
            try {
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith('solar_') || key.startsWith('prayers_')) {
                        localStorage.removeItem(key);
                    }
                });
            } catch (e) {
                console.warn('Cache clear error:', e);
            }
        }
    };

    // =========================================================================
    // 4. API LAYER - EXTERNAL DATA FETCHING
    // =========================================================================
    
    const API = {
        /**
         * Get current date string in YYYY-MM-DD format
         */
        getDateString: (offsetDays = 0) => {
            const date = new Date(Date.now() + (offsetDays * 86400000));
            return date.toLocaleDateString('en-CA');
        },
        
        /**
         * Parse absolute UTC time from API response
         */
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
            if (isNaN(offsetMins)) offsetMins = 0;
            
            return new Date(iso).getTime() - (offsetMins * 60000);
        },
        
        /**
         * Fetch solar data (sunrise/sunset) from API
         */
        fetchSolar: async (lat, lng) => {
            const cacheKey = `solar_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;
            
            UI.setLoading(true, 'جاري جلب بيانات الشمس…');
            
            try {
                const base = `https://api.sunrisesunset.io/json?lat=${lat}&lng=${lng}`;
                
                const [yRes, tRes, tmRes] = await Promise.all([
                    fetch(`${base}&date=${API.getDateString(-1)}`).then(r => {
                        if (!r.ok) throw new Error('فشل جلب بيانات الشمس');
                        return r.json();
                    }),
                    fetch(`${base}&date=${API.getDateString(0)}`).then(r => {
                        if (!r.ok) throw new Error('فشل جلب بيانات الشمس');
                        return r.json();
                    }),
                    fetch(`${base}&date=${API.getDateString(1)}`).then(r => {
                        if (!r.ok) throw new Error('فشل جلب بيانات الشمس');
                        return r.json();
                    })
                ]);
                
                if (tRes.status !== "OK") {
                    throw new Error('خادم بيانات الشمس لا يستجيب');
                }
                
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
            } catch (error) {
                throw new Error(`خطأ في جلب بيانات الشمس: ${error.message}`);
            }
        },
        
        /**
         * Fetch prayer times from API
         */
        fetchPrayers: async (lat, lng) => {
            const cacheKey = `prayers_${lat}_${lng}_${API.getDateString()}`;
            const cached = Storage.get(cacheKey);
            if (cached) return cached;
            
            UI.setLoading(true, 'جاري جلب مواقيت الصلاة…');
            
            try {
                const timestamp = Math.floor(Date.now() / 1000);
                const url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=4`;
                
                const res = await fetch(url);
                if (!res.ok) throw new Error('فشل جلب مواقيت الصلاة');
                
                const json = await res.json();
                if (json.code !== 200) {
                    throw new Error('خادم مواقيت الصلاة لا يستجيب');
                }
                
                Storage.set(cacheKey, json.data.timings);
                return json.data.timings;
            } catch (error) {
                throw new Error(`خطأ في جلب مواقيت الصلاة: ${error.message}`);
            }
        }
    };

    // =========================================================================
    // 5. CORE LOGIC - CALCULATIONS & RENDERING
    // =========================================================================
    
    const Core = {
        /**
         * Get prayer time in UTC milliseconds
         */
        getPrayerUTC: (timeStr, isTomorrow = false) => {
            const offset = State.solarBounds.utcOffsetMinutes;
            const dStr = API.getDateString(isTomorrow ? 1 : 0);
            const iso = `${dStr}T${timeStr}:00Z`;
            return new Date(iso).getTime() - (offset * 60000);
        },
        
        /**
         * Draw prayer time markers on the solar arc
         */
        drawPrayerMarkers: (phase, startMs, endMs) => {
            UI.prayerMarkersContainer.innerHTML = '';
            if (!State.prayerTimes) return;
            
            // Define prayers for each phase
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
            
            prayers.forEach(prayer => {
                const pTime = Core.getPrayerUTC(prayer.time, prayer.tomorrow);
                
                // Only show prayer if within current phase
                if (pTime > startMs && pTime < endMs) {
                    const progress = (pTime - startMs) / (endMs - startMs);
                    const angle = Math.PI - (progress * Math.PI);
                    const cx = 150 + 130 * Math.cos(angle);
                    const cy = 140 - 130 * Math.sin(angle);
                    
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', cx);
                    circle.setAttribute('cy', cy);
                    circle.setAttribute('r', '4');
                    circle.setAttribute('class', 'prayer-marker');
                    circle.setAttribute('role', 'img');
                    circle.setAttribute('aria-label', `صلاة ${prayer.name}`);
                    
                    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    title.textContent = `صلاة ${prayer.name}`;
                    circle.appendChild(title);
                    
                    UI.prayerMarkersContainer.appendChild(circle);
                }
            });
        },
        
        /**
         * Update clock display with current solar time
         */
        updateClock: () => {
            if (!State.solarBounds) return;
            
            const now = Date.now();
            const { yesterdaySunset, todaySunrise, todaySunset, tomorrowSunrise, utcOffsetMinutes } = State.solarBounds;
            
            // Determine current phase (day/night)
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
            
            // ===== THEME MANAGEMENT =====
            if (!State.manualThemeOverride) {
                let theme = 'theme-day';
                const distSunrise = Math.abs(now - todaySunrise);
                const distSunset = Math.abs(now - todaySunset);
                
                if (phase === 'الليل') {
                    theme = 'theme-night';
                } else if (distSunrise < CONFIG.GOLDEN_HOUR_THRESHOLD || distSunset < CONFIG.GOLDEN_HOUR_THRESHOLD) {
                    theme = 'theme-golden';
                }
                
                // Update theme classes
                document.body.classList.remove('theme-night', 'theme-golden');
                if (theme !== 'theme-day') {
                    document.body.classList.add(theme);
                }
                
                // Update theme icons
                if (phase === 'الليل') {
                    UI.sunIcon.classList.add('hidden');
                    UI.moonIcon.classList.remove('hidden');
                    UI.starsLayer.style.opacity = '1';
                } else {
                    UI.sunIcon.classList.remove('hidden');
                    UI.moonIcon.classList.add('hidden');
                    UI.starsLayer.style.opacity = '0';
                }
            }
            
            // ===== CELESTIAL BODY DISPLAY =====
            UI.sunShape.style.opacity = phase === 'الليل' ? '0' : '1';
            UI.moonShape.style.opacity = phase === 'الليل' ? '1' : '0';
            
            // ===== SOLAR TIME CALCULATION =====
            const duration = endMs - startMs;
            const progress = Math.max(0, Math.min(1, (now - startMs) / duration));
            const propElapsedMs = progress * (12 * 3600 * 1000); // 12 hours in milliseconds
            
            const pS = Math.floor((propElapsedMs / 1000) % 60);
            const pM = Math.floor((propElapsedMs / 60000) % 60);
            const pH = Math.floor(propElapsedMs / 3600000);
            
            // Update display
            UI.hourDisplay.textContent = Math.min(pH + 1, 12);
            UI.phaseDisplay.textContent = `من ${phase}`;
            UI.metricDisplay.textContent = UI.formatMetric(pH, pM, pS);
            
            // ===== COUNTDOWN TO NEXT EVENT =====
            const nextEventMs = phase === 'النهار' ? todaySunset : (now < todaySunrise ? todaySunrise : tomorrowSunrise);
            const diffMs = nextEventMs - now;
            UI.nextEventName.textContent = phase === 'النهار' ? 'الغروب' : 'الشروق';
            UI.countdownDisplay.textContent = UI.formatMetric(
                Math.floor(diffMs / 3600000),
                Math.floor((diffMs % 3600000) / 60000),
                Math.floor((diffMs % 60000) / 1000)
            );
            
            // ===== STANDARD LOCAL TIME =====
            const localDate = new Date(now + (utcOffsetMinutes * 60000));
            UI.standardTime.textContent = UI.formatMetric(
                localDate.getUTCHours(),
                localDate.getUTCMinutes(),
                localDate.getUTCSeconds()
            );
            
            // ===== SOLAR ARC ANIMATION =====
            const angle = Math.PI - (progress * Math.PI);
            const cx = 150 + 130 * Math.cos(angle);
            const cy = 140 - 130 * Math.sin(angle);
            
            UI.progressArc.setAttribute('stroke-dashoffset', 100 - (progress * 100));
            UI.celestialBody.setAttribute('transform', `translate(${cx}, ${cy})`);
            
            // ===== PRAYER MARKERS =====
            Core.drawPrayerMarkers(phase, startMs, endMs);
        },
        
        /**
         * Initialize city and load all data
         */
        initCity: async (key) => {
            // Clear existing interval
            if (State.clockInterval) clearInterval(State.clockInterval);
            
            UI.hideError();
            UI.setLoading(true);
            UI.appContainer.classList.remove('opacity-100');
            
            State.currentCityKey = key;
            const city = State.cities[key];
            
            // Update UI
            document.querySelectorAll('.city-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.city === key);
            });
            
            // Update URL
            window.history.replaceState(null, '', `?city=${encodeURIComponent(city.name)}`);
            UI.cityName.textContent = city.name;
            
            try {
                // Fetch data in parallel
                const [solar, prayers] = await Promise.all([
                    API.fetchSolar(city.lat, city.lng),
                    API.fetchPrayers(city.lat, city.lng)
                ]);
                
                State.solarBounds = solar;
                State.prayerTimes = prayers;
                
                // Update time displays
                UI.sunriseTime.textContent = UI.cleanTime(solar.todaySunriseStr);
                UI.sunsetTime.textContent = UI.cleanTime(solar.todaySunsetStr);
                
                // Update Hijri date
                UI.hijriDate.textContent = new Intl.DateTimeFormat('ar-LY-u-ca-islamic-nu-latn', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }).format(new Date());
                
                // Calculate day/night lengths
                const dayLength = solar.todaySunset - solar.todaySunrise;
                const nightLength = (24 * 3600 * 1000) - dayLength;
                const diffLength = Math.abs(dayLength - nightLength);
                
                // Update bars
                UI.dayBar.style.width = (dayLength / (24 * 3600 * 1000) * 100) + "%";
                UI.nightBar.style.width = (nightLength / (24 * 3600 * 1000) * 100) + "%";
                
                // Update text
                UI.dayLengthText.textContent = UI.formatDuration(dayLength);
                UI.nightLengthText.textContent = UI.formatDuration(nightLength);
                
                // Update comparison
                if (diffLength < 5 * 60000) {
                    UI.comparisonText.textContent = 'الاعتدال: يتساوى الليل والنهار';
                } else {
                    const longer = dayLength > nightLength ? 'النهار' : 'الليل';
                    UI.comparisonText.textContent = `${longer} أطول بـ ${UI.formatDuration(diffLength)}`;
                }
                
                // Start clock update
                Core.updateClock();
                State.clockInterval = setInterval(Core.updateClock, 1000);
                
                // Show app
                UI.setLoading(false);
                UI.showApp();
                
            } catch (err) {
                console.error('Error initializing city:', err);
                UI.showError(err.message || 'حدث خطأ غير متوقع');
            }
        }
    };

    // =========================================================================
    // 6. EVENT HANDLERS & INITIALIZATION
    // =========================================================================
    
    const initEvents = () => {
        // =====================================================================
        // City Selection
        // =====================================================================
        
        const buildCityButtons = () => {
            UI.citySelector.innerHTML = '';
            Object.keys(State.cities).forEach(key => {
                const city = State.cities[key];
                const button = document.createElement('button');
                button.className = 'city-btn';
                button.dataset.city = key;
                button.textContent = city.name;
                button.setAttribute('aria-label', `عرض توقيت ${city.name}`);
                button.addEventListener('click', () => {
                    if (State.currentCityKey !== key) {
                        Core.initCity(key);
                    }
                });
                UI.citySelector.appendChild(button);
            });
        };
        
        buildCityButtons();
        
        // =====================================================================
        // Add City Form
        // =====================================================================
        
        UI.addCityForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const input = UI.smartCityInput;
            const value = input.value.trim();
            
            if (!value) {
                input.focus();
                return;
            }
            
            UI.submitBtn.disabled = true;
            UI.submitBtn.textContent = 'جاري البحث…';
            
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=1`;
                const res = await fetch(url);
                
                if (!res.ok) throw new Error('فشل البحث عن المدينة');
                
                const data = await res.json();
                if (!data.length) {
                    throw new Error('لم نجد المدينة. حاول باسم إنجليزي.');
                }
                
                const cityKey = `city_${Date.now()}`;
                State.cities[cityKey] = {
                    name: data[0].name || value,
                    lat: data[0].lat,
                    lng: data[0].lon
                };
                
                buildCityButtons();
                input.value = '';
                Core.initCity(cityKey);
                
            } catch (err) {
                UI.showError(err.message || 'حدث خطأ في البحث');
            } finally {
                UI.submitBtn.disabled = false;
                UI.submitBtn.textContent = 'إضافة';
            }
        });
        
        // =====================================================================
        // Theme Toggle
        // =====================================================================
        
        UI.themeToggle.addEventListener('click', () => {
            State.manualThemeOverride = true;
            document.body.classList.remove('theme-golden');
            const isNight = document.body.classList.toggle('theme-night');
            
            UI.sunIcon.classList.toggle('hidden', isNight);
            UI.moonIcon.classList.toggle('hidden', !isNight);
            UI.starsLayer.style.opacity = isNight ? '1' : '0';
            
            UI.themeReset.classList.remove('hidden', 'opacity-0', 'translate-x-4');
        });
        
        UI.themeReset.addEventListener('click', () => {
            State.manualThemeOverride = false;
            UI.themeReset.classList.add('opacity-0', 'translate-x-4');
            setTimeout(() => {
                UI.themeReset.classList.add('hidden');
            }, 300);
            Core.updateClock();
        });
        
        // =====================================================================
        // Error Handling
        // =====================================================================
        
        UI.retryBtn.addEventListener('click', () => {
            if (State.currentCityKey) {
                Core.initCity(State.currentCityKey);
            }
        });
        
        // =====================================================================
        // URL Parameter Handling
        // =====================================================================
        
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
                UI.smartCityInput.value = cityParam;
                UI.submitBtn.click();
                return;
            }
        }
        
        // =====================================================================
        // Initialize
        // =====================================================================
        
        UI.generateStars();
        Core.initCity(startKey);
    };
    
    // Return public API
    return {
        init: initEvents
    };
})();

// =========================================================================
// 7. APPLICATION STARTUP
// =========================================================================

document.addEventListener('DOMContentLoaded', App.init);
