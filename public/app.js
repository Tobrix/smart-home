/* =========================================================
   HomeOS — app.js (v5 — Opravy + Widgety)
   ========================================================= */

let allDevices = [];
let sensorRange = '24h';
const charts = {};

const _origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401) { window.location.href = '/login'; return res; }
  return res;
};

async function logout() {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login';
}

async function loadUserInfo() {
  try {
    const res = await fetch('/api/auth/check');
    const data = await res.json();
    const el = document.getElementById('mpm-user');
    if (el && data.username) el.textContent = data.username;
  } catch(e) {}
}
loadUserInfo();

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.mtab').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  if (page === 'lights')  renderLights();
  if (page === 'plugs')   renderPlugs();
  if (page === 'sensors') renderSensors();
}

document.querySelectorAll('.nav-item, .mtab').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    if (link.dataset.page) navigateTo(link.dataset.page);
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

function updateClock() {
  const now = new Date();
  const t = document.getElementById('clock');
  const d = document.getElementById('clock-date');
  if (t) t.textContent = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  if (d) d.textContent = now.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' });
}
setInterval(updateClock, 1000);
updateClock();

// ====================================================
// WEATHER WIDGET
// ====================================================
let weatherCity = localStorage.getItem('weather_city') || 'Ostrava';
let weatherLat  = parseFloat(localStorage.getItem('weather_lat') || '49.83');
let weatherLon  = parseFloat(localStorage.getItem('weather_lon') || '18.29');

const WMO_ICONS = { 0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'❄️',73:'❄️',75:'❄️',77:'🌨️',80:'🌦️',81:'🌦️',82:'⛈️',85:'❄️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️' };
const WMO_DESC  = { 0:'Jasno',1:'Převážně jasno',2:'Polojasno',3:'Zataženo',45:'Mlha',48:'Mlha',51:'Mrholení',53:'Mrholení',55:'Mrholení',61:'Slabý déšť',63:'Déšť',65:'Silný déšť',71:'Slabé sněžení',73:'Sněžení',75:'Silné sněžení',77:'Krupky',80:'Přeháňky',81:'Přeháňky',82:'Přeháňky',85:'Sněhové přeháňky',86:'Sněhové přeháňky',95:'Bouřka',96:'Bouřka',99:'Bouřka' };

async function loadWeather() {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${weatherLat}&longitude=${weatherLon}` +
      `&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&timezone=Europe/Prague&forecast_days=7`
    );
    const d = await r.json();
    const cw = d.current_weather;
    const ie = document.getElementById('weather-icon');
    const te = document.getElementById('weather-temp');
    const de = document.getElementById('weather-desc');
    if (ie) ie.textContent = WMO_ICONS[cw.weathercode] || '🌡️';
    if (te) te.textContent = Math.round(cw.temperature) + '°C';
    if (de) de.textContent = WMO_DESC[cw.weathercode] || '';
    renderWeatherWidget(cw, d.daily);
  } catch(e) {}
}

function renderWeatherWidget(current, daily) {
  const w = document.getElementById('weather-widget');
  if (!w) return;
  const days = ['Ne','Po','Út','St','Čt','Pá','So'];
  let fHtml = '';
  if (daily?.time) {
    for (let i = 1; i < Math.min(7, daily.time.length); i++) {
      const date = new Date(daily.time[i]);
      const dayName = i === 1 ? 'Zítra' : days[date.getDay()];
      const icon = WMO_ICONS[daily.weathercode[i]] || '🌡️';
      const hi = Math.round(daily.temperature_2m_max[i]);
      const lo = Math.round(daily.temperature_2m_min[i]);
      const rain = daily.precipitation_sum?.[i] ?? 0;
      fHtml += `<div class="forecast-day">
        <div class="forecast-name">${dayName}</div>
        <div class="forecast-icon">${icon}</div>
        <div class="forecast-hi">${hi}°</div>
        <div class="forecast-lo">${lo}°</div>
        <div class="forecast-rain">${rain > 0.3 ? '💧'+rain.toFixed(1) : ''}</div>
      </div>`;
    }
  }
  w.innerHTML = `
    <div class="widget-header">
      <span class="widget-title">☁️ Počasí</span>
      <div class="weather-city-row">
        <span class="weather-city-name">${weatherCity}</span>
        <button class="widget-btn" onclick="openCitySearch()" title="Změnit město">✏️</button>
      </div>
    </div>
    <div class="weather-now">
      <div class="weather-now-left">
        <div class="weather-big-icon">${WMO_ICONS[current.weathercode] || '🌡️'}</div>
        <div class="weather-big-temp">${Math.round(current.temperature)}°C</div>
      </div>
      <div class="weather-now-right">
        <div class="weather-detail-badge">${WMO_DESC[current.weathercode] || ''}</div>
        <div class="weather-detail-badge">💨 ${Math.round(current.windspeed)} km/h</div>
      </div>
    </div>
    <div class="weather-forecast">${fHtml}</div>
    <div id="city-search-wrap" class="city-search-wrap" style="display:none">
      <input type="text" id="city-input" class="city-input" placeholder="Zadej město..." oninput="searchCity(this.value)" autocomplete="off">
      <div id="city-results" class="city-results"></div>
    </div>`;
}

function openCitySearch() {
  const wrap = document.getElementById('city-search-wrap');
  if (!wrap) return;
  const open = wrap.style.display !== 'none';
  wrap.style.display = open ? 'none' : 'block';
  if (!open) setTimeout(() => document.getElementById('city-input')?.focus(), 50);
}

let _cityTimer = null;
async function searchCity(q) {
  clearTimeout(_cityTimer);
  const res = document.getElementById('city-results');
  if (q.length < 2) { if (res) res.innerHTML = ''; return; }
  _cityTimer = setTimeout(async () => {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=cs`);
      const d = await r.json();
      if (!res) return;
      res.innerHTML = (d.results || []).map(c =>
        `<div class="city-result" onclick="selectCity('${c.name.replace(/'/g,"\\'")}',${c.latitude},${c.longitude})">
          <strong>${c.name}</strong> <span>${c.country || ''}</span>
        </div>`
      ).join('') || '<div class="city-result-empty">Nic nenalezeno</div>';
    } catch(e) {}
  }, 300);
}

function selectCity(name, lat, lon) {
  weatherCity = name; weatherLat = lat; weatherLon = lon;
  localStorage.setItem('weather_city', name);
  localStorage.setItem('weather_lat', lat);
  localStorage.setItem('weather_lon', lon);
  const wrap = document.getElementById('city-search-wrap');
  if (wrap) wrap.style.display = 'none';
  loadWeather();
}

loadWeather();
setInterval(loadWeather, 15 * 60 * 1000);

