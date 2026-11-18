import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amend, amendmentSummary, logRound, openRound, readAmendments, rejectChange, resolveRound, revert } from './amendments.ts';
import { approvalReasons } from './approvals.ts';
import { readiness } from './calc.ts';
import { dealClauses, orderTerms } from './terms.ts';

const base = { of_order_type: 'new_business', of_payment_terms: 'net_30', of_billing_frequency: 'annually_in_advance' };
const T = '2026-11-18T10:00:00.000Z';

test('deal clauses carry the order form numbering and the standard wording filled in', () => {
  const c = dealClauses({ ...base, of_special_terms: JSON.stringify([{ id: 'data_residency', value: 'European Union' }]) });
  const d = c.find((x) => x.id === 'tc_3d')!;
  assert.equal(d.label, '3D');
  assert.equal(d.standard, 'Payment terms Net 30 days from invoice date. Fees to be paid by bank transfer.');
  assert.equal(c.find((x) => x.id === 'tc_1a')!.standard.includes('Protex AI Limited'), true);
  assert.deepEqual(c.find((x) => x.id === 'data_residency'), { id: 'data_residency', label: 'S1', title: 'Data residency', standard: 'Client Data will be hosted in the European Union.', kind: 'special' });
});

test('an amendment replaces the clause on the quote; removing one drops it', () => {
  let rec = readAmendments({});
  rec = amend(rec, { clauseId: 'tc_3d', clauseLabel: '3D', text: 'Payment terms Net 45 days from invoice date.', reason: 'Client AP cycle', source: 'client', byLegal: false, by: 'Rob Rep' }, T);
  rec = amend(rec, { clauseId: 'tc_6a', clauseLabel: '6A', text: '', removed: true, reason: 'Conflicts with client PO terms', source: 'client', byLegal: true, by: 'Jemima Davison' }, T);
  const v = { ...base, of_amendments: JSON.stringify(rec) };
  const t = orderTerms(v);
  assert.ok(t.includes('<p><strong>D.</strong> Payment terms Net 45 days from invoice date.</p>'));
  assert.ok(!t.includes('Acceptance of this Order Form is limited'), 'removed clause gone');
  assert.ok(t.includes('<tr><td>6</td><td><p><strong>A.</strong> This Order Form may be executed'), 'renumbered');
  assert.equal(
    amendmentSummary(rec),
    "3D: amended (client request; proposed by Rob Rep, needs Legal approval) — Client AP cycle\n6A: removed (client request; by legal, Jemima Davison) — Conflicts with client PO terms",
  );
});

test("a rep's amendment needs Legal approval; a legal editor's doesn't; changing the wording re-asks", () => {
  const rep = amend(readAmendments({}), { clauseId: 'tc_3d', clauseLabel: '3D', text: 'Net 45.', reason: 'AP cycle', source: 'client', byLegal: false, by: 'Rob' }, T);
  const r = approvalReasons({ ...base, of_amendments: JSON.stringify(rep) }, []);
  assert.deepEqual(r.map((x) => [x.role, x.label]), [['legal', 'Wording amended: 3D (AP cycle)']]);
  const changed = amend(rep, { clauseId: 'tc_3d', clauseLabel: '3D', text: 'Net 60.', reason: 'AP cycle', source: 'client', byLegal: false, by: 'Rob' }, T);
  assert.notEqual(approvalReasons({ ...base, of_amendments: JSON.stringify(changed) }, [])[0].key, r[0].key, 'new wording, new approval');
  const byLegal = amend(readAmendments({}), { clauseId: 'tc_3d', clauseLabel: '3D', text: 'Net 45.', reason: '', source: 'protex', byLegal: true, by: 'Jemima' }, T);
  assert.deepEqual(approvalReasons({ ...base, of_amendments: JSON.stringify(byLegal) }, []), []);
  assert.deepEqual(revert(rep, 'tc_3d', '3D', 'Jemima', 'Client withdrew', T).amendments, []);
});

test('redline rounds: logged, changes tied to the open round, block sending until resolved', () => {
  let rec = logRound(readAmendments({}), { link: 'https://files.example/redline.pdf', note: 'Wants Net 45 and no clause 6', loggedBy: 'Rob' }, T);
  assert.equal(openRound(rec)!.n, 1);
  rec = amend(rec, { clauseId: 'tc_3d', clauseLabel: '3D', text: 'Net 45.', reason: 'Accepted', source: 'client', byLegal: true, by: 'Jemima' }, T);
  rec = rejectChange(rec, 'tc_6a', '6A', 'Delete clause 6.', 'Standard position', 'Jemima', T);
  assert.equal(rec.amendments[0].round, 1);
  assert.deepEqual(rec.history.map((h) => [h.round, h.clauseLabel, h.action]), [[1, '3D', 'amended'], [1, '6A', 'rejected']]);
  assert.ok(orderTerms({ ...base, of_amendments: JSON.stringify(rec) }).includes('Acceptance of this Order Form is limited'), 'a rejected change leaves the clause');
  assert.ok(readiness({ ...base, of_amendments: JSON.stringify(rec) }, []).missing.some((g) => g.label === 'Client redlines (round 1): resolve them, then mark the round resolved'));
  rec = resolveRound(rec, 'Jemima', T);
  assert.equal(openRound(rec), undefined);
  assert.ok(!readiness({ ...base, of_amendments: JSON.stringify(rec) }, []).missing.some((g) => g.label.startsWith('Client redlines')));
  assert.equal(logRound(rec, { loggedBy: 'Rob' }, T).rounds[1].n, 2, 'next round is 2');
});
