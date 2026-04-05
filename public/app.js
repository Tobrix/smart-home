/* =========================================================
   HomeOS — app.js  (v3)
   ========================================================= */

let allDevices = [];
let sensorRange = '24h';
const charts = {};

// ---- GLOBAL AUTH — přesměruj na login při 401 ----
const _origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401) {
    window.location.href = '/login';
    return res;
  }
  return res;
};

// ---- LOGOUT ----
async function logout() {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ---- PROFILE MENU (mobil) ----
function toggleProfileMenu() {
  const menu = document.getElementById('mobile-profile-menu');
  const overlay = document.getElementById('mobile-profile-overlay');
  const isOpen = menu?.classList.contains('open');
  menu?.classList.toggle('open', !isOpen);
  overlay?.classList.toggle('open', !isOpen);
}

// Načti username do profil menu
async function loadUserInfo() {
  try {
    const res = await fetch('/api/auth/check');
    const data = await res.json();
    const el = document.getElementById('mpm-user');
    if (el && data.username) el.textContent = data.username;
  } catch(e) {}
}
loadUserInfo();

// ---- NAVIGATION ----
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.mtab').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (page === 'lights')  renderLights();
  if (page === 'plugs')   renderPlugs();
  if (page === 'sensors') renderSensors();
}

document.querySelectorAll('.nav-item, .mtab').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sensorRange = btn.dataset.range;
    renderSensors();
  });
});

// ---- CLOCK ----
function updateClock() {
  const now = new Date();
  const t = document.getElementById('clock');
  const d = document.getElementById('clock-date');
  if (t) t.textContent = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (d) d.textContent = now.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' });
}
setInterval(updateClock, 1000);
updateClock();

// ---- WEATHER ----
async function loadWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=49.8&longitude=18.25&current_weather=true&timezone=Europe/Prague');
    const d = await r.json();
    const cw = d.current_weather;
    document.getElementById('weather-temp').textContent = Math.round(cw.temperature) + '°C';
    document.getElementById('weather-icon').textContent = weatherIcon(cw.weathercode);
    document.getElementById('weather-desc').textContent = weatherDesc(cw.weathercode);
  } catch(e) { document.getElementById('weather-desc').textContent = 'N/A'; }
}
function weatherIcon(c) {
  if (c===0) return '☀️'; if (c<=2) return '🌤️'; if (c===3) return '☁️';
  if (c<=49) return '🌫️'; if (c<=67) return '🌧️'; if (c<=77) return '❄️';
  if (c<=82) return '🌦️'; return '⛈️';
}
function weatherDesc(c) {
  if (c===0) return 'Jasno'; if (c<=2) return 'Polojasno'; if (c===3) return 'Zataženo';
  if (c<=49) return 'Mlha'; if (c<=67) return 'Déšť'; if (c<=77) return 'Sněžení';
  if (c<=82) return 'Přeháňky'; return 'Bouřky';
}
loadWeather();
setInterval(loadWeather, 10*60*1000);

// ---- DEVICE TYPE DETECTION ----
function deviceType(device) {
  const st = device.status || [];
  const codes = st.map(s => s.code);
  if (codes.includes('va_temperature') || codes.includes('va_humidity')) return 'sensor';
  if (codes.includes('switch_led')) return 'light';
  if (codes.includes('switch')) return 'plug';
  // Zigbee scene switches / buttons — read only
  if (codes.some(c => c.includes('switch1_value') || c.includes('switch_mode') || c.includes('switch_mode1'))) return 'button';
  return 'other';
}

function deviceIcon(type, name) {
  const n = name.toLowerCase();
  if (type === 'sensor') return '🌡️';
  if (type === 'button') {
    if (n.includes('vánoce') || n.includes('vanocn')) return '🎄';
    if (n.includes('gang') || n.includes('zigbee') || n.includes('m4')) return '🔘';
    return '🔘';
  }
  if (type === 'light') {
    if (n.includes('postel')) return '🛏️';
    if (n.includes('gauč') || n.includes('gauc')) return '🛋️';
    return '💡';
  }
  if (type === 'plug') {
    if (n.includes('vánoč') || n.includes('strome')) return '🎄';
    return '🔌';
  }
  if (n.includes('gateway')) return '📡';
  return '📱';
}

// ---- GOVEE STATE ----
let goveeDevices = []; // { device, model, deviceName, controllable, online, properties }

async function loadGoveeDevices() {
  try {
    const res = await fetch('/api/govee/devices');
    const data = await res.json();
    // OpenAPI v2 vrací { code, message, data: [ {sku, device, deviceName, type, capabilities} ] }
    const raw = data.data || [];

    goveeDevices = await Promise.all(raw.map(async d => {
      try {
        const stateRes = await fetch(`/api/govee/device/state?device=${encodeURIComponent(d.device)}&model=${encodeURIComponent(d.sku)}`);
        const stateData = await stateRes.json();
        // v2 state: { payload: { capabilities: [{type, instance, state: {value}}] } }
        const caps = stateData.payload?.capabilities || [];
        return { ...d, model: d.sku, deviceName: d.deviceName || d.sku, capabilities: caps };
      } catch(e) {
        return { ...d, model: d.sku, deviceName: d.deviceName || d.sku, capabilities: [] };
      }
    }));

    console.log('[govee] načteno:', goveeDevices.length, 'zařízení');
  } catch(e) {
    console.error('[govee] chyba:', e);
    goveeDevices = [];
  }
}