// ====================================================
// BATTERY WIDGET
// ====================================================
function renderBatteryWidget() {
  const w = document.getElementById('battery-widget');
  if (!w) return;
  const batteryDevices = allDevices.filter(d => {
    const st = d.status || [];
    return st.some(s => s.code === 'battery_percentage' || s.code === 'battery_state');
  });
  if (!batteryDevices.length) {
    w.innerHTML = `<div class="widget-header"><span class="widget-title">🔋 Baterie</span></div><p class="widget-empty">Žádná zařízení s baterií</p>`;
    return;
  }
  let itemsHtml = '';
  for (const d of batteryDevices) {
    const st = d.status || [];
    const batPct = st.find(s => s.code === 'battery_percentage');
    const batSt  = st.find(s => s.code === 'battery_state');
    let pct = null, label = '', cls = '';
    if (batPct) {
      pct = batPct.value; label = pct + '%';
      cls = pct < 20 ? 'low' : pct < 50 ? 'mid' : '';
    } else if (batSt) {
      const map = {low:15, middle:55, high:90};
      const labels = {low:'Nízká', middle:'Střední', high:'Vysoká'};
      pct = map[batSt.value] ?? 50; label = labels[batSt.value] || batSt.value;
      cls = batSt.value === 'low' ? 'low' : batSt.value === 'middle' ? 'mid' : '';
    }
    if (pct === null) continue;
    itemsHtml += `
      <div class="bat-item">
        <div class="bat-item-left">
          <span class="bat-icon">${pct < 20 ? '🪫' : '🔋'}</span>
          <div>
            <div class="bat-name">${d.name}</div>
            <div class="card-status ${d.online?'online':'offline'}">${d.online?'Online':'Offline'}</div>
          </div>
        </div>
        <div class="bat-item-right">
          <div class="bat-bar-wrap">
            <div class="bat-bar"><div class="bat-fill ${cls}" style="width:${pct}%"></div></div>
            <span class="bat-pct ${cls}">${label}</span>
          </div>
        </div>
      </div>`;
  }
  w.innerHTML = `
    <div class="widget-header">
      <span class="widget-title">🔋 Stav baterií</span>
      <span class="widget-count">${batteryDevices.length}×</span>
    </div>
    <div class="bat-list">${itemsHtml || '<p class="widget-empty">Žádná data</p>'}</div>`;
}

// ====================================================
// DEVICE HELPERS
// ====================================================
function deviceType(device) {
  const codes = (device.status || []).map(s => s.code);
  if (codes.includes('va_temperature') || codes.includes('va_humidity')) return 'sensor';
  if (codes.includes('switch_led')) return 'light';
  if (codes.includes('switch')) return 'plug';
  if (codes.some(c => c.includes('switch1_value') || c.includes('switch_mode') || c.includes('switch_mode1'))) return 'button';
  return 'other';
}
function deviceIcon(type, name) {
  const n = name.toLowerCase();
  if (type === 'sensor') return '🌡️';
  if (type === 'button') return '🔘';
  if (type === 'light') { if(n.includes('postel')) return '🛏️'; if(n.includes('gauč')||n.includes('gauc')) return '🛋️'; return '💡'; }
  if (type === 'plug') { if(n.includes('vánoč')||n.includes('strome')) return '🎄'; return '🔌'; }
  if (n.includes('gateway')) return '📡';
  return '📱';
}

// ====================================================
// GOVEE
// ====================================================
let goveeDevices = [];
async function loadGoveeDevices() {
  try {
    const res = await fetch('/api/govee/devices');
    const data = await res.json();
    goveeDevices = await Promise.all((data.data || []).map(async d => {
      try {
        const sr = await fetch(`/api/govee/device/state?device=${encodeURIComponent(d.device)}&model=${encodeURIComponent(d.sku)}`);
        const sd = await sr.json();
        return { ...d, model: d.sku, deviceName: d.deviceName || d.sku, capabilities: sd.payload?.capabilities || [] };
      } catch(e) { return { ...d, model: d.sku, deviceName: d.deviceName || d.sku, capabilities: [] }; }
    }));
  } catch(e) { goveeDevices = []; }
}

// ====================================================
// LOAD DEVICES
// ====================================================
async function loadDevices() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');
  try {
    const [tuyaRes] = await Promise.all([fetch('/api/devices').then(r=>r.json()), loadGoveeDevices()]);
    const result = tuyaRes.result;
    allDevices = Array.isArray(result) ? result : (result?.devices || []);
    renderDashboard();
    updateStats();
    renderBatteryWidget();
  } catch(err) {
    document.getElementById('loading-state').innerHTML = '<p style="color:var(--red)">❌ Chyba — zkontroluj server</p>';
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
}

function updateStats() {
  const tuyaOnline = allDevices.filter(d=>d.online).length;
  const tuyaActive = allDevices.filter(d=>(d.status||[]).some(st=>(st.code==='switch_led'||st.code==='switch')&&st.value===true)).length;
  const goveeOnline = goveeDevices.length;
  const goveeActive = goveeDevices.filter(d=>(d.capabilities||[]).find(c=>c.type==='devices.capabilities.on_off'&&c.instance==='powerSwitch')?.state?.value===1).length;
  document.getElementById('stat-active').textContent = tuyaActive + goveeActive;
  document.getElementById('stat-online').textContent = `${tuyaOnline+goveeOnline}/${allDevices.length+goveeDevices.length}`;
  const sens = allDevices.find(d=>d.name.toLowerCase().includes('místnost')) || allDevices.find(d=>deviceType(d)==='sensor');
  if (sens) {
    const temp = (sens.status||[]).find(s=>s.code==='va_temperature');
    const hum  = (sens.status||[]).find(s=>s.code==='va_humidity');
    if (temp) document.getElementById('stat-temp').textContent = (temp.value/10).toFixed(1)+'°C';
    if (hum)  document.getElementById('stat-hum').textContent  = parseHum(hum)+'%';
  }
}
function parseHum(hum) { return hum.value > 100 ? (hum.value/10).toFixed(0) : hum.value; }

function renderDashboard() {
  document.getElementById('loading-state').style.display = 'none';
  const grid = document.getElementById('devices-grid');
  grid.innerHTML = '';
  allDevices.forEach(d => grid.appendChild(buildCard(d)));
  goveeDevices.forEach(d => grid.appendChild(buildGoveeCard(d)));
  initDnd('devices-grid');
}
function renderLights() {
  const grid = document.getElementById('lights-grid');
  grid.innerHTML = '';
  allDevices.filter(d=>deviceType(d)==='light').forEach(d=>grid.appendChild(buildCard(d)));
  goveeDevices.forEach(d=>grid.appendChild(buildGoveeCard(d)));
  initDnd('lights-grid');
}
function renderPlugs() {
  renderGrid('plugs-grid', allDevices.filter(d=>deviceType(d)==='plug'));
  setTimeout(() => allDevices.filter(d=>deviceType(d)==='plug').forEach(d=>loadPowerChart(d.id)), 100);
  initDnd('plugs-grid');
}
function renderGrid(containerId, devices) {
  const grid = document.getElementById(containerId); if (!grid) return;
  grid.innerHTML = '';
  if (!devices.length) { grid.innerHTML = '<p style="color:var(--text2);padding:32px">Žádná zařízení</p>'; return; }
  devices.forEach(d => grid.appendChild(buildCard(d)));
  initDnd(containerId);
}

