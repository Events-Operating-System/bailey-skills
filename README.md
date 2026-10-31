# Bailey Skills — EventOS

Scripts y skills de Bailey, el agente AI de JBD Producciones / EventOS.

## Estructura

```
scripts/          Scripts ejecutables por Bailey vía exec
skills/           SKILL.md para cada capacidad
```

## Secrets

Los archivos `.secrets/` viven **solo en el workspace local de Bailey** (`/Users/baileyserver/.openclaw/workspace/.secrets/`).
No se versionan. El `.gitignore` los excluye explícitamente.

## Capacidades

| Capacidad | Script | Descripción |
|-----------|--------|-------------|
| cronograma-eventos | `scripts/consultar_cronograma.js` | Consulta eventos en EventOS/Supabase por rango de fechas |
| registro-reunion | `scripts/registrar_reunion.js` | Registra una reunión (notas, acuerdos, participantes, adjuntos) en `eventos.meetings`; sin evento identificado va a la bandeja "Sin evento". Reemplaza a `registro-seguimiento` |
