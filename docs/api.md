# API Reference

The orchestrator exposes a WebSocket endpoint for all real-time voice session communication, and a set of REST endpoints for dashboard data and agent connectivity checks.

## Base URL

```
http://localhost:8787
```

---

## WebSocket

```
ws://localhost:8787/ws
```

All UI ↔ orchestrator voice session communication flows through this single persistent WebSocket. See [api-contracts.md](api-contracts.md) for the full message schema.

---

## REST Endpoints

### `GET /health`

Server liveness check.

**Response**

```json
{ "status": "ok" }
```

---

## Smart Home Endpoints

These endpoints are used by the Smart Home Dashboard UI to query device states and send control commands directly — bypassing the voice pipeline for immediate, low-latency device control.

All Smart Home REST calls route through the `voska/hass-mcp` Docker MCP client. The Docker container is started on the first request and reused for subsequent calls.

---

### `GET /api/smarthome/ping`

Verifies connectivity to a Home Assistant instance. Used by the Settings UI "Test Connection" button.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | yes | Home Assistant base URL, e.g. `http://homeassistant.local:8123` |
| `token` | string | yes | Long-lived access token |

**Response**

```json
{
  "ok": true,
  "location_name": "Home",
  "detail": {
    "location_name": "Home",
    "total_entities": 47,
    "ha_version": "2024.12.0"
  }
}
```

**Error Response** — `503 Service Unavailable`

```json
{ "detail": "Cannot connect to Home Assistant: <reason>" }
```

---

### `GET /api/smarthome/states`

Fetches all entity states from Home Assistant, grouped by domain. Called by the Smart Home Dashboard on load and every 8 seconds for auto-refresh.

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `endpoint` | string | yes | Home Assistant base URL |
| `token` | string | yes | Long-lived access token |

**Response**

```json
{
  "domains": {
    "light": [
      {
        "entity_id": "light.living_room",
        "state": "on",
        "attributes": {
          "friendly_name": "Living Room",
          "brightness": 180,
          "color_temp": 370,
          "rgb_color": [255, 210, 160]
        },
        "last_changed": "2026-06-19T12:34:56Z",
        "last_updated": "2026-06-19T12:34:56Z"
      }
    ],
    "switch": [ ... ],
    "climate": [ ... ],
    "cover": [ ... ],
    "fan": [ ... ],
    "lock": [ ... ],
    "scene": [ ... ],
    "sensor": [ ... ],
    "binary_sensor": [ ... ]
  },
  "total": 47
}
```

Domains included: `light`, `switch`, `climate`, `cover`, `media_player`, `fan`, `lock`, `vacuum`, `input_boolean`, `scene`, `automation`, `script`, `sensor`, `binary_sensor`.

**Error Response** — `503 Service Unavailable`

```json
{ "detail": "Cannot reach Home Assistant: <reason>" }
```

---

### `POST /api/smarthome/call`

Calls a Home Assistant service to control a device. Used by the Smart Home Dashboard toggle/slider controls.

**Request Body**

```json
{
  "endpoint": "http://homeassistant.local:8123",
  "token": "eyJ...",
  "domain": "light",
  "service": "turn_on",
  "data": {
    "entity_id": "light.living_room",
    "brightness_pct": 75,
    "rgb_color": [255, 200, 100]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | yes | Home Assistant base URL |
| `token` | string | yes | Long-lived access token |
| `domain` | string | yes | HA domain: `light`, `switch`, `climate`, `cover`, `lock`, `fan`, `scene`, `automation` |
| `service` | string | yes | HA service: `turn_on`, `turn_off`, `toggle`, `open_cover`, `close_cover`, `lock`, `unlock`, `set_temperature`, `set_hvac_mode` |
| `data` | object | no | Service data — `entity_id` plus any domain-specific fields |

**Common service calls**

| Domain | Service | Key data fields |
|--------|---------|-----------------|
| `light` | `turn_on` | `entity_id`, `brightness_pct` (0–100), `rgb_color` ([r,g,b]) |
| `light` | `turn_off` | `entity_id` |
| `switch` | `turn_on` / `turn_off` | `entity_id` |
| `cover` | `open_cover` / `close_cover` | `entity_id` |
| `lock` | `lock` / `unlock` | `entity_id` |
| `climate` | `set_temperature` | `entity_id`, `temperature` |
| `scene` | `turn_on` | `entity_id` |

**Response**

```json
{ "ok": true, "result": "..." }
```

**Error Response** — `503 Service Unavailable`

```json
{ "detail": "Service call failed: <reason>" }
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request — missing or invalid parameters |
| 503 | Cannot reach Home Assistant or MCP client error |
| 500 | Internal server error |
