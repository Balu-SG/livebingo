import type { FastifyInstance } from 'fastify';
import type { Round } from './round.js';

export function createOverlaySnapshot(round: Round) {
  return {
    type: 'overlay_state',
    status: round.status,
    cardsInPlay: Object.keys(round.cards).length,
    winners: round.winnerOrder.slice(0, 3).map((id) => {
      const card = round.cards[id];
      return { user: card?.user ?? 'Viewer', rank: card?.rank ?? 0 };
    }),
  };
}

export function createOverlayRoundState(round: Round) {
  return { type: 'round_state', status: round.status, hits: round.hits };
}

export function registerOverlayPageRoute(app: FastifyInstance) {
  app.get('/overlay', async (_request, reply) => reply.sendFile('overlay.html'));
}
