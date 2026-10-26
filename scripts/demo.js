import 'dotenv/config';

const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
const adminToken = process.env.ADMIN_TOKEN;
if (!adminToken) throw new Error('Set ADMIN_TOKEN in .env before running npm run demo.');

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'X-Admin-Token': adminToken, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${result.error ?? 'request failed'}`);
  return result;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readCard(id) {
  const response = await fetch(`${baseUrl}/api/cards/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Could not read demo card ${id}.`);
  return response.json();
}

function lines() {
  const result = [];
  for (let row = 0; row < 5; row += 1) result.push(Array.from({ length: 5 }, (_, col) => row * 5 + col));
  for (let col = 0; col < 5; col += 1) result.push(Array.from({ length: 5 }, (_, row) => row * 5 + col));
  result.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return result;
}

async function fireSquare(square) {
  if (square.hitAt || square.id === 'FREE') return;
  const trigger = square.trigger;
  if (trigger?.type === 'event') {
    const bits = Math.max(trigger.minBits ?? 0, 500);
    await request(`/api/demo/${trigger.event}${trigger.event === 'cheer' ? `?bits=${bits}` : ''}`);
  } else if (trigger?.type === 'chatBurst') {
    await request(`/api/demo/chatburst/${encodeURIComponent(square.id)}`);
  } else if (trigger?.type === 'manual') {
    await request(`/api/squares/${encodeURIComponent(square.id)}/hit`);
  }
  await pause(3500);
}

const end = await fetch(`${baseUrl}/api/round/end`, { method: 'POST', headers: { 'X-Admin-Token': adminToken } });
if (!end.ok && end.status !== 409) throw new Error(`Could not reset the previous round (${end.status}).`);
await request('/api/round/start');
const { cards } = await request('/api/demo/cards', { count: 5 });
console.log('Demo cards:');
for (const card of cards) console.log(`  ${card.user}: ${card.url}`);

await pause(3000);
await request('/api/demo/follow');
await pause(8000);
await request('/api/demo/chatburst/chat-f');
await pause(8000);
await request('/api/demo/raid');
await pause(8000);
await request('/api/demo/cheer?bits=500');
await pause(8000);
await pause(10_000);

const demoCards = await Promise.all(cards.map((card) => readCard(card.id)));
const manualSquares = [...new Map(demoCards.flatMap((card) => card.squares)
  .filter((square) => square.trigger?.type === 'manual')
  .map((square) => [square.id, square])).values()].slice(0, 2);
for (const square of manualSquares) await fireSquare(square);

let winner = demoCards.find((card) => card.wonAt);
for (const card of demoCards) {
  if (winner) break;
  const candidates = lines().filter((line) => line.every((index) => {
    const square = card.squares[index];
    return square.id === 'FREE' || ['event', 'chatBurst', 'manual'].includes(square.trigger?.type);
  }));
  for (const line of candidates) {
    for (const index of line) await fireSquare(card.squares[index]);
    const updated = await readCard(card.id);
    if (updated.wonAt) {
      winner = updated;
      break;
    }
  }
}

if (!winner) throw new Error('The scripted hits did not produce a BINGO. Check the app logs and try npm run demo again.');
console.log(`BINGO! ${winner.user} won at rank #${winner.rank}.`);
console.log(`Open the card while recording: ${baseUrl}/c/${winner.id}`);
console.log('The round remains live so the card can stay on screen.');
await pause(5000);
