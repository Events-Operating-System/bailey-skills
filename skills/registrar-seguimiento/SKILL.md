---
name: "registrar-seguimiento"
description: "Registrar un seguimiento post-reunión en EventOS (resumen, pendientes, acuerdos, adjuntos opcionales)."
metadata:
  openclaw:
    emoji: "📝"
---

# registrar-seguimiento

Registra una reunión/seguimiento en `agentes.meetings` autenticado como `baileyai@realitynear.org`.
Soporta adjuntar archivos (audio, foto, archivo) al seguimiento.

## Setup (una vez)

Mismos secrets que `cronograma-eventos`:

- `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` — `EMAIL` + `PASSWORD`
- `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` — `SUPABASE_URL` + `SUPABASE_ANON_KEY`

## Comandos

```bash
# Seguimiento básico sobre un evento
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_seguimiento.js \
  --tipo evento \
  --entidad-id <uuid-del-evento> \
  --fecha "2026-08-05T18:00:00-05:00" \
  --resumen "Reunión con cliente para confirmar detalles de producción." \
  --pendientes '[{"task":"Enviar propuesta iluminación","owner":"Javier","due_date":"2026-08-10","status":"pendiente"}]' \
  --acuerdos '[{"text":"Cliente aprueba plano propuesto","owner":"Javier","status":"pendiente"}]'

# Con título y tipo de reunión
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_seguimiento.js \
  --tipo evento \
  --entidad-id <uuid> \
  --fecha "2026-08-05T18:00:00-05:00" \
  --resumen "Coordinación de logística." \
  --titulo "Reunión coordinación Lanzamiento Galaxus" \
  --meeting-type client \
  --pendientes '[]' --acuerdos '[]'

# Seguimiento sobre una oportunidad (ventas)
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_seguimiento.js \
  --tipo oportunidad \
  --entidad-id <uuid-de-la-oportunidad> \
  --fecha "2026-08-05T10:00:00-05:00" \
  --resumen "Primera llamada con prospecto." \
  --pendientes '[]' --acuerdos '[]'

# Con adjuntos (audio + foto)
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_seguimiento.js \
  --tipo evento \
  --entidad-id <uuid> \
  --fecha "2026-08-05T18:00:00-05:00" \
  --resumen "Resumen de la visita." \
  --pendientes '[]' --acuerdos '[]' \
  --archivo audio:/tmp/nota.m4a:nota.m4a \
  --archivo foto:/tmp/espacio.jpg:espacio.jpg
```

## Flujo interno (dos llamadas RPC)

1. `registrar_seguimiento(...)` sin archivos → devuelve fila completa con `id` y `org_id`
2. Por cada `--archivo`: PUT a Storage en `{org_id}/{meeting_id}/{timestamp}-{nombre}` (bucket `agentes-attachments`)
3. `adjuntar_archivo(meeting_id, tipo, storage_path, nombre)` por cada archivo subido

La separación existe porque `org_id`/`meeting_id` no existen hasta que (1) retorna.

## Output

JSON completo de la fila `agentes.meetings` insertada/actualizada, con el campo `archivos` ya poblado.

Campos clave:

- `id` — UUID de la reunión creada
- `org_id` — UUID de la org
- `meeting_date` — fecha de la reunión
- `summary` — resumen
- `pending_items` — pendientes
- `agreements` — acuerdos
- `archivos` — array de `{tipo, storage_path, nombre}`

## Errores

Stderr como `{ "error": "descripción" }`, exit code != 0.

Errores comunes:

- `Login fallido` — credenciales incorrectas
- `registrar_seguimiento falló: el evento X no existe` — UUID incorrecto o evento borrado
- `registrar_seguimiento falló: sin membership activa` — `baileyai@realitynear.org` no tiene membership en esa org
- `Upload fallido` — problema con Storage o path inválido
- `Archivo no encontrado` — `--archivo` apunta a un path que no existe localmente
- `--pendientes no es JSON válido` — revisar sintaxis del array JSON

Responder al usuario: *"No pude registrar el seguimiento: [error]"* — no inventar datos.

## Notes

- `--tipo` + `--entidad-id` son mutuamente excluyentes (evento vs oportunidad) — el RPC lo valida
- `--pendientes` y `--acuerdos` aceptan `'[]'` cuando no hay ninguno
- `--meeting-type` default: `client` — otros valores posibles según el sistema
- Los archivos del Storage son privados — nunca se devuelve URL permanente (se genera signed URL al leer)
- Credenciales y JWT nunca aparecen en stdout/stderr/logs
- Requiere internet — Supabase en `zwrekwltmipmdbautnwd.supabase.co`
- ⚠️ Requiere migración `20260805230000_agentes_seguimientos_archivos_y_registrar_seguimiento.sql` aplicada en producción
