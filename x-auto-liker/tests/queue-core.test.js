// Run: node --test tests/queue-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../queue-core.js');

test('charCount counts each link as 23 characters', () => {
  assert.strictEqual(Q.charCount('hi https://example.com/very/long/path?x=1'), 'hi '.length + 23);
  assert.strictEqual(Q.charCount('سلام'), 4);
});

test('sortQueue puts scheduled items first, earliest first, then newest drafts', () => {
  const items = [
    { id: 'd1', text: 'old draft', at: 1 },
    { id: 's2', text: 'later', due: 300 },
    { id: 's1', text: 'sooner', due: 100 },
    { id: 'd2', text: 'new draft', at: 5 },
    { id: 'x', text: 'posted', due: 50, sent: 60 },
  ];
  const q = Q.sortQueue(items);
  assert.deepStrictEqual(q.scheduled.map((x) => x.id), ['s1', 's2']);
  assert.deepStrictEqual(q.drafts.map((x) => x.id), ['d2', 'd1']);
});

test('dueNow returns only open scheduled items whose time passed and not yet notified', () => {
  const items = [
    { id: 'a', text: '', due: 100 },
    { id: 'b', text: '', due: 900 },
    { id: 'c', text: '', due: 100, notified: 150 },
    { id: 'd', text: '', due: 100, sent: 120 },
    { id: 'e', text: '' },
  ];
  assert.deepStrictEqual(Q.dueNow(items, 500).map((x) => x.id), ['a']);
});

test('intentUrl encodes the text for X composer', () => {
  assert.strictEqual(Q.intentUrl('a b&c'), 'https://x.com/intent/post?text=a%20b%26c');
});
