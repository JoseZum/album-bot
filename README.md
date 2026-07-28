<div align="center">

<img src="./public/logo.png" alt="Album Bot" width="400">

# Album Bot - API

Plataforma de coleccionismo para administrar álbumes de estampas desde Telegram. Centraliza catálogo, progreso, faltantes, repetidas, amistades, álbumes compartidos e intercambios en una API diseñada para colecciones colaborativas.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![CI](https://img.shields.io/github/actions/workflow/status/JoseZum/album-bot/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/JoseZum/album-bot/actions/workflows/ci.yml)

**[Capacidades](#capacidades-principales) · [Garantías](#garantías-operativas) · [Arquitectura](#arquitectura-de-la-aplicación) · [Instalación](#instalación-local) · [Comandos](#comandos-del-bot)**

</div>

---

## Capacidades principales

| Área | Responsabilidad |
| :-- | :-- |
| **Colección** | Registra estampas individuales o en lote, calcula progreso, detecta faltantes y lista repetidas por país o estampa. |
| **Álbumes** | Permite crear varios álbumes, cambiar el álbum activo, renombrarlo, borrarlo o salir de álbumes compartidos. |
| **Amigos** | Gestiona solicitudes de amistad, consulta repetidas de otros coleccionistas y habilita comparaciones directas. |
| **Compartir** | Comparte un álbum activo con otra persona mediante solicitudes explícitas aceptadas desde Telegram. |
| **Marketplace** | Publica ofertas, filtra el mercado por usuario o estampa, propone intercambios y coordina su cierre. |
| **Telegram** | Procesa mensajes y callbacks por webhook, ofrece menús inline, soporte bilingüe y rate limiting por usuario. |

## Garantías operativas

El bot aplica reglas de negocio en varias capas: el parser normaliza aliases de países y comandos, la capa de servicio protege el flujo de álbumes y amistades, y PostgreSQL conserva el estado compartido de colecciones, ofertas y membresías.

| Garantía | Implementación |
| :-- | :-- |
| **Álbum activo** | Las acciones de inventario requieren un álbum activo antes de modificar o consultar la colección. |
| **Compartición explícita** | Las invitaciones de álbum y amistad requieren aceptación del destinatario antes de habilitar acceso. |
| **Intercambio coordinado** | Las ofertas pasan por estados `active`, `pending_confirmation`, `accepted_pending_completion`, `completed`, `cancelled` y `expired`. |
| **Consistencia de inventario** | El cierre de un intercambio actualiza cantidades solo cuando ambas partes lo confirman y la disponibilidad sigue existiendo. |
| **Tolerancia de entrada** | Los comandos aceptan aliases, nombres de país, códigos, formatos flexibles y lotes de hasta 100 estampas. |
| **Operación observable** | El servicio expone salud de base de datos y métricas Prometheus para inspección externa. |

## Arquitectura de la aplicación

La solución se despliega como una API Express conectada a PostgreSQL. Telegram envía mensajes y callbacks al webhook; el servicio registra al usuario, interpreta el comando, aplica la regla de negocio correspondiente y responde al chat o notifica a otros coleccionistas cuando el flujo lo requiere.

El código se organiza por dominios y separa transporte, lógica y persistencia: `routes -> controllers -> services -> repositories`. `src/app.ts` compone la aplicación HTTP, `src/server.ts` la ejecuta localmente, y la capa `db/` permite usar PostgreSQL como base principal o LibSQL/Turso como alternativa opcional.

El catálogo actual modela el álbum `Panini FIFA World Cup 2026`, incluyendo equipos, secciones especiales, nombres de jugadores, resolución de páginas y aliases de países para entrada libre por chat.

## Tecnologías

| Área | Tecnologías |
| :-- | :-- |
| **Core** | Node.js, TypeScript, Express y PostgreSQL |
| **Integración** | Telegram Bot API por webhook |
| **Persistencia alternativa** | LibSQL / Turso mediante `@libsql/client` |
| **Observabilidad** | `prom-client` y métricas Prometheus |
| **Testing** | Node.js Test Runner y `tsx` |
| **Infraestructura** | Docker Compose y Render |

## Instalación local

### Requisitos

- Node.js 22 o superior.
- npm.
- PostgreSQL 16 o Docker con Compose.
- Un token de bot de Telegram creado con BotFather.

```bash
git clone https://github.com/JoseZum/album-bot.git
cd album-bot
cp .env.example .env
npm ci
npm run db:up
npm run db:migrate
npm run dev
```

La API queda disponible en `http://localhost:3000`.

El contrato mínimo de entorno vive en [`.env.example`](./.env.example). Para usar LibSQL o Turso en lugar de PostgreSQL, agrega manualmente `DB_DRIVER=sqlite` y `LIBSQL_URL`; si la instancia es remota, también `LIBSQL_AUTH_TOKEN`.

### Comandos habituales

```bash
npm run dev
npm run build
npm start
npm test
npm run test:unit
npm run test:integration
npm run db:up
npm run db:down
npm run db:logs
npm run db:migrate
```

## Comandos del bot

```text
add CRC 1
add CRC 1 CRC 2 ARG 5
remove ARG 4

missing
missing Costa Rica

duplicates
duplicates Argentina
duplicates @username ARG 5

progress
page Brazil
any 17

friends
friends add @username
friends remove @username
friends duplicates

share @username
compare @username
compare Argentina @username

trade ARG 2 BRA 4
trade cancel T1
trades
marketplace
marketplace -mine
marketplace -give ARG 2
marketplace -need BRA 4

albums
album new Road to 2026
album use 1
album rename Road to 2026 to Mundial
album delete
album leave

start
menu
language
undo
help
```

## API HTTP

### Webhook de Telegram

```http
POST /api/telegram/webhook
```

Recibe mensajes, mensajes editados y callback queries de Telegram.

### Mensaje directo al bot

```http
POST /api/bot/message
Content-Type: application/json
```

```json
{
  "ownerId": "collector-1",
  "username": "josezum",
  "text": "add ARG 2"
}
```

Ejecuta la misma lógica del bot sin depender de un update real de Telegram.

### Salud

```http
GET /health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "db": "ok"
}
```

### Métricas

```http
GET /metrics
```

Expone contadores y duraciones HTTP en formato Prometheus.

## Integración con Telegram

Crea un bot en BotFather y configura su token en `TELEGRAM_BOT_TOKEN`. Cuando la API tenga una URL pública con HTTPS, registra el webhook:

```bash
curl --request POST \
  "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://your-domain.com/api/telegram/webhook"
```

Verifica la configuración:

```bash
curl \
  "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Observabilidad y calidad

- `GET /metrics` publica contadores y duraciones HTTP con Prometheus.
- `GET /health` valida conectividad con PostgreSQL.
- La suite incluye pruebas unitarias e integrales para parser, repositorio, API HTTP y flujo de marketplace.
- El repo incorpora `compose.yml` para levantar PostgreSQL local y `render.yaml` para desplegar la API en Render.

```text
src/                 application code
db/                  PostgreSQL schema and seed data
tests/               unit and integration suites
public/              README assets
```

## Despliegue

El repositorio incluye [`render.yaml`](./render.yaml) para publicar la API en Render junto con una base PostgreSQL administrada. El servicio compila TypeScript, ejecuta migraciones SQL y arranca con `node dist/server.js`.

<div align="center">

Desarrollado por **Jose Zum**

</div>
