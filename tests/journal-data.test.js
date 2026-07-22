import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJournalBackup } from '../src/utils/journalData.js';

test('normalizes a journal backup and removes duplicate tags', () => {
  const backup = normalizeJournalBackup({
    folders: [{ id: 'daily', name: ' Daily ' }],
    notes: {
      first: {
        id: 'first',
        folderId: 'daily',
        date: '2026-07-22',
        content: '<p>Hello</p>',
        tags: ['Review', 'review', '', 42],
      },
    },
  }, html => `safe:${html}`);

  assert.deepEqual(backup.folders, [{ id: 'daily', name: 'Daily', icon: 'far fa-folder' }]);
  assert.equal(backup.notes.first.content, 'safe:<p>Hello</p>');
  assert.deepEqual(backup.notes.first.tags, ['review']);
  assert.equal(backup.notes.first.pinned, false);
});

test('rejects notes that point to a missing folder', () => {
  assert.throws(() => normalizeJournalBackup({
    folders: [],
    notes: { broken: { folderId: 'missing', date: '2026-07-22' } },
  }), /invalid folder/i);
});

test('rejects malformed journal backups', () => {
  assert.throws(() => normalizeJournalBackup({ notes: [] }), /valid journal backup/i);
  assert.throws(() => normalizeJournalBackup({
    folders: [{ id: 'daily', name: 'Daily' }],
    notes: { broken: { folderId: 'daily', date: 'July 22' } },
  }), /invalid date/i);
});
