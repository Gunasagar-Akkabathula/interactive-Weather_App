// ===================== weather.js (full + clouds & drift) =====================


// ===================== API CONFIGURATION =====================
const API_KEY = "f80a809ce080c002f3e2108a0586f6ab";
const BASE_URL = "https://api.openweathermap.org/data/2.5";


// ===================== Nominatim REVERSE GEOCODE =====================
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "WeatherAppExample/1.0 (your_email@example.com)" } });
    if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
    const data = await res.json();
    const address = data.address || {};
    return address.suburb || address.neighbourhood || address.city || address.town || address.state || address.country || "Unknown location";
  } catch (error) {
    console.error(error);
    return "Unknown location";
  }
}


// ===================== DOM ELEMENTS =====================
let cityInput, searchBtn, locationBtn, locationEl, dateEl, tempEl, conditionsEl, iconEl;
let feelsLikeEl, humidityEl, windEl, forecastEl, loadingEl, sunriseEl, sunsetEl;
let unitToggleBtn, animContainer, tipEl;


let lastCurrentData = null;
let lastForecastData = null;
let isCelsius = (localStorage.getItem("weather_isCelsius") || "true") === "true";


// ===================== INITIAL SETUP =====================
document.addEventListener("DOMContentLoaded", () => {
  cityInput = document.getElementById("city-input");
  searchBtn = document.getElementById("search-btn");
  locationBtn = document.getElementById("location-btn");
  locationEl = document.getElementById("location");
  dateEl = document.getElementById("date");
  tempEl = document.getElementById("temp");
  conditionsEl = document.getElementById("conditions");
  iconEl = document.getElementById("weather-icon");
  feelsLikeEl = document.getElementById("feels-like");
  humidityEl = document.getElementById("humidity");
  windEl = document.getElementById("wind");
  forecastEl = document.getElementById("forecast");
  loadingEl = document.getElementById("loading");
  sunriseEl = document.getElementById("sunrise");
  sunsetEl = document.getElementById("sunset");
  unitToggleBtn = document.getElementById("unit-toggle");
  animContainer = document.getElementById("weather-anim");
  tipEl = document.getElementById("weather-tip");


  // ----- Safety: ensure unit toggle exists and has expected layout behavior -----
  if (unitToggleBtn) {
    // make sure it doesn't shrink in a flex row and text doesn't wrap
    unitToggleBtn.style.flex = "0 0 auto";
    unitToggleBtn.style.whiteSpace = "nowrap";
    unitToggleBtn.setAttribute("aria-pressed", isCelsius ? "false" : "true");
  }


  if (searchBtn) searchBtn.addEventListener("click", () => {
    const c = (cityInput && cityInput.value) ? cityInput.value.trim() : "";
    if (c) getWeatherByCity(c);
  });


  if (cityInput) cityInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const c = cityInput.value.trim();
      if (c) getWeatherByCity(c);
    }
  });


  if (locationBtn) locationBtn.addEventListener("click", getLocationWeather);


  if (unitToggleBtn) unitToggleBtn.addEventListener("click", () => {
    isCelsius = !isCelsius;
    localStorage.setItem("weather_isCelsius", isCelsius);
    applyUnitToggleUI();
    if (lastCurrentData && lastForecastData) updateUI(lastCurrentData, lastForecastData);
    // update aria-pressed for accessibility
    unitToggleBtn.setAttribute("aria-pressed", (!isCelsius).toString());
  });


  const testSelect = document.getElementById('testWeather');
  if (testSelect) {
    testSelect.addEventListener('change', (e) => {
      if (e.target.value) updateAnimation(e.target.value);
    });
  }


  // ensure forecast layout adapts at start and on resize
  window.addEventListener('resize', adjustForecastLayout, { passive: true });


  updateDate();
  applyUnitToggleUI();
  getLocationWeather();
});


// ===================== LOADING UI =====================
function showLoading() { if (loadingEl) loadingEl.style.display = "flex"; }
function hideLoading() { if (loadingEl) loadingEl.style.display = "none"; }


// ===================== DATE & UNITS =====================
function updateDate() {
  if (!dateEl) return;
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}


