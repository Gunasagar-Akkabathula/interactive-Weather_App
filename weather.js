// -----------------------------
// CONFIG / CONSTANTS
// -----------------------------
// API keys / base URLs (replace API_KEY if needed)
const API_KEY = "f80a809ce080c002f3e2108a0586f6ab";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0";

// -----------------------------
// STATE
// -----------------------------
let lastCurrentData = null;    // last /weather response object
let lastForecastData = null;   // last /forecast response object
let isCelsius = (localStorage.getItem("weather_isCelsius") || "true") === "true"; // unit preference

// -----------------------------
// DOM ELEMENT REFERENCES
// (populated on DOMContentLoaded)
// -----------------------------
let cityInput, searchBtn, locationBtn, locationEl, dateEl, tempEl, conditionsEl, iconEl;
let feelsLikeEl, humidityEl, windEl, forecastEl, loadingEl, sunriseEl, sunsetEl;
let unitToggleBtn, animContainer, tipEl;

// -----------------------------
// UTILITIES: formatting & helpers
// -----------------------------

/**
 * Convert Celsius to Fahrenheit.
 * @param {number} c - Celsius
 * @returns {number} Fahrenheit
 */
function toF(c) {
  return (c * 9) / 5 + 32;
}

/**
 * Format temperature according to isCelsius flag.
 * Rounds to nearest integer and appends unit symbol.
 * @param {number} c - Celsius
 * @returns {string}
 */
function formatTemp(c) {
  return isCelsius ? `${Math.round(c)}°C` : `${Math.round(toF(c))}°F`;
}

/**
 * Format 'feels like' text according to unit.
 * @param {number} c - Celsius
 * @returns {string}
 */
function formatFeels(c) {
  return isCelsius ? `Feels like: ${Math.round(c)}°C` : `Feels like: ${Math.round(toF(c))}°F`;
}

/**
 * Format wind speed: m/s -> km/h or mph
 * @param {number} mps - meters per second
 * @returns {string}
 */
function formatWind(mps) {
  return isCelsius ? `Wind: ${Math.round(mps * 3.6)} km/h` : `Wind: ${Math.round(mps * 2.23694)} mph`;
}

/**
 * Capitalize first letter of a string.
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Show loading spinner/container (if exists).
 */
function showLoading() {
  if (loadingEl) loadingEl.style.display = "flex";
}

/**
 * Hide loading spinner/container (if exists).
 */
function hideLoading() {
  if (loadingEl) loadingEl.style.display = "none";
}

/**
 * Simple wrapper for fetch + JSON + basic error handling.
 * Throws if response.ok is false.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function safeFetch(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Update the date display element with readable date.
 */
