// Global state
let stops = [];
let map, markers = [];
let lowData = false;

let GTFS = {
  stops: {},        // stop_id → stop metadata
  stopTimes: {},    // stop_id → [stop_time records]
  trips: {},        // trip_id → trip metadata
  routes: {}        // route_id → route metadata
};

// Initialize Leaflet map
function initMap() {
  map = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);
}

// Generate unique stop_id & stop_code
function makeIds() {
  const ts = Date.now();
  return { stop_id: ts, stop_code: `S${ts}` };
}

// Sanitize coordinate for filename (replace decimal with underscore)
function sanitizeCoord(coord) {
  return coord.toFixed(6).replace('.', '_');
}

// Record a stop with optional photo and auto-download image
async function recordStop() {
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej)
    );
    const { latitude: stop_lat, longitude: stop_lon } = pos.coords;
    const { stop_id, stop_code } = makeIds();
    const stop_name = document.getElementById('stopName').value.trim();
    const stop_desc = document.getElementById('stopDesc').value.trim();

    // Single capture input and upload input
    const capIn = document.getElementById('captureImage');
    const upIn = document.getElementById('uploadImage');
    const file = capIn.files[0] || upIn.files[0] || null;

    let photoDataUrl = null;
    let photoFileName = '';

    if (file) {
      // Build safe filename: img{lat}_{lon}.{ext}
      const latStr = sanitizeCoord(stop_lat);
      const lonStr = sanitizeCoord(stop_lon);
      const ext = file.name.split('.').pop().toLowerCase();
      photoFileName = `img${latStr}_${lonStr}.${ext}`;

      // Trigger a client‐side download of the raw image file
      saveAs(file, photoFileName);

      // Read file locally as Data URL for popup preview
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
      photoFileName
    };
    stops.push(stop);
    addMarker(stop);

    // Clear inputs
    document.getElementById('stopName').value = '';
    document.getElementById('stopDesc').value = '';
    capIn.value = '';
    upIn.value = '';
  } catch {
    alert('GPS error or permission denied');
  }
}

// Add marker with edit & delete, plus GTFS and photo preview
function addMarker(stop) {
  if (!map) return;
  const marker = L.marker([stop.stop_lat, stop.stop_lon]).addTo(map);

  let popup = `<b>${stop.stop_name || stop.stop_code}</b><br>${stop.stop_desc || ''}`;

  // GTFS upcoming departures
  const feed = GTFS.stopTimes[stop.stop_code];
  if (feed) {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const current = `${hh}:${mm}:00`;
    const upcoming = feed
      .filter(t => t.departure_time >= current)
      .slice(0, 5)
      .map(t => {
        const trip = GTFS.trips[t.trip_id];
        const route = GTFS.routes[trip.route_id];
        const name = route.route_short_name || route.route_long_name;
        return `${t.departure_time} ➔ ${name}`;
      });
    if (upcoming.length) {
      popup += `<br><br><b>Next Departures:</b><br>${upcoming.join('<br>')}`;
    }
  }

  // Photo preview
  if (stop.photoDataUrl) {
    popup += `<br><img src="${stop.photoDataUrl}" style="max-width:150px">`;
  }

  // Edit & Delete buttons
  popup += `
    <br><button id="edit-${stop.stop_code}">Edit</button>
    <button id="delete-${stop.stop_code}">Delete</button>
  `;

  marker.bindPopup(popup);
  marker.on('popupopen', () => {
    document
      .getElementById(`edit-${stop.stop_code}`)
      .addEventListener('click', () => {
        editStop(stop);
        marker.closePopup();
      });
    document
      .getElementById(`delete-${stop.stop_code}`)
      .addEventListener('click', () => {
        deleteStop(stop);
        marker.closePopup();
      });
  });

  markers.push(marker);
  map.setView([stop.stop_lat, stop.stop_lon], 15);
}

