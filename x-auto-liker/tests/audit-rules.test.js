// Run: node --test tests/audit-rules.test.js
const test = require('node:test');
const assert = require('node:assert');
const { auditProfile } = require('../content/audit-rules.js');

const full = {
  handle: 'me', name: 'Me Real', hasAvatar: true, hasBanner: true, hasPinned: true, location: 'Tehran', url: 'x.com',
  bio: 'Writing about DeFi, on-chain analytics and macro trading. Weekly threads on #Ethereum.', followers: 500, following: 300,
};

test('a complete profile scores 100 with no tips', () => {
  const r = auditProfile(full);
  assert.strictEqual(r.score, 100);
  assert.deepStrictEqual(r.tips, []);
});

test('an empty profile scores 0 and gives a tip per failed check', () => {
  const r = auditProfile({ handle: 'me', name: 'me', hasAvatar: false, hasBanner: false, bio: 'hi', hasPinned: false, followers: 10, following: 900 });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.tips.length, r.checks.length + 1);
});

test('follow ratio is judged only when both counts are known', () => {
  const r = auditProfile({ ...full, followers: null, following: null });
  assert.strictEqual(r.checks.find((c) => c.id === 'ratio').ok, true);
});

test('a small account with many followings fails the ratio check', () => {
  const r = auditProfile({ ...full, followers: 20, following: 900 });
  assert.strictEqual(r.checks.find((c) => c.id === 'ratio').ok, false);
});
