# Anushka's Player — RETROTAPE ESP32 Controller

**Anushka's Player** is a premium, mobile-first wireless music controller web application designed to interface with a physical DIY cassette-style music player powered by an **ESP32** microcontroller and a **DFPlayer Mini** audio module.

Inspired by modern AMOLED music applications and hardware interfaces, it features animated cassette reel transports, tactile rotary output dials, real-time ESP32 synchronization, playlist search, and direct track selection.

---

## 📱 Features

- **Real-Time ESP32 Synchronization:** Periodically polls `GET /api/state` every ~1200ms to keep the webpage updated when physical buttons on the ESP32 cassette deck are pressed.
- **Cassette Transport Visualizer:** Animated spinning cassette tape spools that rotate when music is playing and pause when playback stops.
- **Tactile Volume Rotary Dial:** Full master output control screen featuring a large gauge dial, percentage display, fine-tune slider, mute toggle, and preset volume buttons.
- **Playlist & Direct Track Input:** Supports up to 20 tracks stored on the DFPlayer SD card (`MP3/0001.mp3` through `MP3/0020.mp3`) with configurable track names, search filtering, and automatic input formatting (e.g. typing `7`, `0007`, or `0007.mp3` resolves to `0007.mp3`).
- **Hardware Simulator Mode:** Built-in toggle allows testing all player controls, animations, and volume states without requiring a physical ESP32 board connected.
- **Troubleshooting Diagnostics:** Clear status indicators for ESP32 connection state, DFPlayer initialization, Wi-Fi credentials, and browser HTTPS/Mixed-Content notices.

---

## 🌐 ESP32 Wi-Fi & API Specifications

### Default Wi-Fi Access Point Credentials
- **SSID:** `RetroTape`
- **Password:** `RetroTape123`
- **Default IP Address:** `192.168.4.1`
- **Configurable API Base URL:** `http://192.168.4.1`

---

### REST API Endpoints

#### 1. Read Current Player State
`GET http://192.168.4.1/api/state`

**Example Response:**
```json
{
  "connected": true,
  "playerReady": true,
  "track": 7,
  "filename": "MP3/0007.mp3",
  "playing": true,
  "paused": false,
  "volume": 18,
  "trackCount": 20,
  "ip": "192.168.4.1"
}
```

#### 2. Execute Commands
`GET http://192.168.4.1/api/command?action={ACTION}&value={VALUE}`

- **Play:** `/api/command?action=play`
- **Pause:** `/api/command?action=pause`
- **Toggle Playback:** `/api/command?action=toggle`
- **Next Track:** `/api/command?action=next`
- **Previous Track:** `/api/command?action=previous`
- **Set Volume (0–30):** `/api/command?action=volume&value=18`
- **Select Track File:** `/api/command?action=track&value=0007.mp3`

---

## 🚀 Running and Hosting

### 1. Local Development / Vite
Run the local dev server using npm:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your mobile browser.

### 2. Hosting Directly on the ESP32
To avoid browser HTTPS Mixed-Content restrictions:
1. Place `index.html`, `style.css`, and `script.js` directly into the ESP32's SPIFFS/LittleFS filesystem.
2. Serve the static files from the ESP32 WebServer at `http://192.168.4.1/`.

### 3. Testing with Hardware Simulator
If hosting the app on an HTTPS server or testing without the physical ESP32 board nearby:
1. Navigate to the **Connect** tab in the app.
2. Switch on **Hardware Simulator Mode**.
3. All playback controls, volume dials, tracks, and animations will simulate full hardware responses.

---

## 📄 File Structure
- `index.html` — Semantic HTML5 markup with mobile views (Player, Playlist, Volume Rotary, Connect Diagnostics).
- `style.css` — AMOLED dark theme styling, CSS cassette reel spin keyframes, and tactile rotary gauge styles.
- `script.js` — Vanilla JavaScript managing API polling, command execution, input formatting, and state synchronization.

---

## 🔒 Security & Browser Policy Note
When accessing this application over **HTTPS**, modern web browsers block requests to local HTTP IP addresses (`http://192.168.4.1`) due to **Mixed Content & Private Network Access (PNA)** policies. Connect your phone/laptop directly to the `RetroTape` Wi-Fi AP or serve the app directly from HTTP on the local network for direct ESP32 hardware access.
