#!/usr/bin/env node
// registrar_reunion.js — Bailey: registrar una reunión en el formato único de EventOS (eventos.meetings).
// Reemplaza a registrar_seguimiento.js (que sigue funcionando: escribe en el formato viejo y se copia al nuevo).
//
// Uso:
//   node registrar_reunion.js \
//     [--evento <uuid> | --oportunidad <uuid>]          # sin ninguno → bandeja "Sin evento"
//     --fecha "2026-11-05T18:00:00-05:00" \
//     --titulo "Visita al local — Matri Vane & Sandro" \
//     [--notas "texto; líneas que empiezan con '- ' quedan como lista"] \
//     [--acuerdos '[{"text":"...","owner":"Ana","owner_role":"cliente","due_date":"2026-11-10","status":"pendiente"}]'] \
//     [--participantes '[{"name":"Vane","kind":"cliente"},{"name":"Edward","email":"..."}]'] \
//     [--modalidad presencial|virtual|telefono] [--lugar "..."] \
//     [--archivo audio:/ruta/local/nota.m4a:nota.m4a]     # se puede repetir
//
// Reglas (las valida la base, eventos.registrar_reunion): la org sale del evento u oportunidad; sin ninguno, de la
// única membresía activa de Bailey. La reunión queda SIEMPRE interna (Bailey nunca comparte con el cliente).
// Acuerdos: owner es el nombre de la persona; owner_role ("cliente" | "productora" | null) indica de qué lado está.
// La base decide cliente / miembro / productora, descarta repetidos y corrige fechas pendientes anteriores a la reunión.
//
// SEGURIDAD: credenciales y JWT nunca se imprimen ni loguean. Solo el resultado final (JSON) va a stdout.
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
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function post(urlStr, headers, body) {
  return request('POST', urlStr, { ...headers, 'Content-Type': 'application/json' }, body);
}

