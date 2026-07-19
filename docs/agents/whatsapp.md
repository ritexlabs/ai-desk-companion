# WhatsApp Agent

Send WhatsApp messages and read incoming ones by voice — powered by the Meta Cloud API and a Cloudflare Tunnel for the public webhook.

**Navigation:** [← All Agents](../agents.md) | [Architecture](../architecture.md) | [Setup](../setup.md)

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Message flow](#3-message-flow)
4. [Prerequisites](#4-prerequisites)
5. [Part A — Meta Developer setup](#part-a--meta-developer-setup)
6. [Part B — Cloudflare Tunnel setup](#part-b--cloudflare-tunnel-setup)
7. [Part C — App configuration](#part-c--app-configuration)
8. [Part D — Register the webhook in Meta](#part-d--register-the-webhook-in-meta)
9. [Part E — Test end to end](#part-e--test-end-to-end)
10. [Voice commands](#10-voice-commands)
11. [Troubleshooting](#11-troubleshooting)
12. [Security notes](#12-security-notes)

---

## 1. Overview

The WhatsApp agent lets you:

- **Send messages** by voice — *"Send WhatsApp to Mom saying I'll be home by 7"*
- **Read incoming messages** — *"Any WhatsApp messages for me?"*
- Manage a personal **contact book** (Name → Phone) inside Settings
- Receive real-time messages from any WhatsApp number via a webhook

The agent uses the **Meta WhatsApp Business Cloud API** (free tier, no physical device required). Meta delivers incoming messages to a public HTTPS URL — the **webhook** — which is provided by a **Cloudflare Tunnel** running locally on your machine.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Machine (localhost)                     │
│                                                                  │
│  ┌─────────────┐      ┌──────────────────┐                      │
│  │  Robo UI    │◄────►│   Orchestrator   │                      │
│  │  (React)    │  WS  │  (FastAPI :8787) │                      │
│  └─────────────┘      └────────┬─────────┘                      │
│                                │  WhatsApp Agent                │
│                                │  - send via Meta API           │
│                                │  - receive via webhook         │
│                                │                                │
│                       ┌────────▼─────────┐                      │
│                       │  cloudflared     │                      │
│                       │  (Tunnel client) │                      │
│                       └────────┬─────────┘                      │
└────────────────────────────────│────────────────────────────────┘
                                 │  Encrypted tunnel
                    ┌────────────▼───────────────┐
                    │    Cloudflare Network       │
                    │  whatsapp.yourdomain.com    │
                    │  (or *.trycloudflare.com)   │
                    └────────────┬───────────────┘
                                 │  HTTPS
                    ┌────────────▼───────────────┐
                    │     Meta Cloud API          │
                    │  graph.facebook.com/v18.0   │
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │     WhatsApp Users          │
                    │  (any phone number)         │
                    └────────────────────────────┘
```

---

## 3. Message flow

### Sending a message (outbound)

```
You say: "Send WhatsApp to Mom saying dinner is ready"
         │
         ▼
   Robo UI (STT) ──► Orchestrator ──► WhatsApp Agent
                                            │
                            Looks up "Mom" in contacts
                                            │
                            POST /messages to Meta API
                                            │
                                    Meta delivers to
                                   Mom's WhatsApp ✓
```

### Receiving a message (inbound)

```
Someone sends you a WhatsApp message
         │
         ▼
   Meta Cloud API
         │  POST /webhook/whatsapp
         ▼
   Cloudflare Tunnel (whatsapp.yourdomain.com)
         │  proxied to localhost:8787
         ▼
   Orchestrator ──► stores in memory
         │
         ▼
You say: "Any WhatsApp messages?"
         │
         ▼
   WhatsApp Agent reads stored messages ──► Robo speaks them aloud
```

---

## 4. Prerequisites

| Requirement | Notes |
|-------------|-------|
| A Meta (Facebook) account | Free, personal account works |
| A phone number for test messages | Any number — Meta provides a free test number |
| `cloudflared` installed | Free, open source — install steps below |
| App running (`python3 launch.py`) | Orchestrator must be up before registering the webhook |

> **No WhatsApp Business account or physical device is required.** Meta provides a free cloud-hosted test number.

---

## Part A — Meta Developer setup

### A1. Create a Meta Developer account

1. Go to **[developers.facebook.com](https://developers.facebook.com)**
2. Click **Get Started** (top right)
3. Sign in with your Facebook / Meta account
4. Accept the developer terms
5. Your developer account is ready — you will land on **My Apps**

### A2. Create a new app

1. Click **Create App**
2. Use case: select **Other** → click **Next**
3. App type: select **Business** → click **Next**
4. Fill in:
   - **App name**: e.g. `Robo WhatsApp`
   - **App contact email**: your email
   - **Business portfolio**: leave blank (or select if you have one)
5. Click **Create App** — Meta may ask for your Facebook password

You will land on the App Dashboard.

### A3. Add the WhatsApp product

1. Scroll down to **Add products to your app**
2. Find **WhatsApp** and click **Set up**
3. You are now in the **WhatsApp → Quickstart** screen

### A4. Get your test credentials

On the **Quickstart** page you will see a panel called **Send and receive messages**:

1. **From number** — Meta provides a free test phone number. Copy the **Phone number ID** (a long numeric string like `123456789012345`). This is your `WHATSAPP_PHONE_NUMBER_ID`.

2. **Temporary access token** — Click **Generate** next to the access token field. Copy the token (starts with `EAA...`). This is your `WHATSAPP_ACCESS_TOKEN`.

   > Temporary tokens expire after 24 hours. For permanent access, create a **System User token** — see [A5](#a5-optional-create-a-permanent-system-user-token).

3. **To number** — Click **Manage phone number list** and add your own phone number (the one you will test with). Meta will send a verification code to that number.

### A5. Optional — Create a permanent system user token

For a token that never expires:

1. Go to **[business.facebook.com](https://business.facebook.com)**
2. Navigate to **Settings → Users → System Users**
3. Click **Add** → name it `robo-system-user` → role **Admin**
4. Click **Generate New Token**
5. Select your app from the dropdown
6. Enable permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
7. Click **Generate Token** — copy it immediately (shown once)

### A6. Note your App Secret

You will need this later to validate incoming webhook signatures (recommended):

1. Go to **App Dashboard → App Settings → Basic**
2. Click **Show** next to **App Secret**
3. Copy it — this is your `WHATSAPP_APP_SECRET`

---

## Part B — Cloudflare Tunnel setup

A Cloudflare Tunnel creates a secure HTTPS connection from the internet to your locally running orchestrator. Meta requires a publicly reachable HTTPS URL for the webhook — this is how you provide one without opening firewall ports.

You have two options:

| Option | URL type | Account needed | Stable URL |
|--------|----------|---------------|-----------|
| **Quick tunnel** | `*.trycloudflare.com` | None | No — changes each restart |
| **Named tunnel** | `whatsapp.yourdomain.com` | Free Cloudflare account | Yes — permanent |

> If you only want to test, use the quick tunnel. For daily use, set up a named tunnel with your own domain.

### B1. Install cloudflared

**macOS (Homebrew — recommended):**
```bash
brew install cloudflare/cloudflare/cloudflared
```

**macOS (direct download):**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz | tar xz
sudo mv cloudflared /usr/local/bin/
```

**Verify:**
```bash
cloudflared --version
# cloudflared version 2024.x.x
```

---

### Option B2a — Quick tunnel (no account, no domain)

No setup needed. When you enable the WhatsApp agent in the app, it automatically starts a quick tunnel and shows you a `trycloudflare.com` URL in the **Webhook Callback URL** panel.

**Limitation:** the URL changes every time the tunnel restarts. You will need to update the webhook URL in the Meta Developer Console after each restart.

Skip to [Part C](#part-c--app-configuration).

---

### Option B2b — Named tunnel (recommended, stable URL)

#### B2b-1. Create a Cloudflare account and add your domain

1. Go to **[dash.cloudflare.com](https://dash.cloudflare.com)** → **Sign up** (free)
2. Click **Add a site** and enter your domain name
3. Select the **Free** plan
4. Cloudflare will show you two nameservers (e.g. `ns1.cloudflare.com`). Update your domain's nameservers at your registrar to point to these.
5. Wait for DNS propagation (usually under 30 minutes)
6. Your domain now has **DNS Setup: Full** — you can see this in the Cloudflare dashboard

#### B2b-2. Log in to cloudflared

```bash
cloudflared tunnel login
```

A browser window opens. Sign in to Cloudflare and select your domain. A credentials file is saved to `~/.cloudflared/cert.pem`.

#### B2b-3. Create the tunnel

```bash
cloudflared tunnel create whatsapp
```

Output:
```
Created tunnel whatsapp with id 35922a9b-baed-4081-8361-9f4545f0da10
Tunnel credentials written to /Users/<you>/.cloudflared/35922a9b-baed-4081-8361-9f4545f0da10.json
```

Copy the **tunnel UUID** (the long hex string). You will need it in the next step.

#### B2b-4. Create the config file

In the root of the `ai-desk-companion` repository, copy the example:

```bash
cp .cloudflared/whatsapp-config.example.yml .cloudflared/whatsapp-config.yml
```

Edit `.cloudflared/whatsapp-config.yml` and fill in your values:

```yaml
tunnel: 35922a9b-baed-4081-8361-9f4545f0da10   # your tunnel UUID
credentials-file: /Users/<you>/.cloudflared/35922a9b-baed-4081-8361-9f4545f0da10.json

ingress:
  - hostname: whatsapp.yourdomain.com
    service: http://localhost:8787
  - service: http_status:404
```

> This file is already in `.gitignore` — it will never be committed.

#### B2b-5. Add your domain to .env

Open `apps/orchestrator/.env` and add:

```dotenv
CLOUDFLARE_DOMAIN=yourdomain.com
```

The app reads this to construct the expected URL (`https://whatsapp.yourdomain.com`) and pre-fills it in the Settings panel.

#### B2b-6. Verify (optional manual test)

You can verify the tunnel works before starting the app:

```bash
cloudflared tunnel --config .cloudflared/whatsapp-config.yml run whatsapp
```

You should see:
```
INF Starting tunnel tunnelID=35922a9b-...
INF Registered tunnel connection ...
```

Press `Ctrl+C`. The app will start and manage the tunnel automatically from now on.

---

## Part C — App configuration

### C1. Set environment variables

Open `apps/orchestrator/.env` (create it from `.env.example` if it doesn't exist):

```dotenv
# ── WhatsApp credentials ──────────────────────────────────────────
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxx...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=robo-whatsapp-verify

# App Secret (from Meta → App Settings → Basic → App Secret)
# Strongly recommended — validates that webhooks truly come from Meta
WHATSAPP_APP_SECRET=abc123...

# Your contacts (Name: +E164number, one per line)
WHATSAPP_CONTACTS=Mom: +919876543210\nJohn: +14155552671

# ── Cloudflare Tunnel (only for named tunnel) ─────────────────────
CLOUDFLARE_DOMAIN=yourdomain.com
```

> **Security:** Never commit `.env`. It is already in `.gitignore`.

### C2. Configure via the Settings UI

You can also enter credentials directly in the app (they are stored in browser localStorage — never sent to any server except through the orchestrator):

1. Start the app: `python3 launch.py`
2. Click the **⚙ gear icon** → **Agents** tab
3. Expand **WhatsApp**
4. Fill in:
   - **Phone Number ID** — from Meta Quickstart
   - **Access Token** — from Meta Quickstart (or system user token)
   - **Webhook Verify Token** — any string you choose (e.g. `robo-whatsapp-verify`)
   - **Contacts** — one contact per line: `Name: +CountryCodeNumber`
5. Click **Test Connection** — it should show "Connected to [your number]"
6. Toggle the switch to **enable** the agent

When you enable the agent, the tunnel starts automatically and the **Webhook Callback URL** panel shows the live URL.

---

## Part D — Register the webhook in Meta

> The app must be running and the tunnel must be active before doing this step.

### D1. Note your callback URL

In the app Settings → WhatsApp → **Webhook Callback URL** panel, copy the URL. It looks like:

- Named tunnel: `https://whatsapp.yourdomain.com/webhook/whatsapp`
- Quick tunnel: `https://random-name.trycloudflare.com/webhook/whatsapp`

### D2. Register in Meta Developer Console

1. Go to **[developers.facebook.com](https://developers.facebook.com)** → Your App
2. Left sidebar: **WhatsApp → Configuration**
3. Scroll to the **Webhook** section
4. Click **Edit**
5. Fill in:
   - **Callback URL**: paste the URL from the app
   - **Verify token**: the same string you set as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (e.g. `robo-whatsapp-verify`)
6. Click **Verify and save**

Meta will send a `GET` request to your callback URL with a challenge. If everything is working, the orchestrator responds with the challenge and Meta shows **"Verified ✓"**.

### D3. Subscribe to the messages field

After verification:

1. Still in **WhatsApp → Configuration → Webhooks**
2. Click **Manage** next to the webhook
3. Find the **messages** field and click **Subscribe**
4. Click **Done**

Your webhook is now live. Any message sent to your test number will be delivered to the orchestrator in real time.

---

## Part E — Test end to end

### E1. Test sending a message

1. Make sure the WhatsApp number you added in Meta Quickstart is in your contacts list (e.g. `Me: +919999999999`)
2. Open the app and say:

   > *"Hey Robo, send WhatsApp to Me saying hello from Robo"*

3. Robo confirms: *"Message sent to Me"*
4. Check your phone — the message should arrive within a few seconds

### E2. Test receiving a message

1. From your phone, send a WhatsApp message to the test number Meta provided
2. Wait 2–5 seconds
3. Say to Robo:

   > *"Hey Robo, any WhatsApp messages?"*

4. Robo reads the message aloud: *"You have 1 new message. From [your name]: [message text]"*

### E3. Verify webhook delivery in Meta

1. Go to Meta Developer Console → WhatsApp → Configuration
2. Click **Send test notification** (optional) or check the **Webhook logs**
3. You should see successful `200 OK` responses

---

## 10. Voice commands

| What you say | What happens |
|---|---|
| *"Send WhatsApp to [Name] saying [message]"* | Sends a message to the contact |
| *"WhatsApp [Name] that [message]"* | Same as above |
| *"Any WhatsApp messages?"* | Reads unread messages aloud |
| *"Do I have any WhatsApp messages?"* | Same as above |
| *"Read my WhatsApp messages"* | Same as above |
| *"Who messaged me on WhatsApp?"* | Lists senders |

Contact names are matched case-insensitively. *"Mom"*, *"mom"*, and *"MOM"* all resolve to the same contact.

---

## 11. Troubleshooting

### "Callback URL or verify token couldn't be validated"

Meta returned an error when you clicked **Verify and save**.

**Check:**
1. Is the orchestrator running? Open `http://localhost:8787` in your browser — you should see JSON.
2. Is the tunnel active? The Settings panel should show a green **"Cloudflare tunnel running"** banner.
3. Is the verify token identical in both places?
   - In the app Settings → Webhook Verify Token field
   - In the Meta Developer Console → Verify token field
4. Test the webhook endpoint directly:
   ```bash
   curl "https://whatsapp.yourdomain.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=robo-whatsapp-verify&hub.challenge=test123"
   # Expected response: test123
   ```
5. If using a quick tunnel, the URL changed since you last registered — copy the new URL from the app and re-register.

### Tunnel not starting

```
cloudflared exited without providing a URL
```

- Confirm `cloudflared` is installed: `cloudflared --version`
- For named tunnel: confirm `.cloudflared/whatsapp-config.yml` exists and the UUID matches your tunnel
- Run manually to see raw output:
  ```bash
  cloudflared tunnel --config .cloudflared/whatsapp-config.yml run whatsapp
  ```

### Messages not arriving

1. Confirm the **messages** webhook field is subscribed (Meta → Configuration → Manage)
2. Check the tunnel is still active (tunnels can restart after network drops)
3. Look at orchestrator logs for `POST /webhook/whatsapp` entries

### "Invalid or expired access token"

Temporary tokens expire after 24 hours. Either:
- Regenerate the token in Meta Quickstart and update `WHATSAPP_ACCESS_TOKEN` in `.env`
- Create a permanent system user token — see [A5](#a5-optional-create-a-permanent-system-user-token)

### Contact not found

```
Robo: "I don't have a contact named John in your WhatsApp contacts list."
```

- Check Settings → WhatsApp → Contacts
- Format must be `Name: +CountryCodeNumber` (e.g. `John: +14155552671`)
- Phone numbers must include the country code and the `+` prefix
- Ensure the contact is on the same WhatsApp test number's allowed list in Meta Quickstart

---

## 12. Security notes

| What | How it is protected |
|------|-------------------|
| `WHATSAPP_ACCESS_TOKEN` | Stored in `.env` on the server, never sent to the browser, proxied through the orchestrator for API calls |
| `WHATSAPP_APP_SECRET` | Used server-side only to validate `X-Hub-Signature-256` on every incoming webhook POST |
| Webhook endpoint | Only accepts POST from Meta; validated via HMAC-SHA256 signature when `WHATSAPP_APP_SECRET` is set |
| Cloudflare tunnel | Encrypted end-to-end; `cloudflared` authenticates with Cloudflare using your credentials file |
| Contact list | Stored in browser `localStorage`, never leaves your machine except in the WebSocket session payload |
| Orchestrator port | Binds to `127.0.0.1` only — not reachable from your network, only through the tunnel |

> **Strongly recommended:** set `WHATSAPP_APP_SECRET` in your `.env`. Without it, anyone who discovers your webhook URL can inject fake messages.
