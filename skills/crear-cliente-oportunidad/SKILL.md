---
name: "crear-cliente-oportunidad"
description: "Crear un cliente nuevo y una oportunidad de venta vinculada en EventOS (ventas.crear_cliente_y_oportunidad). Dedup automático por teléfono/email exacto."
metadata:
  openclaw:
    emoji: "🤝"
---

# Crear Cliente + Oportunidad — EventOS

## Cuándo usar este skill

Cuando Javier (u otro miembro del equipo) menciona un prospecto nuevo o una
oportunidad de venta que hay que registrar en EventOS — por texto o nota de voz.

Ejemplos de trigger:
- "Anota a Carla Ríos, quiere un matrimonio en diciembre, llámala al +51999888777"
- "Hay un cliente nuevo, María García, su email es maria@empresa.com"
- "Registra a Pedro López, referido de Karina, sin fecha todavía"

## Campos obligatorios (bloquean si faltan — preguntar antes de invocar)

- **Nombre del cliente** (`--nombre`)
- **Al menos un contacto**: teléfono (`--telefono`) O email (`--email`) — si faltan ambos, preguntar

## Campos opcionales (NO bloquean — crear igual y mencionar en el aviso)

- Tipo de evento (`--tipo-evento`): ej. "Matrimonio", "Corporativo", "Cumpleaños"
- Fecha tentativa (`--fecha-tentativa`): formato YYYY-MM-DD
- Origen (`--origen`): "referido", "instagram", "web", "otro"

Si faltan campos opcionales: crear igual y avisar en el mensaje de confirmación cuáles quedaron vacíos.

## Setup (una vez)

Mismos secrets que los otros skills:

- `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` — `EMAIL` + `PASSWORD`
- `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` — `SUPABASE_URL` + `SUPABASE_ANON_KEY`

## Comando a ejecutar

```bash
node /Users/baileyserver/.openclaw/workspace/bailey-skills/scripts/crear_cliente_oportunidad.js \
  --nombre "Carla Ríos" \
  --telefono "+51999888777" \
  --email "carla@email.com" \
  --tipo-evento "Matrimonio" \
  --fecha-tentativa "2026-12-15" \
  --origen "referido"
```

Solo `--nombre` y al menos uno de `--telefono`/`--email` son obligatorios.
Los demás flags son opcionales — omitirlos si no se tienen.

## Lógica de dedup y casos especiales

El RPC maneja el dedup automáticamente por teléfono/email exacto (incluyendo espacios de borde — ya corregido en el RPC):

**Caso 1 — Cliente nuevo:**
El RPC crea el cliente y la oportunidad. `cliente_reutilizado = false`.
→ Avisar: "✅ Cliente y oportunidad creados. Pendiente de confirmar en el Dashboard."

**Caso 2 — Cliente ya existía (match exacto de teléfono o email):**
El RPC reutiliza el cliente existente y crea solo la oportunidad nueva. `cliente_reutilizado = true`.
→ Avisar: "✅ El cliente ya existía en el sistema — se vinculó la oportunidad nueva. Pendiente de confirmar."

**Caso 3 — Nombre similar pero contacto distinto:**
El RPC no puede detectar esto — crea un cliente nuevo de todas formas. Pero Bailey debe avisar:
→ "⚠️ Creé el cliente como nuevo porque el teléfono/email no coincide con ninguno existente. Si es la misma persona con otro contacto, revisalo en 'Pendientes de confirmar' antes de confirmar."

Para detectar el Caso 3: si el nombre ingresado es muy similar a alguno que Javier haya mencionado antes en la conversación, mencionarlo proactivamente. No bloquear — solo avisar.

## Aviso al terminar (OBLIGATORIO)

Después de que el script devuelva `client_id` y `opportunity_id` reales:

1. **Mensaje en el chat** con el resumen (ver formato abajo)
2. **Email a Javier** — el script lo manda automáticamente. No necesitas invocarlo.
   - El script devuelve `email_enviado: true` si el email llegó.
   - Si devuelve `email_enviado: false` con `email_error`, avisar a Javier en el chat que el email falló y mostrar el error.
   - **No invocar gog manualmente** — el email ya es responsabilidad del script.

### Formato del mensaje de confirmación en chat

```
✅ Oportunidad registrada — pendiente de confirmar

👤 Cliente: [nombre] ([teléfono] / [email])
📋 Tipo de evento: [tipo o "no especificado"]
📅 Fecha tentativa: [fecha o "no especificada"]
📣 Origen: [origen o "no especificado"]

🆔 client_id: [client_id]
🆔 opportunity_id: [opportunity_id]

[Si cliente_reutilizado=true]: ℹ️ El cliente ya existía — se vinculó la oportunidad nueva.
[Si Caso 3 sospechado]: ⚠️ El nombre es similar a [nombre existente] — revisalo antes de confirmar.

[Si email_enviado=true]: 📬 Te envié un email de aviso automáticamente.
[Si email_enviado=false]: ⚠️ El email de aviso no se pudo enviar: [email_error]. Lo sabés por este chat.
Confirmá la oportunidad en el Dashboard → Ventas → Pendientes de confirmar.
```

## Guardrail (OBLIGATORIO)

**Nunca** confirmes que el cliente u oportunidad "está guardado en EventOS" a menos que el script haya corrido y devuelto un `client_id` y un `opportunity_id` reales.

Si el script falla o no devuelve esos IDs: decirle a Javier exactamente qué pasó y qué datos quedaron sin guardar. No inventar confirmaciones.

Esta regla aplica igual que el guardrail de `registro-seguimiento` — mismo criterio.

## La oportunidad nace en estado `pendiente_confirmar`

Javier la confirma desde el Dashboard → Ventas → Pendientes de confirmar.
No es responsabilidad de Bailey confirmarla — solo crearla y avisar.
