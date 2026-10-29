/**
 * ==========================================================================
 * ANUSHKA'S PLAYER — RETROTAPE ESP32 CONTROLLER SCRIPT
 * Minimalist Dark Industrial Architecture
 * ==========================================================================
 */

// --------------------------------------------------------------------------
// 1. CONFIGURATION & CONSTANTS
// --------------------------------------------------------------------------
let API_BASE_URL = 'http://192.168.4.1';
const POLL_INTERVAL_MS = 1200;
const TOTAL_TRACKS = 20;

// High-end track metadata matching the reference design
const TRACK_METADATA = [
  { title: "Vessel", artist: "Structures & Form", duration: "04:38" },
  { title: "Monolith", artist: "S. Davies", duration: "05:12" },
  { title: "Continuum", artist: "Arca", duration: "03:45" },
  { title: "Spatial Grid", artist: "K. Thorne", duration: "04:19" },
  { title: "Velvet Echoes", artist: "L. Vance", duration: "03:20" },
  { title: "Acoustic Signal", artist: "RETROTAPE", duration: "04:05" },
  { title: "Solar Drift", artist: "E. Mercer", duration: "04:50" },
  { title: "Chroma Waves", artist: "M. Kadyan", duration: "03:15" },
  { title: "Midnight Thoughts", artist: "Anushka", duration: "04:10" },
  { title: "Better Days Ahead", artist: "Anushka", duration: "03:55" },
  { title: "Cassette Dreams", artist: "RETROTAPE", duration: "04:22" },
  { title: "Analog Horizons", artist: "Synthwave Co", duration: "03:40" },
  { title: "Dust & Tape", artist: "Lo-Fi Sessions", duration: "02:50" },
  { title: "Electric Pulse", artist: "K. Thorne", duration: "04:02" },
  { title: "Luminous Night", artist: "S. Davies", duration: "05:01" },
  { title: "Starlight Tape", artist: "Anushka", duration: "03:33" },
  { title: "Sunsets & Coffee", artist: "Lo-Fi Sessions", duration: "03:12" },
  { title: "Neon Memories", artist: "RETROTAPE", duration: "04:15" },
  { title: "Lost in You", artist: "L. Vance", duration: "03:48" },
  { title: "Final Resonance", artist: "RETROTAPE", duration: "05:30" }
];

// --------------------------------------------------------------------------
// 2. GLOBAL STATE
// --------------------------------------------------------------------------
const state = {
  connected: false,
  playerReady: false,
  track: 1,
  filename: 'MP3/0001.mp3',
  playing: false,
  paused: true,
  volume: 18, // 0 to 30 DFPlayer scale
  trackCount: TOTAL_TRACKS,
  ip: '192.168.4.1',
  
  isMuted: false,
  lastMuteVolume: 18,
  isSimulator: false,
  lastSyncTime: null,
  pendingCommand: false,
  favorites: new Set(),
  activeView: 'player'
};

let pollingTimer = null;
let isPollingBusy = false;
let toastTimeout = null;

// --------------------------------------------------------------------------
// 3. INITIALIZATION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadPreferences();
  initQueueUI();
  bindEvents();
  updateUI();
  startPolling();
});

