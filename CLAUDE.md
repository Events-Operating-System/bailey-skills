# CLAUDE.md — bailey-skills

Scripts y skills que Bailey (agente AI de JBD Producciones / EventOS) ejecuta
vía `exec`. Cada "Capacidad" es un script Node standalone + un `SKILL.md` que
le dice a Bailey cuándo y cómo invocarlo.

Para las guardrails de comportamiento de Bailey como agente (qué hacer, qué
nunca confirmar sin datos reales, política de grupos) ver `AGENTS.md` — es
para Bailey, no para vos. Este archivo es para vos (Claude Code) trabajando
en el repo.

## Estructura

```
scripts/    Un .js ejecutable por capacidad — sin dependencias externas (solo fs/https/child_process nativos de Node)
skills/     Un SKILL.md por capacidad — instrucciones para Bailey (cuándo invocar, qué campos pedir, cómo confirmar)
```

## Patrón canónico de los scripts

Todos los scripts (`consultar_cronograma.js`, `registrar_seguimiento.js`,
`crear_cliente_oportunidad.js`) siguen la misma forma. Si agregás una
capacidad nueva, replicá esto:

- `loadEnv(filePath)` carga secrets desde `.secrets/*.env` a `process.env` — nunca hardcodear valores.
- `fatal(msg)` escribe `{ "error": msg }` a **stderr** y hace `exit(1)`. Es el único camino de error — nunca `throw` sin capturar, nunca `console.log` de un error.
- `request()`/`post()` son wrappers mínimos sobre `https` nativo — no se usa `axios` ni `node-fetch`.
- Login (Supabase password grant) → RPC → (opcional: side effects como upload a Storage o envío de email) → **un solo** `process.stdout.write(JSON.stringify(...))` al final con el resultado limpio.
- El JWT (`access_token`) se guarda en una variable local, nunca se loguea ni se interpola en un mensaje de error — comentario `// nunca se imprime` marca el punto crítico.
- El IIFE principal siempre termina en `.catch((e) => fatal(...))` para capturar rejections no manejadas.
- Side effects opcionales y no críticos (ej. envío de email) van en su propio `try/catch` que **no** llama a `fatal()` — se degradan a un campo del JSON (`email_enviado: false`, `email_error: "..."`), nunca cuelgan ni interrumpen la operación principal ya confirmada.
- Subprocesos (`execFileSync`) siempre con **array de argumentos**, nunca concatenación de string a shell — y siempre con `timeout` explícito para no colgarse si el proceso hijo no responde (ej. token OAuth vencido).

## Checklist de revisión de seguridad (aplicar a cada Capacidad nueva o modificada)

1. **Sin fugas de credenciales** — password/JWT/token OAuth nunca en stdout/stderr/logs, solo el JSON de resultado final.
2. **Manejo de errores explícito** — exit code ≠0 y mensaje claro en stderr si falla login o RPC. Si hay un side effect no crítico (email, notificación), debe degradarse a un campo del JSON (`*_enviado: false`, `*_error`), nunca colgar el proceso ni fallar en silencio — confirmar timeout explícito en cualquier `execFileSync`/subprocess.
3. **Historial de git limpio** — `git log -p --all` sobre el archivo + grep de patrones de secretos (`password=`, `access_token:`, `PRIVATE KEY`, claves tipo AWS) en todo el historial, no solo el diff actual.
4. **SKILL.md consistente** — mismo patrón de Setup/Comando/Errores que las demás capacidades. Si un side effect puede fallar (email), la plantilla de confirmación a Javier debe ser condicional al resultado real, nunca una afirmación incondicional tipo "te avisé por email" — y debe instruir avisar en el chat/Telegram si falló.
5. **RPC del lado servidor** (vive fuera de este repo, en las migraciones de Supabase) — confirmar con quien mantiene ese código que valida membership activa + organización activa en el cuerpo de la función (no confiar solo en RLS). Revisar lógica de dedup por posibles bypasses: case-sensitivity en email, formatos distintos de teléfono que deberían matchear. El cliente (este repo) solo hace `.trim()` — no asumir normalización adicional sin confirmarla server-side.
6. **Subprocesos externos** (`execFileSync` hacia herramientas como `gog`) — confirmar array de argumentos (no shell), sin interpolar input de usuario en un string que se ejecute vía shell. Destinatarios de email hardcodeados, nunca tomados de input de cliente.

## Fuera de alcance de este repo

El SQL de las funciones RPC (`crear_cliente_y_oportunidad`, `registrar_seguimiento`, etc.) vive en migraciones de Supabase que no están versionadas acá. Para auditar validación server-side o lógica de dedup hay que pedir esas migraciones aparte — no asumir su contenido a partir de lo que dice un `SKILL.md`.
