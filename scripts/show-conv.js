// Usage: node scripts/show-conv.js <evalJsonFile> <convId>
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || 'data/eval-state-2026-03-02T15-47-56-639Z.json';
const id = process.argv[3] || 'c59';
const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf-8'));
const c = j.conversations.find(x => x.id === id);
if (!c) { console.log(id, 'not in', file); process.exit(); }
console.log('=== ' + id + ' (' + c.category + ') ===');
c.turns.forEach((t, i) => {
    const m = t.pass ? 'OK' : 'XX';
    console.log(m + ' t' + (i + 1) + ': user=' + JSON.stringify(t.user));
    console.log('   bot: ' + JSON.stringify((t.actual_bot || '').substring(0, 180)));
    if (!t.pass) console.log('   FAIL: ' + t.failures.join(' | '));
});
