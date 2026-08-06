#!/usr/bin/env node
// registrar_seguimiento.js — Bailey Capacidad 2: seguimiento post-reunión
//
// Uso:
//   node registrar_seguimiento.js \
//     --tipo evento|oportunidad --entidad-id <uuid> \
//     --fecha "2026-08-05T18:00:00-05:00" \
//     --resumen "texto del resumen" \
//     --pendientes '[{"task":"...","owner":"...","due_date":"2026-08-10","status":"pendiente"}]' \
//     --acuerdos '[{"text":"...","owner":"...","status":"pendiente"}]' \
//     [--archivo audio:/ruta/local/nota.m4a:nota.m4a] \
//     [--archivo foto:/ruta/local/foto.jpg:foto.jpg] \
//     [--titulo "..."] [--meeting-type client]
//
// SEGURIDAD: credenciales y JWT nunca se imprimen ni loguean.
// Solo el resultado final (JSON) va a stdout.
// Errores van a stderr como JSON { "error": "..." } con exit code != 0.

'use strict';

const fs   = require('fs');
const https = require('https');
const path  = require('path');

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

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function guessTipoFromExt(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (['m4a', 'mp3', 'wav', 'ogg', 'opus'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'foto';
  return 'archivo';
}

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let tipo, entidadId, fecha, resumen, pendientes, acuerdos, titulo;
let meetingType = 'client';
const archivos = []; // [{ tipo, localPath, nombre }]

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--tipo':         tipo       = args[++i]; break;
    case '--entidad-id':  entidadId  = args[++i]; break;
    case '--fecha':        fecha      = args[++i]; break;
    case '--resumen':      resumen    = args[++i]; break;
    case '--pendientes':   pendientes = args[++i]; break;
    case '--acuerdos':     acuerdos   = args[++i]; break;
    case '--titulo':       titulo     = args[++i]; break;
    case '--meeting-type': meetingType = args[++i]; break;
    case '--archivo': {
      const [tipoRaw, localPath, nombreRaw] = args[++i].split(':');
      if (!localPath) fatal('--archivo debe ser tipo:ruta_local:nombre (nombre opcional)');
      archivos.push({
        tipo:      ['audio', 'foto', 'archivo'].includes(tipoRaw) ? tipoRaw : guessTipoFromExt(localPath),
        localPath,
        nombre:    nombreRaw || localPath.split('/').pop(),
      });
      break;
    }
  }
}

// Validaciones
if (!tipo || !['evento', 'oportunidad'].includes(tipo))
  fatal('--tipo es requerido: evento|oportunidad');
if (!entidadId || !/^[0-9a-f-]{36}$/.test(entidadId))
  fatal('--entidad-id es requerido y debe ser un UUID válido');
if (!fecha) fatal('--fecha es requerida (ISO 8601, ej. "2026-08-05T18:00:00-05:00")');
if (!resumen || resumen.trim().length === 0) fatal('--resumen es requerido y no puede estar vacío');

let pendientesJson, acuerdosJson;
try { pendientesJson = pendientes ? JSON.parse(pendientes) : []; }
catch { fatal('--pendientes no es JSON válido'); }
try { acuerdosJson = acuerdos ? JSON.parse(acuerdos) : []; }
catch { fatal('--acuerdos no es JSON válido'); }

// Verificar archivos locales antes de hacer cualquier request
for (const a of archivos) {
  if (!fs.existsSync(a.localPath))
    fatal(`Archivo no encontrado: ${a.localPath}`);
}

// ── Secrets ───────────────────────────────────────────────────────────────────

loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env');
loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env');

const { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL, PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD)
  fatal('Variables de entorno incompletas — revisar archivos de secrets');

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {

  // 1. Login
  let authRes;
  try {
    authRes = await post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      { apikey: SUPABASE_ANON_KEY },
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

  const token = authRes.body.access_token; // nunca se imprime

  const rpcHeaders = {
    apikey:           SUPABASE_ANON_KEY,
    Authorization:    `Bearer ${token}`,
    'Content-Profile': 'agentes',
    'Accept-Profile':  'agentes',
  };

  // 2. RPC registrar_seguimiento (sin archivos — aún no tenemos meeting_id)
  const rpcPayload = {
    p_fecha_reunion:    fecha,
    p_resumen:          resumen,
    p_pendientes:       pendientesJson,
    p_acuerdos:         acuerdosJson,
    p_archivos:         [],
    p_meeting_type:     meetingType,
  };

  rpcPayload.p_event_id       = tipo === 'evento'      ? entidadId : null;
  rpcPayload.p_opportunity_id = tipo === 'oportunidad' ? entidadId : null;
  if (titulo) rpcPayload.p_title = titulo;

  let rpcRes;
  try {
    rpcRes = await post(
      `${SUPABASE_URL}/rest/v1/rpc/registrar_seguimiento`,
      rpcHeaders,
      rpcPayload
    );
  } catch (e) {
    fatal(`Error de red en registrar_seguimiento: ${e.message}`);
  }

  if (rpcRes.status !== 200) {
    const reason = rpcRes.body?.message || rpcRes.body?.hint
      || rpcRes.body?.details || `HTTP ${rpcRes.status}`;
    fatal(`registrar_seguimiento falló: ${reason}`);
  }

  const meeting = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
  const { id: meetingId, org_id: orgId } = meeting;

  // 3. Subir cada archivo a Storage + adjuntar_archivo
  const archivosSubidos = [];
  for (const a of archivos) {
    let bytes;
    try { bytes = fs.readFileSync(a.localPath); }
    catch { fatal(`No se pudo leer el archivo local: ${a.localPath}`); }

    const storagePath = `${orgId}/${meetingId}/${Date.now()}-${sanitizeFileName(a.nombre)}`;

    const uploadRes = await request(
      'POST',
      `${SUPABASE_URL}/storage/v1/object/agentes-attachments/${storagePath}`,
      { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      bytes
    );
    if (uploadRes.status !== 200 && uploadRes.status !== 201) {
      fatal(`No se pudo subir ${a.localPath}: HTTP ${uploadRes.status}`);
    }

    const adjuntarRes = await post(
      `${SUPABASE_URL}/rest/v1/rpc/adjuntar_archivo`,
      rpcHeaders,
      { p_meeting_id: meetingId, p_tipo: a.tipo, p_storage_path: storagePath, p_nombre: a.nombre }
    );
    if (adjuntarRes.status !== 200 && adjuntarRes.status !== 201) {
      fatal(`adjuntar_archivo falló para ${a.nombre}: HTTP ${adjuntarRes.status}`);
    }
    archivosSubidos.push({ tipo: a.tipo, storage_path: storagePath, nombre: a.nombre });
  }

  // 4. Resultado limpio a stdout
  process.stdout.write(JSON.stringify({ meeting_id: meetingId, org_id: orgId, archivos: archivosSubidos }, null, 2) + '\n');

})().catch((e) => {
  fatal(`Error inesperado: ${e.message}`);
});