// Prompt user to edit stop name/description
function editStop(stop) {
  const name = prompt('Edit stop name:', stop.stop_name) || '';
  const desc = prompt('Edit description:', stop.stop_desc) || '';
  stop.stop_name = name.trim();
  stop.stop_desc = desc.trim();
  refreshMap();
}

// Remove one stop and refresh
function deleteStop(stop) {
  stops = stops.filter(s => s.stop_code !== stop.stop_code);
  refreshMap();
}

// Clear & redraw all markers
function refreshMap() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  stops.forEach(addMarker);
}

// Export two files: with & without image column
function exportStops() {
  const ts = Date.now();
  const baseHeader = 'stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon';
  const baseLines = stops.map(s =>
    `${s.stop_id},${s.stop_code},"${s.stop_name}","${s.stop_desc}",` +
    `${s.stop_lat},${s.stop_lon}`
  );
  const baseBlob = new Blob([baseHeader + '\n' + baseLines.join('\n')], {
    type: 'text/plain'
  });
  saveAs(baseBlob, `stops${ts}.txt`);

  const imgHeader = baseHeader + ',img_filename';
  const imgLines = stops.map(s =>
    `${s.stop_id},${s.stop_code},"${s.stop_name}","${s.stop_desc}",` +
    `${s.stop_lat},${s.stop_lon},${s.photoFileName}`
  );
  const imgBlob = new Blob([imgHeader + '\n' + imgLines.join('\n')], {
    type: 'text/plain'
  });
  saveAs(imgBlob, `stopsWithImages${ts}.txt`);
}

// Load stops from a previously exported TXT, preserving img_filename if present
function loadStops(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = reader.result.trim().split('\n');
    rows.shift(); // drop header
    stops = rows.map(r => {
      const cols = r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
                    .map(v => v.replace(/^"|"$/g, ''));
      return {
        stop_id: cols[0],
        stop_code: cols[1],
        stop_name: cols[2],
        stop_desc: cols[3],
        stop_lat: +cols[4],
        stop_lon: +cols[5],
        photoDataUrl: null,
        photoFileName: cols[6] || ''
      };
    });
    refreshMap();
  };
  reader.readAsText(file);
}

// Load and parse a GTFS ZIP feed
async function loadGTFS(zipFile) {
  document.getElementById('gtfsStatus').textContent = 'Parsing GTFS…';
  const data = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(data);

  async function parseFile(name, cb) {
    if (!zip.files[name]) return;
    const text = await zip.files[name].async('text');
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => cb(res.data)
    });
  }

  await parseFile('stops.txt', rows =>
    rows.forEach(r => GTFS.stops[r.stop_id] = r)
  );

  await parseFile('stop_times.txt', rows =>
    rows.forEach(r => {
      if (!GTFS.stopTimes[r.stop_id]) GTFS.stopTimes[r.stop_id] = [];
      GTFS.stopTimes[r.stop_id].push(r);
    })
  );

  await parseFile('trips.txt', rows =>
    rows.forEach(r => GTFS.trips[r.trip_id] = r)
  );

  await parseFile('routes.txt', rows =>
    rows.forEach(r => GTFS.routes[r.route_id] = r)
  );

  document.getElementById('gtfsStatus').textContent = 'GTFS Loaded';
}

// Toggle between low-data mode and full map view
function toggleLowData() {
  lowData = !lowData;
  document.body.classList.toggle('low-data', lowData);
}

// Attach event listeners once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  document.getElementById('recordBtn')
          .addEventListener('click', recordStop);
  document.getElementById('exportBtn')
          .addEventListener('click', exportStops);
  document.getElementById('toggleData')
          .addEventListener('click', toggleLowData);
  document.getElementById('loadBtn')
          .addEventListener('click', () => {
    const f = document.getElementById('uploadFile').files[0];
    if (f) loadStops(f);
  });
  document.getElementById('loadGtfsBtn')
          .addEventListener('click', () => {
    const f = document.getElementById('gtfsInput').files[0];
    if (f) loadGTFS(f);
  });
});