function updateDate() {
  if (!dateEl) return;
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Update the toggle button label based on current unit preference.
 */
function applyUnitToggleUI() {
  if (!unitToggleBtn) return;
  unitToggleBtn.textContent = isCelsius ? "Show °F" : "Show °C";
}

// -----------------------------
// REVERSE GEOCODING (OpenWeather -> fallback Nominatim)
// Returns a friendly display name like "Madhapur, Hyderabad"
// -----------------------------

/**
 * Pick the most useful locality field from Nominatim address object.
 * @param {object} address
 * @returns {string|null}
 */
function pickNominatimLocality(address) {
  if (!address) return null;
  const localityFields = [
    "suburb",
    "neighbourhood",
    "hamlet",
    "village",
    "town",
    "city_district",
    "city",
    "county",
    "state"
  ];
  for (const f of localityFields) {
    if (address[f]) return address[f];
  }
  return null;
}

/**
 * Reverse geocode lat/lon to a friendly display name.
 * Strategy:
 *  1) Try OpenWeather reverse with limit=5 and pick best entry.
 *  2) If that looks generic, fallback to Nominatim (OpenStreetMap) for neighbourhood/suburb details.
 *  3) Final fallback: single OpenWeather reverse call (limit=1) or "Unknown location".
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
async function reverseGeocode(lat, lon) {
  // 1) Try OpenWeather (limit=5)
  try {
    const owUrl = `${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=5&appid=${API_KEY}`;
    const owRes = await fetch(owUrl);
    if (owRes.ok) {
      const owData = await owRes.json().catch(() => []);
      if (Array.isArray(owData) && owData.length > 0) {
        // prefer entry whose name isn't identical to state/country
        let chosen = owData[0];
        for (const entry of owData) {
          const name = (entry.name || "").toLowerCase();
          const state = (entry.state || "").toLowerCase();
          const country = (entry.country || "").toLowerCase();
          if (name && name !== state && name !== country) {
            chosen = entry;
            break;
          }
        }
        const parts = [];
        if (chosen.name) parts.push(chosen.name);
        if (chosen.state && (!chosen.name || chosen.state.toLowerCase() !== chosen.name.toLowerCase())) parts.push(chosen.state);
        if (chosen.country && (!chosen.state || chosen.country.toLowerCase() !== chosen.state.toLowerCase())) parts.push(chosen.country);
        // return OpenWeather result if it seems specific
        if (parts.length > 0) return parts.join(", ");
      }
    }
  } catch (e) {
    console.warn("OpenWeather reverse geocode failed:", e && e.message);
  }

  // 2) Fallback to Nominatim for more granular locality (suburb/neighbourhood)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const nomRes = await fetch(nomUrl, { headers: { "Accept-Language": "en" }});
    if (nomRes.ok) {
      const nomData = await nomRes.json().catch(() => ({}));
      if (nomData && nomData.address) {
        const local = pickNominatimLocality(nomData.address);
        const city = nomData.address.city || nomData.address.town || nomData.address.county || nomData.address.state;
        if (local && city && local.toLowerCase() !== city.toLowerCase()) {
          return `${local}, ${city}`;
        } else if (local) {
          return local;
        } else if (city) {
          return city;
        }
      }
    } else {
      console.warn("Nominatim returned non-ok:", nomRes.status);
    }
  } catch (e) {
    console.warn("Nominatim reverse geocode failed:", e && e.message);
  }

  // 3) Final small OpenWeather attempt (limit=1)
  try {
    const owUrl2 = `${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
    const res2 = await fetch(owUrl2);
    if (res2.ok) {
      const d2 = await res2.json().catch(() => []);
      if (Array.isArray(d2) && d2.length > 0) {
        return d2[0].name || d2[0].state || d2[0].country || "Unknown location";
      }
    }
  } catch (e) {
    console.warn("Final OpenWeather attempt failed:", e && e.message);
  }

  // If all else fails:
  return "Unknown location";
}

// -----------------------------
// WEATHER FETCHING: by city or coordinates
// -----------------------------

/**
 * Fetch weather by city name (current + forecast), update UI and cache responses.
 * @param {string} city
 */
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

/**
 * Fetch weather by geographic coordinates. Uses reverseGeocode() to get a friendly display name.
 * @param {number} lat
 * @param {number} lon
 */
async function getWeatherByCoords(lat, lon) {
  showLoading();
  try {
    const displayName = await reverseGeocode(lat, lon);
    const cur = await safeFetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    const fdata = await safeFetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`);
    cur._displayName = displayName; // attach displayName for UI
    lastCurrentData = cur;
    lastForecastData = fdata;
    updateUI(cur, fdata);
  } catch (err) {
    alert(`Error fetching weather: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// -----------------------------
// GEOLOCATION: get browser location and fetch weather
// -----------------------------

/**
 * Attempt to get browser geolocation and fetch weather by coords.
 * If geolocation not supported or permission denied, falls back to 'Madhapur' city search.
 */
async function getLocationWeather() {
  showLoading();
  if (!navigator.geolocation) {
    alert('Geolocation not supported by this browser');
    // fallback to Madhapur if geolocation isn't available
    await getWeatherByCity('Madhapur');
    hideLoading();
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    try {
      await getWeatherByCoords(latitude, longitude);
    } catch (err) {
      alert(`Error fetching location/weather: ${err.message || err}`);
    } finally {
      hideLoading();
    }
  }, async (error) => {
    // On error (permission denied, timeout, etc) fallback to Madhapur
    alert(`Geolocation error: ${error.message || error.code}`);
    await getWeatherByCity('Madhapur');
    hideLoading();
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

// -----------------------------
// UI UPDATE: current weather, forecast & tips
// -----------------------------

/**
 * Update the entire UI with current weather and forecast data.
 * @param {object} current - /weather response
 * @param {object} forecast - /forecast response
 */
function updateUI(current, forecast) {
  if (!current || !forecast) return;

  // Location display (prefer reverse geocode attached _displayName)
  if (locationEl) {
    const display = current._displayName || `${current.name}, ${current.sys.country}`;
    locationEl.textContent = display;
  }

  // Date, main temp, description, icon
  updateDate();
  if (tempEl) tempEl.textContent = formatTemp(current.main.temp);
  if (conditionsEl) conditionsEl.textContent = capitalize(current.weather[0].description || "");
  if (iconEl) {
    iconEl.src = `https://openweathermap.org/img/wn/${current.weather[0].icon}@2x.png`;
    iconEl.alt = current.weather[0].description || 'weather icon';
  }

  // Feels-like, humidity, wind, sunrise, sunset
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

  // Generate and show daily tips based on conditions
  generateTip(current);

  // Build forecast elements
  updateForecast(forecast);
}

/**
 * Parse 3-hourly forecast into daily summaries and render next 5 days.
 * @param {object} forecast
 */
function updateForecast(forecast) {
  if (!forecast || !forecast.list || !forecastEl) return;

  // Group forecast entries by date string
  const daily = {};
  forecast.list.forEach(item => {
    const dateKey = new Date(item.dt * 1000).toLocaleDateString('en-US');
    if (!daily[dateKey]) daily[dateKey] = [];
    daily[dateKey].push(item);
  });

  // Select next 5 days excluding today (slice(1,6))
  const days = Object.keys(daily).slice(1, 6);
  forecastEl.innerHTML = '';

  days.forEach(day => {
    const data = daily[day];
    if (!data || data.length === 0) return;

    // Day name e.g., Mon, Tue
    const dayName = new Date(day).toLocaleDateString('en-US', { weekday: 'short' });

    // Compute high and low temps for the day (in Celsius)
    const highC = Math.max(...data.map(d => d.main.temp_max));
    const lowC = Math.min(...data.map(d => d.main.temp_min));

    // Choose a representative icon (middle entry)
    const icon = data[Math.floor(data.length / 2)].weather[0].icon;

    // Create forecast item HTML
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

/**
 * Generate a simple user tip based on current weather conditions.
 * Puts the text into tipEl if available.
 * @param {object} current
 */
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

// -----------------------------
// INITIALIZATION: wire up DOM events on load
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Populate DOM element refs
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

  // Search button click -> fetch by city
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const c = (cityInput && cityInput.value) ? cityInput.value.trim() : "";
      if (c) getWeatherByCity(c);
    });
  }

  // Enter key on input -> fetch by city
  if (cityInput) {
    cityInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const c = cityInput.value.trim();
        if (c) getWeatherByCity(c);
      }
    });
  }

  // Location button -> get browser geolocation
  if (locationBtn) locationBtn.addEventListener("click", getLocationWeather);

  // Unit toggle -> switch units and update UI (and persist preference)
  if (unitToggleBtn) {
    unitToggleBtn.addEventListener("click", () => {
      isCelsius = !isCelsius;
      localStorage.setItem("weather_isCelsius", isCelsius);
      applyUnitToggleUI();
      // refresh UI numbers if we have data cached
      if (lastCurrentData && lastForecastData) updateUI(lastCurrentData, lastForecastData);
    });
  }

  // initial UI setup
  updateDate();
  applyUnitToggleUI();

  // initial attempt to use browser location
  getLocationWeather();
});
