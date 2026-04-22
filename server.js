const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const LOGIN_USER = process.env.LOGIN_USER || 'admin';
const LOGIN_PASS = process.env.LOGIN_PASS || 'admin';
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'homeos-jwt-secret-2024-xyz-fallback';
const JWT_COOKIE = 'homeos_auth';

// ---- AUTH HELPERS ----
function signToken(username, rememberMe) {
    const expiresIn = rememberMe ? '30d' : '8h';
    return jwt.sign({ username, loggedIn: true }, JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); } catch(e) { return null; }
}

function setCookie(res, token, rememberMe) {
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined;
    res.cookie(JWT_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        ...(maxAge ? { maxAge } : {}), // bez maxAge = session cookie
    });
}

// ---- PUBLIC ROUTES ----
app.get('/login', (req, res) => {
    const token = req.cookies?.[JWT_COOKIE];
    if (token && verifyToken(token)) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password, remember } = req.body;
    if (username === LOGIN_USER && password === LOGIN_PASS) {
        const token = signToken(username, !!remember);
        setCookie(res, token, !!remember);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Špatné přihlašovací údaje' });
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie(JWT_COOKIE);
    res.json({ success: true });
});

// ---- AUTH MIDDLEWARE ----
function requireAuth(req, res, next) {
    const token = req.cookies?.[JWT_COOKIE];
    const payload = verifyToken(token);
    if (payload?.loggedIn) {
        req.user = payload;
        // Auto-refresh: pokud token vyprší za méně než 7 dní, prodlož ho
        const remaining = (payload.exp * 1000) - Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (remaining < sevenDays) {
            const isLong = (payload.exp - payload.iat) > 24 * 3600; // byl to 30d token?
            const newToken = signToken(payload.username, isLong);
            setCookie(res, newToken, isLong);
        }
        return next();
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Nepřihlášen', redirect: '/login' });
    }
    res.redirect('/login');
}

app.get('/api/auth/check', (req, res) => {
    const token = req.cookies?.[JWT_COOKIE];
    const payload = verifyToken(token);
    res.json({ loggedIn: !!(payload?.loggedIn), username: payload?.username || '' });
});

// ---- CHRÁNĚNÉ STATIC + API ----
app.use(requireAuth, express.static(path.join(__dirname, 'public')));
app.use('/api', requireAuth);

// ================================================================
// TUYA
// ================================================================
const { TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_BASE_URL } = process.env;

function vygenerujSign(method, fullPath, body = '', accessToken = '') {
    const t = Date.now().toString();
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    let pathForSign = fullPath;
    if (fullPath.includes('?')) {
        const [basePath, qs] = fullPath.split('?');
        const sortedQs = qs.split('&').sort().join('&');
        pathForSign = basePath + '?' + sortedQs;
    }
    const stringToSign = [method, contentHash, '', pathForSign].join('\n');
    const signStr = TUYA_CLIENT_ID + accessToken + t + stringToSign;
    const sign = crypto.createHmac('sha256', TUYA_CLIENT_SECRET).update(signStr).digest('hex').toUpperCase();
    return { sign, t };
}

async function getToken() {
    const path = '/v1.0/token?grant_type=1';
    const { sign, t } = vygenerujSign('GET', path);
    const res = await axios({
        method: 'GET',
        url: `${TUYA_BASE_URL}${path}`,
        headers: { 'client_id': TUYA_CLIENT_ID, 'sign': sign, 'sign_method': 'HMAC-SHA256', 't': t, 'Content-Type': 'application/json' }
    });
    if (!res.data.success) throw new Error(res.data.msg);
    return res.data.result.access_token;
}

async function tuyaGet(urlPath, queryString = '') {
    const token = await getToken();
    const fullPath = queryString ? `${urlPath}?${queryString}` : urlPath;
    const { sign, t } = vygenerujSign('GET', fullPath, '', token);
    const res = await axios.get(`${TUYA_BASE_URL}${fullPath}`, {
        headers: { 'client_id': TUYA_CLIENT_ID, 'sign': sign, 'sign_method': 'HMAC-SHA256', 't': t, 'access_token': token, 'Content-Type': 'application/json' }
    });
    return res.data;
}

app.get('/api/devices', async (req, res) => {
    try {
        const data = await tuyaGet('/v1.0/iot-01/associated-users/devices');
        res.json(data);
    } catch (err) {
        console.error('[devices]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/device/:id/control', async (req, res) => {
    try {
        const token = await getToken();
        const deviceId = req.params.id;
        const path = `/v1.0/iot-03/devices/${deviceId}/commands`;
        const body = JSON.stringify(req.body);
        const { sign, t } = vygenerujSign('POST', path, body, token);
        const response = await axios.post(`${TUYA_BASE_URL}${path}`, req.body, {
            headers: { 'client_id': TUYA_CLIENT_ID, 'sign': sign, 'sign_method': 'HMAC-SHA256', 't': t, 'access_token': token, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[control]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/device/:id/history', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { codes, start_time, end_time, size = 100, last_row_key = '' } = req.query;
        const now = Date.now();
        const from = start_time || (now - 24 * 60 * 60 * 1000);
        const to = end_time || now;
        let query;
        if (last_row_key) {
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

app.get('/api/device/:id/power-history', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const { start_time, end_time, size = 100 } = req.query;
        const now = Date.now();
        const from = start_time || (now - 24 * 60 * 60 * 1000);
        const to = end_time || now;
        const query = `codes=cur_power&end_time=${to}&size=${size}&start_time=${from}`;
        const data = await tuyaGet(`/v2.0/cloud/thing/${deviceId}/report-logs`, query);
        res.json(data);
    } catch (err) {
        console.error('[power-history]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ================================================================
// GOVEE
// ================================================================
const GOVEE_API_KEY = process.env.GOVEE_API_KEY;
const GOVEE_OPENAPI = 'https://openapi.api.govee.com/router/api/v1';

app.get('/api/govee/devices', async (req, res) => {
    try {
        const response = await axios.get(`${GOVEE_OPENAPI}/user/devices`, {
            headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[govee devices]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/govee/device/state', async (req, res) => {
    try {
        const { device, model } = req.query;
        const response = await axios.post(`${GOVEE_OPENAPI}/device/state`, {
            requestId: 'homeos-' + Date.now(),
            payload: { sku: model, device }
        }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } });
        res.json(response.data);
    } catch (err) {
        console.error('[govee state]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/govee/device/control', async (req, res) => {
    try {
        const { device, model, cmd } = req.body;
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
        }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } });
        res.json(response.data);
    } catch (err) {
        console.error('[govee control]', err.response?.data || err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => {
    console.log('Server běží na http://localhost:3000');
});
