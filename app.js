// 🌐 Global State
let stops = [];                  // All recorded stop objects
let map = null;                  // Leaflet map instance
let markers = [];                // Leaflet marker instances
let lowData = false;             // Low-data mode toggle

let originalHeader = null;       // Exact header from uploaded TXT/CSV file
let originalMapping = {};        // Logical field → normalized column name

// Init map + load autosave
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadAutosave();
});

function initMap() {
  map = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);
}

// Utilities
function makeIds() {
  const ts = Date.now();
  return { stop_id: ts, stop_code: 'S' + ts };
}
function sanitizeCoord(coord) {
  return coord.toFixed(6).replace('.', '_');
}

// 🔄 Autosave helpers
function autosave() {
  try {
    localStorage.setItem('busStopsData', JSON.stringify(stops));
  } catch (e) {
    console.warn('Autosave failed:', e);
  }
}
function loadAutosave() {
  try {
    const saved = localStorage.getItem('busStopsData');
    if (saved) {
      stops = JSON.parse(saved);
      refreshMap();
      refreshTable();
    }
  } catch (e) {
    console.warn('Failed to load autosave:', e);
  }
}
function clearAutosave() {
  if (confirm("Are you sure you want to clear all auto‑saved entries? This cannot be undone.")) {
    localStorage.removeItem('busStopsData');
    stops = [];
    refreshMap();
    refreshTable();
    alert("Auto‑saved entries cleared. You're now starting fresh.");
  }
}

// Record a stop with optional photo; auto-center on new points only
async function recordStop() {
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej)
    );
    const { latitude: stop_lat, longitude: stop_lon } = pos.coords;
    const { stop_id, stop_code } = makeIds();

    const stop_name = document.getElementById('stopName').value.trim();
    const stop_desc = document.getElementById('stopDesc').value.trim();

    const capIn = document.getElementById('captureImage');
    const upIn = document.getElementById('uploadImage');
    const file = capIn.files[0] || upIn.files[0] || null;

    let photoDataUrl = null;
    let photoFileName = '';

    if (file) {
      const latStr = sanitizeCoord(stop_lat);
      const lonStr = sanitizeCoord(stop_lon);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      photoFileName = `img${latStr}_${lonStr}.${ext}`;
      saveAs(file, photoFileName);
      photoDataUrl = await new Promise(r => {
        const rd = new FileReader();
        rd.onload = () => r(rd.result);
        rd.readAsDataURL(file);
      });
    }

    const stop = {
      stop_id,
      stop_code,
      stop_name,
      stop_desc,
      stop_lat,
      stop_lon,
      photoDataUrl,
      photoFileName,
      originalRow: {}
    };
    stops.push(stop);
    addMarker(stop);

    // Auto-center for new points
    map.setView([stop_lat, stop_lon], 15);

    // Clear inputs
    document.getElementById('stopName').value = '';
    document.getElementById('stopDesc').value = '';
    capIn.value = '';
    upIn.value = '';

    refreshTable();
    autosave();
  } catch {
    alert('GPS error or permission denied');
  }
}

// Add marker with popup; draggable for coordinate editing
function addMarker(stop) {
  if (!map) return;

  const marker = L.marker([stop.stop_lat, stop.stop_lon], { draggable: true }).addTo(map);

  let popup = `<b>${stop.stop_name || stop.stop_code}</b><br>${stop.stop_desc || ''}`;

  if (stop.photoDataUrl) {
    popup += `<br><img src="${stop.photoDataUrl}" style="max-width:150px">`;
  }

  popup += `
    <br><button id="edit-${stop.stop_code}">Edit</button>
    <button id="delete-${stop.stop_code}">Delete</button>
  `;

  marker.bindPopup(popup);

  // Handle popup buttons
  marker.on('popupopen', () => {
    const editBtn = document.getElementById(`edit-${stop.stop_code}`);
    const delBtn = document.getElementById(`delete-${stop.stop_code}`);

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        editStop(stop);
        marker.closePopup();
      });
    }
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        deleteStop(stop);
        marker.closePopup();
      });
    }
  });

  // Handle drag‑and‑drop coordinate editing
  marker.on('dragend', (e) => {
    const { lat, lng } = e.target.getLatLng();
    stop.stop_lat = lat;
    stop.stop_lon = lng;
    refreshTable();
    autosave();
  });

  markers.push(marker);
}

