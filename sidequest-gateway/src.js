import http from 'node:http';
import { Client, Events, GatewayIntentBits, Options } from 'discord.js';
import { readConfig, createRelay, makeSender, SCOPE } from './relay.js';

// No token or content is printed, including in exceptions.
let config;
try { config = readConfig(process.env); }
catch { console.error('configuration_invalid'); process.exit(1); }
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  allowedMentions: { parse: [] },
  makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0 }),
});
let ready = false;
const relay = createRelay({ send: makeSender(config), log: event => console.log(event) });
const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || !['/healthz', '/readyz'].includes(request.url)) {
    response.writeHead(404).end(); return;
  }
  const status = request.url === '/readyz' && !ready ? 503 : 200;
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ status: ready ? 'ready' : 'connecting' }));
});
client.on(Events.ClientReady, c => {
  if (!relay.setReady(c.user.id)) {
    console.error('wrong_bot_identity'); client.destroy(); server.close(); process.exitCode = 1; return;
  }
  ready = true; console.log('gateway_ready');
});
client.on(Events.MessageCreate, message => { relay.accept(message); });
// Keep the authenticated identity during normal resume: replayed MESSAGE_CREATE can
// arrive before RESUMED. Health is not readiness to accept authenticated replay.
client.on(Events.ShardReconnecting, () => { ready = false; console.log('gateway_reconnecting'); });
client.on(Events.ShardDisconnect, () => { ready = false; relay.disconnect(); console.log('gateway_disconnected'); });
client.on(Events.ShardResume, () => {
  ready = relay.setReady(client.user?.id); console.log(ready ? 'gateway_resumed' : 'identity_not_ready');
});
client.on(Events.ShardReady, () => {
  // Resume/re-identify retains the same in-process seen IDs.
  if (client.user?.id === SCOPE.bot) ready = relay.setReady(client.user.id);
});
client.on(Events.Error, () => { console.error('gateway_error'); });
client.on(Events.ShardError, () => { console.error('gateway_shard_error'); });
server.listen(config.port, '0.0.0.0', () => console.log('health_listener_ready'));
server.on('error', () => { console.error('health_listener_error'); client.destroy(); process.exit(1); });
client.login(config.token).catch(() => { console.error('gateway_login_failed'); server.close(); client.destroy(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  ready = false; relay.disconnect(); client.destroy(); server.close();
  const timer = setTimeout(() => process.exit(0), 12000); timer.unref();
  relay.idle().finally(() => { clearTimeout(timer); process.exit(0); });
});
