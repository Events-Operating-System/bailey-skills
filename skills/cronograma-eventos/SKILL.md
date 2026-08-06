---
name: "cronograma-eventos"
description: "Consultar el cronograma de eventos de JBD Producciones en EventOS (Supabase) por rango de fechas."
metadata:
  openclaw:
    emoji: "📅"
---

# cronograma-eventos

Consulta eventos en EventOS/Supabase autenticado como `baileyai@realitynear.org`.
Solo lectura. Org isolation automático por sesión — solo devuelve eventos de JBD Producciones.

## Setup (una vez)

Requiere dos archivos de secrets en el filesystem de Bailey:

- `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` — `EMAIL` + `PASSWORD` de `baileyai@realitynear.org`
- `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` — `SUPABASE_URL` + `SUPABASE_ANON_KEY`

No se crean automáticamente — deben existir antes de correr el script.

## Comandos

```bash
# Eventos de agosto 2026
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/consultar_cronograma.js \
  --desde 2026-08-01 --hasta 2026-08-31

# Próximos 30 días (ajustar fechas al día actual)
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/consultar_cronograma.js \
  --desde 2026-08-05 --hasta 2026-09-05

# Resto del año
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/consultar_cronograma.js \
  --desde 2026-08-01 --hasta 2026-12-31

# Todos los eventos (rango amplio)
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/consultar_cronograma.js \
  --desde 2020-01-01 --hasta 2030-12-31
```

## Output

Array JSON. Cada elemento:

- `event_id` — UUID del evento
- `nombre` — nombre del evento
- `fecha` — timestamptz (UTC)
- `cliente` — nombre del cliente (puede ser null en eventos legacy)
- `estado` — estado del evento (ej. `confirmado`)

Array vacío `[]` = no hay eventos en ese rango. No es error.

## Errores

Errores van a stderr como `{ "error": "descripción" }` con exit code != 0.
Responder al usuario: *"No pude consultar el cronograma: [error]"* — no inventar datos.

Errores comunes:
- `Login fallido` — credenciales incorrectas o cuenta suspendida
- `RPC fallido` — problema en Supabase o función no disponible
- `No se pudo leer secrets` — archivo de secrets faltante o path incorrecto

## Notes

- Incluye eventos `is_test = true` — función para staff interno, no para Portal Cliente
- Sin filtro de estado: devuelve todos los estados (`confirmado`, `borrador`, etc.)
- Requiere internet — Supabase en `zwrekwltmipmdbautnwd.supabase.co`
- Credenciales y JWT nunca aparecen en stdout/stderr/logs
- `--desde` debe ser ≤ `--hasta` (validado, falla explícito si no)