// ---- LOAD DEVICES ----
async function loadDevices() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');
  try {
    const [tuyaRes] = await Promise.all([
      fetch('/api/devices').then(r => r.json()),
      loadGoveeDevices()
    ]);
    const result = tuyaRes.result;
    allDevices = Array.isArray(result) ? result : (result?.devices || []);
    renderDashboard();
    updateStats();
  } catch (err) {
    console.error('Chyba načítání:', err);
    document.getElementById('loading-state').innerHTML = '<p style="color:var(--red)">❌ Chyba — zkontroluj server (F12)</p>';
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

// ---- STATS ----
function updateStats() {
  // Tuya
  const tuyaOnline = allDevices.filter(d => d.online).length;
  const tuyaActive = allDevices.filter(d => {
    const s = d.status || [];
    return s.some(st => (st.code==='switch_led'||st.code==='switch') && st.value===true);
  }).length;

  // Govee
  const goveeOnline = goveeDevices.length; // Govee jsou online pokud vrátí data
  const goveeActive = goveeDevices.filter(d => {
    const caps = d.capabilities || [];
    const power = caps.find(c => c.type==='devices.capabilities.on_off' && c.instance==='powerSwitch');
    return power?.state?.value === 1;
  }).length;

  const totalOnline = tuyaOnline + goveeOnline;
  const totalCount  = allDevices.length + goveeDevices.length;
  const totalActive = tuyaActive + goveeActive;

  document.getElementById('stat-active').textContent = totalActive;
  document.getElementById('stat-online').textContent = `${totalOnline}/${totalCount}`;

  const sens = allDevices.find(d => d.name.toLowerCase().includes('místnost')) ||
               allDevices.find(d => deviceType(d) === 'sensor');
  if (sens) {
    const st = sens.status || [];
    const temp = st.find(s => s.code === 'va_temperature');
    const hum  = st.find(s => s.code === 'va_humidity');
    if (temp) document.getElementById('stat-temp').textContent = (temp.value/10).toFixed(1)+'°C';
    if (hum)  document.getElementById('stat-hum').textContent  = parseHum(hum)+'%';
  }
}

function parseHum(hum) {
  // scale=1 → divide by 10, scale=0 → use directly
  return hum.value > 100 ? (hum.value/10).toFixed(0) : hum.value;
}

// ---- RENDER PAGES ----
function renderDashboard() {
  document.getElementById('loading-state').style.display = 'none';
  const grid = document.getElementById('devices-grid');
  grid.innerHTML = '';
  allDevices.forEach(d => grid.appendChild(buildCard(d)));
  goveeDevices.forEach(d => grid.appendChild(buildGoveeCard(d)));
}
function renderLights() {
  const grid = document.getElementById('lights-grid');
  grid.innerHTML = '';
  allDevices.filter(d => deviceType(d) === 'light').forEach(d => grid.appendChild(buildCard(d)));
  goveeDevices.forEach(d => grid.appendChild(buildGoveeCard(d)));
}
function renderPlugs() {
  renderGrid('plugs-grid', allDevices.filter(d => deviceType(d) === 'plug'));
  setTimeout(() => {
    allDevices.filter(d => deviceType(d) === 'plug').forEach(d => loadPowerChart(d.id));
  }, 100);
}

function renderGrid(containerId, devices) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  if (devices.length === 0) {
    grid.innerHTML = '<p style="color:var(--sub);padding:32px">Žádná zařízení</p>';
    return;
  }
  devices.forEach(device => grid.appendChild(buildCard(device)));
}

// ---- GOVEE CARD ----
function buildGoveeCard(device) {
  const caps = device.capabilities || [];

  // OpenAPI v2 state format
  const getCap = (type, instance) => caps.find(c => c.type === type && c.instance === instance);
  const powerCap  = getCap('devices.capabilities.on_off', 'powerSwitch');
  const brightCap = getCap('devices.capabilities.range', 'brightness');
  const colorCap  = getCap('devices.capabilities.color_setting', 'colorRgb');

  const isOn     = powerCap?.state?.value === 1;
  const isOnline = device.deviceName !== undefined; // online pokud máme data
  const bright   = brightCap?.state?.value ?? 100;

  // RGB z číselné hodnoty
  const colorVal = colorCap?.state?.value;
  const col = colorVal ? { r:(colorVal>>16)&0xFF, g:(colorVal>>8)&0xFF, b:colorVal&0xFF } : null;
  const iconBg = col ? `rgb(${col.r},${col.g},${col.b})` : '';
  const iconStyle = iconBg ? `background:${iconBg};opacity:0.85` : '';

  const card = document.createElement('div');
  card.className = `device-card govee-card${isOn?' is-on':''}${!isOnline?' is-offline':''}`;
  card.dataset.goveeId = device.device;

  let html = `
    <div class="card-header">
      <div class="card-icon-name">
        <div class="card-icon" style="${iconStyle}">🌈</div>
        <div>
          <div class="card-name">${device.deviceName}</div>
          <div class="card-status ${isOnline?'online':'offline'}">${isOnline?'Online':'Offline'} · Govee</div>
        </div>
      </div>
      <div class="toggle ${isOn?'on':''} ${!isOnline?'disabled':''}"
           onclick="${isOnline?`goveeToggle('${device.device}','${device.model}',this)`:''}">
      </div>
    </div>`;

  if (isOnline) {
    html += `
      <div class="brightness-row">
        <div class="brightness-label"><span>Jas</span><span id="gbr-${device.device}">${bright}%</span></div>
        <input type="range" class="slider" min="1" max="100" value="${bright}"
          oninput="document.getElementById('gbr-${device.device}').textContent=this.value+'%'"
          onchange="goveeSetBrightness('${device.device}','${device.model}',this.value)">
      </div>
      <button class="detail-btn" onclick="openGoveeModal('${device.device}','${device.model}','${device.deviceName}')">Nastavení světla →</button>`;
  }

  card.innerHTML = html;
  return card;
}

