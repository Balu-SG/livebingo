import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventForRole, generateCard, hasBingo, RoundManager } from '../src/round.js';
import { defaultSquares } from '../src/squares.js';

let tempDirectory: string;
let manager: RoundManager;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(tmpdir(), 'livebingo-test-'));
  manager = new RoundManager(path.join(tempDirectory, 'state.json'));
  await manager.startRound();
});

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

describe('generateCard', () => {
  it('makes 24 unique pool squares and a FREE centre', () => {
    const card = generateCard(defaultSquares, 'viewer-seed');
    expect(card).toHaveLength(25);
    expect(card[12]).toBe('FREE');
    expect(card.filter((id) => id !== 'FREE')).toHaveLength(24);
    expect(new Set(card.filter((id) => id !== 'FREE')).size).toBe(24);
    expect(card.filter((id) => id !== 'FREE').every((id) => defaultSquares.some((square) => square.id === id))).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(generateCard(defaultSquares, 'same-seed')).toEqual(generateCard(defaultSquares, 'same-seed'));
    expect(generateCard(defaultSquares, 'same-seed')).not.toEqual(generateCard(defaultSquares, 'other-seed'));
  });
});

describe('hasBingo', () => {
  const card = Array.from({ length: 25 }, (_, index) => index === 12 ? 'FREE' : `s${index}`);

  it('detects rows and does not win before a line is complete', () => {
    expect(hasBingo(card, new Set(['s0', 's1', 's2', 's3']))).toBe(false);
    expect(hasBingo(card, new Set(['s0', 's1', 's2', 's3', 's4']))).toBe(true);
  });

  it('detects columns', () => {
    expect(hasBingo(card, new Set(['s0', 's5', 's10', 's15', 's20']))).toBe(true);
  });

  it('detects both diagonals with FREE counting as marked', () => {
    expect(hasBingo(card, new Set(['s0', 's6', 's18', 's24']))).toBe(true);
    expect(hasBingo(card, new Set(['s4', 's8', 's16', 's20']))).toBe(true);
  });

  it('rejects malformed grids', () => {
    expect(hasBingo(['FREE'], new Set())).toBe(false);
  });
});

describe('chat burst triggers', () => {
  it('counts distinct users rather than repeated messages from one user', async () => {
    for (let index = 0; index < 7; index += 1) {
      await manager.receiveChat('same-user', 'viewer', 'F!', 10_000 + index);
    }
    for (let index = 1; index <= 6; index += 1) {
      await manager.receiveChat(`other-${index}`, 'viewer', 'F!', 10_010 + index);
    }
    expect(manager.round.hits['chat-f']).toBeUndefined();
    await manager.receiveChat('eighth-user', 'viewer8', 'f.', 10_020);
    expect(manager.round.hits['chat-f']).toBeDefined();
  });

  it('expires users outside the configured window', async () => {
    for (let index = 0; index < 7; index += 1) {
      await manager.receiveChat(`old-${index}`, 'viewer', 'f', 10_000 + index);
    }
    await manager.receiveChat('new-user', 'new', 'f', 31_000);
    expect(manager.round.hits['chat-f']).toBeUndefined();
    for (let index = 0; index < 7; index += 1) {
      await manager.receiveChat(`new-${index}`, 'viewer', 'f', 31_001 + index);
    }
    expect(manager.round.hits['chat-f']).toBeDefined();
  });

  it('matches whole words across Unicode punctuation and ignores commands and the broadcaster', async () => {
    for (let index = 0; index < 8; index += 1) {
      await manager.receiveChat(`command-${index}`, 'viewer', '!f', 40_000 + index);
    }
    await manager.receiveChat('broadcaster', 'streamer', 'f', 40_010, ['broadcaster']);
    for (let index = 0; index < 8; index += 1) {
      await manager.receiveChat(`substring-${index}`, 'viewer', 'gift', 40_100 + index);
    }
    expect(manager.round.hits['chat-f']).toBeUndefined();
    for (let index = 0; index < 8; index += 1) {
      await manager.receiveChat(`punct-${index}`, 'viewer', 'F—', 41_000 + index);
    }
    expect(manager.round.hits['chat-f']).toBeDefined();
  });
});

describe('event triggers', () => {
  it('honors the cheer minimum bits for each matching square', async () => {
    await manager.hitEvent('cheer', 99);
    expect(manager.round.hits['cheer-100']).toBeUndefined();
    expect(manager.round.hits['cheer-500']).toBeUndefined();
    await manager.hitEvent('cheer', 100);
    expect(manager.round.hits['cheer-100']).toBeDefined();
    expect(manager.round.hits['cheer-500']).toBeUndefined();
    await manager.hitEvent('cheer', 500);
    expect(manager.round.hits['cheer-500']).toBeDefined();
  });
});

describe('win announcements', () => {
  it('counts cards containing a hit square and strips viewer card IDs from public bingo events', async () => {
    const card = manager.createCard('viewer-1', 'viewer');
    const squareId = card.squareIds.find((id) => id !== 'FREE')!;
    await manager.saveCard(card);
    const second = manager.createCard('viewer-2', 'viewer2');
    second.squareIds[0] = squareId;
    await manager.saveCard(second);
    const events = await manager.hitSquare(squareId);
    expect(events[0]).toMatchObject({ type: 'square_hit', markedCards: 2 });
    const bingo = { type: 'bingo' as const, user: 'viewer', cardId: 'secret-card-id', rank: 1 };
    expect(eventForRole(bingo, 'overlay')).toEqual({ type: 'bingo', user: 'viewer', rank: 1 });
    expect(eventForRole(bingo, 'viewer')).not.toHaveProperty('cardId');
    expect(eventForRole(bingo, 'dashboard')).toEqual(bingo);
  });

  it('emits exactly one bingo event per card and records its rank', async () => {
    const card = manager.createCard('winner-id', 'winner');
    const manual = defaultSquares.filter((square) => square.trigger.type === 'manual').slice(0, 5).map((square) => square.id);
    const remaining = defaultSquares.map((square) => square.id).filter((id) => !manual.includes(id));
    card.squareIds = [...manual, ...remaining.slice(0, 7), 'FREE', ...remaining.slice(7, 19)];
    await manager.saveCard(card);
    const announced: unknown[] = [];
    manager.onEvent((event) => { if (event.type === 'bingo') announced.push(event); });

    for (const squareId of manual) await manager.hitSquare(squareId, 'manual');
    await manager.hitSquare(manual[4]!, 'manual');

    expect(announced).toHaveLength(1);
    expect(manager.round.cards[card.id]?.rank).toBe(1);
    expect(manager.round.winnerOrder).toEqual([card.id]);
  });
});
