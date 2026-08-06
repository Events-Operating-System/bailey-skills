---
name: "cronograma-eventos"
description: "Consultar el cronograma de eventos de JBD Producciones en EventOS (Supabase) por rango de fechas."
---

# Cronograma de Eventos — EventOS

## Cuándo usar este skill

Cuando Javier (u otro miembro del equipo) pregunta:

- "¿Qué eventos hay en agosto?"
- "¿Cuál es el cronograma de la próxima semana?"
- "¿Hay algo agendado entre el X y el Y?"
- Cualquier variante de consultar eventos próximos o pasados por fecha.

---

## Cómo funciona

Este skill invoca un script Node.js que:

1. Se autentica en Supabase con la cuenta `test@realitynear.org`
2. Llama al RPC `eventos.consultar_cronograma(fecha_desde, fecha_hasta)`
3. Devuelve un array JSON con los eventos del rango solicitado

La autenticación y el JWT nunca aparecen en los logs.

---

## Comando a ejecutar

```bash
node /Users/baileyserver/.openclaw/workspace/scripts/consultar_cronograma.js \
  --desde YYYY-MM-DD \
  --hasta YYYY-MM-DD
```

**Ejemplo — eventos de agosto 2026:**
```bash
node /Users/baileyserver/.openclaw/workspace/scripts/consultar_cronograma.js \
  --desde 2026-08-01 \
  --hasta 2026-08-31
```

---

## Resultado esperado

Array JSON. Cada elemento tiene:

| Campo      | Tipo        | Descripción                              |
|------------|-------------|------------------------------------------|
| `event_id` | UUID        | ID único del evento en EventOS           |
| `nombre`   | string      | Nombre del evento                        |
| `fecha`    | timestamptz | Fecha y hora del evento (UTC)            |
| `cliente`  | string      | Nombre del cliente (puede ser null)      |
| `estado`   | string      | Estado del evento (ej. "activo", etc.)   |

---

## Manejo de errores

Si el script falla, imprime a stderr:
```json
{ "error": "descripción del problema" }
```

Con exit code distinto de 0.

Responder al usuario: *"No pude consultar el cronograma: [error]"* — no inventar datos.

---

## Límites conocidos

- Solo muestra eventos de JBD Producciones (org isolation por sesión de `test@realitynear.org`)
- Incluye eventos de prueba (`is_test = true`) — es una función para staff interno, no para clientes
- Requiere conexión a internet para acceder a Supabase
- Si el servidor tarda, el timeout es el de Node por defecto (~30s)

---

## Archivos dependientes

| Archivo | Propósito |
|---------|-----------|
| `/Users/baileyserver/.openclaw/workspace/scripts/consultar_cronograma.js` | Script principal |
| `/Users/baileyserver/.openclaw/workspace/.secrets/supabase.env` | URL y anon key de Supabase |
| `/Users/baileyserver/.openclaw/workspace/.secrets/bailey-identity.env` | Credenciales de `baileyai@realitynear.org` |