function loadPreferences() {
  try {
    const savedUrl = localStorage.getItem('retrotape_api_url');
    if (savedUrl) {
      API_BASE_URL = savedUrl;
      const apiInput = document.getElementById('apiBaseInput');
      if (apiInput) apiInput.value = savedUrl;
    }

    const simState = localStorage.getItem('retrotape_simulator');
    if (simState === 'true') {
      state.isSimulator = true;
      const simToggle = document.getElementById('simulatorToggle');
      if (simToggle) simToggle.checked = true;
    }

    const savedFavs = localStorage.getItem('retrotape_favorites');
    if (savedFavs) {
      state.favorites = new Set(JSON.parse(savedFavs));
    }
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
}

// --------------------------------------------------------------------------
// 4. API & ESP32 COMMUNICATION
// --------------------------------------------------------------------------

function formatFilename(input) {
  if (!input) return '0001.mp3';
  let str = String(input).trim().replace(/^MP3\//i, '').replace(/\.mp3$/i, '');
  const num = parseInt(str, 10);
  if (!isNaN(num) && num > 0) {
    return `${String(num).padStart(4, '0')}.mp3`;
  }
  return '0001.mp3';
}

function parseTrackNumber(filename) {
  if (!filename) return 1;
  const match = String(filename).match(/(\d+)/);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? 1 : num;
  }
  return 1;
}

async function fetchState() {
  if (isPollingBusy) return;
  isPollingBusy = true;

  if (state.isSimulator) {
    state.connected = true;
    state.playerReady = true;
    state.lastSyncTime = new Date().toLocaleTimeString();
    updateUI();
    isPollingBusy = false;
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const targetUrl = new URL('/api/state', API_BASE_URL).toString();
    const response = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      state.connected = data.connected !== undefined ? Boolean(data.connected) : true;
      state.playerReady = data.playerReady !== undefined ? Boolean(data.playerReady) : true;
      state.playing = Boolean(data.playing);
      state.paused = Boolean(data.paused);

      if (typeof data.volume === 'number') {
        state.volume = Math.min(30, Math.max(0, data.volume));
      }
      if (typeof data.track === 'number') {
        state.track = data.track;
      }
      if (data.filename) {
        state.filename = data.filename;
        state.track = parseTrackNumber(data.filename);
      }
      if (data.ip) state.ip = data.ip;

      state.lastSyncTime = new Date().toLocaleTimeString();
    } else {
      state.connected = false;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    state.connected = false;
  } finally {
    isPollingBusy = false;
    updateUI();
  }
}

async function sendCommand(action, value = null) {
  if (state.pendingCommand) return;
  state.pendingCommand = true;

  if (state.isSimulator) {
    simulateCommand(action, value);
    state.pendingCommand = false;
    showToast(`Simulator: Executed ${action} ${value || ''}`);
    updateUI();
    return;
  }

  try {
    const url = new URL('/api/command', API_BASE_URL);
    url.searchParams.append('action', action);
    if (value !== null && value !== undefined) {
      url.searchParams.append('value', value);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      showToast(`✓ Command ${action} accepted`);
      await fetchState();
    } else {
      showToast(`✕ Command failed (${response.status})`);
    }
  } catch (err) {
    showToast(`✕ Connection error`);
  } finally {
    state.pendingCommand = false;
    updateUI();
  }
}

function simulateCommand(action, value) {
  switch (action) {
    case 'play':
      state.playing = true;
      state.paused = false;
      break;
    case 'pause':
      state.playing = false;
      state.paused = true;
      break;
    case 'toggle':
      state.playing = !state.playing;
      state.paused = !state.playing;
      break;
    case 'next':
      state.track = state.track >= TOTAL_TRACKS ? 1 : state.track + 1;
      state.filename = `MP3/${String(state.track).padStart(4, '0')}.mp3`;
      state.playing = true;
      state.paused = false;
      break;
    case 'previous':
      state.track = state.track <= 1 ? TOTAL_TRACKS : state.track - 1;
      state.filename = `MP3/${String(state.track).padStart(4, '0')}.mp3`;
      state.playing = true;
      state.paused = false;
      break;
    case 'volume':
      if (value !== null) {
        state.volume = Math.min(30, Math.max(0, parseInt(value, 10)));
      }
      break;
    case 'track':
      if (value) {
        const formatted = formatFilename(value);
        state.filename = `MP3/${formatted}`;
        state.track = parseTrackNumber(formatted);
        state.playing = true;
        state.paused = false;
      }
      break;
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  fetchState();
  pollingTimer = setInterval(fetchState, POLL_INTERVAL_MS);
}

// --------------------------------------------------------------------------
// 5. UI SYNCHRONIZATION
// --------------------------------------------------------------------------

function updateUI() {
  updateConnectionPill();
  updatePlayerView();
  updateVolumeView();
  updateQueueListActive();
  updateDiagnosticsTable();
}

function updateConnectionPill() {
  const pill = document.getElementById('connectionPill');
  const pillText = document.getElementById('pillText');
  const pillIp = document.getElementById('pillIp');

  if (!pill || !pillText || !pillIp) return;

  pillIp.textContent = state.ip;

  if (state.isSimulator) {
    pill.className = 'connection-pill state-simulator';
    pillText.textContent = 'SIMULATOR';
  } else if (state.connected) {
    pill.className = 'connection-pill state-connected';
    pillText.textContent = 'CONNECTED';
  } else {
    pill.className = 'connection-pill state-disconnected';
    pillText.textContent = 'DISCONNECTED';
  }
}

function updatePlayerView() {
  const trackNum = state.track || 1;
  const metaIndex = (trackNum - 1) % TRACK_METADATA.length;
  const meta = TRACK_METADATA[metaIndex] || { title: `Track ${trackNum}`, artist: 'RETROTAPE', duration: '04:00' };

  const titleEl = document.getElementById('currentTrackTitle');
  const artistEl = document.getElementById('currentTrackArtist');
  const artTitleEl = document.getElementById('artCanvasTitle');
  const artSubEl = document.getElementById('artCanvasSub');
  const tapeDurationEl = document.getElementById('tapeDurationText');

  if (titleEl) titleEl.textContent = meta.title;
  if (artistEl) artistEl.textContent = meta.artist;
  if (artTitleEl) artTitleEl.textContent = meta.title.toUpperCase();
  if (artSubEl) artSubEl.textContent = meta.artist.toUpperCase();
  if (tapeDurationEl) tapeDurationEl.textContent = meta.duration;

  // Play / Pause Block Button Icons
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const isPlaying = state.playing && !state.paused;

  if (playIcon && pauseIcon) {
    if (isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  }

  // Favorite button state
  const favBtn = document.getElementById('favoriteBtn');
  if (favBtn) {
    const isFav = state.favorites.has(trackNum);
    favBtn.classList.toggle('active-orange', isFav);
  }

  // Progress Bar Position
  const progressFill = document.getElementById('progressBarFill');
  const progressHead = document.getElementById('progressHeadPip');
  if (progressFill && progressHead) {
    const posPercent = Math.min(100, Math.max(5, ((trackNum - 1) / TOTAL_TRACKS) * 100));
    progressFill.style.width = `${posPercent}%`;
    progressHead.style.left = `${posPercent}%`;
  }
}

function updateVolumeView() {
  const vol = state.volume;
  const maxVol = 30;
  const percent = Math.round((vol / maxVol) * 100);

  // Quick Vol
  const quickVolSlider = document.getElementById('quickVolSlider');
  const quickVolValText = document.getElementById('quickVolValText');
  if (quickVolSlider) quickVolSlider.value = vol;
  if (quickVolValText) quickVolValText.textContent = `${percent}%`;

  // Master Vol
  const masterVolSlider = document.getElementById('masterVolSlider');
  if (masterVolSlider) masterVolSlider.value = vol;

  // Rotary Gauge Display (Matching image right panel: "78%")
  const rotaryPercentText = document.getElementById('rotaryPercentText');
  const rotaryGaugeArc = document.getElementById('rotaryGaugeArc');

  if (rotaryPercentText) rotaryPercentText.textContent = percent;

  if (rotaryGaugeArc) {
    const totalDash = 515;
    const offset = totalDash - (totalDash * (vol / maxVol));
    rotaryGaugeArc.style.strokeDashoffset = offset;
  }

  // Mute label
  const volMuteLabel = document.getElementById('volMuteLabel');
  if (volMuteLabel) {
    volMuteLabel.textContent = vol === 0 ? 'UNMUTE' : 'MUTE';
  }
}

function initQueueUI() {
  const container = document.getElementById('queueListContainer');
  if (!container) return;

  container.innerHTML = '';

  for (let i = 1; i <= TOTAL_TRACKS; i++) {
    const meta = TRACK_METADATA[(i - 1) % TRACK_METADATA.length];
    const indexStr = String(i - 1).padStart(2, '0');
    const filename = `00${String(i).padStart(2, '0')}.mp3`.slice(-8);

    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = `queue-item-${i}`;
    item.dataset.track = i;
    item.dataset.filename = filename;

    item.innerHTML = `
      <div class="queue-left">
        <span class="queue-index">${indexStr}</span>
        <div class="queue-meta">
          <span class="queue-track-name">${meta.title} ${i === 1 ? '•' : ''}</span>
          <span class="queue-artist-name">${meta.artist}</span>
        </div>
      </div>
      <div class="queue-right">
        <span class="badge-now hidden" id="now-badge-${i}">NOW ✦</span>
        <span class="queue-time">${meta.duration}</span>
        <svg class="drag-dots" width="12" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="8" cy="6" r="2"></circle>
          <circle cx="16" cy="6" r="2"></circle>
          <circle cx="8" cy="12" r="2"></circle>
          <circle cx="16" cy="12" r="2"></circle>
          <circle cx="8" cy="18" r="2"></circle>
          <circle cx="16" cy="18" r="2"></circle>
        </svg>
      </div>
    `;

    item.addEventListener('click', () => {
      sendCommand('track', filename);
    });

    container.appendChild(item);
  }
}

function updateQueueListActive() {
  const activeTrack = state.track;

  for (let i = 1; i <= TOTAL_TRACKS; i++) {
    const item = document.getElementById(`queue-item-${i}`);
    const badge = document.getElementById(`now-badge-${i}`);

    if (item) {
      if (i === activeTrack) {
        item.classList.add('item-now-playing');
        if (badge) badge.classList.remove('hidden');
      } else {
        item.classList.remove('item-now-playing');
        if (badge) badge.classList.add('hidden');
      }
    }
  }
}

function updateDiagnosticsTable() {
  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setEl('diagConnected', state.connected ? 'Connected' : 'Disconnected');
  setEl('diagPlayerReady', state.playerReady ? 'Ready' : 'Not Ready');
  setEl('diagTrack', state.track);
  setEl('diagFilename', state.filename || 'None');
  setEl('diagPlaying', state.playing && !state.paused ? 'Playing' : 'Paused / Stopped');
  setEl('diagVolume', `${state.volume} / 30`);
  setEl('diagIp', state.ip);
  setEl('diagLastSync', state.lastSyncTime || 'Never');
}

// --------------------------------------------------------------------------
// 6. EVENT BINDINGS
// --------------------------------------------------------------------------

function bindEvents() {
  // Navigation Tabs (3 Views: Player, Volume, Settings)
  const navBtns = document.querySelectorAll('.nav-item');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      switchView(viewName);
    });
  });

  const connectionPill = document.getElementById('connectionPill');
  if (connectionPill) {
    connectionPill.addEventListener('click', () => switchView('settings'));
  }

  // Player Controls
  const playPauseBtn = document.getElementById('playPauseBtn');
  if (playPauseBtn) playPauseBtn.addEventListener('click', () => sendCommand('toggle'));

  const prevBtn = document.getElementById('prevBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => sendCommand('previous'));

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.addEventListener('click', () => sendCommand('next'));

  // Favorite toggle
  const favBtn = document.getElementById('favoriteBtn');
  if (favBtn) {
    favBtn.addEventListener('click', () => {
      const track = state.track;
      if (state.favorites.has(track)) {
        state.favorites.delete(track);
        showToast(`Removed Track ${track} from favorites`);
      } else {
        state.favorites.add(track);
        showToast(`♥ Track ${track} added to favorites`);
      }
      localStorage.setItem('retrotape_favorites', JSON.stringify(Array.from(state.favorites)));
      updateUI();
    });
  }

  // Mini Vol
  const quickVolSlider = document.getElementById('quickVolSlider');
  if (quickVolSlider) {
    quickVolSlider.addEventListener('change', (e) => {
      sendCommand('volume', parseInt(e.target.value, 10));
    });
  }

  // Master Vol
  const masterVolSlider = document.getElementById('masterVolSlider');
  if (masterVolSlider) {
    masterVolSlider.addEventListener('change', (e) => {
      sendCommand('volume', parseInt(e.target.value, 10));
    });
  }

  // Tactile Rotary DEC / INC / MUTE
  const volDecBtn = document.getElementById('volDecBtn');
  if (volDecBtn) {
    volDecBtn.addEventListener('click', () => {
      sendCommand('volume', Math.max(0, state.volume - 1));
    });
  }

  const volIncBtn = document.getElementById('volIncBtn');
  if (volIncBtn) {
    volIncBtn.addEventListener('click', () => {
      sendCommand('volume', Math.min(30, state.volume + 1));
    });
  }

  const volMuteBtn = document.getElementById('volMuteBtn');
  if (volMuteBtn) {
    volMuteBtn.addEventListener('click', () => {
      if (state.volume > 0) {
        state.lastMuteVolume = state.volume;
        sendCommand('volume', 0);
      } else {
        sendCommand('volume', state.lastMuteVolume || 18);
      }
    });
  }

  // Queue Search Box
  const queueSearchInput = document.getElementById('queueSearchInput');
  if (queueSearchInput) {
    queueSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      for (let i = 1; i <= TOTAL_TRACKS; i++) {
        const item = document.getElementById(`queue-item-${i}`);
        const meta = TRACK_METADATA[(i - 1) % TRACK_METADATA.length];
        const text = `${meta.title} ${meta.artist}`.toLowerCase();

        if (item) {
          if (text.includes(query) || String(i - 1).includes(query)) {
            item.classList.remove('hidden');
          } else {
            item.classList.add('hidden');
          }
        }
      }
    });
  }

  // Settings: Reconnect / Simulator / Save API
  const retryBtn = document.getElementById('retryConnectBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      showToast('Retrying ESP32 connection...');
      fetchState();
    });
  }

  const simToggle = document.getElementById('simulatorToggle');
  if (simToggle) {
    simToggle.addEventListener('change', (e) => {
      state.isSimulator = e.target.checked;
      localStorage.setItem('retrotape_simulator', state.isSimulator);
      showToast(state.isSimulator ? 'Simulator Enabled' : 'Live ESP32 Mode Enabled');
      fetchState();
    });
  }

  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiInput = document.getElementById('apiBaseInput');
  if (saveApiBtn && apiInput) {
    saveApiBtn.addEventListener('click', () => {
      let val = apiInput.value.trim();
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        val = 'http://' + val;
      }
      API_BASE_URL = val;
      localStorage.setItem('retrotape_api_url', API_BASE_URL);
      showToast(`Target set to ${API_BASE_URL}`);
      fetchState();
    });
  }
}

function switchView(viewName) {
  const views = ['player', 'volume', 'settings'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`navBtn${v.charAt(0).toUpperCase() + v.slice(1)}`);

    if (el) {
      if (v === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    if (navBtn) {
      if (v === viewName) {
        navBtn.classList.add('nav-active');
      } else {
        navBtn.classList.remove('nav-active');
      }
    }
  });

  state.activeView = viewName;
}

function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');

  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}
