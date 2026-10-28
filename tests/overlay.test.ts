import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { afterEach, describe, expect, it } from 'vitest';
import { createOverlayRoundState, createOverlaySnapshot, registerOverlayPageRoute } from '../src/overlay.js';
import { RoundManager } from '../src/round.js';

describe('public overlay', () => {
  it('projects round state without card IDs or card data', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'livebingo-overlay-'));
    try {
      const manager = new RoundManager(path.join(directory, 'state.json'));
      await manager.startRound();
      const card = manager.createCard('private-user-id', 'SampleWinner');
      card.rank = 1;
      manager.round.winnerOrder.push(card.id);
      const snapshot = createOverlaySnapshot(manager.round);
      const serialized = JSON.stringify(snapshot);

      expect(snapshot).toEqual({
        type: 'overlay_state', status: 'live', cardsInPlay: 1,
        winners: [{ user: 'SampleWinner', rank: 1 }],
      });
      expect(serialized).not.toContain(card.id);
      expect(serialized).not.toContain('private-user-id');
      expect(serialized).not.toContain('squareIds');
      expect(serialized).not.toContain('cardId');
      const initial = JSON.stringify(createOverlayRoundState(manager.round));
      expect(initial).not.toContain(card.id);
      expect(initial).not.toContain('cardId');
      expect(initial).not.toContain('squareIds');
      expect(initial).not.toContain('SampleWinner');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serves GET /overlay without authentication', async () => {
    const app = Fastify();
    const publicDir = path.resolve('public');
    app.register(fastifyStatic, { root: publicDir });
    registerOverlayPageRoute(app);
    try {
      const response = await app.inject({ method: 'GET', url: '/overlay' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('LiveBingo OBS overlay');
    } finally {
      await app.close();
    }
  });
});
