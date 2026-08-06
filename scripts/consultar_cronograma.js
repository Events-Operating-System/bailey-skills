#!/usr/bin/env node
// consultar_cronograma.js — Bailey Capacidad 1: cronograma de eventos
// Uso: node consultar_cronograma.js --desde YYYY-MM-DD --hasta YYYY-MM-DD
//
// SEGURIDAD: credenciales y JWT nunca se imprimen ni loguean.
// Solo el resultado final (JSON) va a stdout.
// Errores van a stderr como JSON { "error": "..." } con exit code != 0.

'use strict';

const fs   = require('fs');
const https = require('https');

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadEnv(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    fatal(`No se pudo leer secrets: ${filePath}`);
  }
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

function fatal(msg) {
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}

function post(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url  = new URL(urlStr);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let desde, hasta;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--desde') desde = args[++i];
  else if (args[i] === '--hasta') hasta = args[++i];
}

if (!desde || !hasta)
  fatal('Uso: node consultar_cronograma.js --desde YYYY-MM-DD --hasta YYYY-MM-DD');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
if (!ISO.test(desde) || !ISO.test(hasta))
  fatal('Fechas deben tener formato YYYY-MM-DD');

if (desde > hasta)
  fatal('--desde no puede ser posterior a --hasta');

// ── Secrets (nunca se imprimen) ───────────────────────────────────────────────

loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env'); // EMAIL, PASSWORD
loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env');             // SUPABASE_URL, SUPABASE_ANON_KEY

const { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL, PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD)
  fatal('Variables de entorno incompletas — revisar archivos de secrets');

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {

  // 1. Login — token queda en memoria, nunca sale a stdout/stderr
  let authRes;
  try {
    authRes = await post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      { 'apikey': SUPABASE_ANON_KEY },
      { email: EMAIL, password: PASSWORD }
    );
  } catch (e) {
    fatal(`Error de red en login: ${e.message}`);
  }

  if (authRes.status !== 200 || !authRes.body?.access_token) {
    const reason = authRes.body?.error_description
      || authRes.body?.msg
      || `HTTP ${authRes.status}`;
    fatal(`Login fallido: ${reason}`);
  }

  const token = authRes.body.access_token; // ← nunca se imprime

  // 2. RPC consultar_cronograma
  let rpcRes;
  try {
    rpcRes = await post(
      `${SUPABASE_URL}/rest/v1/rpc/consultar_cronograma`,
      {
        'apikey':           SUPABASE_ANON_KEY,
        'Authorization':    `Bearer ${token}`,
        'Content-Profile':  'eventos',
        'Accept-Profile':   'eventos',
      },
      { fecha_desde: desde, fecha_hasta: hasta }
    );
  } catch (e) {
    fatal(`Error de red en RPC: ${e.message}`);
  }

  if (rpcRes.status !== 200) {
    const reason = rpcRes.body?.message
      || rpcRes.body?.hint
      || rpcRes.body?.details
      || `HTTP ${rpcRes.status}`;
    fatal(`RPC fallido: ${reason}`);
  }

  // 3. Resultado limpio a stdout
  process.stdout.write(JSON.stringify(rpcRes.body, null, 2) + '\n');

})();