// ---- GOVEE TOGGLE ----
async function goveeToggle(device, model, el) {
  const currentlyOn = el.classList.contains('on');
  const turnOn = !currentlyOn;
  el.classList.toggle('on', turnOn);
  const card = el.closest('.device-card');
  if (card) card.classList.toggle('is-on', turnOn);
  try {
    await fetch('/api/govee/device/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, model, cmd: { name:'turn', value: turnOn?'on':'off' } })
    });
    setTimeout(loadDevices, 1000);
  } catch(e) {
    el.classList.toggle('on', currentlyOn);
    if (card) card.classList.toggle('is-on', currentlyOn);
  }
}

// ---- GOVEE BRIGHTNESS ----
async function goveeSetBrightness(device, model, value) {
  await fetch('/api/govee/device/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, model, cmd: { name:'brightness', value: parseInt(value) } })
  });
}

// ---- GOVEE COLOR ----
async function goveeSetColor(device, model, r, g, b, el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  await fetch('/api/govee/device/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, model, cmd: { name:'color', value: {r,g,b} } })
  });
}

async function goveeSetColorTemp(device, model, kelvin) {
  await fetch('/api/govee/device/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, model, cmd: { name:'colorTem', value: parseInt(kelvin) } })
  });
}

// ---- GOVEE MODAL ----
function openGoveeModal(device, model, name) {
  document.getElementById('modal-title').textContent = name;

  let swatches = '';
  for (let i=0; i<PALETTE.length; i+=4) {
    swatches += '<div class="palette-row">';
    for (let j=i; j<Math.min(i+4,PALETTE.length); j++) {
      const c = PALETTE[j];
      // Převod HSV → RGB pro Govee
      const [r,g,b] = hsvToRgb(c.h, c.s/1000, c.v/1000);
      swatches += `<div class="color-swatch" style="background:${c.css}" title="${c.label}"
        onclick="goveeSetColor('${device}','${model}',${r},${g},${b},this)">
        <div class="swatch-label">${c.label}</div></div>`;
    }
    swatches += '</div>';
  }

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-section">
      <div class="modal-label">Jas</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>0%</span><span id="modal-govee-br">50%</span></div>
        <input type="range" class="slider" min="1" max="100" value="50"
          oninput="document.getElementById('modal-govee-br').textContent=this.value+'%'"
          onchange="goveeSetBrightness('${device}','${model}',this.value)">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Teplota světla (2000K – 9000K)</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>🔥 Teplá</span><span>❄️ Studená</span></div>
        <input type="range" class="slider" min="2000" max="9000" value="4000"
          onchange="goveeSetColorTemp('${device}','${model}',this.value)">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Paleta barev</div>
      <div class="color-palette">${swatches}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Vlastní barva</div>
      <div class="custom-color-row">
        <input type="color" value="#ffffff" onchange="goveeColorFromHex('${device}','${model}',this.value)">
        <span>Klikni a vyber libovolnou barvu</span>
      </div>
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function goveeColorFromHex(device, model, hex) {
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  goveeSetColor(device, model, r, g, b, null);
}

function hsvToRgb(h, s, v) {
  let r,g,b;
  const i = Math.floor(h/60)%6;
  const f = h/60-Math.floor(h/60);
  const p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  switch(i){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

// ---- BUILD CARD ----
function buildCard(device) {
  const type = deviceType(device);
  const icon = deviceIcon(type, device.name);
  const status = device.status || [];
  const isOnline = device.online;

  const switchLed  = status.find(s => s.code === 'switch_led');
  const switchPlug = status.find(s => s.code === 'switch');
  const isOn = switchLed?.value || switchPlug?.value || false;
  const switchCode = switchLed ? 'switch_led' : 'switch';

  const card = document.createElement('div');
  card.className = `device-card${isOn?' is-on':''}${!isOnline?' is-offline':''}`;
  card.dataset.id = device.id;

  let html = `
    <div class="card-header">
      <div class="card-icon-name">
        <div class="card-icon">${icon}</div>
        <div>
          <div class="card-name">${device.name}</div>
          <div class="card-status ${isOnline?'online':'offline'}">${isOnline?'Online':'Offline'}</div>
        </div>
      </div>`;

  if ((type === 'light' || type === 'plug') && isOnline) {
    html += `<div class="toggle ${isOn?'on':''}" onclick="toggleDevice('${device.id}','${switchCode}',this)"></div>`;
  }
  html += `</div>`;

  // ---- SENSOR ----
  if (type === 'sensor') {
    const temp  = status.find(s => s.code === 'va_temperature');
    const hum   = status.find(s => s.code === 'va_humidity');
    const bat   = status.find(s => s.code === 'battery_percentage');
    const batSt = status.find(s => s.code === 'battery_state');
    html += `<div class="sensor-row">`;
    if (temp) html += `<div class="sensor-val"><div class="val">${(temp.value/10).toFixed(1)}°</div><div class="lbl">Teplota</div></div>`;
    if (hum)  html += `<div class="sensor-val"><div class="val">${parseHum(hum)}%</div><div class="lbl">Vlhkost</div></div>`;
    html += `</div>`;
    if (bat) {
      const p = bat.value;
      const cls = p<20?'low':p<50?'mid':'';
      html += `<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`;
    } else if (batSt) {
      const icons = {low:'🪫',middle:'🔋',high:'🔋'};
      html += `<div class="battery-row">${icons[batSt.value]||'🔋'} Baterie: ${batSt.value}</div>`;
    }
  }

  // ---- LIGHT ----
  if (type === 'light' && isOnline) {
    const bright = status.find(s => s.code === 'bright_value_v2');
    if (bright) {
      const pct = Math.round((bright.value/1000)*100);
      html += `
        <div class="brightness-row">
          <div class="brightness-label"><span>Jas</span><span id="br-${device.id}">${pct}%</span></div>
          <input type="range" class="slider" min="1" max="100" value="${pct}"
            oninput="document.getElementById('br-${device.id}').textContent=this.value+'%'"
            onchange="setBrightness('${device.id}',this.value)">
        </div>`;
    }
    html += `<button class="detail-btn" onclick="openLightModal('${device.id}')">Nastavení světla →</button>`;
  }

  // ---- PLUG ----
  if (type === 'plug') {
    // cur_power scale=0 → value is in 0.1W → divide by 10
    // cur_voltage scale=0 → value is in 0.1V → divide by 10
    // cur_current scale=0 → value is in mA → divide by 1000
    const power   = status.find(s => s.code === 'cur_power');
    const voltage = status.find(s => s.code === 'cur_voltage');
    const current = status.find(s => s.code === 'cur_current');
    const addEle  = status.find(s => s.code === 'add_ele');

    if (power || voltage || current) {
      html += `<div class="power-row">`;
      if (power)   html += `<div class="power-chip"><strong>${(power.value/10).toFixed(1)} W</strong>Výkon</div>`;
      if (voltage) html += `<div class="power-chip"><strong>${(voltage.value/10).toFixed(0)} V</strong>Napětí</div>`;
      if (current) html += `<div class="power-chip"><strong>${(current.value/1000).toFixed(2)} A</strong>Proud</div>`;
      html += `</div>`;
    }
    if (addEle) {
      html += `<div class="energy-total">⚡ Celkem: <strong>${(addEle.value/1000).toFixed(3)} kWh</strong></div>`;
    }
    // Power gauge — max 3500W (běžná zásuvka)
    if (power) {
      const watt = power.value / 10;
      const maxW = 3500;
      const pct = Math.min(100, (watt / maxW) * 100);
      const gaugeColor = pct > 80 ? '#f25f5c' : pct > 50 ? '#f5a623' : '#3ecf8e';
      const r = 36, cx = 50, cy = 50;
      const circ = 2 * Math.PI * r;
      const dashOffset = circ * (1 - pct / 100);
      html += `
        <div class="power-gauge-wrap">
          <svg viewBox="0 0 100 100" class="power-gauge">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${gaugeColor}" stroke-width="8"
              stroke-dasharray="${circ}" stroke-dashoffset="${dashOffset}"
              stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
              style="transition:stroke-dashoffset 0.6s ease"/>
            <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="${gaugeColor}" font-size="13" font-weight="600" font-family="DM Mono,monospace">${watt.toFixed(0)}</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="rgba(232,234,240,0.4)" font-size="7">WATT</text>
          </svg>
          <div class="gauge-info">
            <div class="gauge-pct">${pct.toFixed(0)}% kapacity</div>
            <div class="gauge-max">max 3500 W</div>
          </div>
        </div>`;
    }
  }

  // ---- BUTTON / SCENE SWITCH ----
  if (type === 'button') {
    const bat = status.find(s => s.code === 'battery_percentage');
    const modes = status.filter(s => s.code.includes('switch') || s.code.includes('mode'));
    html += `<div class="button-info">`;
    modes.forEach(m => {
      html += `<div class="mode-badge">${m.code.replace(/_/g,' ')}: <span>${m.value || '—'}</span></div>`;
    });
    html += `</div>`;
    if (bat) {
      const p = bat.value;
      const cls = p<20?'low':p<50?'mid':'';
      html += `<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`;
    }
  }

  // ---- GATEWAY ----
  if (type === 'other' && device.name.toLowerCase().includes('gateway')) {
    html += `<div class="gateway-info">📡 Zigbee brána — ${isOnline ? 'aktivní' : 'offline'}</div>`;
  }

  card.innerHTML = html;
  return card;
}

// ---- TOGGLE ----
async function toggleDevice(id, code, el) {
  // Přečti aktuální stav z DOM — ne z parametru
  const currentlyOn = el.classList.contains('on');
  const newVal = !currentlyOn;

  // Optimistic UI
  el.classList.toggle('on', newVal);
  const card = el.closest('.device-card');
  if (card) card.classList.toggle('is-on', newVal);

  // Aktualizuj stav v allDevices aby ostatní sekce věděly o změně
  const device = allDevices.find(d => d.id === id);
  if (device) {
    const sw = device.status?.find(s => s.code === code);
    if (sw) sw.value = newVal;
  }

  try {
    const r = await fetch(`/api/device/${id}/control`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ commands:[{code, value:newVal}] })
    });
    const d = await r.json();
    if (!d.success) {
      // Vrátit zpět
      el.classList.toggle('on', currentlyOn);
      if (card) card.classList.toggle('is-on', currentlyOn);
      if (device) {
        const sw = device.status?.find(s => s.code === code);
        if (sw) sw.value = currentlyOn;
      }
    } else {
      setTimeout(loadDevices, 900);
    }
  } catch(e) {
    el.classList.toggle('on', currentlyOn);
    if (card) card.classList.toggle('is-on', currentlyOn);
  }
}