// ====================================================
// GOVEE CARD
// ====================================================
function buildGoveeCard(device) {
  const caps = device.capabilities || [];
  const getCap = (t, i) => caps.find(c=>c.type===t&&c.instance===i);
  const powerCap  = getCap('devices.capabilities.on_off','powerSwitch');
  const brightCap = getCap('devices.capabilities.range','brightness');
  const colorCap  = getCap('devices.capabilities.color_setting','colorRgb');
  const isOn = powerCap?.state?.value === 1;
  const bright = brightCap?.state?.value ?? 100;
  const colorVal = colorCap?.state?.value;
  const col = colorVal ? {r:(colorVal>>16)&0xFF, g:(colorVal>>8)&0xFF, b:colorVal&0xFF} : null;
  const iconStyle = col ? `background:rgb(${col.r},${col.g},${col.b})` : '';

  const card = document.createElement('div');
  card.className = `device-card govee-card${isOn?' is-on':''}`;
  card.dataset.goveeId = device.device;
  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon-name">
        <div class="card-icon" style="${iconStyle}">🌈</div>
        <div>
          <div class="card-name">${device.deviceName}</div>
          <div class="card-status online">Online · Govee</div>
        </div>
      </div>
      <div class="toggle ${isOn?'on':''}" onclick="goveeToggle('${device.device}','${device.model}',this)"></div>
    </div>
    <div class="brightness-row">
      <div class="brightness-label"><span>Jas</span><span id="gbr-${device.device}">${bright}%</span></div>
      <input type="range" class="slider" min="1" max="100" value="${bright}"
        oninput="document.getElementById('gbr-${device.device}').textContent=this.value+'%'"
        onchange="goveeSetBrightness('${device.device}','${device.model}',this.value)">
    </div>
    <button class="detail-btn" onclick="openGoveeModal('${device.device}','${device.model}','${device.deviceName}')">Nastavení světla →</button>`;
  return card;
}

async function goveeToggle(device, model, el) {
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  el.closest('.device-card')?.classList.toggle('is-on', on);
  try {
    await fetch('/api/govee/device/control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({device,model,cmd:{name:'turn',value:on?'on':'off'}}) });
    setTimeout(loadDevices, 1000);
  } catch(e) { el.classList.toggle('on', !on); }
}
async function goveeSetBrightness(device, model, value) {
  await fetch('/api/govee/device/control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({device,model,cmd:{name:'brightness',value:parseInt(value)}}) });
}
async function goveeSetColor(device, model, r, g, b, el) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
  if (el) el.classList.add('active');
  updateLightPreview(r, g, b);
  await fetch('/api/govee/device/control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({device,model,cmd:{name:'color',value:{r,g,b}}}) });
}
async function goveeSetColorTemp(device, model, kelvin) {
  const k = parseInt(kelvin);
  await fetch('/api/govee/device/control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({device,model,cmd:{name:'colorTem',value:k}}) });
  const t=(k-2000)/7000;
  updateLightPreview(Math.round(255-t*20), Math.round(230+t*20), Math.round(190+t*65));
}

function openGoveeModal(device, model, name) {
  document.getElementById('modal-title').textContent = name;
  document.getElementById('modal-body').innerHTML = buildLightModalHtml({
    brightnessOnChange: `goveeSetBrightness('${device}','${model}',this.value)`,
    onColorTemp: `goveeSetColorTemp('${device}','${model}',kelvinFromSlider(this.value))`,
  });
  // Wire palette
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.onclick = () => {
      const h=parseInt(sw.dataset.h), s=parseInt(sw.dataset.s), v=parseInt(sw.dataset.v);
      const [r,g,b] = hsvToRgb(h, s/1000, v/1000);
      document.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('active'));
      sw.classList.add('active');
      goveeSetColor(device, model, r, g, b, null);
    };
  });
  initColorWheel((r,g,b) => goveeSetColor(device, model, r, g, b, null));
  document.getElementById('modal-overlay').classList.add('open');
}

// ====================================================
// BUILD CARD (Tuya)
// ====================================================
function buildCard(device) {
  const type = deviceType(device);
  const icon = deviceIcon(type, device.name);
  const status = device.status || [];
  const isOnline = device.online;
  const switchLed  = status.find(s=>s.code==='switch_led');
  const switchPlug = status.find(s=>s.code==='switch');
  const isOn = switchLed?.value || switchPlug?.value || false;
  const switchCode = switchLed ? 'switch_led' : 'switch';

  const card = document.createElement('div');
  card.className = `device-card${isOn?' is-on':''}${!isOnline?' is-offline':''}`;
  card.dataset.id = device.id;

  let html = `<div class="card-header"><div class="card-icon-name"><div class="card-icon">${icon}</div><div><div class="card-name">${device.name}</div><div class="card-status ${isOnline?'online':'offline'}">${isOnline?'Online':'Offline'}</div></div></div>`;
  if ((type==='light'||type==='plug') && isOnline) html += `<div class="toggle ${isOn?'on':''}" onclick="toggleDevice('${device.id}','${switchCode}',this)"></div>`;
  html += `</div>`;

  if (type === 'sensor') {
    const temp=status.find(s=>s.code==='va_temperature'), hum=status.find(s=>s.code==='va_humidity');
    const bat=status.find(s=>s.code==='battery_percentage'), batSt=status.find(s=>s.code==='battery_state');
    html += `<div class="sensor-row">`;
    if (temp) html += `<div class="sensor-val"><div class="val">${(temp.value/10).toFixed(1)}°</div><div class="lbl">Teplota</div></div>`;
    if (hum)  html += `<div class="sensor-val"><div class="val">${parseHum(hum)}%</div><div class="lbl">Vlhkost</div></div>`;
    html += `</div>`;
    if (bat) {
      const p=bat.value, cls=p<20?'low':p<50?'mid':'';
      html += `<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`;
    } else if (batSt) {
      html += `<div class="battery-row">${batSt.value==='low'?'🪫':'🔋'} Baterie: ${batSt.value}</div>`;
    }
  }

  // OPRAVA SVĚTEL: Detekuj správný brightness kód a zobraz vždy slider
  if (type === 'light' && isOnline) {
    const brightV2 = status.find(s=>s.code==='bright_value_v2');
    const brightV1 = status.find(s=>s.code==='bright_value');
    let pct = 50;
    if (brightV2) pct = Math.round((brightV2.value/1000)*100);
    else if (brightV1) pct = Math.round(((brightV1.value-25)/230)*100);

    html += `<div class="brightness-row">
      <div class="brightness-label"><span>Jas</span><span id="br-${device.id}">${pct}%</span></div>
      <input type="range" class="slider" min="1" max="100" value="${pct}"
        oninput="document.getElementById('br-${device.id}').textContent=this.value+'%'"
        onchange="setBrightness('${device.id}',this.value)">
    </div>
    <button class="detail-btn" onclick="openLightModal('${device.id}')">Nastavení světla →</button>`;
  }

  if (type === 'plug') {
    const power=status.find(s=>s.code==='cur_power'), voltage=status.find(s=>s.code==='cur_voltage'), current=status.find(s=>s.code==='cur_current'), addEle=status.find(s=>s.code==='add_ele');
    if (power||voltage||current) {
      html += `<div class="power-row">`;
      if (power)   html += `<div class="power-chip"><strong>${(power.value/10).toFixed(1)} W</strong>Výkon</div>`;
      if (voltage) html += `<div class="power-chip"><strong>${(voltage.value/10).toFixed(0)} V</strong>Napětí</div>`;
      if (current) html += `<div class="power-chip"><strong>${(current.value/1000).toFixed(2)} A</strong>Proud</div>`;
      html += `</div>`;
    }
    if (addEle) html += `<div class="energy-total">⚡ Celkem: <strong>${(addEle.value/1000).toFixed(3)} kWh</strong></div>`;
    if (power) {
      const watt=power.value/10, pct=Math.min(100,(watt/3500)*100);
      const gc=pct>80?'#fc5c65':pct>50?'#f7b731':'#2dce89';
      const circ=2*Math.PI*36, dashOffset=circ*(1-pct/100);
      html += `<div class="power-gauge-wrap"><svg viewBox="0 0 100 100" class="power-gauge">
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="9"/>
        <circle cx="50" cy="50" r="36" fill="none" stroke="${gc}" stroke-width="9" stroke-dasharray="${circ}" stroke-dashoffset="${dashOffset}" stroke-linecap="round" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset 0.6s"/>
        <text x="50" y="45" text-anchor="middle" fill="${gc}" font-size="13" font-weight="600" font-family="DM Mono,monospace">${watt.toFixed(0)}</text>
        <text x="50" y="60" text-anchor="middle" fill="rgba(238,242,255,0.3)" font-size="7">WATT</text>
      </svg><div class="gauge-info"><div class="gauge-pct">${pct.toFixed(0)}% kapacity</div><div class="gauge-max">max 3500 W</div></div></div>`;
    }
  }

  if (type === 'button') {
    const bat=status.find(s=>s.code==='battery_percentage');
    const modes=status.filter(s=>s.code.includes('switch')||s.code.includes('mode'));
    html += `<div class="button-info">`;
    modes.forEach(m=>{ html += `<div class="mode-badge">${m.code.replace(/_/g,' ')}: <span>${m.value||'—'}</span></div>`; });
    html += `</div>`;
    if (bat) { const p=bat.value, cls=p<20?'low':p<50?'mid':''; html += `<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`; }
  }

  if (type === 'other' && device.name.toLowerCase().includes('gateway')) html += `<div class="gateway-info">📡 Zigbee brána — ${isOnline?'aktivní':'offline'}</div>`;

  card.innerHTML = html;
  return card;
}

async function toggleDevice(id, code, el) {
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  el.closest('.device-card')?.classList.toggle('is-on', on);
  const device = allDevices.find(d=>d.id===id);
  if (device) { const sw=device.status?.find(s=>s.code===code); if(sw) sw.value=on; }
  try {
    const r = await fetch(`/api/device/${id}/control`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commands:[{code,value:on}]})});
    const d = await r.json();
    if (!d.success) { el.classList.toggle('on',!on); el.closest('.device-card')?.classList.toggle('is-on',!on); }
    else setTimeout(loadDevices, 900);
  } catch(e) { el.classList.toggle('on',!on); }
}

// OPRAVA JASU: Detekuj správný kód dle zařízení + aktualizuj lokální stav
async function setBrightness(id, pct) {
  const device = allDevices.find(d=>d.id===id);
  const status = device?.status || [];
  const hasBrV2    = status.find(s=>s.code==='bright_value_v2');
  const hasBr      = status.find(s=>s.code==='bright_value');
  const hasColour  = status.find(s=>s.code==='colour_data_v2') || status.find(s=>s.code==='colour_data');
  const workMode   = status.find(s=>s.code==='work_mode');

  let commands;

  if (hasBrV2) {
    // Standardní světlo s bright_value_v2 (0–1000)
    const val = Math.max(10, Math.round((pct/100)*1000));
    commands = [{ code:'bright_value_v2', value: val }];
    hasBrV2.value = val;

  } else if (hasBr) {
    // Starší světlo s bright_value (25–255)
    const val = Math.max(25, Math.round(25+(pct/100)*230));
    commands = [{ code:'bright_value', value: val }];
    hasBr.value = val;

  } else if (hasColour) {
    // Světlo bez bright_value — používá V v colour_data (0–1000)
    // Přepni do white módu pokud není, pak nastav jas přes bright_value_v2
    // nebo uprav V v colour_data pokud je v colour módu
    const mode = workMode?.value || 'white';
    if (mode === 'colour') {
      // V colour módu měň V složku colour_data
      const cdKey = status.find(s=>s.code==='colour_data_v2') ? 'colour_data_v2' : 'colour_data';
      const cd = status.find(s=>s.code===cdKey);
      const current = cd?.value || { h:0, s:1000, v:1000 };
      const newV = Math.max(10, Math.round((pct/100)*1000));
      const newVal = { h: current.h||0, s: current.s||1000, v: newV };
      commands = [{ code: cdKey, value: newVal }];
      if (cd) cd.value = newVal;
    } else {
      // V white módu zkus bright_value_v2 i tak
      const val = Math.max(10, Math.round((pct/100)*1000));
      commands = [{ code:'bright_value_v2', value: val }];
    }
  } else {
    // Fallback
    commands = [{ code:'bright_value_v2', value: Math.max(10, Math.round((pct/100)*1000)) }];
  }

  // Aktualizuj brightness-label lokálně
  const label = document.getElementById(`br-${id}`);
  if (label) label.textContent = pct + '%';

  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ commands })
  });
}

// ====================================================
// COLOR WHEEL
// ====================================================
let _wheelCallback=null, _wheelCanvas=null, _wheelCtx=null, _wheelDragging=false;
let _cleanupMove=null, _cleanupUp=null;

function initColorWheel(onColorChange) {
  _wheelCallback = onColorChange;
  const canvas = document.getElementById('color-wheel-canvas');
  if (!canvas) return;
  _wheelCanvas = canvas;
  const size = 220;
  canvas.width  = size * (window.devicePixelRatio||1);
  canvas.height = size * (window.devicePixelRatio||1);
  canvas.style.width = canvas.style.height = size+'px';
  _wheelCtx = canvas.getContext('2d');
  _wheelCtx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1);
  drawColorWheel(size);
  updateWheelCursor(size/2, size/2);

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX-rect.left, y: touch.clientY-rect.top };
  }
  function handle(e) {
    e.preventDefault();
    const {x,y} = getPos(e);
    const dx=x-110, dy=y-110;
    if (Math.sqrt(dx*dx+dy*dy)<=110) {
      updateWheelCursor(x,y);
      const [r,g,b] = getColorAtPos(x,y);
      updateLightPreview(r,g,b);
      if (_wheelCallback) _wheelCallback(r,g,b);
    }
  }
  canvas.onmousedown  = e => { _wheelDragging=true; handle(e); };
  canvas.ontouchstart = handle;
  canvas.ontouchmove  = handle;
  if (_cleanupMove) window.removeEventListener('mousemove', _cleanupMove);
  if (_cleanupUp)   window.removeEventListener('mouseup',   _cleanupUp);
  _cleanupMove = e => { if (_wheelDragging) handle(e); };
  _cleanupUp   = ()  => { _wheelDragging=false; };
  window.addEventListener('mousemove', _cleanupMove);
  window.addEventListener('mouseup',   _cleanupUp);
}

function drawColorWheel(size) {
  const ctx=_wheelCtx, cx=size/2, cy=size/2, r=size/2;
  for (let a=0; a<360; a++) {
    const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    grad.addColorStop(0,'white');
    grad.addColorStop(0.45,`hsl(${a},100%,50%)`);
    grad.addColorStop(1,`hsl(${a},100%,15%)`);
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,(a-1)*Math.PI/180,(a+1)*Math.PI/180);
    ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  }
}

function getColorAtPos(x,y) {
  try {
    const dpr=window.devicePixelRatio||1;
    const d=_wheelCtx.getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data;
    return [d[0],d[1],d[2]];
  } catch(e) { return [255,255,255]; }
}

function updateWheelCursor(x,y) {
  const c=document.getElementById('color-wheel-cursor');
  if (c) { c.style.left=x+'px'; c.style.top=y+'px'; }
}

function updateLightPreview(r,g,b) {
  const p=document.getElementById('light-preview'); if (!p) return;
  const h=rgbToHex(r,g,b);
  p.style.background=`radial-gradient(ellipse at center,${h} 0%,rgba(${r},${g},${b},0.25) 60%,transparent 100%)`;
  p.style.boxShadow=`0 0 40px rgba(${r},${g},${b},0.45),inset 0 0 50px rgba(${r},${g},${b},0.08)`;
}

function rgbToHex(r,g,b) { return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }

function hsvToRgb(h,s,v) {
  const i=Math.floor(h/60)%6, f=h/60-Math.floor(h/60);
  const p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  const arr=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
  return arr[i].map(x=>Math.round(x*255));
}

function kelvinFromSlider(val) { return Math.round(2000+(val/100)*7000); }

// ====================================================
// LIGHT MODAL HTML
// ====================================================
const PALETTE = [
  {label:'Teplá',    h:30,  s:80,   v:1000, css:'#ffdb99'},
  {label:'Neutrální',h:40,  s:40,   v:1000, css:'#fff5e0'},
  {label:'Studená',  h:210, s:30,   v:1000, css:'#ddeeff'},
  {label:'Bílá',     h:0,   s:0,    v:1000, css:'#ffffff'},
  {label:'Červená',  h:0,   s:1000, v:900,  css:'#ff4040'},
  {label:'Oranžová', h:25,  s:1000, v:1000, css:'#ff8c00'},
  {label:'Žlutá',    h:55,  s:1000, v:1000, css:'#ffd700'},
  {label:'Zelená',   h:120, s:900,  v:800,  css:'#3cb371'},
  {label:'Tyrkys',   h:175, s:900,  v:800,  css:'#20b2aa'},
  {label:'Modrá',    h:220, s:1000, v:1000, css:'#4169e1'},
  {label:'Fialová',  h:275, s:900,  v:900,  css:'#8a2be2'},
  {label:'Růžová',   h:320, s:800,  v:1000, css:'#ff69b4'},
];

function buildLightModalHtml(opts) {
  const swatches = PALETTE.map(c =>
    `<div class="color-swatch" style="background:${c.css}" title="${c.label}" data-h="${c.h}" data-s="${c.s}" data-v="${c.v}">
      <div class="swatch-label">${c.label}</div></div>`
  ).join('');
  return `
    <div id="light-preview" class="light-preview"><span class="light-preview-icon">💡</span></div>
    <div class="modal-section">
      <div class="modal-label">Jas</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>0%</span><span id="modal-br-val">50%</span><span>100%</span></div>
        <input type="range" class="slider brightness-slider" min="1" max="100" value="50"
          oninput="document.getElementById('modal-br-val').textContent=this.value+'%'"
          onchange="${opts.brightnessOnChange}">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Teplota světla</div>
      <div class="brightness-row">
        <div class="brightness-label"><span>🔥 Teplá (2000K)</span><span>❄️ Studená (9000K)</span></div>
        <input type="range" class="slider temp-slider" min="0" max="100" value="28" onchange="${opts.onColorTemp}">
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Výběr barvy</div>
      <div class="color-wheel-wrap">
        <div class="color-wheel-container" id="color-wheel-container">
          <canvas class="color-wheel-canvas" id="color-wheel-canvas"></canvas>
          <div class="color-wheel-cursor" id="color-wheel-cursor"></div>
        </div>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-label">Rychlé barvy</div>
      <div class="color-palette">${swatches}</div>
    </div>`;
}

// ====================================================
// LIGHT MODAL (Tuya)
// ====================================================
function openLightModal(id) {
  const device = allDevices.find(d=>d.id===id); if (!device) return;
  document.getElementById('modal-title').textContent = device.name;

  const st = device.status || [];
  const brightV2   = st.find(s=>s.code==='bright_value_v2');
  const brightV1   = st.find(s=>s.code==='bright_value');
  const colourData = st.find(s=>s.code==='colour_data_v2') || st.find(s=>s.code==='colour_data');
  let pct = 50;
  if (brightV2) {
    pct = Math.round((brightV2.value/1000)*100);
  } else if (brightV1) {
    pct = Math.round(((brightV1.value-25)/230)*100);
  } else if (colourData?.value?.v !== undefined) {
    // colour_data zařízení — jas je V složka (0–1000)
    pct = Math.round((colourData.value.v/1000)*100);
  }
  pct = Math.max(1, Math.min(100, pct));

  document.getElementById('modal-body').innerHTML = buildLightModalHtml({
    brightnessOnChange: `setBrightness('${id}',this.value)`,
    onColorTemp: `setColorTempFromSlider('${id}',this.value)`,
  });

  // Nastav aktuální jas v modálu
  const brInput = document.querySelector('#modal-body .brightness-slider');
  if (brInput) { brInput.value=pct; document.getElementById('modal-br-val').textContent=pct+'%'; }

  // Napoj paletu — Tuya
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.onclick = () => {
      const h=parseInt(sw.dataset.h), s=parseInt(sw.dataset.s), v=parseInt(sw.dataset.v);
      const [r,g,b] = hsvToRgb(h, s/1000, v/1000);
      document.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('active'));
      sw.classList.add('active');
      updateLightPreview(r,g,b);
      setColor(id, h, s, v, null);
    };
  });

  initColorWheel((r,g,b) => setColorFromRgb(id,r,g,b));
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  if (_cleanupMove) window.removeEventListener('mousemove', _cleanupMove);
  if (_cleanupUp)   window.removeEventListener('mouseup',   _cleanupUp);
  _cleanupMove=null; _cleanupUp=null;
  _wheelCanvas=null; _wheelCtx=null; _wheelCallback=null;
}

async function setColor(id, h, s, v, el) {
  if (el) { document.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('active')); el.classList.add('active'); }
  const [r,g,b] = hsvToRgb(h, s/1000, v/1000);
  updateLightPreview(r,g,b);
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({commands:[{code:'work_mode',value:'colour'},{code:'colour_data_v2',value:{h,s,v}}]})
  });
}

async function setColorFromRgb(id, r, g, b) {
  const rn=r/255, gn=g/255, bn=b/255;
  const max=Math.max(rn,gn,bn), min=Math.min(rn,gn,bn), d=max-min;
  let h=0, s=max===0?0:d/max, v=max;
  if (max!==min) {
    switch(max) {
      case rn: h=((gn-bn)/d+(gn<bn?6:0))/6; break;
      case gn: h=((bn-rn)/d+2)/6; break;
      case bn: h=((rn-gn)/d+4)/6; break;
    }
  }
  setColor(id, Math.round(h*360), Math.round(s*1000), Math.round(v*1000), null);
}

async function setColorTemp(id, pct) {
  const value = Math.round((pct/100)*1000);
  await fetch(`/api/device/${id}/control`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({commands:[{code:'work_mode',value:'white'},{code:'temp_value_v2',value}]})
  });
}

function setColorTempFromSlider(id, val) {
  setColorTemp(id, val);
  const t=val/100;
  updateLightPreview(Math.round(255-t*20), Math.round(230+t*20), Math.round(190+t*65));
}

// ====================================================
// POWER CHART
// ====================================================
async function loadPowerChart(id) {
  if (charts['pw_'+id]) { charts['pw_'+id].destroy(); delete charts['pw_'+id]; }
  const canvas = document.getElementById(`pwchart-${id}`); if (!canvas) return;
  try {
    const now=Date.now(), from=now-24*3600*1000;
    const res=await fetch(`/api/device/${id}/power-history?start_time=${from}&end_time=${now}&size=50`);
    const data=await res.json();
    const logs=(data.result?.logs||[]).reverse();
    if (!logs.length) { canvas.parentElement.innerHTML+='<p class="no-data">Žádná data</p>'; return; }
    const labels=logs.map(l=>new Date(parseInt(l.event_time)).toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}));
    const values=logs.map(l=>(parseInt(l.value)/10).toFixed(1));
    charts['pw_'+id]=new Chart(canvas.getContext('2d'),{
      type:'line', data:{labels,datasets:[{label:'Výkon (W)',data:values,borderColor:'#f7b731',backgroundColor:'rgba(247,183,49,0.07)',tension:0.4,fill:true,pointRadius:0,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(238,242,255,0.3)',maxTicksLimit:6,font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},y:{ticks:{color:'#f7b731',font:{size:10},callback:v=>v+'W'},grid:{color:'rgba(255,255,255,0.03)'}}}}
    });
  } catch(e) {}
}

// ====================================================
// SENSORS
// ====================================================
const sensorData = {};
async function renderSensors() {
  const grid=document.getElementById('sensors-grid'); if (!grid) return;
  grid.innerHTML='';
  Object.keys(charts).forEach(k=>{ if(!k.startsWith('pw_')){ try{charts[k].destroy()}catch(e){} delete charts[k]; } });
  const sensors=allDevices.filter(d=>deviceType(d)==='sensor');
  if (!sensors.length) { grid.innerHTML='<p style="color:var(--text2);padding:32px">Žádné senzory</p>'; return; }
  const now=Date.now(), from=sensorRange==='7d'?now-7*24*3600*1000:now-24*3600*1000;
  for (const device of sensors) {
    const st=device.status||[], temp=st.find(s=>s.code==='va_temperature'), hum=st.find(s=>s.code==='va_humidity'), bat=st.find(s=>s.code==='battery_percentage'), batSt=st.find(s=>s.code==='battery_state');
    let batHtml='';
    if (bat) { const p=bat.value,cls=p<20?'low':p<50?'mid':''; batHtml=`<div class="battery-row">🔋<div class="battery-bar"><div class="battery-fill ${cls}" style="width:${p}%"></div></div><span>${p}%</span></div>`; }
    else if (batSt) batHtml=`<div class="battery-row">${batSt.value==='low'?'🪫':'🔋'} Baterie: ${batSt.value}</div>`;
    const card=document.createElement('div'); card.className='sensor-card';
    card.innerHTML=`<div class="sensor-card-header"><div class="sensor-card-title"><span class="icon">🌡️</span><h3>${device.name}</h3></div><div class="card-status ${device.online?'online':'offline'}">${device.online?'Online':'Offline'}</div></div>
      <div class="sensor-current">${temp?`<div class="sensor-big"><div class="big-val">${(temp.value/10).toFixed(1)}°C</div><div class="big-lbl">Teplota</div></div>`:''} ${hum?`<div class="sensor-big"><div class="big-val">${parseHum(hum)}%</div><div class="big-lbl">Vlhkost</div></div>`:''}</div>
      ${batHtml}
      <div class="sensor-charts-split">
        <div class="sensor-chart-block"><div class="sensor-chart-label">🌡️ Teplota (°C)</div><div class="chart-wrap" id="chart-temp-wrap-${device.id}"><div class="chart-loading">Načítám...</div><canvas id="chart-temp-${device.id}" style="display:none"></canvas></div></div>
        <div class="sensor-chart-block"><div class="sensor-chart-label">💧 Vlhkost (%)</div><div class="chart-wrap" id="chart-hum-wrap-${device.id}"><div class="chart-loading">Načítám...</div><canvas id="chart-hum-${device.id}" style="display:none"></canvas></div></div>
      </div>`;
    grid.appendChild(card);
  }
  const summaryEl=document.createElement('div'); summaryEl.className='sensor-summary';
  summaryEl.innerHTML=`
    <div class="sensor-card sensor-card-full"><div class="sensor-card-header"><div class="sensor-card-title"><span class="icon">🌡️</span><h3>Porovnání teplot</h3></div><button class="avg-btn" id="avg-btn-temp" onclick="toggleAverage('temp')">∅ Průměr</button></div><div class="chart-wrap tall" id="chart-compare-temp"><div class="chart-loading">Načítám...</div><canvas id="canvas-compare-temp" style="display:none"></canvas></div><div class="compare-stats" id="compare-stats-temp"></div></div>
    <div class="sensor-card sensor-card-full"><div class="sensor-card-header"><div class="sensor-card-title"><span class="icon">💧</span><h3>Porovnání vlhkostí</h3></div><button class="avg-btn" id="avg-btn-hum" onclick="toggleAverage('hum')">∅ Průměr</button></div><div class="chart-wrap tall" id="chart-compare-hum"><div class="chart-loading">Načítám...</div><canvas id="canvas-compare-hum" style="display:none"></canvas></div><div class="compare-stats" id="compare-stats-hum"></div></div>`;
  grid.appendChild(summaryEl);
  await Promise.all(sensors.map(d=>loadSensorData(d.id,from,now)));
  drawComparisons(sensors); renderCompareStats(sensors);
}

async function fetchAllLogs(deviceId,codes,from,to,maxPages=5) {
  let allLogs=[],lastRowKey='';
  for(let page=0;page<maxPages;page++){
    const params=new URLSearchParams({codes,start_time:from,end_time:to,size:100});
    if(lastRowKey) params.set('last_row_key',lastRowKey);
    const res=await fetch(`/api/device/${deviceId}/history?${params}`).then(r=>r.json());
    const logs=res.result?.logs||[];
    if(!logs.length) break;
    allLogs=allLogs.concat(logs);
    if(!res.result?.has_more||!res.result?.last_row_key) break;
    if(res.result.last_row_key===lastRowKey) break;
    lastRowKey=res.result.last_row_key;
  }
  return allLogs.reverse();
}

async function loadSensorData(deviceId,from,to) {
  try {
    const [tempLogs,humLogs]=await Promise.all([fetchAllLogs(deviceId,'va_temperature',from,to),fetchAllLogs(deviceId,'va_humidity',from,to)]);
    const tempData=tempLogs.map(l=>parseInt(l.value)/10);
    const humData=humLogs.map(l=>{const v=parseInt(l.value);return v>100?v/10:v;});
    const fmt=ts=>{const d=new Date(parseInt(ts));return sensorRange==='7d'?d.toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):d.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'});};
    sensorData[deviceId]={tempLogs,humLogs,tempData,humData,tempLabels:tempLogs.map(l=>fmt(l.event_time)),humLabels:humLogs.map(l=>fmt(l.event_time))};
    drawSingleChart(`chart-temp-${deviceId}`,`chart-temp-wrap-${deviceId}`,sensorData[deviceId].tempLabels,tempData,'Teplota','#5b8fff','rgba(91,143,255,0.08)','°');
    drawSingleChart(`chart-hum-${deviceId}`,`chart-hum-wrap-${deviceId}`,sensorData[deviceId].humLabels,humData,'Vlhkost','#2dce89','rgba(45,206,137,0.07)','%');
  } catch(e){}
}

function drawSingleChart(cid,wid,labels,data,label,color,bg,unit) {
  const wrap=document.getElementById(wid),canvas=document.getElementById(cid); if(!canvas||!wrap) return;
  const loading=wrap.querySelector('.chart-loading'); if(loading) loading.style.display='none';
  if(!data.length){wrap.innerHTML='<p class="no-data">Žádná data</p>';return;}
  canvas.style.display='block'; if(charts[cid]){try{charts[cid].destroy()}catch(e){}}
  const minVal=Math.min(...data),maxVal=Math.max(...data),padding=(maxVal-minVal)*0.15||1;
  charts[cid]=new Chart(canvas.getContext('2d'),{type:'line',data:{labels,datasets:[{label,data,borderColor:color,backgroundColor:bg,tension:0.4,fill:true,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:false}},scales:{x:{ticks:{color:'rgba(238,242,255,0.3)',maxTicksLimit:6,font:{size:10}},grid:{color:'rgba(255,255,255,0.03)'}},y:{min:minVal-padding,max:maxVal+padding,ticks:{color,font:{size:10},callback:v=>v.toFixed(1)+unit},grid:{color:'rgba(255,255,255,0.03)'}}}}});
}

function toggleAverage(title) {
  const chart=charts['compare_'+title],btn=document.getElementById('avg-btn-'+title); if(!chart||!btn) return;
  const lastIdx=chart.data.datasets.length-1, meta=chart.getDatasetMeta(lastIdx);
  meta.hidden=!meta.hidden; btn.classList.toggle('active',!meta.hidden); chart.update();
}

function drawComparisons(sensors) {
  const COLORS=['#5b8fff','#f7b731','#2dce89','#fc5c65'];
  [{canvasId:'canvas-compare-temp',wrapId:'chart-compare-temp',key:'tempData',timeKey:'tempLogs',unit:'°',title:'temp',avgLabel:'Průměr'},
   {canvasId:'canvas-compare-hum', wrapId:'chart-compare-hum', key:'humData', timeKey:'humLogs', unit:'%',title:'hum', avgLabel:'Průměr'}].forEach(({canvasId,wrapId,key,timeKey,unit,title,avgLabel})=>{
    const wrap=document.getElementById(wrapId),canvas=document.getElementById(canvasId); if(!canvas||!wrap) return;
    const loading=wrap.querySelector('.chart-loading'); if(loading) loading.style.display='none';
    const longest=sensors.reduce((a,b)=>(sensorData[a.id]?.[timeKey]?.length||0)>=(sensorData[b.id]?.[timeKey]?.length||0)?a:b);
    const baseLogs=sensorData[longest.id]?.[timeKey]||[];
    const labels=baseLogs.map(l=>{const d=new Date(parseInt(l.event_time));return sensorRange==='7d'?d.toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):d.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'});});
    const maxLen=labels.length;
    const sensorDatasets=sensors.map((device,i)=>{const d=sensorData[device.id];if(!d||!d[key].length)return null;const src=d[key];return{label:device.name,data:Array.from({length:maxLen},(_,idx)=>src[Math.round((idx/(maxLen-1))*(src.length-1))]??null),borderColor:COLORS[i%COLORS.length],backgroundColor:'transparent',tension:0.4,fill:false,pointRadius:0,borderWidth:2};}).filter(Boolean);
    if(!sensorDatasets.length){wrap.innerHTML='<p class="no-data">Žádná data</p>';return;}
    const avgData=Array.from({length:maxLen},(_,i)=>{const v=sensorDatasets.map(ds=>ds.data[i]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;});
    const datasets=[...sensorDatasets,{label:avgLabel,data:avgData,borderColor:'rgba(255,255,255,0.5)',backgroundColor:'transparent',borderDash:[6,3],tension:0.4,fill:false,pointRadius:0,borderWidth:1.5}];
    canvas.style.display='block'; if(charts['compare_'+title]){try{charts['compare_'+title].destroy()}catch(e){}}
    const allVals=sensorDatasets.flatMap(ds=>ds.data).filter(v=>v!=null);
    const minVal=Math.min(...allVals),maxVal=Math.max(...allVals),padding=(maxVal-minVal)*0.15||1;
    charts['compare_'+title]=new Chart(canvas.getContext('2d'),{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{font:{size:11},padding:16,color:'rgba(238,242,255,0.6)'},onClick(e,item,legend){const ci=legend.chart,meta=ci.getDatasetMeta(item.datasetIndex);meta.hidden=!meta.hidden;if(item.datasetIndex===ci.data.datasets.length-1){const btn=document.getElementById('avg-btn-'+title);if(btn)btn.classList.toggle('active',!meta.hidden);}ci.update();}}},scales:{x:{ticks:{color:'rgba(238,242,255,0.3)',maxTicksLimit:8,font:{size:10},maxRotation:0},grid:{color:'rgba(255,255,255,0.03)'}},y:{min:minVal-padding,max:maxVal+padding,ticks:{color:'rgba(238,242,255,0.45)',font:{size:10},callback:v=>v.toFixed(1)+unit},grid:{color:'rgba(255,255,255,0.03)'}}}}});
    charts['compare_'+title].getDatasetMeta(charts['compare_'+title].data.datasets.length-1).hidden=true;
    charts['compare_'+title].update('none');
  });
}

function renderCompareStats(sensors) {
  const COLORS=['#5b8fff','#f7b731','#2dce89','#fc5c65'];
  [{statsId:'compare-stats-temp',key:'tempData',unit:'°C'},{statsId:'compare-stats-hum',key:'humData',unit:'%'}].forEach(({statsId,key,unit})=>{
    const el=document.getElementById(statsId); if(!el) return;
    el.innerHTML=sensors.map((device,i)=>{const d=sensorData[device.id];if(!d||!d[key].length)return'';const vals=d[key],color=COLORS[i%COLORS.length];return`<div class="compare-stat-row"><div class="compare-stat-name"><span class="compare-dot" style="background:${color}"></span>${device.name}</div><div class="compare-stat-vals"><div class="compare-stat-item"><span class="csi-label">Min</span><span class="csi-val" style="color:${color}">${Math.min(...vals).toFixed(1)}${unit}</span></div><div class="compare-stat-item"><span class="csi-label">Průměr</span><span class="csi-val">${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)}${unit}</span></div><div class="compare-stat-item"><span class="csi-label">Max</span><span class="csi-val" style="color:${color}">${Math.max(...vals).toFixed(1)}${unit}</span></div></div></div>`;}).join('');
  });
}

// INIT
loadDevices();
setInterval(loadDevices, 15000);

// ====================================================
// DRAG & DROP — iOS style
// Podržení karty → wiggle animace → přesunutí
// ====================================================
let _dnd = {
  active: false,
  dragging: null,
  placeholder: null,
  startX: 0, startY: 0,
  offX: 0, offY: 0,
  grid: null,
  order: {},     // gridId → [deviceId, ...]
  longPressTimer: null,
};

// Ulož pořadí do localStorage
function saveDndOrder(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const ids = [...grid.children]
    .filter(c => c.dataset.deviceId)
    .map(c => c.dataset.deviceId);
  try { localStorage.setItem('dnd-' + gridId, JSON.stringify(ids)); } catch(e) {}
}

// Načti uložené pořadí a přeuspořádej
function applyDndOrder(gridId) {
  try {
    const saved = JSON.parse(localStorage.getItem('dnd-' + gridId) || 'null');
    if (!saved || !saved.length) return;
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const cards = {};
    [...grid.children].forEach(c => { if (c.dataset.deviceId) cards[c.dataset.deviceId] = c; });
    saved.forEach(id => { if (cards[id]) grid.appendChild(cards[id]); });
  } catch(e) {}
}

function enterEditMode(grid) {
  if (_dnd.active) return;
  _dnd.active = true;
  _dnd.grid = grid;
  grid.classList.add('dnd-mode');
  // Wiggle na všechny karty
  [...grid.children].forEach(c => { if (c.classList.contains('device-card')) c.classList.add('wiggle'); });
  // Kliknutí mimo = ukončí edit mód
  setTimeout(() => document.addEventListener('click', exitEditModeOnOutside, { once: true, capture: true }), 100);
}

function exitEditMode() {
  if (!_dnd.active) return;
  _dnd.active = false;
  if (_dnd.grid) {
    _dnd.grid.classList.remove('dnd-mode');
    [..._dnd.grid.children].forEach(c => c.classList.remove('wiggle'));
    saveDndOrder(_dnd.grid.id);
  }
  _dnd.grid = null;
  document.removeEventListener('click', exitEditModeOnOutside, true);
}

function exitEditModeOnOutside(e) {
  // Kliknutí na kartu = přesunutí, ne ukončení
  if (e.target.closest('.device-card')) return;
  exitEditMode();
}

function startDrag(e, card) {
  if (!_dnd.active) return;
  e.preventDefault();

  const touch = e.touches ? e.touches[0] : e;
  const rect = card.getBoundingClientRect();
  _dnd.dragging = card;
  _dnd.offX = touch.clientX - rect.left;
  _dnd.offY = touch.clientY - rect.top;
  _dnd.startX = touch.clientX;
  _dnd.startY = touch.clientY;

  // Placeholder
  const ph = document.createElement('div');
  ph.className = 'dnd-placeholder';
  ph.style.width = rect.width + 'px';
  ph.style.height = rect.height + 'px';
  card.parentNode.insertBefore(ph, card);
  _dnd.placeholder = ph;

  // Dragging styl
  card.classList.add('dnd-dragging');
  card.classList.remove('wiggle');
  card.style.width  = rect.width  + 'px';
  card.style.height = rect.height + 'px';
  card.style.left   = rect.left   + 'px';
  card.style.top    = rect.top    + 'px';
  document.body.appendChild(card);

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('mouseup',   onDragEnd);
  document.addEventListener('touchend',  onDragEnd);
}

function onDragMove(e) {
  if (!_dnd.dragging) return;
  e.preventDefault();
  const touch = e.touches ? e.touches[0] : e;
  const x = touch.clientX - _dnd.offX;
  const y = touch.clientY - _dnd.offY;
  _dnd.dragging.style.left = x + 'px';
  _dnd.dragging.style.top  = y + 'px';

  // Najdi nejbližší kartu a přesuň placeholder
  const grid = _dnd.grid;
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.device-card:not(.dnd-dragging)')];
  let closest = null, closestDist = Infinity;
  const midX = touch.clientX, midY = touch.clientY;
  cards.forEach(c => {
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const dist = Math.sqrt((midX-cx)**2 + (midY-cy)**2);
    if (dist < closestDist) { closestDist = dist; closest = c; }
  });
  if (closest) {
    const r = closest.getBoundingClientRect();
    const before = touch.clientX < r.left + r.width/2;
    grid.insertBefore(_dnd.placeholder, before ? closest : closest.nextSibling);
  }
}

function onDragEnd() {
  if (!_dnd.dragging) return;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);
  document.removeEventListener('touchend',  onDragEnd);

  const card = _dnd.dragging;
  const ph   = _dnd.placeholder;

  // Vrať kartu na místo placeholder
  card.classList.remove('dnd-dragging');
  card.classList.add('wiggle');
  card.style.cssText = '';
  ph.parentNode.insertBefore(card, ph);
  ph.remove();

  _dnd.dragging = null;
  _dnd.placeholder = null;
  saveDndOrder(_dnd.grid?.id);
}

// Attach drag events na kartu
function attachDnd(card, gridId) {
  card.dataset.gridId = gridId;

  // Long press = vstup do edit módu
  card.addEventListener('touchstart', e => {
    _dnd.longPressTimer = setTimeout(() => {
      navigator.vibrate?.(30);
      const grid = document.getElementById(gridId);
      if (grid) { enterEditMode(grid); startDrag(e, card); }
    }, 500);
  }, { passive: true });

  card.addEventListener('touchend',  () => clearTimeout(_dnd.longPressTimer));
  card.addEventListener('touchmove', () => clearTimeout(_dnd.longPressTimer));

  // Na PC: long mousedown = edit mód
  card.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _dnd.longPressTimer = setTimeout(() => {
      const grid = document.getElementById(gridId);
      if (grid) { enterEditMode(grid); startDrag(e, card); }
    }, 500);
  });
  card.addEventListener('mouseup',   () => clearTimeout(_dnd.longPressTimer));
  card.addEventListener('mouseleave',() => clearTimeout(_dnd.longPressTimer));

  // Pokud už jsme v edit módu, mousedown/touchstart rovnou zahájí drag
  card.addEventListener('mousedown', e => { if (_dnd.active && _dnd.grid?.id === gridId) startDrag(e, card); });
  card.addEventListener('touchstart', e => { if (_dnd.active && _dnd.grid?.id === gridId) startDrag(e, card); }, { passive: false });
}

// Zavolej po vykreslení karet
function initDnd(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  applyDndOrder(gridId);
  grid.querySelectorAll('.device-card').forEach(c => attachDnd(c, gridId));
}