function applyUnitToggleUI() {
  if (!unitToggleBtn) return;
  unitToggleBtn.textContent = isCelsius ? "Show °F" : "Show °C";
}


function toF(c) { return (c * 9) / 5 + 32; }
function formatTemp(c) { return isCelsius ? `${Math.round(c)}°C` : `${Math.round(toF(c))}°F`; }
function formatFeels(c) { return isCelsius ? `Feels like: ${Math.round(c)}°C` : `Feels like: ${Math.round(toF(c))}°F`; }
function formatWind(mps) { return isCelsius ? `Wind: ${Math.round(mps * 3.6)} km/h` : `Wind: ${Math.round(mps * 2.23694)} mph`; }


// ===================== SAFE FETCH =====================
async function safeFetch(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}


// ===================== WEATHER BY CITY =====================
async function getWeatherByCity(city) {
  showLoading();
  try {
    const cur = await safeFetch(`${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`);
    const fdata = await safeFetch(`${BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`);
    lastCurrentData = cur;
    lastForecastData = fdata;
    updateUI(cur, fdata);
  } catch (err) {
    alert(`Error fetching weather: ${err.message}`);
  } finally {
    hideLoading();
  }
}


// ===================== WEATHER BY COORDS =====================
async function getWeatherByCoords(lat, lon) {
  showLoading();
  try {
    const displayName = await reverseGeocode(lat, lon);
    const cur = await safeFetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    const fdata = await safeFetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    cur._displayName = displayName;
    lastCurrentData = cur;
    lastForecastData = fdata;
    updateUI(cur, fdata);
  } catch (err) {
    alert(`Error fetching weather: ${err.message}`);
  } finally {
    hideLoading();
  }
}