// ---- BRIGHTNESS ----
async function setBrightness(id, pct) {
  const value = Math.max(10, Math.round((pct/100)*1000));
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ commands:[{code:'bright_value_v2', value}] })
  });
}

// ---- POWER CHART TOGGLE ----
async function togglePowerChart(id) {
  const wrap = document.getElementById(`pwchart-wrap-${id}`);
  if (!wrap) return;
  if (wrap.style.display === 'none') {
    wrap.style.display = 'block';
    await loadPowerChart(id);
  } else {
    wrap.style.display = 'none';
  }
}

async function loadPowerChart(id) {
  if (charts['pw_'+id]) { charts['pw_'+id].destroy(); delete charts['pw_'+id]; }
  const canvas = document.getElementById(`pwchart-${id}`);
  if (!canvas) return;

  try {
    const now = Date.now();
    const from = now - 24*60*60*1000;
    const res = await fetch(`/api/device/${id}/power-history?start_time=${from}&end_time=${now}&size=50`);
    const data = await res.json();

    console.log('[power chart]', id, JSON.stringify(data).slice(0,200));

    const logs = (data.result?.logs || []).reverse();
    if (!logs.length) {
      canvas.parentElement.innerHTML += '<p class="no-data">Žádná data o spotřebě</p>';
      return;
    }

    const labels = logs.map(l => {
      const d = new Date(parseInt(l.event_time));
      return d.toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'});
    });
    const values = logs.map(l => (parseInt(l.value)/10).toFixed(1));

    const ctx = canvas.getContext('2d');
    charts['pw_'+id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Výkon (W)',
          data: values,
          borderColor: '#f5a623',
          backgroundColor: 'rgba(245,166,35,0.08)',
          tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect:false, mode:'index' },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color:'rgba(232,234,240,0.35)', maxTicksLimit:6, font:{size:10} }, grid: { color:'rgba(255,255,255,0.04)' } },
          y: { ticks: { color:'#f5a623', font:{size:10}, callback: v => v+'W' }, grid: { color:'rgba(255,255,255,0.04)' } },
        }
      }
    });
  } catch(e) {
    console.error('[power chart error]', e);
  }
}

