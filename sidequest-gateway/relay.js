export const SCOPE = Object.freeze({
  guild: '1558882224781271151', channel: '1562098940617293906',
  bot: '1562103884053479545', authors: Object.freeze(['201003770069385216', '500864342112075796']),
});
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);

// IDs/verified Discord mention collection only. Never inspect/log message content or attachments.
export function eligible(message) {
  return Boolean(message && !message.partial && snowflake(message.id)
    && message.guildId === SCOPE.guild && message.channelId === SCOPE.channel
    && SCOPE.authors.includes(message.author?.id) && message.author?.bot === false
    && !message.webhookId && message.mentions?.users?.has(SCOPE.bot) === true);
}

export function readConfig(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const key = env.MAKE_INGRESS_KEY;
  let url;
  try { url = new URL(env.MAKE_INGRESS_URL); } catch { throw new Error('INVALID_INGRESS_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !/^hook\.[a-z0-9-]+\.make\.com$/.test(url.hostname) || url.pathname.length < 2) {
    throw new Error('INVALID_INGRESS_URL');
  }
  if (typeof token !== 'string' || !token.trim() || typeof key !== 'string' || key.length < 20) {
    throw new Error('MISSING_SECRETS');
  }
  const port = Number(env.PORT || '10000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
  return { token, key, url: url.href, port };
}

// Retries only a cryptographically authenticated endpoint's explicit *not accepted*
// rate-limit response. Network failures, 5xx, redirects, malformed success: uncertain,
// never resend. Hourly inbox fallback will independently find unclaimed requests.
export function makeSender({ url, key, fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  return async messageId => {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      try {
        response = await fetchFn(url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { 'content-type': 'application/json', 'x-make-apikey': key },
          body: JSON.stringify({ message_id: messageId }),
        });
      } catch { return 'uncertain'; }
      // Do not print upstream text; it can contain secrets or arbitrary content.
      let data;
      try { data = JSON.parse((await response.text()).slice(0, 2048)); } catch { return 'uncertain'; }
      if (response.status === 200 && data.message_id === messageId && ['relayed', 'skipped'].includes(data.status)) {
        return data.status;
      }
      if (response.status === 429 && data.accepted === false && attempt < 2) {
        const seconds = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(seconds) ? Math.max(1000, Math.min(30000, seconds * 1000)) : 5000);
        continue;
      }
      return response.status === 401 || response.status === 403 ? 'rejected' : 'uncertain';
    }
    return 'rejected';
  };
}

export function createRelay({ send, log = () => {}, now = Date.now, maxSeen = 10000, maxPending = 128 }) {
  const seen = new Map();
  let pending = 0;
  let chain = Promise.resolve();
  let enabled = false;
  function prune() {
    const cutoff = now() - 24 * 60 * 60 * 1000;
    for (const [id, timestamp] of seen) if (timestamp < cutoff) seen.delete(id);
  }
  return {
    setReady(identity) { enabled = identity === SCOPE.bot; return enabled; },
    disconnect() { enabled = false; },
    accept(message) {
      if (!enabled || !eligible(message)) return false;
      prune();
      if (seen.has(message.id)) return false;
      // Fail closed rather than evict live IDs / create duplicate effects.
      if (seen.size >= maxSeen || pending >= maxPending) { log('capacity_blocked'); return false; }
      seen.set(message.id, now());
      pending++;
      const id = message.id;
      chain = chain.then(async () => {
        let outcome;
        try { outcome = await send(id); } catch { outcome = 'uncertain'; }
        log(['relayed', 'skipped', 'rejected'].includes(outcome) ? outcome : 'uncertain');
      }).finally(() => { pending--; });
      return true;
    },
    idle() { return chain; },
    get pending() { return pending; },
  };
}
