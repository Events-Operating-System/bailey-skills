---
name: "registro-reunion"
description: "Registrar una reunión (notas, acuerdos, participantes, adjuntos) en EventOS: sobre un evento, una oportunidad o, si no se sabe, en la bandeja Sin evento."
metadata:
  openclaw:
    emoji: "📝"
---

# Registro de Reunión — EventOS

Reemplaza a `registro-seguimiento`. Guarda en el registro único de reuniones (`eventos.meetings`), el mismo que el
equipo ve en Eventos (pestaña Reuniones), Portal Cliente, Agentes AI y Ventas.

## Cuándo usar este skill

Cuando Javier (u otro miembro del equipo) te cuenta cómo fue una reunión — por texto, nota de voz, foto o archivo —
y ya redactaste las notas y los acuerdos.

## A qué evento va

- Si Javier dice a qué evento u oportunidad corresponde, usá ese (`--evento` o `--oportunidad`; buscá el id con
  `cronograma-eventos` si hace falta).
- **Si no está claro, no lo adivines** por el título, el calendario o los invitados: guardala **sin** `--evento` ni
  `--oportunidad`. Queda en la bandeja "Sin evento" y el equipo la asigna después desde Eventos o Agentes AI.
  Decíselo a Javier en la confirmación.
- Una oportunidad que ya tiene evento: la base la guarda directo en el evento.

## Qué mandar

- `--titulo` **siempre** (3-8 palabras). Ej.: `--titulo "Visita al local — Matri Vane & Sandro"`.
- `--fecha` de la reunión (no la de hoy si fue otro día).
- `--notas`: el resumen, en texto. Una línea por párrafo; las líneas que empiezan con `- ` quedan como lista.
- `--acuerdos`: **una sola lista** con acuerdos y pendientes (ya no hay "pendientes" aparte). Cada uno:
  `{"text": "...", "owner": "Cliente | Javier | Equipo JBD | ...", "due_date": "AAAA-MM-DD", "status": "pendiente"}`.
  Si algo ya quedó resuelto en la reunión, `"status": "hecho"`. El responsable va como texto: la base lo clasifica
  (cliente, miembro del equipo o productora).
- `--participantes` (opcional): `[{"name": "...", "kind": "cliente|externo"}]`; con `email` de alguien del equipo
  queda como miembro.
- `--modalidad presencial|virtual|telefono` y `--lugar` (opcionales).
- `--archivo tipo:/ruta:nombre` por cada audio, foto o archivo.

La reunión queda **interna**. Nunca la compartas con el cliente: eso lo decide alguien del equipo en la pantalla.

## Setup (una vez)

Mismos secrets que `cronograma-eventos`:

- `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` — `EMAIL` + `PASSWORD`
- `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` — `SUPABASE_URL` + `SUPABASE_ANON_KEY`

## Comando

```bash
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/registrar_reunion.js \
  --evento <uuid-del-evento> \
  --fecha "2026-11-05T18:00:00-05:00" \
  --titulo "Visita al local — Matri Vane & Sandro" \
  --notas "Recorrimos el jardín y la terraza.
- Ceremonia en el jardín
- Cóctel en la terraza" \
  --acuerdos '[{"text":"Enviar plano actualizado","owner":"Javier","due_date":"2026-11-08","status":"pendiente"},{"text":"Confirmar número de invitados","owner":"Cliente","status":"pendiente"}]' \
  --archivo foto:/tmp/jardin.jpg:jardin.jpg
```

Sin evento identificado: el mismo comando **sin** `--evento`.

## Resultado esperado

```json
{ "meeting_id": "uuid", "org_id": "uuid", "event_id": "uuid|null", "opportunity_id": "uuid|null",
  "sin_evento": false, "acuerdos": 2, "archivos": [{ "tipo": "foto", "nombre": "jardin.jpg" }] }
```

## Confirmación al usuario

1. Título, fecha y a qué quedó asignada: nombre del evento u oportunidad, o **"Sin evento — asignala desde Eventos o
   Agentes AI"** si `sin_evento` es `true`. `meeting_id` (primeros 8 caracteres).
2. **Todos** los acuerdos, uno por línea, con responsable y fecha. No agrupar ni resumir.
3. Los adjuntos, si hubo.

## Errores

Stderr como `{ "error": "..." }`, exit code != 0.

- `Login fallido` — credenciales.
- `registrar_reunion falló: MEET073...` — el evento u oportunidad no existe (UUID mal o borrado).
- `registrar_reunion falló: MEET071...` — Bailey no tiene acceso a esa organización.
- `Sin evento ni oportunidad hace falta una sola organización activa` — indicar `--evento` u `--oportunidad`.
- `No se pudo subir ... (la reunión X ya quedó creada)` — avisar a Javier: la reunión está, falta el archivo.
- `--acuerdos no es JSON válido` / `--participantes no es JSON válido` — revisar sintaxis.
