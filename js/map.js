// =====================================================================
// CivicSphere - Karnataka State Interactive Map Engine
// Authenticated CARTO Basemaps · Google Maps Style Controls · Real-World Geocoding
// =====================================================================

import { BLR_CENTER, WARDS, SENSITIVE, PRI_COLOR, CATS, DEPTS, KARNATAKA_BOUNDS, KARNATAKA_BORDER_COORDS, KARNATAKA_CITIES, PLACES, isWithinKarnataka } from './data.js';

let fullMap = null;
let currentTileLayer = null;
let markersLayer = null;
let wardsLayer = null;
let citiesLayer = null;
let sensitiveLayer = null;
let borderLayer = null;
let searchPlaceMarker = null;

let pickerMap = null;
let pickerMarker = null;

let userLocationMarker = null;
let userAccuracyCircle = null;

export const CARTO_API_KEY = 'cb1_52od_1_b34c3c8cb2c53410033edda2';

function isDarkMode() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' || theme === 'oled';
}

// ---------------------------------------------------------------------
// Authenticated Basemap Providers (Voyager, DarkMatter, OSM)
// ---------------------------------------------------------------------
export function getTileLayerUrl(type) {
  if (type === 'dark' || (type === 'auto' && isDarkMode())) {
    return `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;
  }
  if (type === 'osm') {
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  // Default: Voyager (Light)
  return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;
}

function createTileLayer(map, type = 'auto') {
  const url = getTileLayerUrl(type);
  const isOsm = type === 'osm';

  const tileLayer = window.L.tileLayer(url, {
    attribution: isOsm ? '&copy; OpenStreetMap contributors' : '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: isOsm ? 'abc' : 'abcd',
    maxZoom: 19,
    minZoom: 7
  });

  tileLayer.on('tileerror', () => {
    console.warn('CARTO tile slow/blocked, switching to OpenStreetMap fallback');
    if (map.hasLayer(tileLayer)) {
      map.removeLayer(tileLayer);
      const fallback = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 7
      });
      fallback.addTo(map);
      currentTileLayer = fallback;
    }
  });

  return tileLayer;
}

export function switchBasemap(type) {
  if (!fullMap) return;
  if (currentTileLayer && fullMap.hasLayer(currentTileLayer)) {
    fullMap.removeLayer(currentTileLayer);
  }
  currentTileLayer = createTileLayer(fullMap, type);
  currentTileLayer.addTo(fullMap);

  // Update UI active state in layers menu
  document.querySelectorAll('.gmap-layer-opt').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-layer') === type);
  });
}

// ---------------------------------------------------------------------
// Full Viewport Karnataka State Civic Map
// ---------------------------------------------------------------------
export function initFullMap(containerEl, { onPinClick }) {
  if (!window.L) {
    console.error('Leaflet is not available in window');
    return null;
  }

  if (fullMap) {
    fullMap.remove();
  }

  const karnatakaLatLngBounds = window.L.latLngBounds(KARNATAKA_BOUNDS);

  fullMap = window.L.map(containerEl, {
    center: [BLR_CENTER.lat, BLR_CENTER.lng],
    zoom: 12,
    minZoom: 7,
    maxZoom: 19,
    maxBounds: karnatakaLatLngBounds,
    maxBoundsViscosity: 0.5, // Soft resistance at border allowing smooth high-precision flyTo
    zoomControl: false // Using modern Google Maps style zoom stack
  });

  currentTileLayer = createTileLayer(fullMap, 'auto');
  currentTileLayer.addTo(fullMap);

  // Layer Groups
  borderLayer = window.L.layerGroup().addTo(fullMap);
  citiesLayer = window.L.layerGroup().addTo(fullMap);
  wardsLayer = window.L.layerGroup().addTo(fullMap);
  sensitiveLayer = window.L.layerGroup().addTo(fullMap);
  markersLayer = window.L.layerGroup().addTo(fullMap);

  // Render Boundaries & City Hubs
  renderKarnatakaBoundary();
  renderKarnatakaCities();
  renderWardBoundaries();
  renderSensitivePills();

  // Multi-stage size invalidation for zero-grey tiles
  setTimeout(() => fullMap && fullMap.invalidateSize(), 50);
  setTimeout(() => fullMap && fullMap.invalidateSize(), 250);
  setTimeout(() => fullMap && fullMap.invalidateSize(), 600);

  window.addEventListener('resize', () => {
    if (fullMap) fullMap.invalidateSize();
  });

  return fullMap;
}

// ---------------------------------------------------------------------
// Google Maps Side Controls Actions (Compass, Zoom, Re-orient)
// ---------------------------------------------------------------------
let compassAngle = 0;

export function reorientCompass() {
  if (!fullMap) return;
  // Animate compass needle
  compassAngle += 360;
  const needle = document.getElementById('compass-needle-poly');
  if (needle) {
    needle.style.transform = `rotate(${compassAngle}deg)`;
  }
  // Smoothly center and re-orient view
  fullMap.fitBounds(KARNATAKA_BOUNDS, { padding: [25, 25], duration: 1.2 });
  if (window.showToast) window.showToast('🧭 Re-oriented to True North · Karnataka Overview');
}

export function zoomInMap() {
  if (fullMap) fullMap.zoomIn();
}

export function zoomOutMap() {
  if (fullMap) fullMap.zoomOut();
}

export function zoomToFullKarnataka() {
  if (fullMap) {
    fullMap.fitBounds(KARNATAKA_BOUNDS, { padding: [30, 30], duration: 1.2 });
  }
}

export function flyToLocation(lat, lng, zoom = 15) {
  if (fullMap && isWithinKarnataka(lat, lng)) {
    fullMap.flyTo([lat, lng], zoom, { duration: 1.2 });
  }
}

export function flyToKarnatakaCity(cityName) {
  const city = KARNATAKA_CITIES.find(c => c.name.toLowerCase().includes(cityName.toLowerCase()));
  if (city && fullMap) {
    fullMap.flyTo([city.lat, city.lng], 13, { duration: 1.2 });
  }
}

// ---------------------------------------------------------------------
// Universal Auto-Location Engine (All Devices: Mobile, Tablet, Desktop)
// Zero-Prompt IP Geolocation + High-Accuracy Browser GPS Upgrade
// ---------------------------------------------------------------------
export async function fetchIPLocation() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      if (lat && lng && isWithinKarnataka(lat, lng)) {
        return {
          lat,
          lng,
          city: data.city || 'Bengaluru',
          region: data.region || 'Karnataka',
          accuracy: 5000,
          source: 'network_ip'
        };
      }
    }
  } catch (e) {}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch('https://freeipapi.com/api/json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      if (lat && lng && isWithinKarnataka(lat, lng)) {
        return {
          lat,
          lng,
          city: data.cityName || 'Bengaluru',
          region: data.regionName || 'Karnataka',
          accuracy: 5000,
          source: 'network_ip'
        };
      }
    }
  } catch (e) {}

  return null;
}

// ---------------------------------------------------------------------
// Reverse Geocoding Engine (OpenStreetMap Nominatim)
// Resolves coordinates to real-world street, road, neighbourhood & city
// ---------------------------------------------------------------------
const reverseGeocodeCache = new Map();

export async function reverseGeocodeCoords(lat, lng) {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2600);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.street || addr.residential || addr.suburb || addr.neighbourhood || '';
      const area = addr.suburb || addr.neighbourhood || addr.city_district || '';
      const city = addr.city || addr.town || addr.village || addr.county || 'Karnataka';
      const postcode = addr.postcode ? ` - ${addr.postcode}` : '';

      const parts = [road, area, city].filter(Boolean);
      const formatted = parts.length > 0 ? parts.join(', ') : (data.display_name?.split(',').slice(0, 3).join(', ') || 'Karnataka');
      const cleanAddress = formatted + (formatted.includes('Karnataka') ? '' : ', Karnataka') + postcode;

      const result = {
        formattedAddress: cleanAddress,
        street: road || area || city || 'Karnataka Local Street',
        area: area || city,
        city
      };
      reverseGeocodeCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    // Offline or fast fallback
  }

  return null;
}

export function renderUserLocationMarker(map, lat, lng, accuracy = 20, addressLabel = '', { zoom = 17, fly = true } = {}) {
  if (!map || !window.L) return;

  const targetZoom = accuracy <= 35 ? Math.max(zoom, 17) : Math.min(zoom, 16);

  // Smoothly update marker position if already rendered
  if (userLocationMarker && map.hasLayer(userLocationMarker)) {
    userLocationMarker.setLatLng([lat, lng]);
  } else {
    const pulseHtml = `
      <div class="user-location-pulse">
        <div class="pulse-ring"></div>
        <div class="pulse-core"></div>
      </div>
    `;
    const pulseIcon = window.L.divIcon({
      className: 'user-location-icon',
      html: pulseHtml,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    userLocationMarker = window.L.marker([lat, lng], { icon: pulseIcon, zIndexOffset: 1000 }).addTo(map);
  }

  // Render or update accuracy uncertainty circle
  const visualRadius = Math.max(accuracy, 10);
  if (userAccuracyCircle && map.hasLayer(userAccuracyCircle)) {
    userAccuracyCircle.setLatLng([lat, lng]);
    userAccuracyCircle.setRadius(visualRadius);
  } else {
    userAccuracyCircle = window.L.circle([lat, lng], {
      radius: visualRadius,
      color: '#1a73e8',
      fillColor: '#1a73e8',
      fillOpacity: 0.12,
      weight: 1.5
    }).addTo(map);
  }

  const accText = accuracy <= 35 ? `GPS High-Precision ±${Math.round(accuracy)}m` : `Estimated Range ±${Math.round(accuracy)}m`;
  const locationTitle = addressLabel ? `<b>📍 ${addressLabel}</b><br>` : '<b>📍 Your Current Location</b><br>';

  userLocationMarker.unbindTooltip();
  userLocationMarker.bindTooltip(`${locationTitle}<span style="font-size:11px; color:#64748b;">${accText}</span>`, {
    permanent: false,
    direction: 'top',
    offset: [0, -10],
    className: 'gmap-loc-tooltip'
  });

  if (fly) {
    map.flyTo([lat, lng], targetZoom, { duration: 1.2 });
  }
}

// ---------------------------------------------------------------------
// High-Precision Hardware GPS Engine with Progressive Refinement
// Uses watchPosition with maximumAge: 0 to get fresh real-world satellites/Wi-Fi
// ---------------------------------------------------------------------
export function acquireHighPrecisionLocation({ onProgress, onSuccess, onError }) {
  if (!navigator.geolocation) {
    if (onError) onError({ code: 'NOT_SUPPORTED', message: 'Geolocation is not supported by your browser.' });
    return;
  }

  let bestReading = null;
  let watchId = null;
  let settled = false;

  const cleanup = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };

  // Safety timer to prevent hanging if device never stabilizes
  const safetyTimer = setTimeout(() => {
    if (!settled) {
      settled = true;
      cleanup();
      if (bestReading) {
        if (onSuccess) onSuccess(bestReading);
      } else {
        if (onError) onError({ code: 'TIMEOUT', message: 'GPS satellite / network lock timed out after 12s.' });
      }
    }
  }, 12000);

  const handlePosition = (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy || 20;

    const reading = {
      lat,
      lng,
      accuracy,
      source: 'device_gps',
      timestamp: pos.timestamp || Date.now()
    };

    if (!bestReading || accuracy < bestReading.accuracy) {
      bestReading = reading;
    }

    if (onProgress) {
      onProgress(reading);
    }

    // High precision achieved (<= 25 meters)!
    if (accuracy <= 25 && !settled) {
      settled = true;
      clearTimeout(safetyTimer);
      cleanup();
      if (onSuccess) onSuccess(reading);
    }
  };

  const handleError = (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(safetyTimer);
    cleanup();

    let code = 'UNKNOWN';
    let message = 'Could not acquire your current location.';

    if (err.code === 1) { // PERMISSION_DENIED
      code = 'PERMISSION_DENIED';
      message = 'Location permission was denied. Please allow location access in your browser (click the lock icon 🔒 in the URL address bar).';
    } else if (err.code === 2) { // POSITION_UNAVAILABLE
      code = 'POSITION_UNAVAILABLE';
      message = 'Device GPS / location service is unavailable. Please check that location is enabled in your OS settings.';
    } else if (err.code === 3) { // TIMEOUT
      code = 'TIMEOUT';
      message = 'GPS location request timed out. Retrying with network fallback...';
    }

    if (onError) onError({ code, message, originalError: err });
  };

  try {
    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0, // STRICTLY FRESH, NO CACHE
      timeout: 10000
    });
  } catch (e) {
    handleError(e);
  }
}

export function locateUserOnMap(targetMap, { onSuccess, onError, onPrompt, silent = false } = {}) {
  const activeMap = targetMap || fullMap;
  const locateBtn = document.getElementById('gmap-locate-btn');
  if (locateBtn && !silent) locateBtn.classList.add('locating');

  if (onPrompt) onPrompt();

  acquireHighPrecisionLocation({
    onProgress: (reading) => {
      renderUserLocationMarker(activeMap, reading.lat, reading.lng, reading.accuracy, '', { zoom: 17, fly: true });
    },
    onSuccess: async (reading) => {
      if (locateBtn) {
        locateBtn.classList.remove('locating');
        locateBtn.classList.add('located');
      }
      const geo = await reverseGeocodeCoords(reading.lat, reading.lng);
      const street = geo?.street || 'Karnataka Street';
      renderUserLocationMarker(activeMap, reading.lat, reading.lng, reading.accuracy, street, { zoom: 17, fly: false });
      if (onSuccess) onSuccess({ ...reading, address: geo?.formattedAddress || street, street });
    },
    onError: async (err) => {
      if (locateBtn) locateBtn.classList.remove('locating');
      // Only fall back to IP location when GPS hardware is completely unavailable
      const ipLoc = await fetchIPLocation();
      if (ipLoc) {
        renderUserLocationMarker(activeMap, ipLoc.lat, ipLoc.lng, ipLoc.accuracy, 'Network Area Approximation', { zoom: 14, fly: true });
        if (onSuccess) onSuccess({ ...ipLoc, source: 'network_ip_fallback' });
        return;
      }
      if (onError && !silent) onError(err.message || 'Could not acquire location.');
    }
  });
}

// ---------------------------------------------------------------------
// Real-World Street & Place Geocoding Engine (Google Maps Search)
// ---------------------------------------------------------------------
const searchCache = new Map();

export async function searchRealWorldPlaces(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();

  if (searchCache.has(q)) {
    return searchCache.get(q);
  }

  const results = [];
  const seen = new Set();

  // 1. Instant local index matching (Cities, Wards, Landmarks)
  KARNATAKA_CITIES.forEach((c) => {
    if (c.name.toLowerCase().includes(q)) {
      const key = `${c.name}-${c.lat.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          name: c.name,
          secondary: `${c.zone}, Karnataka`,
          type: 'city',
          icon: c.icon || '🏛️',
          lat: c.lat,
          lng: c.lng
        });
      }
    }
  });

  WARDS.forEach((w) => {
    if (w.name.toLowerCase().includes(q)) {
      const key = `${w.name}-${w.lat.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          name: w.name,
          secondary: `${w.zone}, ${w.city || 'Karnataka'}`,
          type: 'ward',
          icon: '📍',
          lat: w.lat,
          lng: w.lng
        });
      }
    }
  });

  PLACES.forEach((p) => {
    if (p.name.toLowerCase().includes(q)) {
      const key = `${p.name}-${p.lat.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          name: p.name,
          secondary: 'Karnataka Landmark / Street',
          type: p.kind || 'landmark',
          icon: p.kind === 'street' ? '🛣️' : '📍',
          lat: p.lat,
          lng: p.lng
        });
      }
    }
  });

  // 2. Query Nominatim OpenStreetMap for all streets & real-world places in Karnataka
  try {
    const searchParam = q.includes('karnataka') || q.includes('bengaluru') || q.includes('bangalore') || q.includes('mysore')
      ? q
      : `${q}, Karnataka`;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchParam)}&countrycodes=in&viewbox=74.00,18.55,78.65,11.45&bounded=0&limit=5&addressdetails=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    const resp = await fetch(nominatimUrl, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      data.forEach((item) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (isWithinKarnataka(lat, lng)) {
          const parts = (item.display_name || '').split(',');
          const mainName = parts[0]?.trim() || query;
          const secondary = parts.slice(1, 4).join(',').trim();
          const key = `${mainName}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            const isStreet = item.type === 'secondary' || item.type === 'primary' || item.type === 'residential' || item.class === 'highway';
            results.push({
              name: mainName,
              secondary: secondary || 'Karnataka, India',
              type: isStreet ? 'street' : item.type || 'place',
              icon: isStreet ? '🛣️' : '📍',
              lat,
              lng
            });
          }
        }
      });
    }
  } catch (e) {
    // Silent fallback
  }

  // 3. Fallback to Photon Komoot API for street POIs
  if (results.length < 5) {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=74.00,11.45,78.65,18.55&limit=5`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(photonUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        (data.features || []).forEach((feat) => {
          const [lng, lat] = feat.geometry?.coordinates || [];
          if (lat && lng && isWithinKarnataka(lat, lng)) {
            const props = feat.properties || {};
            const name = props.name || props.street || query;
            const city = props.city || props.district || props.county || 'Karnataka';
            const key = `${name}-${lat.toFixed(3)}-${lng.toFixed(3)}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                name,
                secondary: `${city}, Karnataka`,
                type: props.osm_value || 'place',
                icon: props.osm_key === 'highway' ? '🛣️' : '📍',
                lat,
                lng
              });
            }
          }
        });
      }
    } catch (e) {}
  }

  const finalResults = results.slice(0, 8);
  searchCache.set(q, finalResults);
  return finalResults;
}

// Drop Google Maps Style Highlight Pin for Searched Place
export function highlightSearchPlace(lat, lng, name, secondary) {
  if (!fullMap) return;

  if (searchPlaceMarker && fullMap.hasLayer(searchPlaceMarker)) {
    fullMap.removeLayer(searchPlaceMarker);
  }

  const pinHtml = `
    <div class="gmap-search-pin">
      <svg width="32" height="42" viewBox="0 0 384 512">
        <path fill="#ea4335" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
        <circle cx="192" cy="192" r="70" fill="#ffffff"/>
      </svg>
    </div>
  `;

  const pinIcon = window.L.divIcon({
    className: 'custom-search-pin',
    html: pinHtml,
    iconSize: [32, 42],
    iconAnchor: [16, 42]
  });

  searchPlaceMarker = window.L.marker([lat, lng], { icon: pinIcon }).addTo(fullMap);
  searchPlaceMarker.bindTooltip(`<b>📍 ${name}</b><br><span style="font-size:11px;">${secondary}</span>`, {
    permanent: false,
    direction: 'top',
    offset: [0, -42]
  });

  fullMap.flyTo([lat, lng], 16, { duration: 1.4 });
}

// ---------------------------------------------------------------------
// Render Karnataka State Boundary & City Hubs
// ---------------------------------------------------------------------
function renderKarnatakaBoundary() {
  if (!borderLayer) return;
  borderLayer.clearLayers();

  const isDark = isDarkMode();
  const borderColor = isDark ? '#60a5fa' : '#2563eb';

  const stateBorder = window.L.polygon(KARNATAKA_BORDER_COORDS, {
    color: borderColor,
    weight: 2.5,
    opacity: 0.85,
    dashArray: '6, 6',
    fillColor: borderColor,
    fillOpacity: 0.03
  });

  stateBorder.bindTooltip('<b style="font-size:12px;">🏛️ Karnataka State Municipal Jurisdiction</b>', {
    sticky: true
  });

  borderLayer.addLayer(stateBorder);
}

function renderKarnatakaCities() {
  if (!citiesLayer) return;
  citiesLayer.clearLayers();

  KARNATAKA_CITIES.forEach((city) => {
    const cityIcon = window.L.divIcon({
      className: 'karnataka-city-icon',
      html: `
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(6px);
          color: #ffffff;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          cursor: pointer;
          white-space: nowrap;
        ">
          <span>${city.icon}</span>
          <span>${city.name}</span>
        </div>
      `,
      iconSize: [120, 24],
      iconAnchor: [60, 12]
    });

    const marker = window.L.marker([city.lat, city.lng], { icon: cityIcon });
    marker.on('click', () => {
      if (fullMap) fullMap.flyTo([city.lat, city.lng], 13, { duration: 1.2 });
    });

    citiesLayer.addLayer(marker);
  });
}

export function updateMapMarkers(complaints, { filterStatus = 'all', filterPriority = '', filterCategory = '', onPinClick }) {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  const filtered = complaints.filter((c) => {
    if (c.duplicate_of) return false;
    if (!isWithinKarnataka(c.lat, c.lng)) return false;

    if (filterStatus === 'open' && ['RESOLVED', 'CLOSED'].includes(c.status)) return false;
    if (filterStatus === 'resolved' && !['RESOLVED', 'CLOSED'].includes(c.status)) return false;
    if (filterPriority && c.priority !== filterPriority) return false;
    if (filterCategory && c.category !== filterCategory) return false;
    return true;
  });

  filtered.forEach((c) => {
    const color = PRI_COLOR[c.priority] || '#3b82f6';
    const cat = CATS[c.category] || ['ROADS', 50, 'Civic Issue', '📍'];
    const emoji = cat[3];
    const isP1 = c.priority === 'P1';

    const iconHtml = `
      <div style="
        position: relative;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: ${color};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        border: 2.5px solid #ffffff;
        cursor: pointer;
        transition: transform 0.2s ease;
      " class="map-marker-pin ${isP1 ? 'marker-pulse' : ''}" title="${c.id} - ${c.title}">
        <span>${emoji}</span>
      </div>
    `;

    const customIcon = window.L.divIcon({
      className: 'custom-map-icon',
      html: iconHtml,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    const marker = window.L.marker([c.lat, c.lng], { icon: customIcon });

    marker.on('click', () => {
      if (onPinClick) onPinClick(c);
    });

    markersLayer.addLayer(marker);
  });
}

function renderWardBoundaries() {
  if (!wardsLayer) return;
  wardsLayer.clearLayers();

  WARDS.forEach((w) => {
    const circle = window.L.circle([w.lat, w.lng], {
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.04,
      weight: 1,
      dashArray: '4, 4',
      radius: 1800
    });

    const labelIcon = window.L.divIcon({
      className: 'ward-label-icon',
      html: `<div style="font-size: 11px; font-weight: 700; color: #64748b; background: rgba(255,255,255,0.85); padding: 2px 7px; border-radius: 4px; pointer-events: none; white-space: nowrap; border: 1px solid rgba(0,0,0,0.1);">${w.name}</div>`,
      iconSize: [80, 20],
      iconAnchor: [40, 10]
    });

    const labelMarker = window.L.marker([w.lat, w.lng], { icon: labelIcon, interactive: false });

    wardsLayer.addLayer(circle);
    wardsLayer.addLayer(labelMarker);
  });
}

function renderSensitivePills() {
  if (!sensitiveLayer) return;
  sensitiveLayer.clearLayers();

  SENSITIVE.forEach((s) => {
    const icon = s.type === 'hospital' ? '🏥' : s.type === 'school' ? '🏫' : '🚆';
    const marker = window.L.circleMarker([s.lat, s.lng], {
      radius: 5,
      color: s.type === 'hospital' ? '#ef4444' : '#8b5cf6',
      fillColor: s.type === 'hospital' ? '#ef4444' : '#8b5cf6',
      fillOpacity: 0.65,
      weight: 1.5
    });

    marker.bindTooltip(`<b>${icon} ${s.name}</b><br><span style="font-size:11px;color:#64748b;">${s.type.toUpperCase()} · High Urgency Buffer (Karnataka)</span>`, {
      direction: 'top',
      offset: [0, -6]
    });

    sensitiveLayer.addLayer(marker);
  });
}

// ---------------------------------------------------------------------
// Interactive Location Picker for Issue Reporting (Locked to Karnataka)
// ---------------------------------------------------------------------
export function initPickerMap(containerEl, { initialPos, onPosPicked }) {
  if (!window.L) return null;

  if (pickerMap) {
    pickerMap.remove();
  }

  const karnatakaLatLngBounds = window.L.latLngBounds(KARNATAKA_BOUNDS);
  const pos = (initialPos && isWithinKarnataka(initialPos.lat, initialPos.lng)) ? initialPos : BLR_CENTER;

  pickerMap = window.L.map(containerEl, {
    center: [pos.lat, pos.lng],
    zoom: 14,
    minZoom: 7,
    maxZoom: 19,
    maxBounds: karnatakaLatLngBounds,
    maxBoundsViscosity: 0.5,
    zoomControl: false
  });

  createTileLayer(pickerMap, 'auto').addTo(pickerMap);

  const pickerBorder = window.L.polygon(KARNATAKA_BORDER_COORDS, {
    color: '#2563eb',
    weight: 2,
    opacity: 0.7,
    dashArray: '5, 5',
    fillColor: '#2563eb',
    fillOpacity: 0.02
  }).addTo(pickerMap);

  const pinHtml = `
    <div style="
      width: 34px;
      height: 34px;
      border-radius: 50% 50% 50% 0;
      background: #2563eb;
      transform: rotate(-45deg);
      border: 3px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      cursor: grab;
    "></div>
  `;

  const pinIcon = window.L.divIcon({
    className: 'picker-pin-icon',
    html: pinHtml,
    iconSize: [34, 34],
    iconAnchor: [17, 34]
  });

  pickerMarker = window.L.marker([pos.lat, pos.lng], {
    icon: pinIcon,
    draggable: true
  }).addTo(pickerMap);

  const handleCoords = (latlng) => {
    let { lat, lng } = latlng;
    if (!isWithinKarnataka(lat, lng)) {
      lat = Math.min(Math.max(lat, 11.55), 18.45);
      lng = Math.min(Math.max(lng, 74.10), 78.55);
      pickerMarker.setLatLng([lat, lng]);
      if (window.showToast) window.showToast('📍 Clamped: Location restricted to Karnataka State jurisdiction.');
    }
    if (onPosPicked) onPosPicked({ lat, lng });
  };

  pickerMarker.on('dragend', (e) => {
    handleCoords(e.target.getLatLng());
  });

  pickerMap.on('click', (e) => {
    pickerMarker.setLatLng(e.latlng);
    handleCoords(e.latlng);
  });

  setTimeout(() => pickerMap && pickerMap.invalidateSize(), 50);
  setTimeout(() => pickerMap && pickerMap.invalidateSize(), 250);

  return {
    setPos: (lat, lng, zoom = 17) => {
      let finalLat = lat;
      let finalLng = lng;
      if (!isWithinKarnataka(lat, lng)) {
        finalLat = Math.min(Math.max(lat, 11.55), 18.45);
        finalLng = Math.min(Math.max(lng, 74.10), 78.55);
      }
      pickerMarker.setLatLng([finalLat, finalLng]);
      pickerMap.flyTo([finalLat, finalLng], zoom, { duration: 1.0 });
    },
    getMap: () => pickerMap
  };
}

export function getFullMap() {
  return fullMap;
}

export function getPickerMap() {
  return pickerMap;
}
