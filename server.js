const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- SESSION ----
app.use(session({
    secret: process.env.SESSION_SECRET || 'homeos-secret-2024-xyz',
    resave: false,
    saveUninitialized: false,
    rolling: true, // obnoví maxAge při každém requestu
    cookie: { httpOnly: true, sameSite: 'lax' }
}));

const LOGIN_USER = process.env.LOGIN_USER || 'admin';
const LOGIN_PASS = process.env.LOGIN_PASS || 'admin';

// ---- PUBLIC routes (bez auth) ----
app.get('/login', (req, res) => {
    if (req.session?.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password, remember } = req.body;
    if (username === LOGIN_USER && password === LOGIN_PASS) {
        req.session.loggedIn = true;
        req.session.username = username;
        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 dní
        } else {
            req.session.cookie.expires = false; // session cookie
        }
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Špatné přihlašovací údaje' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// ---- AUTH MIDDLEWARE ----
function requireAuth(req, res, next) {
    if (req.session?.loggedIn) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Nepřihlášen', redirect: '/login' });
    }
    res.redirect('/login');
}

app.get('/api/auth/check', (req, res) => {
    res.json({ loggedIn: !!req.session?.loggedIn, username: req.session?.username || '' });
});

// ---- CHRÁNĚNÉ statické soubory ----
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ---- CHRÁNĚNÉ API ----
app.use('/api', requireAuth);

const { TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_BASE_URL } = process.env;

// ---- PODPIS ----
function vygenerujSign(method, fullPath, body = '', accessToken = '') {
    const t = Date.now().toString();
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');

    // Seřaď query parametry abecedně (nutné pro v2.0)
    let pathForSign = fullPath;
    if (fullPath.includes('?')) {
        const [basePath, qs] = fullPath.split('?');
        const sortedQs = qs.split('&').sort().join('&');
        pathForSign = basePath + '?' + sortedQs;
    }

    const stringToSign = [method, contentHash, '', pathForSign].join('\n');
    const signStr = TUYA_CLIENT_ID + accessToken + t + stringToSign;
    const sign = crypto
        .createHmac('sha256', TUYA_CLIENT_SECRET)
        .update(signStr)
        .digest('hex')
        .toUpperCase();
    return { sign, t };
}

// ---- TOKEN ----
async function getToken() {
    const path = '/v1.0/token?grant_type=1';
    const { sign, t } = vygenerujSign('GET', path);
    const res = await axios({
        method: 'GET',
        url: `${TUYA_BASE_URL}${path}`,
        headers: {
            'client_id': TUYA_CLIENT_ID,
            'sign': sign,
            'sign_method': 'HMAC-SHA256',
            't': t,
            'Content-Type': 'application/json'
        }
    });
    if (!res.data.success) throw new Error(res.data.msg);
    return res.data.result.access_token;
}

// ---- HELPER GET ----
async function tuyaGet(urlPath, queryString = '') {
    const token = await getToken();
    const fullPath = queryString ? `${urlPath}?${queryString}` : urlPath;
    const { sign, t } = vygenerujSign('GET', fullPath, '', token);
    const res = await axios.get(`${TUYA_BASE_URL}${fullPath}`, {
        headers: {
            'client_id': TUYA_CLIENT_ID,
            'sign': sign,
            'sign_method': 'HMAC-SHA256',
            't': t,
            'access_token': token,
            'Content-Type': 'application/json'
        }
    });
    return res.data;
}

// ---- ZAŘÍZENÍ ----
app.get('/api/devices', async (req, res) => {
    try {
        const data = await tuyaGet('/v1.0/iot-01/associated-users/devices');
        res.json(data);
    } catch (err) {
        console.error('[devices]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- OVLÁDÁNÍ ----
app.post('/api/device/:id/control', async (req, res) => {
    try {
        const token = await getToken();
        const deviceId = req.params.id;
        const path = `/v1.0/iot-03/devices/${deviceId}/commands`;
        const body = JSON.stringify(req.body);
        const { sign, t } = vygenerujSign('POST', path, body, token);
        const response = await axios.post(`${TUYA_BASE_URL}${path}`, req.body, {
            headers: {
                'client_id': TUYA_CLIENT_ID,
                'sign': sign,
                'sign_method': 'HMAC-SHA256',
                't': t,
                'access_token': token,
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[control]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- HISTORIE SENZORU ----
app.get('/api/device/:id/history', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { codes, start_time, end_time, size = 100, last_row_key = '' } = req.query;
        const now = Date.now();
        const from = start_time || (now - 24 * 60 * 60 * 1000);
        const to = end_time || now;

        // Parametry seřazené abecedně — last_row_key se přidá jen když není prázdný
        let query;
        if (last_row_key) {
            // codes, end_time, last_row_key, size, start_time — abecedně
            query = `codes=${codes}&end_time=${to}&last_row_key=${encodeURIComponent(last_row_key)}&size=${size}&start_time=${from}`;
        } else {
            query = `codes=${codes}&end_time=${to}&size=${size}&start_time=${from}`;
        }

        const data = await tuyaGet(`/v2.0/cloud/thing/${deviceId}/report-logs`, query);
        res.json(data);
    } catch (err) {
        console.error('[history]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- HISTORIE SPOTŘEBY ----
app.get('/api/device/:id/power-history', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { start_time, end_time, size = 100 } = req.query;
        const now = Date.now();
        const from = start_time || (now - 24 * 60 * 60 * 1000);
        const to = end_time || now;

        // Parametry seřazené abecedně: codes, end_time, size, start_time
        const query = `codes=cur_power&end_time=${to}&size=${size}&start_time=${from}`;
        console.log(`[power-history] /v2.0/cloud/thing/${deviceId}/report-logs?${query}`);
        const data = await tuyaGet(`/v2.0/cloud/thing/${deviceId}/report-logs`, query);
        console.log(`[power-history] response:`, JSON.stringify(data).slice(0, 300));
        res.json(data);
    } catch (err) {
        console.error('[power-history]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log('Server běží na http://localhost:3000');
});

// ================================================================
// GOVEE API (OpenAPI v2)
// ================================================================
const GOVEE_API_KEY = process.env.GOVEE_API_KEY;
const GOVEE_OPENAPI = 'https://openapi.api.govee.com/router/api/v1';

// ---- GOVEE: seznam zařízení (OpenAPI v2) ----
app.get('/api/govee/devices', async (req, res) => {
    try {
        const response = await axios.get(`${GOVEE_OPENAPI}/user/devices`, {
            headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' }
        });
        console.log('[govee devices v2]', JSON.stringify(response.data).slice(0, 400));
        res.json(response.data);
    } catch (err) {
        console.error('[govee devices v2]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- GOVEE: stav zařízení (OpenAPI v2) ----
app.get('/api/govee/device/state', async (req, res) => {
    try {
        const { device, model } = req.query;
        const response = await axios.post(`${GOVEE_OPENAPI}/device/state`, {
            requestId: 'homeos-' + Date.now(),
            payload: { sku: model, device }
        }, {
            headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[govee state v2]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- GOVEE: ovládání (OpenAPI v2) ----
app.post('/api/govee/device/control', async (req, res) => {
    try {
        const { device, model, cmd } = req.body;

        // Převod starého formátu cmd na v2 capabilities
        let capability = {};
        if (cmd.name === 'turn') {
            capability = { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: cmd.value === 'on' ? 1 : 0 };
        } else if (cmd.name === 'brightness') {
            capability = { type: 'devices.capabilities.range', instance: 'brightness', value: cmd.value };
        } else if (cmd.name === 'color') {
            const { r, g, b } = cmd.value;
            capability = { type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: (r << 16) | (g << 8) | b };
        } else if (cmd.name === 'colorTem') {
            capability = { type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', value: cmd.value };
        }

        const response = await axios.post(`${GOVEE_OPENAPI}/device/control`, {
            requestId: 'homeos-' + Date.now(),
            payload: { sku: model, device, capability }
        }, {
            headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' }
        });
        console.log('[govee control v2]', JSON.stringify(response.data));
        res.json(response.data);
    } catch (err) {
        console.error('[govee control v2]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});
