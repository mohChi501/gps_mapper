# gps_mapper
record, label, and edit gps points
## Features
1. Record GPS locations with optional stop name, description, and photo (camera capture or upload).  
2. Photo capture uses the rear camera hint (`capture="environment"`) and is processed entirely in the browser.  
3. When a point with an image is recorded, the image is saved locally to the device using a sanitized filename: `img{lat}_{lon}.{ext}` (decimal point replaced with underscore; coordinates rounded to 6 decimal places).  
4. Map visualization with Leaflet; marker popups show details, photo preview, GTFS upcoming departures, and Edit/Delete actions.  
5. GTFS static feed (.zip) parsing and merging (supports `stops.txt`, `stop_times.txt`, `trips.txt`, `routes.txt`).  
6. Two export files produced on demand:
   - `stops{timestamp}.txt` — `stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon`  
   - `stopsWithImages{timestamp}.txt` — same as above plus `img_filename`  
7. Low-data mode to hide the map for bandwidth-constrained environments.  
8. All processing and file generation happen client-side; no data is sent to servers by the app.

---

## Repository Files
- `index.html` — main UI, inputs, and script references  
- `style.css` — jade (#00A36C), black, white theme and Leaflet overrides  
- `app.js` — application logic: geolocation, image handling, marker management, GTFS parsing, exporting

External libraries are referenced via CDN (Leaflet, FileSaver.js, JSZip, PapaParse).

---

## Quick Setup (local testing)
1. Clone or download the repository.  
2. Serve the folder with a static server for best results. Example (Node):
   - `npm install -g http-server`  
   - `http-server -c-1` then open the provided URL on your mobile device.  
3. For camera and geolocation support, use HTTPS or localhost; many browsers require a secure context. Use a tunnel (ngrok) or host over HTTPS for field testing.  
4. Open the app in a modern mobile browser and grant location and file permissions when prompted.

---

## Usage
1. Optionally enter a Stop Name and Description.  
2. Capture Photo (Take Photo) or Upload Image. Capture takes precedence if both are provided.  
3. Tap **Record Current Location**. If an image is present, the app:
   - Generates a sanitized filename: `img{lat}_{lon}.{ext}` (decimal points replaced with underscore; coordinates limited to 6 decimal places).  
   - Triggers a client-side download of the image using that filename.  
   - Stores the image DataURL in memory for preview in the map popup.  
4. Inspect the map: open a marker popup to view details, preview the image, edit name/description, or delete the point (deletion updates the in-memory dataset and subsequent exports).  
5. Export to download two text files: the base stops file and the stops-with-images file (contains `img_filename` column).  
6. To reload a dataset, upload a previously exported TXT file. If the file includes `img_filename`, you can manually pair stored images from your device.

---

## Security and Privacy
- All capture, parsing, and file generation occur client-side in the browser. No image or location data is sent to any remote server by the app.  
- The app triggers downloads that the user controls; where files are saved depends on the browser and device.  
- For any future server sync, always require HTTPS, explicit user consent, and proper authentication.

---

## Development Notes
- Filename sanitization: coordinates are rounded to six decimal places and the decimal point replaced with an underscore to avoid filesystem issues (e.g., `17.504321` → `17_504321`).  
- `capture="environment"` is a hint to prefer the rear camera; actual behavior depends on device/browser.  
- Deleting a point removes it from the in-memory collection; subsequent exports reflect deletions.  
- GTFS integration expects the following files in the uploaded ZIP: `stops.txt`, `stop_times.txt`, `trips.txt`, `routes.txt`. Parsing of `calendar.txt` and `calendar_dates.txt` can be added to improve service-day accuracy.

---

## Known Limitations and Suggested Enhancements
- File save location for images is determined by the browser/device and cannot be enforced by the app. Some mobile browsers place downloads in a default downloads folder.  
- Add IndexedDB persistence to preserve points and cached GTFS across sessions.  
- Cache map tiles with a service worker for offline mapping (observe tile usage terms).  
- Add parsing for `calendar.txt` and `calendar_dates.txt` for accurate service-day logic.  
- Integrate GTFS-Realtime for live updates with authentication and rate limits.

---

## Citations
- Leaflet (map library): https://leafletjs.com/  
- FileSaver.js (client-side file download): https://github.com/eligrey/FileSaver.js/  
- JSZip (ZIP handling in browser): https://stuk.github.io/jszip/  
- PapaParse (CSV parsing in browser): https://www.papaparse.com/  
- OpenStreetMap (tile provider used via Leaflet): https://www.openstreetmap.org/  
- W3C Geolocation API documentation (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API  
- File and FileReader APIs (MDN): https://developer.mozilla.org/en-US/docs/Web/API/FileReader  
- Blob API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Blob  
- HTML input capture attribute (MDN): https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/capture

---
