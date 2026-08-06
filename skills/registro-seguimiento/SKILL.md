---
name: "registro-seguimiento"
description: "Registrar el seguimiento de una reunión (resumen, pendientes, acuerdos, adjuntos) sobre un evento o una oportunidad de JBD Producciones en EventOS."
metadata:
  openclaw:
    emoji: "📝"
---

# Registro de Seguimiento Post-Reunión — EventOS

## Cuándo usar este skill

Después de que Javier (u otro miembro del equipo) te cuenta cómo fue una
reunión — por texto, nota de voz, foto o archivo — y vos ya redactaste el
resumen, los pendientes y los acuerdos.

**Antes de invocar el script, preguntá explícitamente a qué evento u
oportunidad corresponde la reunión** (por nombre/cliente), incluso si el
calendario sugiere uno — no lo infieras del título ni de los invitados. Es
más lento pero evita que el seguimiento quede pegado a la entidad
equivocada.

## Setup (una vez)

Mismos secrets que `cronograma-eventos`:

- `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` — `EMAIL` + `PASSWORD`
- `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` — `SUPABASE_URL` + `SUPABASE_ANON_KEY`

## Cómo funciona

1. Llama a `registrar_seguimiento` (RPC en el schema `agentes`), que valida que la entidad exista y pertenezca a la organización real del usuario autenticado, y crea la fila.
2. Si hay archivos (audio/foto/documento), los sube a Storage y los adjunta con `adjuntar_archivo` — uno por uno, después de tener el `meeting_id` real.

La autenticación y el JWT nunca aparecen en los logs.

## Comando a ejecutar

```bash
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_seguimiento.js \
  --tipo evento \
  --entidad-id <uuid-del-evento-u-oportunidad> \
  --fecha "2026-08-05T18:00:00-05:00" \
  --resumen "Resumen de la reunión..." \
  --pendientes '[{"task":"Enviar propuesta","owner":"Javier","due_date":"2026-08-10","status":"pendiente"}]' \
  --acuerdos '[{"text":"Presupuesto aprobado hasta $20k","owner":"Cliente","status":"confirmado"}]' \
  --archivo audio:/tmp/nota.m4a:nota_reunion.m4a
```

`--tipo` es `evento` si la reunión es sobre un evento operativo ya creado (`eventos.events`), u `oportunidad` si todavía es pre-venta (`ventas.opportunities`) — nunca ambos.
`--archivo` puede repetirse por cada adjunto.

## Resultado esperado

```json
{
  "meeting_id": "uuid",
  "org_id": "uuid",
  "archivos": [{ "tipo": "audio", "storage_path": "...", "nombre": "nota_reunion.m4a" }]
}
```

## Errores

Stderr como `{ "error": "descripción" }`, exit code != 0. Nunca crea una fila parcial de la que Bailey no se entera.

Errores comunes:

- `Login fallido` — credenciales incorrectas
- `registrar_seguimiento falló: el evento X no existe` — UUID incorrecto o evento borrado
- `registrar_seguimiento falló: sin membership activa` — `baileyai@realitynear.org` sin membership en esa org
- `No se pudo subir` — problema con Storage
- `No se pudo leer el archivo local` — `--archivo` apunta a path que no existe
- `--pendientes no es JSON válido` — revisar sintaxis

## Notes

- `--tipo` + `--entidad-id` son mutuamente excluyentes — el RPC lo valida y rechaza si se pasan ambos
- `--pendientes` y `--acuerdos` aceptan `'[]'` cuando no hay ninguno
- `--meeting-type` default: `client`
- Archivos en Storage son privados (bucket `agentes-attachments`) — nunca URL permanente
- Credenciales y JWT nunca aparecen en stdout/stderr/logs
- Requiere internet — Supabase en `zwrekwltmipmdbautnwd.supabase.co`
- ⚠️ Requiere migración `20260805230000_agentes_seguimientos_archivos_y_registrar_seguimiento.sql` aplicada en producción
