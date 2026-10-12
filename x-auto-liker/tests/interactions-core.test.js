// Run: node --test tests/interactions-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const T = require('../interactions-core.js');
const DAY = 86400e3;

test('actionOf reads English and Persian notification text', () => {
  assert.strictEqual(T.actionOf('Jane liked your post'), 'like');
  assert.strictEqual(T.actionOf('Jane reposted your post'), 'repost');
  assert.strictEqual(T.actionOf('Jane replied to you'), 'reply');
  assert.strictEqual(T.actionOf('Jane followed you'), 'follow');
  assert.strictEqual(T.actionOf('جین پست شما را پسندید'), 'like');
  assert.strictEqual(T.actionOf('some unrelated text'), null);
});

test('mergeEvents ignores duplicates and keeps newest first', () => {
  const now = 1e12;
  const a = { k: 'x|like|1', h: 'x', a: 'like', t: now - 2 * DAY };
  const b = { k: 'y|reply|1', h: 'y', a: 'reply', t: now - DAY };
  const r1 = T.mergeEvents([a], [a, b]);
  assert.strictEqual(r1.added, 1);
  assert.deepStrictEqual(r1.events.map((e) => e.h), ['y', 'x']);
});

test('summarize counts per account, this week, and flags quiet accounts', () => {
  const now = 1e12;
  const ev = [
    { k: '1', h: 'a', n: 'A', a: 'like', t: now - DAY },
    { k: '2', h: 'a', a: 'repost', t: now - 2 * DAY },
    { k: '3', h: 'b', a: 'reply', t: now - 40 * DAY },
  ];
  const rows = T.summarize(ev, now, { scores: { a: 300 } });
  const a = rows.find((r) => r.handle === 'a');
  assert.deepStrictEqual([a.total, a.week, a.counts.like, a.counts.repost, a.score, a.quiet], [2, 2, 1, 1, 300, false]);
  const b = rows.find((r) => r.handle === 'b');
  assert.deepStrictEqual([b.quiet, b.score], [true, null]);
  assert.strictEqual(rows[0].handle, 'a', 'higher score first');
});
