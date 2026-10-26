import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultSquares, type Square, type SquareTrigger } from './squares.js';

export type Card = {
  id: string;
  userId: string;
  user: string;
  squareIds: string[];
  wonAt: string | null;
  rank: number | null;
};

export type Round = {
  status: 'idle' | 'live' | 'ended';
  squarePool: Square[];
  hits: Record<string, string>;
  cards: Record<string, Card>;
  winnerOrder: string[];
  chatActivity: Record<string, Record<string, number>>;
};

export type RoundEvent =
  | { type: 'square_hit'; squareId: string; label: string; at: string }
  | { type: 'bingo'; user: string; cardId: string; rank: number };

export function generateCard(pool: Square[], seed: string): string[] {
  if (pool.length < 24) throw new Error('A bingo card needs at least 24 available squares.');
  const random = seededRandom(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const selected = shuffled.slice(0, 24).map((square) => square.id);
  selected.splice(12, 0, 'FREE');
  return selected;
}

function seededRandom(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hasBingo(squareIds: string[], hitIds: Set<string>): boolean {
  if (squareIds.length !== 25) return false;
  const marked = (index: number) => squareIds[index] === 'FREE' || hitIds.has(squareIds[index]!);
  const lines: number[][] = [];
  for (let row = 0; row < 5; row += 1) lines.push(Array.from({ length: 5 }, (_, col) => row * 5 + col));
  for (let col = 0; col < 5; col += 1) lines.push(Array.from({ length: 5 }, (_, row) => row * 5 + col));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return lines.some((line) => line.every(marked));
}

function emptyRound(status: Round['status'] = 'idle'): Round {
  return { status, squarePool: defaultSquares, hits: {}, cards: {}, winnerOrder: [], chatActivity: {} };
}

export class RoundManager {
  round: Round = emptyRound();
  private listeners = new Set<(event: RoundEvent) => void>();

  constructor(private readonly stateFile: string) {}

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.stateFile, 'utf8')) as Round;
      this.round = { ...emptyRound(), ...saved };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  onEvent(listener: (event: RoundEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RoundEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private async save() {
    await mkdir(path.dirname(this.stateFile), { recursive: true });
    await writeFile(this.stateFile, JSON.stringify(this.round, null, 2), { mode: 0o600 });
  }

  async startRound() {
    if (this.round.status === 'live') throw new Error('A round is already live.');
    this.round = { ...emptyRound('live'), squarePool: defaultSquares.map((square) => ({ ...square })) };
    await this.save();
    return this.round;
  }

  async endRound() {
    if (this.round.status !== 'live') throw new Error('There is no live round.');
    this.round.status = 'ended';
    await this.save();
    return this.round;
  }

  createCard(userId: string, user: string): Card {
    const existing = Object.values(this.round.cards).find((card) => card.userId === userId);
    if (existing) return existing;
    const card: Card = { id: randomBytes(16).toString('hex'), userId, user, squareIds: generateCard(this.round.squarePool, randomBytes(16).toString('hex')), wonAt: null, rank: null };
    this.round.cards[card.id] = card;
    return card;
  }

  getCard(cardId: string) {
    return this.round.cards[cardId];
  }

  async saveCard(card: Card) {
    this.round.cards[card.id] = card;
    await this.save();
  }

  async hitSquare(squareId: string, allowedTrigger?: SquareTrigger['type']) {
    if (this.round.status !== 'live') throw new Error('There is no live round.');
    const square = this.round.squarePool.find((item) => item.id === squareId);
    if (!square) throw new Error('Unknown square.');
    if (allowedTrigger && square.trigger.type !== allowedTrigger) throw new Error('This endpoint only hits manual squares.');
    if (this.round.hits[squareId]) return [];

    const at = new Date().toISOString();
    this.round.hits[squareId] = at;
    const events: RoundEvent[] = [{ type: 'square_hit', squareId, label: square.label, at }];
    const hitIds = new Set(Object.keys(this.round.hits));
    for (const card of Object.values(this.round.cards)) {
      if (!card.wonAt && hasBingo(card.squareIds, hitIds)) {
        card.wonAt = at;
        card.rank = this.round.winnerOrder.length + 1;
        this.round.winnerOrder.push(card.id);
        events.push({ type: 'bingo', user: card.user, cardId: card.id, rank: card.rank });
      }
    }
    await this.save();
    for (const event of events) this.emit(event);
    return events;
  }

  async receiveChat(userId: string, user: string, text: string, atMs = Date.now()) {
    if (this.round.status !== 'live') return [];
    const normalized = text.toLowerCase();
    const completed: RoundEvent[] = [];
    for (const square of this.round.squarePool) {
      const trigger = square.trigger;
      const hasKeyword = trigger.type === 'chatBurst' && normalized.split(/[^a-z0-9]+/).includes(trigger.keyword.toLowerCase());
      if (trigger.type !== 'chatBurst' || !hasKeyword || this.round.hits[square.id]) continue;
      const cutoff = atMs - trigger.windowSec * 1000;
      const activity = this.round.chatActivity[square.id] ??= {};
      for (const [id, seenAt] of Object.entries(activity)) if (seenAt < cutoff) delete activity[id];
      activity[userId] = atMs;
      if (new Set(Object.keys(activity)).size >= trigger.minUsers) completed.push(...await this.hitSquare(square.id, 'chatBurst'));
    }
    if (Object.keys(this.round.chatActivity).length) await this.save();
    return completed;
  }

  async hitEvent(event: Extract<SquareTrigger, { type: 'event' }>['event'], bits?: number) {
    if (this.round.status !== 'live') return [];
    const matching = this.round.squarePool.filter((square) => {
      if (square.trigger.type !== 'event' || square.trigger.event !== event) return false;
      return square.trigger.minBits === undefined || (bits ?? 0) >= square.trigger.minBits;
    });
    const results: RoundEvent[] = [];
    for (const square of matching) results.push(...await this.hitSquare(square.id, 'event'));
    return results;
  }

  viewerCard(cardId: string) {
    const card = this.getCard(cardId);
    if (!card) return undefined;
    const labels = new Map(this.round.squarePool.map((square) => [square.id, square.label]));
    return {
      id: card.id, user: card.user, wonAt: card.wonAt, rank: card.rank,
      squares: card.squareIds.map((id, index) => ({ id, label: id === 'FREE' ? 'FREE' : labels.get(id) ?? 'Unknown square', hitAt: id === 'FREE' ? 'FREE' : this.round.hits[id] ?? null, index })),
      status: this.round.status,
    };
  }
}