// ---- COLOR PALETTE ----
const PALETTE = [
  { label:'Teplá bílá',   h:30,  s:80,   v:1000, css:'#ffdb99' },
  { label:'Neutrální',    h:40,  s:40,   v:1000, css:'#fff5e0' },
  { label:'Studená bílá', h:210, s:30,   v:1000, css:'#ddeeff' },
  { label:'Bílá',         h:0,   s:0,    v:1000, css:'#ffffff' },
  { label:'Červená',      h:0,   s:1000, v:900,  css:'#ff4040' },
  { label:'Oranžová',     h:25,  s:1000, v:1000, css:'#ff8c00' },
  { label:'Žlutá',        h:55,  s:1000, v:1000, css:'#ffd700' },
  { label:'Zelená',       h:120, s:900,  v:800,  css:'#3cb371' },
  { label:'Tyrkysová',    h:175, s:900,  v:800,  css:'#20b2aa' },
  { label:'Modrá',        h:220, s:1000, v:1000, css:'#4169e1' },
  { label:'Fialová',      h:275, s:900,  v:900,  css:'#8a2be2' },
  { label:'Růžová',       h:320, s:800,  v:1000, css:'#ff69b4' },
];

// ---- LIGHT MODAL ----
function openLightModal(id) {
  const device = allDevices.find(d => d.id === id);
  if (!device) return;
  document.getElementById('modal-title').textContent = device.name;

  const st = device.status || [];
  const bright = st.find(s => s.code==='bright_value_v2');
  const pct = bright ? Math.round((bright.value/1000)*100) : 50;
  const tempVal = st.find(s => s.code==='temp_value_v2');
  const tempPct = tempVal ? Math.round((tempVal.value/1000)*100) : 50;

  let swatches = '';
  for (let i=0; i<PALETTE.length; i+=4) {
    swatches += '<div class="palette-row">';
    for (let j=i; j<Math.min(i+4,PALETTE.length); j++) {
      const c = PALETTE[j];
      swatches += `<div class="color-swatch" style="background:${c.css}" title="${c.label}" onclick="setColor('${id}',${c.h},${c.s},${c.v},this)"><div class="swatch-label">${c.label}</div></div>`;
    }
    swatches += '</div>';
  }

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-section">
      <div class="modal-label">Režim</div>
      <div class="mode-tabs">
        <button class="mode-tab active" onclick="setMode('${id}','white',this)">⬜ Bílá</button>
        <button class="mode-tab" onclick="setMode('${id}','colour',this)">🎨 Barva</button>
        <button class="mode-tab" onclick="setMode('${id}','scene',this)">✨ Scéna</button>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Jas</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>0%</span><span id="modal-br">${pct}%</span></div>
        <input type="range" class="slider" min="1" max="100" value="${pct}"
          oninput="document.getElementById('modal-br').textContent=this.value+'%'"
          onchange="setBrightness('${id}',this.value)">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Teplota světla</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>❄️ Studená</span><span>🔥 Teplá</span></div>
        <input type="range" class="slider" min="0" max="100" value="${100-tempPct}"
          onchange="setColorTemp('${id}',100-this.value)">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Paleta barev</div>
      <div class="color-palette">${swatches}</div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Vlastní barva</div>
      <div class="custom-color-row">
        <input type="color" value="#ffffff" onchange="setColorFromHex('${id}',this.value)">
        <span>Klikni a vyber libovolnou barvu</span>
      </div>
    </div>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

async function setMode(id, mode, btn) {
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ commands:[{code:'work_mode', value:mode}] })
  });
}

