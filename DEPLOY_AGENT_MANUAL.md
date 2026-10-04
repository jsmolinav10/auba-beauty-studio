# 🚀 MANUAL DE DESPLIEGUE CONTINUO EN VERCEL (AUBA BEAUTY STUDIO)
> **Destinatario:** Agentes de Inteligencia de Software (AI/IS Agents) y Desarrolladores.  
> **Propósito:** Guía de ejecución determinista y autónoma para validar, versionar y desplegar modificaciones a producción sin riesgo de downtime o fallos lógicos.

---

## 📌 1. METADATOS Y ARQUITECTURA DEL SISTEMA

| Parámetro | Detalle |
| :--- | :--- |
| **Nombre del Proyecto** | `auba-beauty-studio` |
| **Repositorio Remoto** | `https://github.com/jsmolinav10/auba-beauty-studio.git` |
| **Rama de Producción** | `main` |
| **Dominio Público Oficial** | `https://aubaestudio.com` (con alias `https://www.aubaestudio.com`) |
| **Vercel Project ID** | `prj_P9lmj3otLVSin8WmdRSei7GS1y2C` |
| **Vercel Org/Team ID** | `team_1IxFxIi62tIKXogyuPBfJ2t9` |
| **Runtime** | Node.js (>= 18.0.0) |
| **Arquitectura** | Monolito Serverless (Express en `server.js` exportado vía `api/index.js`, frontend PWA estático en `public/`, PostgreSQL en Supabase) |
| **Orquestador Vercel** | `vercel.json` (rutas, cabeceras de seguridad CSP/Helmet, rewrites y cron keepalive) |

---

## ⚠️ 2. REGLAS DE ORO DE DESPLIEGUE (ZERO-BREAKAGE POLICY)

Antes de ejecutar cualquier comando de despliegue, el Agente **DEBE** respetar las siguientes restricciones estrictas:

1. **PROHIBIDO DESPLEGAR CON TESTS FALLIDOS:** Nunca se debe ejecutar el despliegue a producción si la suite integral `npm test` reporta al menos 1 fallo.
2. **PROTECCIÓN ABSOLUTA DE SECRETOS:** Nunca ejecutar `git add .` sin antes verificar que `.env`, `.env.local`, `.env.vercel.*` y cualquier credencial sensible permanezcan ignorados por Git.
3. **MIGRACIONES DE BASE DE DATOS PRIMERO:** Si las modificaciones incluyen cambios en el esquema de PostgreSQL (`schema/postgres.sql` o `schema/migrations/`), dichas sentencias SQL deben estar aplicadas en Supabase antes de desplegar código que dependa de ellas.
4. **SMOKE TEST OBLIGATORIO POST-DEPLOY:** El despliegue no se da por concluido hasta comprobar el estado HTTP 200 en los endpoints públicos de producción.

---

## 🛠️ 3. PROCEDIMIENTO OPERATIVO ESTÁNDAR (SOP) PASO A PASO

### FASE 1: Inspección de Modificaciones y Pre-vuelo (Pre-Flight Checks)

El agente debe comenzar verificando el estado del árbol de trabajo:

```bash
# 1.1 Verificar archivos modificados y sin seguimiento
git status

# 1.2 Inspeccionar cambios sintácticos y lógicos
git diff --stat
```

Si se agregaron imágenes o se actualizaron iconos PWA, ejecutar las optimizaciones:
```bash
# 1.3 Solo si se modificaron iconos o imágenes en public/
npm run optimize-images
npm run generate-icons
```

---

### FASE 2: Quality Gate (Validación Integral Obligatoria)

El agente debe correr la suite de 47+ pruebas automáticas que validan conexión a Supabase, RBAC, sistema de reservas, anti-traslapes, pagos, seguridad de headers y assets PWA:

```bash
npm test
```

> 🛑 **Condición de Parada:**  
> Si el resultado es distinto a `0 FALLIDAS` o el código de salida es `1`:  
> **ABORTAR DESPLIEGUE INMEDIATAMENTE**, analizar el log de errores, corregir el código y volver a probar.

---

### FASE 3: Control de Versiones y Commit en Git

Una vez validadas las pruebas:

```bash
# 3.1 Agregar los archivos modificados
git add .

# 3.2 Verificar que ningún archivo .env esté en staging
git status
```
*(Si por error aparece un archivo confidencial, retirarlo inmediatamente con `git reset HEAD <archivo>`)*.

```bash
# 3.3 Crear commit semántico descriptivo
git commit -m "feat(scope): descripción concisa de los cambios"

# 3.4 Sincronizar con el repositorio remoto GitHub
git push origin main
```

---

### FASE 4: Ejecución del Despliegue en Vercel

Dado que el proyecto cuenta con el archivo de enlace local `.vercel/project.json`, el agente puede elegir entre:

#### Opción A: Despliegue Directo a Producción con Vercel CLI (Recomendado para Agentes)
Este método es 100% determinista, autónomo y no interactivo:

```powershell
npx vercel --prod --yes
```

> **¿Qué hace este comando?**
> - Lee la configuración de `vercel.json`.
> - Empaqueta el frontend (`public/`) y la función serverless (`api/index.js`).
> - Sube el release a los servidores de Vercel.
> - Asigna el despliegue al dominio oficial **`https://aubaestudio.com`**.
> - Retorna la URL de producción y la URL de inspección.

#### Opción B: Despliegue de Pre-visualización (Preview Deployment)
Si se desea validar en una URL temporal antes de tocar el dominio principal:
```powershell
npx vercel --yes
```

---

### FASE 5: Verificación Post-Despliegue (Automated Smoke Test)

El agente debe ejecutar una prueba rápida de verificación HTTP contra el dominio en producción:

```powershell
# 5.1 Verificar que el catálogo de servicios responda 200 OK con JSON válido
Invoke-RestMethod -Uri "https://aubaestudio.com/api/services" -Method Get

# 5.2 Verificar que el listado de manicuristas responda 200 OK
Invoke-RestMethod -Uri "https://aubaestudio.com/api/manicurists" -Method Get

# 5.3 Verificar que el manifest PWA esté accesible
Invoke-WebRequest -Uri "https://aubaestudio.com/manifest.json" -UseBasicParsing

# 5.4 Verificar que los archivos confidenciales sigan protegidos (debe retornar 404)
try {
    Invoke-WebRequest -Uri "https://aubaestudio.com/.env" -UseBasicParsing
    Write-Warning "ALERTA: /.env no devolvió 404!"
} catch {
    Write-Host "✅ Seguridad confirmada: /.env bloqueado con 404"
}
```

Si todas las peticiones responden correctamente, el despliegue se considera **EXITOSO**.

---

## 🚨 4. PROTOCOLO DE CONTINGENCIA Y ROLLBACK

En caso de que el Smoke Test falle o se detecte un error crítico en producción:

### Rollback Inmediato vía CLI:
```powershell
npx vercel rollback
```
*(Vercel reasignará instantáneamente el dominio `aubaestudio.com` al despliegue anterior que estaba funcionando sin compilar de nuevo).*

### Rollback vía Git:
```bash
git revert HEAD --no-edit
git push origin main
npx vercel --prod --yes
```

---

## 📋 5. GUÍA RÁPIDA / CHEAT SHEET (PARA EL AGENTE)

```powershell
# 1. Asegurar tests en verde
npm test

# 2. Versionar cambios
git add .
git commit -m "update: aplicar mejoras validadas"
git push origin main

# 3. Desplegar en producción Vercel
npx vercel --prod --yes

# 4. Smoke check
Invoke-RestMethod -Uri "https://aubaestudio.com/api/services" -Method Get
```
