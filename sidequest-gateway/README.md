# Sidequest Blip event relay

**Local implementation only. No live credentials, deployment, Discord connection, or Make changes were used to test this code.** This is a transport for the existing dot, not an AI or task executor.

## Runtime

Node 24.17+ (24.x), pinned discord.js 14.27.0, lockfile included. Build `npm ci --ignore-scripts`; start `npm start`; tests `npm test`. discord.js manages Gateway heartbeat/resume/reconnection. Only `Guilds` and `GuildMessages` intents (513). No privileged Message Content intent, member intent, reactions, commands, or Discord writes. Mentioned-app messages are Discord's documented content exception, but this listener does not need content at all.

Webservice-compatible: binds `0.0.0.0:$PORT` (default10000), GET `/healthz` = process liveness; `/readyz` =503 until the exact expected bot is connected, 200 when ready. Both return generic status only. Health endpoint is not a message ingress and cannot trigger a relay. Single replica only. Configure Render health path `/healthz`; externally inspect `/readyz` for gateway readiness. Do not claim free sleeping service is always-on; verify existing instance tier. No self-pings or uptime workarounds.

## Secure environment (configure separately with user approval)

- `DISCORD_BOT_TOKEN`: existing Sidequest Blip token, **not** old fishbot token. Startup checks authenticated user ID1562103884053479545 and exits on mismatch. Never reset/extract an existing Make token, print tokens, commit `.env`, or paste secrets into chat.
- `MAKE_INGRESS_URL`: authenticated webhook HTTPS URL restricted to `hook.<zone>.make.com`, no query/fragment/credentials.
- `MAKE_INGRESS_KEY`: dedicated API-key secret, >=20 chars, sent only as `x-make-apikey`.
- `PORT`: Render provided port.

Use the approved host's encrypted environment settings. Existing bot Admin means this secret is powerful even though this program has no permission-management code. Do not broaden bot privileges.

## Scope and ingress contract

Only original messageCreate objects matching all of these are eligible:
- guild1558882224781271151
- channel1562098940617293906
- author201003770069385216 (Lucas) or500864342112075796 (Freddy)
- author explicitly non-bot, not a webhook, not a partial
- actual Discord mentions.users contains bot1562103884053479545

Text, quotes, links, attachments, edited messages, DMs and other channels cannot authorize a task. Only numeric original message ID leaves this process. Content is never read by our code, logged or retained in Discord message cache.

```http
POST <MAKE_INGRESS_URL>
x-make-apikey: <MAKE_INGRESS_KEY>
Content-Type: application/json

{"message_id":"1569999999999999999"}
```

The Make ingress must authenticate *before* processing. Reject nonnumeric/extra malformed input. GET original message in fixed channel and independently verify original IDs/mention. Then call existing on-demand verified relay6707892 (or equivalent verified chain), leaving monitor/inbox/claim/reply/completion unchanged. No arbitrary Slack text/channel input. Never trust an ingress message ID as authorization. A successful synchronous ack is:

```json
{"status":"relayed","message_id":"1569999999999999999"}
```

or `status:skipped` for known ineligible/previously handled originals. Status must be200 and ID exact. This confirms **relay transport**, not Discord task completion. The existing dot still uses serial verified claim and completion rules.

A 429 may be retried only when JSON explicitly says `{"accepted":false}` meaning no effect was accepted. Maximum3 attempts, 1–30 second bounded backoff. No retries after network ambiguity, timeout, 5xx, redirect, malformed ack, or other uncertain effect. Such outcomes log a generic `uncertain`, retain in-process seen ID, and leave hourly inbox fallback to recover business work. No blind Slack resend.

## Limits / duplicates

Serial pending queue max128; process-local seen map max10000, TTL24h; fail closed at capacity. It survives reconnect in the same process, not process restarts/deploy overlap. Single Render replica and orderly rollout required. Strong cross-process relay dedup is not claimed. Existing dot claims/reaction markers mitigate duplicate task execution but are not atomic locks or exactly-once guarantees. Never rely on webhook transport alone for action authorization.

## Verification before declaring live

1. Review exact Render service/repo/plan; preserve unrelated services and rollback snapshot. Sole deploy owner operates Render.
2. Approve secret configuration and create secured Make ingress; inspect final definition.
3. Run `npm ci --ignore-scripts`, `npm test`, `node --check src.js` against final commit.
4. Deploy one instance; verify generic `gateway_ready` and `/readyz`200, expected bot identity, no secrets/content in logs.
5. Lucas or Freddy sends a new harmless @Blip request in the allowlisted playground. Verify exact Gateway relay -> Make -> Slack -> existing dot event -> original verified claim -> single reply -> completion.
6. Check negative case remains ignored; retain hourly monitor fallback. Do not replay a completed original as a live test.

## Local test evidence

Eight Node tests passed Oct26 2026. Installed import verifies Events.ClientReady/MessageCreate/ShardDisconnect/ShardResume/ShardReady and intent constants1,512. No live networking test performed. Reconnection tests exercise our readiness/dedup wrapper; Discord SDK's heartbeat implementation is delegated, not independently integration-tested.

## Official references

- https://docs.discord.com/developers/events/gateway (persistent Gateway, intents, mentioned-app exception)
- https://docs.discord.com/developers/events/gateway-events#message-create (original message/mentions)
- https://docs.discord.com/developers/events/webhook-events (does not offer ordinary guild channel message events)
- https://discord.js.org/docs/packages/discord.js/main (SDK)
- https://render.com/docs/web-services (PORT0.0.0.0 binding)
