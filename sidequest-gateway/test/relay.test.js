import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, SCOPE, createRelay, makeSender, readConfig } from '../relay.js';
const valid = (overrides = {}) => ({ id: '1569999999999999999', guildId: SCOPE.guild, channelId: SCOPE.channel,
  author: { id: SCOPE.authors[0], bot: false }, mentions: { users: new Map([[SCOPE.bot, {}]]) }, ...overrides });
const response = (status, data, retry = null) => ({ status, text: async () => JSON.stringify(data), headers: { get: () => retry } });

test('only exact original author/channel/guild/explicit mention; content irrelevant', () => {
  assert.equal(eligible(valid()), true);
  assert.equal(eligible(valid({ author: { id: SCOPE.authors[1], bot: false } })), true);
  for (const patch of [{guildId:'other'}, {channelId:'other'}, {author:{id:'spoof',bot:false}},
    {author:{id:SCOPE.authors[0],bot:true}}, {author:{id:SCOPE.authors[0]}}, {webhookId:'123'},
    {mentions:{users:new Map()}}, {mentions:undefined}, {partial:true}, {id:'bad'}]) {
    assert.equal(eligible(valid(patch)), false);
  }
  assert.equal(eligible(valid({content:'quoted @Blip', mentions:{users:new Map()}})), false);
});

test('readiness denies wrong bot; reconnect cannot repeat accepted ID', async () => {
  const sent = []; const relay = createRelay({send:async id => { sent.push(id); return 'relayed'; }});
  assert.equal(relay.accept(valid()), false);
  assert.equal(relay.setReady('fishbot'), false);
  assert.equal(relay.accept(valid()), false);
  relay.setReady(SCOPE.bot);
  assert.equal(relay.accept(valid()), true);
  assert.equal(relay.accept(valid()), false);
  relay.disconnect(); assert.equal(relay.accept(valid({id:'1569999999999999998'})), false);
  relay.setReady(SCOPE.bot); assert.equal(relay.accept(valid()), false);
  await relay.idle(); assert.deepEqual(sent, ['1569999999999999999']);
});

test('serial execution, bounded queue and no repeated uncertain effect', async () => {
  let release; const gate = new Promise(r => { release = r; }); const sent = [];
  const relay = createRelay({maxPending:1,send:async id => { sent.push(id); await gate; return 'uncertain'; }});
  relay.setReady(SCOPE.bot); relay.accept(valid());
  assert.equal(relay.accept(valid({id:'1569999999999999998'})),false);
  release(); await relay.idle(); assert.equal(relay.accept(valid()),false); assert.equal(sent.length,1);
});

test('outbound exact ID only, auth header, no redirect and exact response ID', async () => {
  let request;
  const send = makeSender({url:'https://hook.us2.make.com/example',key:'test-secret',fetchFn:async (url, options) => {
    request = options; return response(200,{status:'relayed',message_id:'1569999999999999999'});
  }});
  assert.equal(await send('1569999999999999999'),'relayed');
  assert.deepEqual(JSON.parse(request.body),{message_id:'1569999999999999999'});
  assert.equal(request.headers['x-make-apikey'],'test-secret'); assert.equal(request.redirect,'error');
  const mismatched = makeSender({url:'https://hook.us2.make.com/example',key:'x',fetchFn:async()=>response(200,{status:'relayed',message_id:'wrong'})});
  assert.equal(await mismatched('1569999999999999999'),'uncertain');
});

test('timeouts and server failures never blindly retry', async () => {
  for (const fn of [async()=>{throw new Error('secret must not leak');}, async()=>response(500,{error:'failed'})]) {
    let calls=0; const send=makeSender({url:'https://hook.us2.make.com/example',key:'x',fetchFn:async()=>{calls++;return fn();}});
    assert.equal(await send('1569999999999999999'),'uncertain'); assert.equal(calls,1);
  }
});

test('only explicit 429 not-accepted permits at most three attempts', async () => {
  let calls=0; const waits=[];
  const send=makeSender({url:'https://hook.us2.make.com/example',key:'x',sleep:async ms=>waits.push(ms),fetchFn:async()=>{calls++;return response(429,{accepted:false},'999');}});
  assert.equal(await send('1569999999999999999'),'uncertain'); assert.equal(calls,3); assert.deepEqual(waits,[30000,30000]);
  calls=0; const uncertain=makeSender({url:'https://hook.us2.make.com/example',key:'x',fetchFn:async()=>{calls++;return response(429,{});}});
  assert.equal(await uncertain('1569999999999999999'),'uncertain'); assert.equal(calls,1);
});

test('config rejects wrong targets, missing secrets and invalid port', () => {
  const env={DISCORD_BOT_TOKEN:'placeholder-only',MAKE_INGRESS_KEY:'placeholder-only-20-characters',MAKE_INGRESS_URL:'https://hook.us2.make.com/example'};
  assert.equal(readConfig(env).port,10000);
  for(const url of ['http://hook.us2.make.com/x','https://evil.example/x','https://hook.us2.make.com/x?key=secret','https://name:pass@hook.us2.make.com/x']) {
    assert.throws(()=>readConfig({...env,MAKE_INGRESS_URL:url}));
  }
  assert.throws(()=>readConfig({...env,DISCORD_BOT_TOKEN:''}));
  assert.throws(()=>readConfig({...env,PORT:'fish'}));
});

// SDK handles reconnect, while our same-client identity remains authenticated.
test('authenticated replay before resume accepts new ID but rejects replay duplicate', async () => {
  const sent=[]; const relay=createRelay({send:async id=>{sent.push(id);return 'relayed';}});
  relay.setReady(SCOPE.bot); relay.accept(valid()); await relay.idle();
  // A normal shardReconnecting only changes health, not relay identity.
  assert.equal(relay.accept(valid()),false);
  assert.equal(relay.accept(valid({id:'1569999999999999998'})),true);
  relay.setReady(SCOPE.bot); await relay.idle(); assert.equal(sent.length,2);
});
