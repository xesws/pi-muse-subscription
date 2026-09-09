# pi-muse-subscription

Pi provider for **Meta Muse Code coding-plan subscription** (the monthly plan used by the official `muse` CLI). This is **not** the PAYG Model API.

| You want | Use |
| --- | --- |
| Coding plan quota ($/month, Muse CLI) | **this package** → `/login muse` → `muse/muse-spark-1.3` |
| PAYG `LLM\|...` keys from [dev.meta.ai](https://dev.meta.ai) | `pi-muse-spark` → provider `meta-ai` |

Unofficial integration, same idea as `pi-agy` / built-in xAI subscription: OAuth in Pi, requests go to Meta. Use only with a Muse Code subscription you own.

## Install

```bash
pi install npm:pi-muse-subscription
```

Or pin to a git ref:

```bash
pi install git:github.com/xesws/pi-muse-subscription@v0.1.1
```

Restart Pi or `/reload`.

`pi --list-models` only lists **authenticated** providers, so `muse/*` will not appear until `/login muse` succeeds.

## Quick start

1. `/login muse` — browser device-code (same public client as the official Muse launcher: `auth.meta.com`, client id `1031625952748946`).
2. If `~/.config/muse/auth.json` already contains `access_token` / `refresh_token`, `/login muse` imports them and skips the browser. Current Muse CLI often stores tokens in the **OS keychain** instead; in that case device-code login is required.
3. `/model muse/muse-spark-1.3`
4. `/muse status`

Do **not** set `MODEL_API_KEY` / `META_API_KEY` / `LLM|` keys for this provider.

## Models

Subscription catalog (cost 0 in Pi):

- `muse/muse-spark-1.3` — current
- `muse/muse-spark-1.3-contributor` — may be used for product improvement
- `muse/muse-spark-1.2`
- `muse/muse-spark-1.2-contributor` — may be used for product improvement

Context ~1M, max output 128k. Thinking levels: `minimal` / `low` / `medium` / `high` / `xhigh` (`max` maps to `xhigh`). Muse CLI `ultra` is clamp-to-`xhigh` on the wire; Pi has no `ultra` tier.

## How it works

- OIDC device-code against `https://auth.meta.com`
- On each request, Pi mints a subscription Model API key via `POST https://api.meta.ai/muse-code/key` (same as the official Muse CLI). The OAuth access token is **not** sent to `/v1`.
- Inference: OpenAI Responses at `https://api.meta.ai/v1` with the minted `LLM|` key
- Tokens stored in `~/.pi/agent/auth.json` under `muse` (OAuth). Minted keys are cached in memory only.
- **No refresh token by design.** Meta's device flow rejects every `scope` (`invalid_scope`), so the token response carries no `refresh_token`, and its `expires_in` is far shorter than the token's real lifetime (measured: a token still minted keys 29 h after its local expiry). Since v0.1.2 a refresh-less credential is treated as long-lived instead of expiring on the OIDC `expires_in`; Pi keeps using it until Meta answers 401/403, then reports `Muse session expired or was revoked — run /login muse again`. Before v0.1.2 the short expiry triggered a refresh that could never succeed, so Pi asked for a new login roughly every 50 minutes.

## Commands

| Command | Description |
| --- | --- |
| `/login muse` | Sign in (import CLI file tokens when present) |
| `/muse status` | Auth source, models, CLI import hint (no secrets) |
| `/muse help` | Short usage |

## Security

- Never commit `~/.pi/agent/auth.json` or `~/.config/muse/auth.json`
- `/muse status` does not print tokens
- This package does not read the OS keychain
