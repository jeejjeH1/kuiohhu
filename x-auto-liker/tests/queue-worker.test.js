// Run: node --test tests/queue-worker.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(store) {
  const created = [];
  let alarmListener, notifClick;
  const chrome = {
    alarms: { create() {}, onAlarm: { addListener: (f) => { alarmListener = f; } } },
    notifications: { create: (id, o) => created.push({ id, ...o }), clear() {}, onClicked: { addListener: (f) => { notifClick = f; } } },
    storage: { local: {
      get: async (k) => ({ drafts: store.drafts }),
      set: async (o) => { Object.assign(store, o); },
    } },
    tabs: { create() {} },
    runtime: { getURL: (p) => p },
  };
  const ctx = { chrome, importScripts: (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx)), console, Date, self: null };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'queue-worker.js'), 'utf8'), ctx);
  return { created, fire: () => alarmListener({ name: 'xal-queue' }), click: (id) => notifClick(id) };
}

test('a due scheduled post gets one reminder, then is marked notified', async () => {
  const store = { drafts: [
    { id: 'a', text: 'ready', due: Date.now() - 1000 },
    { id: 'b', text: 'later', due: Date.now() + 60e3 },
    { id: 'c', text: 'plain' },
  ] };
  const w = load(store);
  await w.fire();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(w.created.length, 1);
  assert.strictEqual(w.created[0].id, 'xal-q-a');
  assert.ok(store.drafts.find((x) => x.id === 'a').notified);
  assert.ok(!store.drafts.find((x) => x.id === 'b').notified);
  await w.fire();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(w.created.length, 1, 'no repeat reminder');
});
