const j = require('../data/eval-state-2026-03-02T15-30-16-534Z.json');
const ids = ['c53', 'c57', 'c58'];
ids.forEach(id => {
    const c = j.conversations.find(x => x.id === id);
    if (!c) return;
    console.log('\n=== ' + id + ' (' + c.category + ') ===');
    c.turns.forEach((t, i) => {
        const mark = t.pass ? 'OK' : 'XX';
        console.log(mark + ' t' + (i + 1) + ': user=' + JSON.stringify(t.user));
        console.log('   bot: ' + JSON.stringify((t.actual_bot || '').substring(0, 150)));
        if (!t.pass) console.log('   FAIL: ' + t.failures.join(' | '));
    });
});