// ===================== GET LOCATION WEATHER =====================
async function getLocationWeather() {
  showLoading();
  if (!navigator.geolocation) {
    alert('Geolocation not supported by this browser');
    await getWeatherByCity('Hyderabad');
    hideLoading();
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    try { await getWeatherByCoords(latitude, longitude); } 
    catch (err) { alert(`Error fetching location/weather: ${err.message || err}`); }
    finally { hideLoading(); }
  }, async (error) => {
    alert(`Geolocation error: ${error.message || error.code}`);
    await getWeatherByCity('Hyderabad');
    hideLoading();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}


// ===================== UPDATE UI =====================
function updateUI(current, forecast) {
  if (!current || !forecast) return;
  if (locationEl) locationEl.textContent = current._displayName || `${current.name}, ${current.sys.country}`;
  updateDate();
  if (tempEl) tempEl.textContent = formatTemp(current.main.temp);
  if (conditionsEl) conditionsEl.textContent = capitalize(current.weather[0].description || "");
  if (iconEl) {
    iconEl.src = `https://openweathermap.org/img/wn/${current.weather[0].icon}@2x.png`;
    iconEl.alt = current.weather[0].description || 'weather icon';
  }
  if (feelsLikeEl) feelsLikeEl.textContent = formatFeels(current.main.feels_like);
  if (humidityEl) humidityEl.textContent = `Humidity: ${current.main.humidity}%`;
  if (windEl) windEl.textContent = formatWind(current.wind.speed);
  if (sunriseEl) sunriseEl.textContent = `Sunrise: ${new Date(current.sys.sunrise*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  if (sunsetEl) sunsetEl.textContent = `Sunset: ${new Date(current.sys.sunset*1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  generateTip(current);
  updateForecast(forecast);
  updateAnimation(current.weather[0].main);
}


// ===================== FORECAST =====================
function updateForecast(forecast) {
  if (!forecast || !forecast.list || !forecastEl) return;
  const daily = {};
  forecast.list.forEach(item => {
    const dateKey = new Date(item.dt * 1000).toLocaleDateString('en-US');
    if (!daily[dateKey]) daily[dateKey] = [];
    daily[dateKey].push(item);
  });
  const days = Object.keys(daily).slice(1, 6); // next 5 days
  forecastEl.innerHTML = '';
  days.forEach(day => {
    const data = daily[day];
    if (!data || data.length === 0) return;
    const dayName = new Date(day).toLocaleDateString('en-US', { weekday: 'short' });
    const highC = Math.max(...data.map(d => d.main.temp_max));
    const lowC = Math.min(...data.map(d => d.main.temp_min));
    const icon = data[Math.floor(data.length / 2)].weather[0].icon;
    const div = document.createElement('div');
    div.className = 'forecast-item';
    div.innerHTML = `
      <div class="forecast-day">${dayName}</div>
      <div class="forecast-icon"><img src="https://openweathermap.org/img/wn/${icon}.png" alt=""></div>
      <div class="forecast-temp">
        <span class="forecast-high">${isCelsius ? Math.round(highC)+'°C' : Math.round(toF(highC))+'°F'}</span>
        <span class="forecast-low">${isCelsius ? Math.round(lowC)+'°C' : Math.round(toF(lowC))+'°F'}</span>
      </div>
    `;
    forecastEl.appendChild(div);
  });

  // adjust layout according to viewport (mobile: horizontal scroll; wider: keep grid)
  adjustForecastLayout();
}


// ===================== ADJUST FORECAST LAYOUT (responsive) =====================
function adjustForecastLayout() {
  if (!forecastEl) return;
  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);

  // threshold where grid would be too tight and we prefer horizontal scroll (you can tweak)
  const mobileThreshold = 420;

  if (vw <= mobileThreshold) {
    // switch to horizontal scroll layout
    forecastEl.style.display = 'flex';
    forecastEl.style.overflowX = 'auto';
    forecastEl.style.WebkitOverflowScrolling = 'touch';
    forecastEl.style.gap = '10px';
    forecastEl.style.paddingBottom = '6px';
    // ensure each card has a fixed width so they don't compress
    const items = forecastEl.querySelectorAll('.forecast-item');
    items.forEach(it => {
      it.style.flex = '0 0 120px';
      it.style.minWidth = '120px';
      it.style.maxWidth = '120px';
    });
  } else {
    // revert to grid-based layout so your CSS grid rules can apply
    forecastEl.style.display = '';
    forecastEl.style.overflowX = '';
    forecastEl.style.gap = '';
    forecastEl.style.paddingBottom = '';
    const items = forecastEl.querySelectorAll('.forecast-item');
    items.forEach(it => {
      it.style.flex = '';
      it.style.minWidth = '';
      it.style.maxWidth = '';
      it.style.width = '';
    });
  }
}


// ===================== TIPS =====================
function generateTip(current) {
  if (!tipEl || !current) return;
  const main = (current.weather[0].main || "").toLowerCase();
  const tempC = current.main.temp;
  const feels = current.main.feels_like;
  const humidity = current.main.humidity;
  const windKmh = current.wind.speed * 3.6;
  const tips = [];
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunder')) tips.push("Carry an umbrella ☔ — there's rain expected.");
  if (main.includes('snow')) tips.push("Snowy conditions ❄ — wear warm layers & be careful on roads.");
  if (feels >= 30) tips.push("It's hot — stay hydrated 💧 and avoid prolonged sun exposure.");
  if (tempC <= 10) tips.push("It's chilly — wear a jacket 🧥.");
  if (windKmh >= 45) tips.push("Very windy 🌬 — secure loose items outdoors.");
  if (humidity >= 85 && !main.includes('rain')) tips.push("High humidity — it may feel muggy.");
  if (main.includes('clear')) tips.push("Difficulty seeing sun-glow? Wear sunglasses 😎 and apply sunscreen.");
  if (tips.length === 0) tips.push("Have a great day! ☀");
  tipEl.textContent = `Tip: ${tips.join(" ")}`;
}


// ===================== UTILITY =====================
function capitalize(s) { if (!s) return ""; return s.charAt(0).toUpperCase() + s.slice(1); }


// ===================== ANIMATION HELPERS =====================
function getAnimStyleSheet() {
  let styleEl = document.getElementById('weather-anim-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'weather-anim-styles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = '';
  return styleEl.sheet;
}


// ===================== WEATHER ANIMATION =====================
function updateAnimation(main) {
  if (!animContainer) return;
  animContainer.innerHTML = "";
  const sheet = getAnimStyleSheet();
  main = (main || '').toLowerCase();


  // --- Rain/Drizzle ---
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunder')) {
    const dropCount = 100;
    for (let i=0;i<dropCount;i++){
      const drop=document.createElement('div');
      drop.className='raindrop';
      drop.style.width=`${1+Math.random()*2}px`;
      drop.style.height=`${10+Math.random()*20}px`;
      drop.style.left=`${Math.random()*100}vw`;
      drop.style.top=`${-5-Math.random()*10}%`;
      drop.style.opacity=(0.4+Math.random()*0.6).toString();
      const duration=(0.8+Math.random()*1.2)+'s';
      drop.style.animationDuration=duration;
      drop.style.animationDelay=(Math.random()*2).toFixed(2)+'s';
      drop.style.transform='skewX(-20deg) translateY(-10%)';
      animContainer.appendChild(drop);
    }
  }


  // --- Snow ---
  else if (main.includes('snow')) {
    const flakeCount=60, baseName=`drift_${Date.now()}`;
    for (let i=0;i<flakeCount;i++){
      const flake=document.createElement('div');
      flake.className='snowflake';
      const size=4+Math.random()*6;
      flake.style.width=`${size}px`;
      flake.style.height=`${size}px`;
      flake.style.left=`${Math.random()*100}vw`;
      flake.style.top=`${-5-Math.random()*10}%`;
      const opacityVal=0.5+Math.random()*0.5;
      flake.style.opacity=opacityVal.toString();
      const duration=(4+Math.random()*3).toFixed(2)+'s';
      flake.style.animationDuration=duration;
      flake.style.animationDelay=(Math.random()*2).toFixed(2)+'s';
      const rotate=Math.random()*360;
      const sway=20+Math.random()*30;
      const kName=`${baseName}_${i}`;
      const kf=`@keyframes ${kName} {0%{transform:translateY(0) translateX(0) rotate(0deg);opacity:${opacityVal};}50%{transform:translateY(50vh) translateX(${sway}px) rotate(${180+rotate}deg);opacity:${Math.max(opacityVal*0.9,0.2)};}100%{transform:translateY(110vh) translateX(0) rotate(${360+rotate}deg);opacity:${Math.max(opacityVal*0.7,0.1)};}}`;
      try{sheet.insertRule(kf,sheet.cssRules.length);}catch(e){}
      flake.style.animationName=kName;
      animContainer.appendChild(flake);
    }
  }


  // --- Clouds --- (mobile optimized)
  else if (main.includes('cloud') || main.includes('clouds')) {
    const isMobile = window.innerWidth <= 600;
    const cloudCount = isMobile ? 3 : 7; // Fewer clouds on mobile
    const baseTop = 8;
    for (let i=0;i<cloudCount;i++){
      const c=document.createElement('div');
      c.className='cloud';
      // Smaller clouds on mobile
      const scale = isMobile ? (0.7+Math.random()*0.5) : (0.8+Math.random()*1.2);
      c.style.width = `${isMobile ? 70 : 120 * scale + Math.random() * 120}px`;
      c.style.height = `${isMobile ? 24 : 48 * scale + Math.random() * 24}px`;
      c.style.top = `${baseTop + Math.random() * 50}%`;
      const duration = isMobile ? 18 + Math.random() * 10 : 24 + Math.random() * 24;
      c.style.animationName='cloudMove';
      c.style.animationDuration=`${duration}s`;
      c.style.animationDelay=`${Math.random()*-duration}s`;
      c.style.animationTimingFunction='linear';
      c.style.animationIterationCount='infinite';
      c.style.opacity=(0.65+Math.random()*0.2).toString();
      animContainer.appendChild(c);
    }
  }


  // --- Clear/Sun ---
  else if (main.includes('clear') || main.includes('sun')) {
    const sun=document.createElement('div');
    sun.className='sun-glow';
    sun.style.animation='sun-pulse 50s ease-in-out infinite alternate';
    animContainer.appendChild(sun);
  }
}
