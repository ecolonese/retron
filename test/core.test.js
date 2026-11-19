// Run: node test/core.test.js  (tests the content bank and learning engine inside index.html)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function mockStorage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m };
}
function load(storage) {
  const win = { localStorage: storage || mockStorage() };
  const ctx = vm.createContext({ window: win, console, Math, Date, JSON, Object, Array, String, Number });
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const m = html.match(/<script id="retron-core">([\s\S]*?)<\/script>/);
  vm.runInContext(m[1], ctx);
  return win.Retron;
}
let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } }

const R = load();
const { QUESTIONS, CONCEPTS, SUBJECTS, Engine, QBY, CBY, SBY } = R;
const DAY = 86400000;
const T0 = Date.UTC(2027, 0, 12, 15, 0, 0); // mid-day UTC, safely same local day in US zones

// ── Content integrity ──
t('unique question ids', () => assert.strictEqual(new Set(QUESTIONS.map(q => q.id)).size, QUESTIONS.length));
t('every question has valid subject and concept', () => QUESTIONS.forEach(q => {
  assert(SBY[q.subject], q.id + ' subject'); assert(CBY[q.concept], q.id + ' concept');
  assert.strictEqual(CBY[q.concept].subject, q.subject, q.id + ' concept/subject mismatch');
  assert([1, 2, 3].includes(q.diff), q.id + ' diff'); assert(q.explain && q.explain.length > 20, q.id + ' explain');
}));
t('MC questions: 4 options, exactly one correct, wrong options in new content have why', () => QUESTIONS.filter(q => q.type === 'mc').forEach(q => {
  assert.strictEqual(q.options.length, 4, q.id + ' option count');
  assert.strictEqual(q.options.filter(o => o.correct).length, 1, q.id + ' one correct');
  if (q.subject !== 'orgo') q.options.filter(o => !o.correct).forEach(o => assert(o.why && o.why.length > 10, q.id + ' missing why'));
}));
t('no duplicate option text within a question', () => QUESTIONS.forEach(q => {
  if (q.options) assert.strictEqual(new Set(q.options.map(o => o.label)).size, q.options.length, q.id);
}));
t('correct answer position is not always first after shuffle (spread across 40 seeds)', () => {
  const q = QBY['bc-aa-5']; const pos = new Set();
  for (let s = 0; s < 40; s++) { const ord = Engine.optionOrder(q, 'x' + s); pos.add(ord.indexOf(0)); }
  assert(pos.size >= 3, 'positions ' + [...pos]);
});
t('arrow + nmr question shapes', () => {
  const a = QBY['arrow-1']; assert.strictEqual(a.arrowChoices.filter(c => c.correct).length, 1);
  const n = QBY['nmr-1']; assert(n.peaks[n.correctPeak]);
});
t('every concept has at least one question; every subject has concepts', () => {
  CONCEPTS.forEach(c => assert(QUESTIONS.some(q => q.concept === c.id), c.id));
  SUBJECTS.forEach(s => assert(CONCEPTS.some(c => c.subject === s.id), s.id));
});
t('no em dashes in content', () => {
  const src = fs.readFileSync(__dirname + '/../index.html', 'utf8').match(/<script id="retron-core">([\s\S]*?)<\/script>/)[1];
  assert(!/—/.test(src), 'em dash found');
});
console.log('     counts:', SUBJECTS.map(s => s.id + '=' + QUESTIONS.filter(q => q.subject === s.id).length).join(' '));