// ✏️ Edit stop (prompt-based editing, including coordinates)
function editStop(stop) {
  const name = prompt('Edit stop name:', stop.stop_name) || '';
  const desc = prompt('Edit description:', stop.stop_desc) || '';
  const lat = parseFloat(prompt('Edit latitude:', stop.stop_lat)) || stop.stop_lat;
  const lon = parseFloat(prompt('Edit longitude:', stop.stop_lon)) || stop.stop_lon;

  stop.stop_name = name.trim();
  stop.stop_desc = desc.trim();
  stop.stop_lat = lat;
  stop.stop_lon = lon;

  refreshMap(false); // redraw markers without recentering
  refreshTable();
  autosave();
}

// ❌ Delete stop
function deleteStop(stop) {
  stops = stops.filter(s => s.stop_id !== stop.stop_id);
  refreshMap(false);
  refreshTable();
  autosave();
}

// 🔄 Refresh map
function refreshMap(recenter = true) {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  stops.forEach(s => addMarker(s));

  if (recenter && stops.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

// 📋 Refresh table
function refreshTable() {
  const tbody = document.querySelector('#stopsTable tbody');
  tbody.innerHTML = '';

  stops.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.stop_id}</td>
      <td>${s.stop_name}</td>
      <td>${s.stop_desc}</td>
      <td>${s.stop_lat.toFixed(6)}</td>
      <td>${s.stop_lon.toFixed(6)}</td>
    `;
    // Clicking a row highlights the marker
    tr.addEventListener('click', () => {
      const marker = markers.find(m => {
        const { lat, lng } = m.getLatLng();
        return Math.abs(lat - s.stop_lat) < 1e-6 && Math.abs(lng - s.stop_lon) < 1e-6;
      });
      if (marker) {
        marker.openPopup();
        map.setView(marker.getLatLng(), 16);
      }
    });
    tbody.appendChild(tr);
  });
}

// 📉 Toggle low-data mode
function toggleLowData() {
  lowData = !lowData;
  document.body.classList.toggle('low-data', lowData);
  if (lowData) {
    alert('Low-data mode enabled: map hidden, only table view active.');
  } else {
    alert('Low-data mode disabled: map visible again.');
  }
}

// 📂 Handle file upload entrypoint
function handleUpload() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file first.');
    return;
  }
  if (file.name.endsWith('.json')) {
    loadStopsJSON(file);
  } else {
    loadStops(file);
  }
}

// 📥 Load stops from TXT/CSV
function loadStops(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result.trim();
    const rows = text.split('\n');

    const rawHeader = rows.shift()
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map(h => h.trim());
    originalHeader = rawHeader;
    const header = rawHeader.map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));

    originalMapping = {};

    const isPreferred = header.includes('stop_id') &&
                        header.includes('stop_code') &&
                        header.includes('stop_name') &&
                        header.includes('stop_desc') &&
                        header.includes('stop_lat') &&
                        header.includes('stop_lon');

    if (isPreferred) {
      // GTFS-like header
      stops = rows.map(r => {
        const cols = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
                      .map(v => v.replace(/^"|"$/g, ''));
        const originalRow = {};
        rawHeader.forEach((h, idx) => { originalRow[h] = cols[idx]; });
        return {
          stop_id: cols[header.indexOf('stop_id')],
          stop_code: cols[header.indexOf('stop_code')],
          stop_name: cols[header.indexOf('stop_name')],
          stop_desc: cols[header.indexOf('stop_desc')],
          stop_lat: +cols[header.indexOf('stop_lat')],
          stop_lon: +cols[header.indexOf('stop_lon')],
          photoDataUrl: null,
          photoFileName: header.includes('img_filename') ? cols[header.indexOf('img_filename')] : '',
          originalRow
        };
      });
    } else {
      // Try to detect columns
      const findCol = (aliases) => header.find(h => aliases.includes(h)) || null;
      originalMapping.name = findCol(['name','stopname','title']);
      originalMapping.lat  = findCol(['lat','latitude','_lat','stoplat']);
      originalMapping.lon  = findCol(['lon','lng','longitude','_lon','stoplon']);
      originalMapping.desc = findCol(['desc','description','stopdesc']);
      originalMapping.img  = findCol(['img','image','photo','imgfilename']);

      if (!originalMapping.lat || !originalMapping.lon) {
        alert('Could not detect latitude/longitude columns.');
        return;
      }

      stops = rows.map((r) => {
        const cols = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
                      .map(v => v.replace(/^"|"$/g, ''));
        const get = (colName) => {
          const idx = header.indexOf(colName);
          return idx >= 0 ? cols[idx] : '';
        };
        const stop_lat = +get(originalMapping.lat);
        const stop_lon = +get(originalMapping.lon);
        const stop_name = get(originalMapping.name);
        const stop_desc = get(originalMapping.desc);
        const photoFileName = originalMapping.img ? get(originalMapping.img) : '';
        const { stop_id, stop_code } = makeIds();

        const originalRow = {};
        rawHeader.forEach((h, idx) => { originalRow[h] = cols[idx]; });

        return {
          stop_id,
          stop_code,
          stop_name,
          stop_desc,
          stop_lat,
          stop_lon,
          photoDataUrl: null,
          photoFileName,
          originalRow
        };
      });
    }

    refreshMap();
    refreshTable();
    autosave();
  };
  reader.readAsText(file);
}

// 📥 Load stops from JSON
function loadStopsJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result.trim());
      if (!Array.isArray(data)) throw new Error('JSON must be an array of stop objects');

      originalHeader = null;
      originalMapping = {};

      stops = data.map((obj) => {
        const { stop_id, stop_code } = obj.stop_id
          ? { stop_id: obj.stop_id, stop_code: obj.stop_code || 'S' + obj.stop_id }
          : makeIds();
        const lat = obj.lat ?? obj.latitude ?? obj.stop_lat;
        const lon = obj.lon ?? obj.lng ?? obj.longitude ?? obj.stop_lon;
        return {
          stop_id,
          stop_code,
          stop_name: obj.name ?? obj.stop_name ?? '',
          stop_desc: obj.desc ?? obj.stop_desc ?? '',
          stop_lat: Number(lat),
          stop_lon: Number(lon),
          photoDataUrl: null,
          photoFileName: obj.img ?? obj.image ?? obj.photo ?? '',
          originalRow: { ...obj }
        };
      });

      refreshMap();
      refreshTable();
      autosave();
    } catch (e) {
      alert('Invalid JSON file: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// 🌐 Load from API (GET) using "allBusStops" format
async function loadFromAPI(url) {
  try {
    if (!url) throw new Error('API URL is required');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network error: ' + res.status);

    const json = await res.json();
    const data = json.allBusStops;
    if (!Array.isArray(data)) throw new Error('Expected "allBusStops" to be an array');

    originalHeader = null;
    originalMapping = {};

    stops = data.map((obj) => {
      const {
        id,
        name,
        alias,
        district,
        type,
        latitude,
        longitude,
        is_active,
        description,
        capacity,
        operating_hours,
        nearby_landmarks,
        highway,
        created_at,
        updated_at
      } = obj;

      const { stop_id, stop_code } = id
        ? { stop_id: id, stop_code: 'S' + id }
        : makeIds();

      return {
        stop_id,
        stop_code,
        stop_name: name ?? '',
        stop_desc: description ?? '',
        stop_lat: Number(latitude),
        stop_lon: Number(longitude),
        photoDataUrl: null,
        photoFileName: '',
        originalRow: {
          id,
          name,
          alias,
          district,
          type,
          latitude,
          longitude,
          is_active,
          description,
          capacity,
          operating_hours,
          nearby_landmarks,
          highway,
          created_at,
          updated_at
        }
      };
    });

    refreshMap();
    refreshTable();
    autosave();
  } catch (err) {
    alert('Failed to load from API: ' + err.message);
  }
}

// 📤 Export stops (TXT or JSON)
function exportStops(format = 'txt', apiMode = false) {
  const ts = Date.now();

  // If exporting for API, enforce API schema
  if (apiMode || format === 'json') {
    const data = stops.map(s => {
      const row = { ...s.originalRow };

      // Overwrite editable fields with latest values
      row.id = s.stop_id;
      row.name = s.stop_name;
      row.description = s.stop_desc;
      row.latitude = s.stop_lat;
      row.longitude = s.stop_lon;
      row.updated_at = new Date().toISOString();

      return row;
    });

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      saveAs(blob, `stopsExport${ts}.json`);
    } else {
      // TXT/CSV with API schema header
      const header = [
        "id",
        "name",
        "alias",
        "district",
        "type",
        "latitude",
        "longitude",
        "is_active",
        "description",
        "capacity",
        "operating_hours",
        "nearby_landmarks",
        "highway",
        "created_at",
        "updated_at"
      ];

      const lines = data.map(row => {
        return header.map(h => {
          const val = row[h] ?? '';
          const needsQuotes = typeof val === 'string' && (val.includes(',') || val.includes('"'));
          if (needsQuotes) {
            return '"' + String(val).replace(/"/g, '""') + '"';
          }
          return val;
        }).join(',');
      });

      const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], {
        type: 'text/plain'
      });
      saveAs(blob, `stopsExport${ts}.txt`);
    }
    return;
  }

  // Otherwise, preserve original headers for file workflows
  if (originalHeader && originalHeader.length) {
    const lines = stops.map(s => {
      const row = { ...s.originalRow };
      if (originalMapping.name) row[originalMapping.name] = s.stop_name;
      if (originalMapping.desc) row[originalMapping.desc] = s.stop_desc;
      if (originalMapping.img && s.photoFileName) row[originalMapping.img] = s.photoFileName;
      row.stop_lat = s.stop_lat;
      row.stop_lon = s.stop_lon;
      row.stop_id = s.stop_id;
      row.stop_code = s.stop_code;

      return originalHeader.map(h => {
        const val = row[h] ?? '';
        const needsQuotes = typeof val === 'string' && (val.includes(',') || val.includes('"'));
        if (needsQuotes) {
          return '"' + String(val).replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',');
    });

    const blob = new Blob([originalHeader.join(',') + '\n' + lines.join('\n')], {
      type: 'text/plain'
    });
    saveAs(blob, `stopsExport${ts}.txt`);
  } else {
    // Fallback header
    const baseHeader = 'stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon';
    const baseLines = stops.map(s =>
      `${s.stop_id},${s.stop_code},"${s.stop_name.replace(/"/g, '""')}","${s.stop_desc.replace(/"/g, '""')}",${s.stop_lat},${s.stop_lon}`
    );
    const baseBlob = new Blob([baseHeader + '\n' + baseLines.join('\n')], {
      type: 'text/plain'
    });
    saveAs(baseBlob, `stops${ts}.txt`);
  }
}

// 🌐 Update a single stop back to API (PUT)
async function updateStopAPI(baseUrl, stop) {
  if (!baseUrl) return;
  const url = baseUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(stop.stop_id);

  const payload = {
    id: stop.stop_id,
    name: stop.stop_name,
    alias: stop.originalRow.alias ?? null,
    district: stop.originalRow.district ?? null,
    type: stop.originalRow.type ?? null,
    latitude: stop.stop_lat,
    longitude: stop.stop_lon,
    is_active: stop.originalRow.is_active ?? true,
    description: stop.stop_desc,
    capacity: stop.originalRow.capacity ?? 0,
    operating_hours: stop.originalRow.operating_hours ?? null,
    nearby_landmarks: stop.originalRow.nearby_landmarks ?? null,
    highway: stop.originalRow.highway ?? null,
    created_at: stop.originalRow.created_at ?? null,
    updated_at: new Date().toISOString()
  };

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error('API update failed: ' + res.status);
    }
    return res.json().catch(() => ({}));
  } catch (err) {
    alert('Failed to update stop: ' + err.message);
  }
}