async function setColor(id, h, s, v, el) {
  document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
  if (el) el.classList.add('active');
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ commands:[
      {code:'work_mode', value:'colour'},
      {code:'colour_data_v2', value:{h,s,v}}
    ]})
  });
}

async function setColorTemp(id, pct) {
  const value = Math.round((pct/100)*1000);
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ commands:[
      {code:'work_mode', value:'white'},
      {code:'temp_value_v2', value}
    ]})
  });
}

function setColorFromHex(id, hex) {
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0, s=max===0?0:d/max, v=max;
  if(max!==min){
    switch(max){
      case r: h=((g-b)/d+(g<b?6:0))/6; break;
      case g: h=((b-r)/d+2)/6; break;
      case b: h=((r-g)/d+4)/6; break;
    }
  }
  setColor(id, Math.round(h*360), Math.round(s*1000), Math.round(v*1000), null);
}

// ---- SENSORS PAGE WITH CHARTS ----

// Globální úložiště dat senzorů pro souhrnné grafy
const sensorData = {}; // { deviceId: { tempLogs, humLogs, tempData, humData, labels } }

async function renderSensors() {
  const grid = document.getElementById('sensors-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Zruš staré grafy
  Object.keys(charts).forEach(k => {
    if (!k.startsWith('pw_')) { try { charts[k].destroy(); } catch(e){} delete charts[k]; }
  });

  const sensors = allDevices.filter(d => deviceType(d) === 'sensor');
  if (!sensors.length) {
    grid.innerHTML = '<p style="color:var(--sub);padding:32px">Žádné senzory</p>';
    return;
  }

  const now = Date.now();
  const from = sensorRange === '7d' ? now - 7*24*60*60*1000 : now - 24*60*60*1000;

  // ---- Jednotlivé karty senzorů ----
  for (const device of sensors) {
    const st = device.status || [];
    const temp  = st.find(s => s.code === 'va_temperature');
    const hum   = st.find(s => s.code === 'va_humidity');
    const bat   = st.find(s => s.code === 'battery_percentage');
    const batSt = st.find(s => s.code === 'battery_state');

    let batHtml = '';
    if (bat) {
      const p = bat.value;
      const cls = p<20?'low':p<50?'mid':'';
      batHtml = `<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`;
    } else if (batSt) {
      const icons = {low:'🪫',middle:'🔋',high:'🔋'};
      batHtml = `<div class="battery-row">${icons[batSt.value]||'🔋'} Baterie: ${batSt.value}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'sensor-card';
    card.innerHTML = `
      <div class="sensor-card-header">
        <div class="sensor-card-title">
          <span class="icon">🌡️</span>
          <h3>${device.name}</h3>
        </div>
        <div class="card-status ${device.online?'online':'offline'}">${device.online?'Online':'Offline'}</div>
      </div>
      <div class="sensor-current">
        ${temp ? `<div class="sensor-big"><div class="big-val">${(temp.value/10).toFixed(1)}°C</div><div class="big-lbl">Teplota</div></div>` : ''}
        ${hum  ? `<div class="sensor-big"><div class="big-val">${parseHum(hum)}%</div><div class="big-lbl">Vlhkost</div></div>` : ''}
      </div>
      ${batHtml}
      <div class="sensor-charts-split">
        <div class="sensor-chart-block">
          <div class="sensor-chart-label">🌡️ Teplota (°C)</div>
          <div class="chart-wrap" id="chart-temp-wrap-${device.id}">
            <div class="chart-loading">Načítám...</div>
            <canvas id="chart-temp-${device.id}" style="display:none"></canvas>
          </div>
        </div>
        <div class="sensor-chart-block">
          <div class="sensor-chart-label">💧 Vlhkost (%)</div>
          <div class="chart-wrap" id="chart-hum-wrap-${device.id}">
            <div class="chart-loading">Načítám...</div>
            <canvas id="chart-hum-${device.id}" style="display:none"></canvas>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  // ---- Souhrnné grafy (full width) ----
  const summaryEl = document.createElement('div');
  summaryEl.className = 'sensor-summary';
  summaryEl.innerHTML = `
    <div class="sensor-card sensor-card-full">
      <div class="sensor-card-header">
        <div class="sensor-card-title"><span class="icon">🌡️</span><h3>Porovnání teplot</h3></div>
        <button class="avg-btn" id="avg-btn-temp" onclick="toggleAverage('temp')">∅ Průměr</button>
      </div>
      <div class="chart-wrap tall" id="chart-compare-temp">
        <div class="chart-loading">Načítám...</div>
        <canvas id="canvas-compare-temp" style="display:none"></canvas>
      </div>
      <div class="compare-stats" id="compare-stats-temp"></div>
    </div>
    <div class="sensor-card sensor-card-full">
      <div class="sensor-card-header">
        <div class="sensor-card-title"><span class="icon">💧</span><h3>Porovnání vlhkostí</h3></div>
        <button class="avg-btn" id="avg-btn-hum" onclick="toggleAverage('hum')">∅ Průměr</button>
      </div>
      <div class="chart-wrap tall" id="chart-compare-hum">
        <div class="chart-loading">Načítám...</div>
        <canvas id="canvas-compare-hum" style="display:none"></canvas>
      </div>
      <div class="compare-stats" id="compare-stats-hum"></div>
    </div>
  `;
  grid.appendChild(summaryEl);

  // Načti data pro všechny senzory pak vykresli
  await Promise.all(sensors.map(d => loadSensorData(d.id, from, now)));
  drawComparisons(sensors);
  renderCompareStats(sensors);
}

async function fetchAllLogs(deviceId, codes, from, to, maxPages = 5) {
  let allLogs = [];
  let lastRowKey = '';

  for (let page = 0; page < maxPages; page++) {
    // Sestavíme URL parametry — last_row_key přidáme jen pokud existuje
    const params = new URLSearchParams({
      codes,
      start_time: from,
      end_time: to,
      size: 100,
    });
    if (lastRowKey) params.set('last_row_key', lastRowKey);

    const res = await fetch(`/api/device/${deviceId}/history?${params.toString()}`).then(r => r.json());
    const logs = res.result?.logs || [];

    if (!logs.length) break;
    allLogs = allLogs.concat(logs);

    if (!res.result?.has_more || !res.result?.last_row_key) break;

    // Ochrana proti zacyklení — pokud dostaneme stejný klíč, zastav
    if (res.result.last_row_key === lastRowKey) break;
    lastRowKey = res.result.last_row_key;
  }

  return allLogs.reverse();
}

async function loadSensorData(deviceId, from, to) {
  try {
    const [tempLogs, humLogs] = await Promise.all([
      fetchAllLogs(deviceId, 'va_temperature', from, to),
      fetchAllLogs(deviceId, 'va_humidity', from, to),
    ]);

    const tempData = tempLogs.map(l => (parseInt(l.value)/10));
    const humData  = humLogs.map(l  => { const v=parseInt(l.value); return v>100?v/10:v; });

    const timeLabel = (ts) => {
      const d = new Date(parseInt(ts));
      return sensorRange === '7d'
        ? d.toLocaleDateString('cs-CZ', {weekday:'short', day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'})
        : d.toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'});
    };

    const tempLabels = tempLogs.map(l => timeLabel(l.event_time));
    const humLabels  = humLogs.map(l  => timeLabel(l.event_time));

    sensorData[deviceId] = { tempLogs, humLogs, tempData, humData, tempLabels, humLabels };

    drawSingleChart(`chart-temp-${deviceId}`, `chart-temp-wrap-${deviceId}`, tempLabels, tempData, 'Teplota (°C)', '#4f8ef7', 'rgba(79,142,247,0.1)', '°');
    drawSingleChart(`chart-hum-${deviceId}`,  `chart-hum-wrap-${deviceId}`,  humLabels,  humData,  'Vlhkost (%)', '#3ecf8e', 'rgba(62,207,142,0.08)', '%');

  } catch(e) {
    console.error('[sensor data error]', deviceId, e);
  }
}

function drawSingleChart(canvasId, wrapId, labels, data, label, color, bgColor, unit) {
  const wrap   = document.getElementById(wrapId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || !wrap) return;

  const loading = wrap.querySelector('.chart-loading');
  if (loading) loading.style.display = 'none';

  if (!data.length) {
    wrap.innerHTML = '<p class="no-data">Žádná data</p>';
    return;
  }

  canvas.style.display = 'block';
  if (charts[canvasId]) { try { charts[canvasId].destroy(); } catch(e){} }

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const padding = (maxVal - minVal) * 0.15 || 1;

  charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: bgColor,
        tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect:false, mode:'index' },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color:'rgba(232,234,240,0.35)', maxTicksLimit:6, font:{size:10} }, grid: { color:'rgba(255,255,255,0.04)' } },
        y: {
          min: minVal - padding,
          max: maxVal + padding,
          ticks: { color, font:{size:10}, callback: v => v.toFixed(1)+unit },
          grid: { color:'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function toggleAverage(title) {
  const chart = charts['compare_'+title];
  const btn = document.getElementById('avg-btn-'+title);
  if (!chart || !btn) return;

  const lastIdx = chart.data.datasets.length - 1;
  const meta = chart.getDatasetMeta(lastIdx);
  // meta.hidden je true (skrytý) nebo null (viditelný)
  const currentlyHidden = meta.hidden === true;
  meta.hidden = !currentlyHidden;
  btn.classList.toggle('active', !meta.hidden);
  chart.update();
}

function drawComparisons(sensors) {
  const COLORS = ['#4f8ef7','#f5a623','#3ecf8e','#f25f5c'];
  const AVG_COLOR = 'rgba(255,255,255,0.65)';

  [
    { canvasId:'canvas-compare-temp', wrapId:'chart-compare-temp', key:'tempData', timeKey:'tempLogs', unit:'°', title:'temp', avgLabel:'Průměr' },
    { canvasId:'canvas-compare-hum',  wrapId:'chart-compare-hum',  key:'humData',  timeKey:'humLogs',  unit:'%', title:'hum',  avgLabel:'Průměr' },
  ].forEach(({ canvasId, wrapId, key, timeKey, unit, title, avgLabel }) => {
    const wrap   = document.getElementById(wrapId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !wrap) return;

    const loading = wrap.querySelector('.chart-loading');
    if (loading) loading.style.display = 'none';

    // Použij string labels — nejdelší série jako základ
    const longestDevice = sensors.reduce((a,b) => {
      const da = sensorData[a.id]; const db = sensorData[b.id];
      return (da?.[timeKey]?.length||0) >= (db?.[timeKey]?.length||0) ? a : b;
    });
    const baseLogs = sensorData[longestDevice.id]?.[timeKey] || [];
    const labels = baseLogs.map(l => {
      const d = new Date(parseInt(l.event_time));
      return sensorRange === '7d'
        ? d.toLocaleDateString('cs-CZ', {day:'numeric', month:'numeric', hour:'2-digit', minute:'2-digit'})
        : d.toLocaleTimeString('cs-CZ', {hour:'2-digit', minute:'2-digit'});
    });

    // Interpoluj kratší série na délku nejdelší
    const maxLen = labels.length;
    const sensorDatasets = sensors.map((device, i) => {
      const d = sensorData[device.id];
      if (!d || !d[key].length) return null;
      const src = d[key];
      const interpolated = Array.from({length: maxLen}, (_, idx) => {
        const srcIdx = Math.round((idx / (maxLen - 1)) * (src.length - 1));
        return src[srcIdx] ?? null;
      });
      return {
        label: device.name,
        data: interpolated,
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: 'transparent',
        tension: 0.4, fill: false, pointRadius: 0, borderWidth: 2,
      };
    }).filter(Boolean);

    if (!sensorDatasets.length) { wrap.innerHTML = '<p class="no-data">Žádná data</p>'; return; }

    // Průměr
    const avgData = Array.from({length: maxLen}, (_, i) => {
      const vals = sensorDatasets.map(ds => ds.data[i]).filter(v => v !== null && v !== undefined);
      return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    });

    const avgDataset = {
      label: avgLabel,
      data: avgData,
      borderColor: AVG_COLOR,
      backgroundColor: 'transparent',
      borderDash: [6, 3],
      tension: 0.4, fill: false, pointRadius: 0, borderWidth: 1.5,
    };

    const datasets = [...sensorDatasets, avgDataset];
    canvas.style.display = 'block';
    if (charts['compare_'+title]) { try { charts['compare_'+title].destroy(); } catch(e){} }

    const allVals = sensorDatasets.flatMap(ds => ds.data).filter(v => v !== null);
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const padding = (maxVal - minVal) * 0.15 || 1;

    charts['compare_'+title] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect:false, mode:'index' },
        plugins: {
          legend: {
            labels: {
              font:{size:11},
              padding:16,
              generateLabels(chart) {
                return chart.data.datasets.map((ds, i) => {
                  const meta = chart.getDatasetMeta(i);
                  const isHidden = meta.hidden === true;
                  const isAvg = ds.label === avgLabel;
                  return {
                    text: ds.label,
                    fillStyle: 'transparent',
                    strokeStyle: ds.borderColor,
                    lineWidth: isAvg ? 1.5 : 2,
                    lineDash: isAvg ? [6,3] : [],
                    hidden: false, // nikdy nepřeškrtávat
                    datasetIndex: i,
                    pointStyle: 'line',
                    // Ztmavnout když je skrytý
                    fontColor: isHidden
                      ? 'rgba(232,234,240,0.2)'
                      : isAvg ? 'rgba(255,255,255,0.5)' : 'rgba(232,234,240,0.7)',
                  };
                });
              }
            },
            onClick(e, item, legend) {
              const ci = legend.chart;
              const meta = ci.getDatasetMeta(item.datasetIndex);
              meta.hidden = !meta.hidden;
              if (item.datasetIndex === ci.data.datasets.length - 1) {
                const btn = document.getElementById('avg-btn-'+title);
                if (btn) btn.classList.toggle('active', !meta.hidden);
              }
              ci.update();
            }
          }
        },
        scales: {
          x: {
            ticks: { color:'rgba(232,234,240,0.35)', maxTicksLimit:8, font:{size:10}, maxRotation:0 },
            grid: { color:'rgba(255,255,255,0.04)' }
          },
          y: {
            min: minVal - padding,
            max: maxVal + padding,
            ticks: { color:'rgba(232,234,240,0.5)', font:{size:10}, callback: v => v.toFixed(1)+unit },
            grid: { color:'rgba(255,255,255,0.04)' }
          }
        }
      }
    });

    // Skryj průměr hned po vytvoření přes meta (jediná správná cesta)
    const newChart = charts['compare_'+title];
    if (newChart) {
      const lastIdx = newChart.data.datasets.length - 1;
      newChart.getDatasetMeta(lastIdx).hidden = true;
      newChart.update('none');
    }
  });
}

