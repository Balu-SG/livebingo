export type SquareTrigger =
  | { type: 'event'; event: 'raid' | 'follow' | 'sub' | 'giftsub' | 'cheer'; minBits?: number }
  | { type: 'chatBurst'; keyword: string; minUsers: number; windowSec: number }
  | { type: 'voice'; phrases: string[] }
  | { type: 'manual' };

export type Square = { id: string; label: string; trigger: SquareTrigger };

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