function sanitizeFileName(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function guessTipoFromExt(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'foto';
  return 'archivo';
}

function errorReason(res) {
  return res.body?.message || res.body?.hint || res.body?.details || `HTTP ${res.status}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let evento = null, oportunidad = null, fecha, titulo, notas = null, acuerdos, participantes, modalidad = null, lugar = null;
const archivos = []; // [{ tipo, localPath, nombre }]

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--evento':        evento        = args[++i]; break;
    case '--oportunidad':   oportunidad   = args[++i]; break;
    case '--fecha':         fecha         = args[++i]; break;
    case '--titulo':        titulo        = args[++i]; break;
    case '--notas':         notas         = args[++i]; break;
    case '--acuerdos':      acuerdos      = args[++i]; break;
    case '--participantes': participantes = args[++i]; break;
    case '--modalidad':     modalidad     = args[++i]; break;
    case '--lugar':         lugar         = args[++i]; break;
    case '--archivo': {
      const [tipoRaw, localPath, nombreRaw] = (args[++i] || '').split(':');
      if (!localPath) fatal('--archivo debe ser tipo:ruta_local:nombre (nombre opcional)');
      archivos.push({
        tipo:      ['audio', 'foto', 'archivo'].includes(tipoRaw) ? tipoRaw : guessTipoFromExt(localPath),
        localPath,
        nombre:    nombreRaw || localPath.split('/').pop(),
      });
      break;
    }
    default: fatal(`Argumento desconocido: ${args[i]}`);
  }
}

// Validaciones
if (evento && oportunidad) fatal('Indicar --evento o --oportunidad, no ambos');
if (evento && !UUID.test(evento)) fatal('--evento debe ser un UUID válido');
if (oportunidad && !UUID.test(oportunidad)) fatal('--oportunidad debe ser un UUID válido');
if (!fecha || Number.isNaN(Date.parse(fecha))) fatal('--fecha es requerida (ISO 8601, ej. "2026-11-05T18:00:00-05:00")');
if (!titulo || !titulo.trim()) fatal('--titulo es requerido (3-8 palabras que resuman la reunión)');
if (modalidad && !['presencial', 'virtual', 'telefono'].includes(modalidad)) fatal('--modalidad: presencial|virtual|telefono');

let acuerdosJson, participantesJson;
try { acuerdosJson = acuerdos ? JSON.parse(acuerdos) : []; } catch { fatal('--acuerdos no es JSON válido'); }
try { participantesJson = participantes ? JSON.parse(participantes) : []; } catch { fatal('--participantes no es JSON válido'); }
if (!Array.isArray(acuerdosJson)) fatal('--acuerdos debe ser una lista JSON');
if (!Array.isArray(participantesJson)) fatal('--participantes debe ser una lista JSON');

for (const a of archivos) {
  if (!fs.existsSync(a.localPath)) fatal(`Archivo no encontrado: ${a.localPath}`);
}

// ── Secrets ───────────────────────────────────────────────────────────────────

loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env');
loadEnv('/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env');

const { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL, PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD)
  fatal('Variables de entorno incompletas — revisar archivos de secrets');

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {

  // 1. Login (password grant)
  let authRes;
  try {
    authRes = await post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { apikey: SUPABASE_ANON_KEY }, { email: EMAIL, password: PASSWORD });
  } catch (e) {
    fatal(`Error de red en login: ${e.message}`);
  }
  if (authRes.status !== 200 || !authRes.body?.access_token) {
    fatal(`Login fallido: ${authRes.body?.error_description || authRes.body?.msg || `HTTP ${authRes.status}`}`);
  }
  const token  = authRes.body.access_token; // nunca se imprime
  const userId = authRes.body.user?.id;

  const auth = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const eventosRpc = { ...auth, 'Content-Profile': 'eventos', 'Accept-Profile': 'eventos' };

  // 2. Sin evento ni oportunidad: la org es la única membresía activa de Bailey (nunca un valor fijo).
  let orgId = null;
  if (!evento && !oportunidad) {
    const memRes = await request('GET',
      `${SUPABASE_URL}/rest/v1/organization_members?select=org_id&user_id=eq.${userId}&is_active=eq.true`, auth);
    if (memRes.status !== 200 || !Array.isArray(memRes.body)) fatal(`No se pudo leer la membresía: ${errorReason(memRes)}`);
    const orgs = [...new Set(memRes.body.map((r) => r.org_id))];
    if (orgs.length !== 1) fatal(`Sin evento ni oportunidad hace falta una sola organización activa (hay ${orgs.length}). Indicar --evento u --oportunidad.`);
    orgId = orgs[0];
  }

  // 3. RPC registrar_reunion
  let rpcRes;
  try {
    rpcRes = await post(`${SUPABASE_URL}/rest/v1/rpc/registrar_reunion`, eventosRpc, {
      p_title:          titulo.trim(),
      p_starts_at:      fecha,
      p_notes:          notas,
      p_event_id:       evento,
      p_opportunity_id: oportunidad,
      p_org_id:         orgId,
      p_participants:   participantesJson,
      p_agreements:     acuerdosJson,
      p_modality:       modalidad,
      p_location:       lugar,
    });
  } catch (e) {
    fatal(`Error de red en registrar_reunion: ${e.message}`);
  }
  if (rpcRes.status !== 200) fatal(`registrar_reunion falló: ${errorReason(rpcRes)}`);

  const meeting = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
  const { id: meetingId, org_id: meetingOrg, event_id: eventId, opportunity_id: opportunityId } = meeting;

  // 4. Archivos: subir a {org}/{reunión}/... del bucket "meetings" + adjuntar_a_reunion
  const archivosSubidos = [];
  for (const a of archivos) {
    let bytes;
    try { bytes = fs.readFileSync(a.localPath); }
    catch { fatal(`No se pudo leer el archivo local: ${a.localPath}`); }

    const storagePath = `${meetingOrg}/${meetingId}/${Date.now()}-${sanitizeFileName(a.nombre)}`;
    const uploadRes = await request('POST', `${SUPABASE_URL}/storage/v1/object/meetings/${storagePath}`,
      { ...auth, 'Content-Type': 'application/octet-stream' }, bytes);
    if (uploadRes.status !== 200 && uploadRes.status !== 201) {
      fatal(`No se pudo subir ${a.nombre}: ${errorReason(uploadRes)} (la reunión ${meetingId} ya quedó creada)`);
    }

    const adjRes = await post(`${SUPABASE_URL}/rest/v1/rpc/adjuntar_a_reunion`, eventosRpc, {
      p_meeting_id: meetingId, p_kind: a.tipo, p_storage_path: storagePath, p_filename: a.nombre, p_size_bytes: bytes.byteLength,
    });
    if (adjRes.status !== 200) fatal(`adjuntar_a_reunion falló para ${a.nombre}: ${errorReason(adjRes)} (la reunión ${meetingId} ya quedó creada)`);
    archivosSubidos.push({ tipo: a.tipo, nombre: a.nombre });
  }

  // 5. Resultado limpio a stdout
  process.stdout.write(JSON.stringify({
    meeting_id:     meetingId,
    org_id:         meetingOrg,
    event_id:       eventId,
    opportunity_id: opportunityId,
    sin_evento:     !eventId && !opportunityId,
    acuerdos:       acuerdosJson.length,
    archivos:       archivosSubidos,
  }, null, 2) + '\n');

})().catch((e) => {
  fatal(`Error inesperado: ${e.message}`);
});
