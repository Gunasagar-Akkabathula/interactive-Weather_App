const API_KEY = "f80a809ce080c002f3e2108a0586f6ab";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0";

// Reverse geocode latitude and longitude to city/locality name
async function reverseGeocode(lat, lon) {
  try {
    const url = `${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Reverse geocode error: ${res.status}`);
    const data = await res.json();
    if (data && data.length > 0) {
      return data[0].name || data[0].state || data[0].country || "Unknown location";
    }
    return "Unknown location";
  } catch (error) {
    console.error(error);
    return "Unknown location";
  }
}

let cityInput, searchBtn, locationBtn, locationEl, dateEl, tempEl, conditionsEl, iconEl;
let feelsLikeEl, humidityEl, windEl, forecastEl, loadingEl, sunriseEl, sunsetEl;
let unitToggleBtn, animContainer, tipEl;


let lastCurrentData = null;
let lastForecastData = null;
let isCelsius = (localStorage.getItem("weather_isCelsius") || "true") === "true";


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

  if (searchBtn) searchBtn.addEventListener("click", () => { const c = (cityInput && cityInput.value) ? cityInput.value.trim() : ""; if (c) getWeatherByCity(c); });
  if (cityInput) cityInput.addEventListener("keypress", (e) => { if (e.key === "Enter") { const c = cityInput.value.trim(); if (c) getWeatherByCity(c); }});
  if (locationBtn) locationBtn.addEventListener("click", getLocationWeather);

  if (unitToggleBtn) unitToggleBtn.addEventListener("click", () => {
    isCelsius = !isCelsius;
    localStorage.setItem("weather_isCelsius", isCelsius);
    applyUnitToggleUI();
    if (lastCurrentData && lastForecastData) updateUI(lastCurrentData, lastForecastData);
  });

  updateDate();
  applyUnitToggleUI();

  // initial attempt to get current location weather
  getLocationWeather();
});


function showLoading(){ if (loadingEl) loadingEl.style.display = "flex"; }
function hideLoading(){ if (loadingEl) loadingEl.style.display = "none"; }
function updateDate(){ if (!dateEl) return; const now = new Date(); dateEl.textContent = now.toLocaleDateString("en-US",{ weekday:"long", month:"long", day:"numeric" }); }
function applyUnitToggleUI(){ if (!unitToggleBtn) return; unitToggleBtn.textContent = isCelsius ? "Show °F" : "Show °C"; }
function toF(c){ return (c * 9) / 5 + 32; }
function formatTemp(c){ return isCelsius ? `${Math.round(c)}°C` : `${Math.round(toF(c))}°F`; }
function formatFeels(c){ return isCelsius ? `Feels like: ${Math.round(c)}°C` : `Feels like: ${Math.round(toF(c))}°F`; }
function formatWind(mps){ return isCelsius ? `Wind: ${Math.round(mps * 3.6)} km/h` : `Wind: ${Math.round(mps * 2.23694)} mph`; }


async function safeFetch(url) {
  const res = await fetch(url);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}


async function getWeatherByCity(city){
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


// Updated to use reverse geocoding for display name
async function getWeatherByCoords(lat, lon) {
  showLoading();
  try {
    const displayName = await reverseGeocode(lat, lon);
    const cur = await safeFetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    const fdata = await safeFetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    cur._displayName = displayName; // Use the reverse geocode result
    lastCurrentData = cur;
    lastForecastData = fdata;
    updateUI(cur, fdata);
  } catch (err) {
    alert(`Error fetching weather: ${err.message}`);
  } finally {
    hideLoading();
  }
}


async function getLocationWeather(){
  showLoading();
  if (!navigator.geolocation) {
    alert('Geolocation not supported by this browser');
    await getWeatherByCity('Hyderabad');
    hideLoading();
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    try {
      await getWeatherByCoords(latitude, longitude);
    } catch (err) {
      alert(`Error fetching location/weather: ${err.message || err}`);
    } finally {
      hideLoading();
    }
  }, async (error) => {
    alert(`Geolocation error: ${error.message || error.code}`);
    await getWeatherByCity('Hyderabad');
    hideLoading();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}


function updateUI(current, forecast){
  if (!current || !forecast) return;
  if (locationEl) {
    const display = current._displayName || `${current.name}, ${current.sys.country}`;
    locationEl.textContent = display;
  }
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
  if (sunriseEl) {
    const sr = new Date(current.sys.sunrise * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sunriseEl.textContent = `Sunrise: ${sr}`;
  }
  if (sunsetEl) {
    const ss = new Date(current.sys.sunset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    sunsetEl.textContent = `Sunset: ${ss}`;
  }
  generateTip(current);
  updateForecast(forecast);
}


function updateForecast(forecast){
  if (!forecast || !forecast.list || !forecastEl) return;
  const daily = {};
  forecast.list.forEach(item => {
    const dateKey = new Date(item.dt * 1000).toLocaleDateString('en-US');
    if (!daily[dateKey]) daily[dateKey] = [];
    daily[dateKey].push(item);
  });
  const days = Object.keys(daily).slice(1, 6);
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
}


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
  if (tips.length === 0) tips.push("Have a great day! ☀");
  tipEl.textContent = `Tip: ${tips.join(" ")}`;
}


function capitalize(s){ if (!s) return ""; return s.charAt(0).toUpperCase() + s.slice(1); }
