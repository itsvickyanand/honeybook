# Avantus → TallyPrime Bridge Agent

This is a separate Electron desktop application that pairs with an Avantus tenant and pushes invoices to a locally-installed TallyPrime instance via its XML (ODBC) interface.

## Why a desktop agent?

TallyPrime runs on the vendor's local Windows machine; it does not expose a public API. The agent bridges Avantus' cloud → Tally's local XML interface.

## Protocol

Server side (Avantus) exposes:
- **GET `/api/accounting/tally/bridge?token=<agentToken>`** — returns up to 20 pending envelopes:
  ```json
  {
    "envelopes": [
      { "id": "log-id", "kind": "invoice", "xml": "<TALLY-INVOICE …>" },
      ...
    ]
  }
  ```
- **POST `/api/accounting/tally/bridge?token=<agentToken>`** — agent ACKs successes / reports errors:
  ```json
  {
    "ack": ["log-id-1", "log-id-2"],
    "errors": [{ "id": "log-id-3", "error": "Tally rejected: missing GSTIN" }]
  }
  ```

## Agent responsibilities

1. **Pair**: vendor copies a pairing token from `/app/settings/integrations` → pastes into agent UI. Agent stores it locally (e.g. Electron's `safeStorage`).
2. **Poll**: every 60s, hit GET endpoint with the token.
3. **Push to Tally**: for each envelope, POST the XML to `http://localhost:9000` (TallyPrime's default XML port — configurable in agent settings).
4. **ACK**: POST back results.
5. **Auto-update**: check for new agent versions; respect Tally version compatibility.

## Skeleton (Electron + Node)

```
tally-agent/
  package.json          # electron + electron-builder
  main.js               # main process: poll loop, Tally XML POST
  preload.js            # bridge between main and renderer
  renderer/
    index.html
    app.js              # pairing UI, status, logs
  build/
    icon.icns / .ico
```

A minimal `main.js` skeleton:

```js
const { app, BrowserWindow, safeStorage } = require('electron');
const fetch = require('node-fetch');

const SERVER = process.env.AVANTUS_URL || 'https://app.avantus.example';
const POLL_INTERVAL_MS = 60_000;

async function pollOnce(token) {
  const res = await fetch(`${SERVER}/api/accounting/tally/bridge?token=${token}`);
  if (!res.ok) return;
  const { envelopes } = await res.json();
  const ack = [];
  const errors = [];
  for (const env of envelopes) {
    try {
      await fetch('http://localhost:9000', {
        method: 'POST',
        headers: { 'content-type': 'text/xml' },
        body: env.xml,
      });
      ack.push(env.id);
    } catch (e) {
      errors.push({ id: env.id, error: e.message });
    }
  }
  if (ack.length || errors.length) {
    await fetch(`${SERVER}/api/accounting/tally/bridge?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ack, errors }),
    });
  }
}

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, webPreferences: { preload: __dirname + '/preload.js' } });
  win.loadFile('renderer/index.html');
  const token = safeStorage.decryptString(/* stored cipher */);
  if (token) setInterval(() => pollOnce(token).catch(() => {}), POLL_INTERVAL_MS);
});
```

## Security

- Token never leaves the agent's local secure storage.
- Tally XML posts go to `localhost` — agent does not require inbound network exposure.
- HTTPS-only when talking to Avantus.
- Agent signs its build (Apple notarisation on macOS, code signing on Windows).

## Building

```bash
cd tally-agent
npm install
npm run dist           # electron-builder dmg + nsis
```

## What's in this repo

Just this README + the protocol contract that the server side at `/api/accounting/tally/bridge` already implements. The actual Electron app is a separate project. Use this README as your spec when you build it.
