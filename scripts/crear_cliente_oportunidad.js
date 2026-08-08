#!/usr/bin/env node
// crear_cliente_oportunidad.js — Bailey Capacidad 3: crear cliente + oportunidad
//
// Uso:
//   node crear_cliente_oportunidad.js \
//     --nombre "Nombre del Cliente" \
//     [--telefono "+51999999999"] \
//     [--email "cliente@email.com"] \
//     [--tipo-evento "Matrimonio"] \
//     [--fecha-tentativa "2026-12-15"] \
//     [--origen "referido|instagram|web|otro"]
//
// Al menos uno de --telefono o --email es requerido junto con --nombre.
//
// SEGURIDAD: credenciales y JWT nunca se imprimen ni loguean.
// Solo el resultado final (JSON) va a stdout.
// Errores van a stderr como JSON { "error": "..." } con exit code != 0.

'use strict';

const fs    = require('fs');
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

function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr);
    const data = body instanceof Buffer ? body
               : body                  ? Buffer.from(JSON.stringify(body))
               : null;
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers:  data ? { ...headers, 'Content-Length': data.byteLength } : headers,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function post(urlStr, headers, body) {
  return request('POST', urlStr,
    { ...headers, 'Content-Type': 'application/json' }, body);
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let nombre, telefono, email, tipoEvento, fechaTentativa, origen;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--nombre':          nombre         = args[++i]; break;
    case '--telefono':        telefono       = args[++i]; break;
    case '--email':           email          = args[++i]; break;
    case '--tipo-evento':     tipoEvento     = args[++i]; break;
    case '--fecha-tentativa': fechaTentativa = args[++i]; break;
    case '--origen':          origen         = args[++i]; break;
  }
}

// Validaciones — solo bloquea en campos obligatorios
if (!nombre || nombre.trim().length === 0)
  fatal('--nombre es requerido');
if (!telefono && !email)
  fatal('Al menos uno de --telefono o --email es requerido');

// ── Secrets ───────────────────────────────────────────────────────────────────

loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env');
loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env');

const { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL: AUTH_EMAIL, PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !AUTH_EMAIL || !PASSWORD)
  fatal('Variables de entorno incompletas — revisar archivos de secrets');

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {

  // 1. Login
  let authRes;
  try {
    authRes = await post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      { apikey: SUPABASE_ANON_KEY },
      { email: AUTH_EMAIL, password: PASSWORD }
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

  const token = authRes.body.access_token; // nunca se imprime

  const rpcHeaders = {
    apikey:            SUPABASE_ANON_KEY,
    Authorization:     `Bearer ${token}`,
    'Content-Profile': 'ventas',
    'Accept-Profile':  'ventas',
  };

  // 2. RPC crear_cliente_y_oportunidad
  const rpcPayload = {
    p_cliente_nombre:   nombre.trim(),
    p_telefono:         telefono ? telefono.trim() : null,
    p_email:            email    ? email.trim()    : null,
    p_tipo_evento:      tipoEvento     || null,
    p_fecha_tentativa:  fechaTentativa || null,
    p_origen:           origen         || null,
  };

  let rpcRes;
  try {
    rpcRes = await post(
      `${SUPABASE_URL}/rest/v1/rpc/crear_cliente_y_oportunidad`,
      rpcHeaders,
      rpcPayload
    );
  } catch (e) {
    fatal(`Error de red en crear_cliente_y_oportunidad: ${e.message}`);
  }

  if (rpcRes.status !== 200) {
    const reason = rpcRes.body?.message || rpcRes.body?.hint
      || rpcRes.body?.details || `HTTP ${rpcRes.status}`;
    fatal(`crear_cliente_y_oportunidad falló: ${reason}`);
  }

  const result = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
  const { client_id, opportunity_id, client_was_created, campos_pendientes } = result;

  if (!client_id || !opportunity_id)
    fatal('RPC no devolvió client_id u opportunity_id — no se puede confirmar la creación');

  // 3. Resultado limpio a stdout
  process.stdout.write(JSON.stringify({
    client_id,
    opportunity_id,
    cliente_reutilizado: !client_was_created,
    campos_pendientes: campos_pendientes || [],
  }, null, 2) + '\n');

})().catch((e) => {
  fatal(`Error inesperado: ${e.message}`);
});
