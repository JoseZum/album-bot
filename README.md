<p align="center">
  <img src="./public/logo.png" alt="Album Bot" width="220">
</p>

# Album Bot

Bot de Telegram para administrar albums de estampas coleccionables. Centraliza catalogo, progreso, faltantes, repetidas, amistades, albums compartidos e intercambios en una API Express conectada a PostgreSQL y operada directamente desde el chat.

`Capacidades` | `Garantias` | `Arquitectura` | `Instalacion` | `API`

* * *

## Capacidades principales

Area | Responsabilidad
--- | ---
Coleccion | Registra estampas individuales o en lote, calcula progreso, detecta faltantes y lista repetidas por pais o estampa.
Albums | Permite crear varios albums, cambiar el album activo, renombrarlo, borrarlo o salir de albums compartidos.
Amigos | Gestiona solicitudes de amistad, consulta repetidas de otros coleccionistas y habilita comparaciones directas.
Compartir | Comparte un album activo con otra persona mediante solicitudes explicitas aceptadas desde Telegram.
Marketplace | Publica ofertas, filtra el mercado por usuario o estampa, propone intercambios y coordina su cierre.
Telegram | Procesa mensajes y callbacks por webhook, ofrece menus inline, soporte bilingue y rate limiting por usuario.

## Garantias operativas

El bot aplica reglas de negocio en varias capas: el parser normaliza aliases de paises y comandos, la capa de servicio protege el flujo de albums y amistades, y PostgreSQL conserva el estado compartido de colecciones, ofertas y membresias.

Garantia | Implementacion
--- | ---
Album activo | Las acciones de inventario requieren un album activo antes de modificar o consultar la coleccion.
Comparticion explicita | Las invitaciones de album y amistad requieren aceptacion del destinatario antes de habilitar acceso.
Intercambio coordinado | Las ofertas pasan por estados `active`, `pending_confirmation`, `accepted_pending_completion`, `completed`, `cancelled` y `expired`.
Consistencia de inventario | El cierre de un intercambio actualiza cantidades solo cuando ambas partes lo confirman y la disponibilidad sigue existiendo.
Tolerancia de entrada | Los comandos aceptan aliases, nombres de pais, codigos, formatos flexibles y lotes de hasta 100 estampas.
Operacion observable | El servicio expone salud de base de datos y metricas Prometheus para inspeccion externa.

## Arquitectura de la aplicacion

La solucion se despliega como una API Express. Telegram envia mensajes y callbacks al webhook; el servicio registra al usuario, interpreta el comando, aplica la regla de negocio correspondiente y responde al chat o notifica a otros coleccionistas cuando el flujo lo requiere.

El codigo se organiza por dominios y separa transporte, logica y persistencia: `routes -> controllers -> services -> repositories`. `src/app.ts` compone la aplicacion HTTP, `src/server.ts` la ejecuta localmente, y la capa `db/` permite usar PostgreSQL como base principal o LibSQL/Turso como alternativa opcional.

El catalogo actual modela el album `Panini FIFA World Cup 2026`, incluyendo equipos, secciones especiales, nombres de jugadores, resolucion de paginas y aliases de paises para entrada libre por chat.

## Tecnologias

Area | Tecnologias
--- | ---
Core | Node.js, TypeScript y Express
Persistencia principal | PostgreSQL y `pg`
Persistencia alternativa | LibSQL / Turso mediante `@libsql/client`
Integracion | Telegram Bot API por webhook
Observabilidad | `prom-client`
Testing | Node.js Test Runner y `tsx`
Infraestructura local | Docker Compose
Despliegue | Render

## Instalacion local

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

El contrato minimo de entorno vive en [`.env.example`](./.env.example). Para usar LibSQL o Turso en lugar de PostgreSQL, agrega manualmente `DB_DRIVER=sqlite` y `LIBSQL_URL`; si la instancia es remota, tambien `LIBSQL_AUTH_TOKEN`.

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

Ejecuta la misma logica del bot sin depender de un update real de Telegram.

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

### Metricas

```http
GET /metrics
```

Expone contadores y duraciones HTTP en formato Prometheus.

## Integracion con Telegram

Crea un bot en BotFather y configura su token en `TELEGRAM_BOT_TOKEN`. Cuando la API tenga una URL publica con HTTPS, registra el webhook:

```bash
curl --request POST \
  "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://your-domain.com/api/telegram/webhook"
```

Verifica la configuracion:

```bash
curl \
  "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Observabilidad y calidad

- `GET /metrics` publica contadores y duraciones HTTP con Prometheus.
- `GET /health` valida conectividad con PostgreSQL.
- La suite incluye pruebas unitarias e integrales para parser, repositorio, API HTTP y flujo de marketplace.
- El repo incorpora `compose.yml` para levantar PostgreSQL local y `render.yaml` para desplegar la API en Render.

## Estructura del repositorio

```text
src/
|-- catalog/         # catalogos de album, paginas y estampas
|-- commands/        # mutaciones de inventario
|-- config/          # entorno y metricas
|-- controllers/     # entrada HTTP y Telegram
|-- db/              # adapters y conexion
|-- i18n/            # mensajes del bot
|-- parsers/         # comandos y normalizacion
|-- repositories/    # persistencia y consultas
|-- routes/          # rutas Express
|-- services/        # orquestacion del bot y Telegram
|-- trades/          # dominio de intercambios
|-- utils/           # rate limiting
|-- app.ts           # composicion HTTP
`-- server.ts        # entry point local

db/
|-- 01-schema.sql
|-- 02-seed-album-data.sql
|-- 03-trade-offers.sql
|-- 04-drop-sticker-fks.sql
`-- 05-friends.sql

tests/
|-- integration/
`-- unit/
```

## Despliegue

El repositorio incluye [`render.yaml`](./render.yaml) para publicar la API en Render junto con una base PostgreSQL administrada. El servicio compila TypeScript, ejecuta migraciones SQL y arranca con `node dist/server.js`.

## Licencia

Distribuido bajo la licencia ISC.