function renderCompareStats(sensors) {
  [
    { statsId: 'compare-stats-temp', key: 'tempData', unit: '°C', label: 'Teplota' },
    { statsId: 'compare-stats-hum',  key: 'humData',  unit: '%',  label: 'Vlhkost' },
  ].forEach(({ statsId, key, unit, label }) => {
    const el = document.getElementById(statsId);
    if (!el) return;

    const rows = sensors.map((device, i) => {
      const d = sensorData[device.id];
      if (!d || !d[key].length) return '';
      const vals = d[key];
      const min = Math.min(...vals).toFixed(1);
      const max = Math.max(...vals).toFixed(1);
      const avg = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
      const COLORS = ['#4f8ef7','#f5a623','#3ecf8e','#f25f5c'];
      const color = COLORS[i % COLORS.length];
      return `
        <div class="compare-stat-row">
          <div class="compare-stat-name">
            <span class="compare-dot" style="background:${color}"></span>
            ${device.name}
          </div>
          <div class="compare-stat-vals">
            <div class="compare-stat-item"><span class="csi-label">Min</span><span class="csi-val" style="color:${color}">${min}${unit}</span></div>
            <div class="compare-stat-item"><span class="csi-label">Průměr</span><span class="csi-val">${avg}${unit}</span></div>
            <div class="compare-stat-item"><span class="csi-label">Max</span><span class="csi-val" style="color:${color}">${max}${unit}</span></div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = rows || '';
  });
}

// ---- INIT ----
loadDevices();
setInterval(loadDevices, 15000);
