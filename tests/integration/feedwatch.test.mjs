import test from 'node:test';
import assert from 'node:assert/strict';
import { stopFeedWatch, isFeedWatching, stopAllFeedWatchers } from '../../src/feedwatch.js';

test('isFeedWatching returns false for unknown channel', () => {
  assert.equal(isFeedWatching('never-existed'), false);
});

test('stopFeedWatch returns false for unknown channel', () => {
  assert.equal(stopFeedWatch('never-existed'), false);
});

test('stopAllFeedWatchers is safe with no active watchers', () => {
  stopAllFeedWatchers();
  assert.equal(isFeedWatching('never-existed'), false);
});