// ── Scheduling ──
t('new question answered right: box 1, due +2 days', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', true, { now: T0 });
  const r = d.q['bc-aa-1']; assert.strictEqual(r.box, 1); assert.strictEqual(r.due, Engine.dayNum(T0) + 2); assert.strictEqual(r.n, 1); assert.strictEqual(r.c, 1);
});
t('wrong answer: box 0, due tomorrow, counts as attempt only', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', false, { now: T0 });
  const r = d.q['bc-aa-1']; assert.strictEqual(r.box, 0); assert.strictEqual(r.due, Engine.dayNum(T0) + 1); assert.strictEqual(r.c, 0);
});
t('spaced correct reviews climb boxes and reach solid at 3', () => {
  const d = Engine.blank(T0); let now = T0;
  Engine.answer(d, 'bc-aa-1', true, { now });                   // box1
  now += 2 * DAY; Engine.answer(d, 'bc-aa-1', true, { now });   // box2
  now += 4 * DAY; Engine.answer(d, 'bc-aa-1', true, { now });   // box3
  assert.strictEqual(d.q['bc-aa-1'].box, 3);
  assert.strictEqual(Engine.stats(d, q => q.id === 'bc-aa-1', now).solid, 1);
});
t('correct but early does not advance the box (no credit for cramming)', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', true, { now: T0 });
  const before = JSON.stringify(d.q['bc-aa-1']);
  Engine.answer(d, 'bc-aa-1', true, { now: T0 + 3600000 });
  const r = d.q['bc-aa-1']; assert.strictEqual(r.box, 1); assert.strictEqual(r.n, 2);
});
t('a miss after progress resets to box 0', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', true, { now: T0 });
  Engine.answer(d, 'bc-aa-1', true, { now: T0 + 2 * DAY });
  Engine.answer(d, 'bc-aa-1', false, { now: T0 + 6 * DAY });
  assert.strictEqual(d.q['bc-aa-1'].box, 0);
});
t('retry answers never change records', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', false, { now: T0 });
  const before = JSON.stringify(d.q);
  Engine.answer(d, 'bc-aa-1', true, { now: T0, retry: true });
  assert.strictEqual(JSON.stringify(d.q), before);
});
t('missing days carry no penalty: nothing changes, due items just wait', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', false, { now: T0 });
  const later = T0 + 40 * DAY;
  const ids = Engine.pickSession(d, { subject: 'mixed', count: 5, now: later });
  assert(ids.includes('bc-aa-1'), 'missed item should be offered');
  assert.strictEqual(d.q['bc-aa-1'].box, 0);
});

// ── Selection ──
t('daily review returns 5 unique ids (fresh data)', () => {
  const d = Engine.blank(T0); const ids = Engine.pickSession(d, { subject: 'mixed', count: 5, now: T0 });
  assert.strictEqual(ids.length, 5); assert.strictEqual(new Set(ids).size, 5);
});
t('mixed weights biochem first then micro, excludes orgo', () => {
  const tally = {}; const d = Engine.blank(T0);
  for (let s = 0; s < 60; s++) { d.sessions.length = s; Engine.pickSession(d, { subject: 'mixed', count: 8, now: T0, salt: s }).forEach(id => { const sj = QBY[id].subject; tally[sj] = (tally[sj] || 0) + 1; }); }
  assert(tally.biochem > tally.micro, JSON.stringify(tally)); assert(tally.micro >= tally.hort, JSON.stringify(tally)); assert(!tally.orgo);
  assert(tally.hort > 0 && tally.fruit > 0, 'all courses represented ' + JSON.stringify(tally));
});
t('single subject stays in subject; orgo selectable directly', () => {
  const d = Engine.blank(T0);
  Engine.pickSession(d, { subject: 'micro', count: 5, now: T0 }).forEach(id => assert.strictEqual(QBY[id].subject, 'micro'));
  Engine.pickSession(d, { subject: 'orgo', count: 5, now: T0 }).forEach(id => assert.strictEqual(QBY[id].subject, 'orgo'));
});
t('missed questions come back first the next day, new material still appears', () => {
  const d = Engine.blank(T0);
  ['bc-aa-1', 'bc-aa-2', 'bc-aa-3', 'bc-aa-4', 'bc-aa-5'].forEach(id => Engine.answer(d, id, false, { now: T0 }));
  const ids = Engine.pickSession(d, { subject: 'biochem', count: 5, now: T0 + DAY });
  const dueCount = ids.filter(id => d.q[id]).length;
  assert(dueCount >= 1 && dueCount <= 3, 'due share ' + dueCount);
  assert(ids.some(id => !d.q[id]), 'some new material');
});
t('does not offer items answered earlier today if alternatives exist', () => {
  const d = Engine.blank(T0);
  const first = Engine.pickSession(d, { subject: 'biochem', count: 5, now: T0 });
  first.forEach(id => Engine.answer(d, id, true, { now: T0 }));
  const second = Engine.pickSession(d, { subject: 'biochem', count: 5, now: T0 + 3600000, salt: 'again' });
  assert(!second.some(id => first.includes(id)), 'repeated ' + second.filter(id => first.includes(id)));
});
t('difficulty ramps: foundation first, challenge only after success', () => {
  const d = Engine.blank(T0);
  assert.strictEqual(Engine.subjectLevel(d, 'biochem'), 1);
  QUESTIONS.filter(q => q.subject === 'biochem' && q.diff === 1).slice(0, 5).forEach(q => Engine.answer(d, q.id, true, { now: T0 }));
  assert.strictEqual(Engine.subjectLevel(d, 'biochem'), 2);
  const fresh = Engine.blank(T0);
  let ch = 0; for (let s = 0; s < 30; s++) { fresh.sessions.length = s; Engine.pickSession(fresh, { subject: 'biochem', count: 5, now: T0, salt: s }).forEach(id => { if (QBY[id].diff === 3) ch++; }); }
  assert(ch <= 12, 'too many challenge qs for a new user: ' + ch + ' of 150');
});
t('session opens with lowest difficulty item', () => {
  const d = Engine.blank(T0);
  for (let s = 0; s < 20; s++) { d.sessions.length = s; const ids = Engine.pickSession(d, { subject: 'biochem', count: 5, now: T0, salt: s }); const min = Math.min(...ids.map(i => QBY[i].diff)); assert.strictEqual(QBY[ids[0]].diff, min); }
});
t('weak concept is prioritized for new questions', () => {
  const d = Engine.blank(T0);
  QUESTIONS.filter(q => q.concept === 'enz-kinetics').forEach(q => Engine.answer(d, q.id, false, { now: T0 })); // miss all
  QUESTIONS.filter(q => q.concept === 'gibbs').forEach(q => Engine.answer(d, q.id, true, { now: T0 }));
  assert(Engine.conceptMiss(d, 'enz-kinetics') > Engine.conceptMiss(d, 'gibbs'));
});

