export type SquareTrigger =
  | { type: 'event'; event: 'raid' | 'follow' | 'sub' | 'giftsub' | 'cheer'; minBits?: number }
  | { type: 'chatBurst'; keyword: string; minUsers: number; windowSec: number }
  | { type: 'voice'; phrases: string[] }
  | { type: 'manual' };
export type SquareEvent = Extract<SquareTrigger, { type: 'event' }>['event'];

export type Square = { id: string; label: string; trigger: SquareTrigger };

export function validateSquarePool(value: unknown): Square[] {
  if (!Array.isArray(value) || value.length < 24) throw new Error('The square pool must contain at least 24 squares.');
  const ids = new Set<string>();
  const events = new Set(['raid', 'follow', 'sub', 'giftsub', 'cheer']);
  const squares = value.map((entry): Square => {
    if (!entry || typeof entry !== 'object') throw new Error('Each square must be an object.');
    const square = entry as Record<string, unknown>;
    if (typeof square.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(square.id)) throw new Error('Square IDs must use letters, numbers, hyphens, or underscores.');
    if (ids.has(square.id)) throw new Error(`Duplicate square ID: ${square.id}`);
    ids.add(square.id);
    if (typeof square.label !== 'string' || !square.label.trim() || Array.from(square.label.trim()).length > 28) throw new Error(`Square ${square.id} needs a label of 1–28 characters.`);
    if (!square.trigger || typeof square.trigger !== 'object') throw new Error(`Square ${square.id} needs a valid trigger.`);
    const trigger = square.trigger as Record<string, unknown>;
    if (trigger.type === 'event' && typeof trigger.event === 'string' && events.has(trigger.event) && (trigger.minBits === undefined || trigger.minBits === null || (Number.isInteger(Number(trigger.minBits)) && Number(trigger.minBits) >= 0))) {
      return { id: square.id, label: square.label.trim(), trigger: { type: 'event', event: trigger.event as SquareEvent, ...(trigger.minBits === undefined || trigger.minBits === null ? {} : { minBits: Number(trigger.minBits) }) } };
    }
    if (trigger.type === 'chatBurst' && typeof trigger.keyword === 'string' && trigger.keyword.trim() && Number.isInteger(Number(trigger.minUsers)) && Number(trigger.minUsers) > 0 && Number.isInteger(Number(trigger.windowSec)) && Number(trigger.windowSec) > 0) {
      return { id: square.id, label: square.label.trim(), trigger: { type: 'chatBurst', keyword: trigger.keyword.trim(), minUsers: Number(trigger.minUsers), windowSec: Number(trigger.windowSec) } };
    }
    if (trigger.type === 'voice' && Array.isArray(trigger.phrases) && trigger.phrases.length > 0 && trigger.phrases.every((phrase) => typeof phrase === 'string' && phrase.trim())) {
      return { id: square.id, label: square.label.trim(), trigger: { type: 'voice', phrases: trigger.phrases.map((phrase) => String(phrase).trim()) } };
    }
    if (trigger.type === 'manual') return { id: square.id, label: square.label.trim(), trigger: { type: 'manual' } };
    throw new Error(`Square ${square.id} has an invalid trigger.`);
  });
  return squares;
}

export const defaultSquares: Square[] = [
  { id: 'raid-arrives', label: 'A raid arrives', trigger: { type: 'event', event: 'raid' } },
  { id: 'new-follower', label: 'New follower', trigger: { type: 'event', event: 'follow' } },
  { id: 'new-sub', label: 'Someone subscribes', trigger: { type: 'event', event: 'sub' } },
  { id: 'gift-sub', label: 'Someone gifts a sub', trigger: { type: 'event', event: 'giftsub' } },
  { id: 'cheer-100', label: 'Cheer of 100+ bits', trigger: { type: 'event', event: 'cheer', minBits: 100 } },
  { id: 'cheer-500', label: 'Cheer of 500+ bits', trigger: { type: 'event', event: 'cheer', minBits: 500 } },
  { id: 'chat-f', label: 'Chat spams F', trigger: { type: 'chatBurst', keyword: 'f', minUsers: 8, windowSec: 20 } },
  { id: 'chat-lul', label: 'Chat spams LUL', trigger: { type: 'chatBurst', keyword: 'lul', minUsers: 6, windowSec: 20 } },
  { id: 'chat-hype', label: 'Chat says HYPE', trigger: { type: 'chatBurst', keyword: 'hype', minUsers: 6, windowSec: 20 } },
  { id: 'chat-gg', label: 'Chat says GG', trigger: { type: 'chatBurst', keyword: 'gg', minUsers: 6, windowSec: 20 } },
  { id: 'chat-pog', label: 'Chat says POG', trigger: { type: 'chatBurst', keyword: 'pog', minUsers: 6, windowSec: 20 } },
  { id: 'chat-l', label: 'Chat spams L', trigger: { type: 'chatBurst', keyword: 'l', minUsers: 8, windowSec: 20 } },
  { id: 'voice-lets-go', label: "Streamer says 'let's go'", trigger: { type: 'voice', phrases: ["let's go", 'lets go'] } },
  { id: 'voice-chat', label: "Streamer says 'chat'", trigger: { type: 'voice', phrases: ['chat'] } },
  { id: 'voice-no-way', label: "Streamer says 'no way'", trigger: { type: 'voice', phrases: ['no way'] } },
  { id: 'voice-oh-my', label: "Streamer says 'oh my god'", trigger: { type: 'voice', phrases: ['oh my god', 'omg'] } },
  { id: 'voice-clutch', label: "Streamer says 'clutch'", trigger: { type: 'voice', phrases: ['clutch'] } },
  { id: 'voice-unlucky', label: "Streamer says 'unlucky'", trigger: { type: 'voice', phrases: ['unlucky'] } },
  { id: 'rage-moment', label: 'Rage moment', trigger: { type: 'manual' } },
  { id: 'snack-break', label: 'Snack break', trigger: { type: 'manual' } },
  { id: 'technical-pause', label: 'Technical pause', trigger: { type: 'manual' } },
  { id: 'big-play', label: 'Big play', trigger: { type: 'manual' } },
  { id: 'streamer-laughs', label: 'Streamer laughs', trigger: { type: 'manual' } },
  { id: 'game-change', label: 'Game changes', trigger: { type: 'manual' } },
  { id: 'missed-shot', label: 'Missed an easy shot', trigger: { type: 'manual' } },
  { id: 'unexpected-win', label: 'Unexpected win', trigger: { type: 'manual' } },
  { id: 'loud-noise', label: 'A loud noise', trigger: { type: 'manual' } },
  { id: 'streamer-sings', label: 'Streamer sings', trigger: { type: 'manual' } },
  { id: 'game-glitch', label: 'Game glitch', trigger: { type: 'manual' } },
  { id: 'water-break', label: 'Water break', trigger: { type: 'manual' } },
];

if (defaultSquares.length !== 30 || defaultSquares.some((square) => square.label.length > 28)) {
  throw new Error('Default square pool must contain 30 squares with short labels.');
}