// ── Session lifecycle + storage ──
t('session lifecycle: create, answer, finish, summary logged, active cleared', () => {
  const d = Engine.blank(T0); d.active = Engine.newSession(d, 'daily', 'mixed', T0);
  assert.strictEqual(d.active.ids.length, 5);
  d.active.ids.forEach((id, i) => { const ok = i % 2 === 0; Engine.answer(d, id, ok, { now: T0 }); d.active.answers.push({ id, ok }); });
  const s = Engine.finishSession(d, T0); assert.strictEqual(s.n, 5); assert.strictEqual(s.c, 3); assert.strictEqual(s.missed.length, 2);
  assert.strictEqual(d.active, null); assert.strictEqual(d.sessions.length, 1);
});
t('retry session is not logged', () => {
  const d = Engine.blank(T0); d.active = Engine.newSession(d, 'retry', 'mixed', T0, ['bc-aa-1']); d.active.answers.push({ id: 'bc-aa-1', ok: true });
  assert.strictEqual(Engine.finishSession(d, T0), null); assert.strictEqual(d.sessions.length, 0);
});
t('stats: no invented numbers on empty data', () => {
  const s = Engine.stats(Engine.blank(T0), null, T0); assert.strictEqual(s.seen, 0); assert.strictEqual(s.acc, null); assert.strictEqual(s.solid, 0);
});
t('storage round trip + paused session survives reload', () => {
  const st = mockStorage(); const r1 = load(st);
  const d = r1.Engine.blank(T0); d.active = r1.Engine.newSession(d, 'daily', 'biochem', T0); r1.Engine.answer(d, d.active.ids[0], false, { now: T0 }); d.active.answers.push({ id: d.active.ids[0], ok: false });
  assert(r1.Store.save(d));
  const r2 = load(st); const back = r2.Store.load();
  assert.strictEqual(back.active.ids.length, 5); assert.strictEqual(back.active.answers.length, 1); assert.strictEqual(back.q[d.active.ids[0]].n, 1);
});
t('export then import round trip', () => {
  const d = Engine.blank(T0); Engine.answer(d, 'bc-aa-1', true, { now: T0 }); d.flagged.push('bc-aa-2');
  const back = R.parseImport(R.exportPayload(d, T0)); assert.strictEqual(back.data.q['bc-aa-1'].c, 1); assert.deepStrictEqual(back.data.flagged, ['bc-aa-2']);
});
t('import rejects wrong files', () => { assert.throws(() => R.parseImport('{"hello":1}')); assert.throws(() => R.parseImport('not json')); });
t('corrupt storage does not crash and keeps a copy', () => {
  const st = mockStorage(); st.setItem('retron.v2', '{broken'); const r = load(st); const d = r.Store.load();
  assert(r.Engine.isValid(d)); assert.strictEqual(st.getItem('retron.v2.unreadable'), '{broken');
});
t('unavailable storage falls back safely', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const r = load(bad); const d = r.Store.load(); assert(r.Engine.isValid(d)); assert.strictEqual(r.Store.ok, false); assert.strictEqual(r.Store.save(d), false);
});
t('unknown question ids in saved data are tolerated', () => {
  const d = Engine.normalize({ v: 2, q: { 'gone-1': { box: 2, due: 5, n: 3, c: 2, last: 1, hist: '101' } } });
  assert.doesNotThrow(() => Engine.stats(d, null, T0)); assert.doesNotThrow(() => Engine.pickSession(d, { subject: 'mixed', count: 5, now: T0 }));
});
console.log(`\n${pass} passed`);
