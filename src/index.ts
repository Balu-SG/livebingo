import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { RoundManager } from './round.js';

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;
const redirectUri = process.env.TWITCH_REDIRECT_URI ?? 'http://localhost:3000/auth/callback';
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
const scopes = [
  'user:read:chat', 'user:write:chat', 'user:bot', 'moderator:read:followers',
  'channel:read:subscriptions', 'bits:read',
];
const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(root, '../public');
const tokenFile = path.resolve(root, '../data/tokens.json');
const stateFile = path.resolve(root, '../data/state.json');
const app = Fastify({ logger: true });
const rounds = new RoundManager(stateFile);
const webSocketServer = new WebSocketServer({ noServer: true });

type TwitchUser = { id: string; login: string; display_name: string };
type TokenData = { access_token: string; refresh_token: string; expires_at: number; user: TwitchUser };
let tokens: TokenData | null = null;
let eventSocket: WebSocket | null = null;
let eventSubConnected = false;
let reconnectTimer: NodeJS.Timeout | undefined;
let pendingOAuthState: string | undefined;

rounds.onEvent((event) => {
  broadcast(event);
});

function broadcast(event: unknown) {
  const message = JSON.stringify(event);
  for (const socket of webSocketServer.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

async function loadTokens() {
  try {
    tokens = JSON.parse(await readFile(tokenFile, 'utf8')) as TokenData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function saveTokens() {
  if (!tokens) return;
  await mkdir(path.dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function refreshAccessToken() {
  if (!tokens || !clientId || !clientSecret) throw new Error('Twitch credentials are not configured.');
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  if (!response.ok) throw new Error(`Twitch token refresh failed: ${response.status} ${await response.text()}`);
  const refreshed = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  tokens = { ...tokens, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token ?? tokens.refresh_token, expires_at: Date.now() + refreshed.expires_in * 1000 };
  await saveTokens();
  app.log.info('Twitch access token refreshed');
}

async function getAccessToken() {
  if (!tokens) throw new Error('Log in with Twitch first.');
  if (tokens.expires_at < Date.now() + 60_000) await refreshAccessToken();
  return tokens.access_token;
}

async function helix(pathname: string, init: RequestInit = {}) {
  if (!clientId) throw new Error('TWITCH_CLIENT_ID is not configured.');
  const token = await getAccessToken();
  return fetch(`https://api.twitch.tv/helix${pathname}`, {
    ...init,
    headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
}

function scheduleReconnect() {
  if (reconnectTimer || !tokens) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectEventSub();
  }, 3000);
}

function connectEventSub(url = 'wss://eventsub.wss.twitch.tv/ws', transferFrom?: WebSocket) {
  const socket = new WebSocket(url);
  eventSocket = socket;
  socket.on('open', () => app.log.info('Connected to Twitch EventSub WebSocket'));
  socket.on('message', async (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as { metadata?: { message_type?: string }; payload?: any };
      const type = message.metadata?.message_type;
      if (type === 'session_welcome') {
        eventSubConnected = true;
        app.log.info('EventSub session welcomed');
        if (transferFrom) transferFrom.close();
        else await subscribeToChat(message.payload.session.id);
      } else if (type === 'session_keepalive') {
        app.log.debug('EventSub keepalive received');
      } else if (type === 'session_reconnect') {
        app.log.info('EventSub requested session reconnect');
        connectEventSub(message.payload.session.reconnect_url, socket);
      } else if (type === 'notification' && message.payload.subscription.type === 'channel.chat.message') {
        await handleChatMessage(message.payload.event);
      } else if (type === 'notification') {
        await handleEventSubNotification(message.payload.subscription.type, message.payload.event);
      } else if (type === 'revocation') {
        app.log.warn({ subscription: message.payload.subscription }, 'EventSub subscription revoked');
      }
    } catch (error) {
      app.log.error(error, 'Could not process EventSub message');
    }
  });
  socket.on('close', () => {
    if (eventSocket === socket) {
      eventSocket = null;
      eventSubConnected = false;
      app.log.warn('EventSub connection closed; reconnecting');
      scheduleReconnect();
    }
  });
  socket.on('error', (error) => app.log.error(error, 'EventSub WebSocket error'));
}

async function subscribeToChat(sessionId: string) {
  if (!tokens) return;
  const subscriptions = [
    { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: tokens.user.id, user_id: tokens.user.id } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: tokens.user.id } },
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: tokens.user.id, moderator_user_id: tokens.user.id } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: tokens.user.id } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: tokens.user.id } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: tokens.user.id } },
  ];
  for (const subscription of subscriptions) {
    const response = await helix('/eventsub/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ ...subscription, transport: { method: 'websocket', session_id: sessionId } }),
    });
    if (!response.ok) throw new Error(`EventSub ${subscription.type} subscription failed: ${response.status} ${await response.text()}`);
    app.log.info({ type: subscription.type }, 'Subscribed to EventSub');
  }
}

async function handleChatMessage(event: { message: { text: string }; chatter_user_id: string; chatter_user_login: string; broadcaster_user_id: string }) {
  app.log.info({ user: event.chatter_user_login, text: event.message.text }, 'Chat message received');
  await rounds.receiveChat(event.chatter_user_id, event.chatter_user_login, event.message.text);
  if (event.message.text.trim().toLowerCase() !== '!bingo' || !tokens) return;
  let message: string;
  if (rounds.round.status !== 'live') {
    message = `@${event.chatter_user_login} the next LiveBingo round hasn't started yet.`;
  } else {
    const card = rounds.createCard(event.chatter_user_id, event.chatter_user_login);
    await rounds.saveCard(card);
    message = `@${event.chatter_user_login} your LiveBingo card → ${publicBaseUrl}/c/${card.id}`;
  }
  const response = await helix('/chat/messages', {
    method: 'POST',
    body: JSON.stringify({ broadcaster_id: event.broadcaster_user_id, sender_id: tokens.user.id, message }),
  });
  if (!response.ok) throw new Error(`Chat reply failed: ${response.status} ${await response.text()}`);
  app.log.info({ user: event.chatter_user_login }, 'Bingo chat reply sent');
}

async function handleEventSubNotification(type: string, event: any) {
  if (type === 'channel.raid') await rounds.hitEvent('raid');
  if (type === 'channel.follow') await rounds.hitEvent('follow');
  if (type === 'channel.subscribe' && !event.is_gift) await rounds.hitEvent('sub');
  if (type === 'channel.subscription.gift') await rounds.hitEvent('giftsub');
  if (type === 'channel.cheer') await rounds.hitEvent('cheer', event.bits);
}

app.register(fastifyStatic, { root: publicDir });

app.get('/status', async () => ({ loggedIn: Boolean(tokens), username: tokens?.user.display_name ?? null, eventSubConnected }));

app.get<{ Params: { id: string } }>('/c/:id', async (request, reply) => {
  if (!rounds.getCard(request.params.id)) return reply.code(404).type('text/plain').send('Bingo card not found. Ask in chat with !bingo during a live round to create one.');
  return reply.sendFile('card.html');
});

app.get<{ Params: { id: string } }>('/api/cards/:id', async (request, reply) => {
  const card = rounds.viewerCard(request.params.id);
  if (!card) return reply.code(404).send({ error: 'Bingo card not found.' });
  return card;
});

app.post('/api/round/start', async (_request, reply) => {
  try {
    const round = await rounds.startRound();
    broadcast({ type: 'round_state', status: round.status, hits: round.hits });
    app.log.info('Bingo round started');
    return { status: round.status, squares: round.squarePool.length };
  } catch (error) {
    return reply.code(409).send({ error: error instanceof Error ? error.message : 'Could not start round.' });
  }
});

app.post('/api/round/end', async (_request, reply) => {
  try {
    await rounds.endRound();
    broadcast({ type: 'round_state', status: rounds.round.status, hits: rounds.round.hits });
    app.log.info('Bingo round ended');
    return { status: rounds.round.status, winners: rounds.round.winnerOrder.length };
  } catch (error) {
    return reply.code(409).send({ error: error instanceof Error ? error.message : 'Could not end round.' });
  }
});

app.post<{ Params: { id: string } }>('/api/squares/:id/hit', async (request, reply) => {
  try {
    const events = await rounds.hitSquare(request.params.id, 'manual');
    app.log.info({ squareId: request.params.id }, 'Manual square hit');
    return { events };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not hit square.';
    return reply.code(message === 'There is no live round.' ? 409 : 400).send({ error: message });
  }
});

app.server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/ws') return;
  const cardId = url.searchParams.get('card');
  const role = url.searchParams.get('role');
  if (cardId && !rounds.getCard(cardId)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!cardId && role !== 'overlay' && role !== 'dashboard') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (client) => {
    webSocketServer.emit('connection', client, request);
    client.send(JSON.stringify({
      type: 'round_state', status: rounds.round.status,
      hits: rounds.round.hits, card: cardId ? rounds.viewerCard(cardId) : undefined,
    }));
  });
});

webSocketServer.on('connection', (socket) => {
  socket.on('error', (error) => app.log.warn(error, 'Viewer WebSocket error'));
});

app.get('/auth/login', async (_request, reply) => {
  if (!clientId || !clientSecret) return reply.code(500).send('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env first.');
  const state = randomUUID();
  pendingOAuthState = state;
  return reply.redirect(`https://id.twitch.tv/oauth2/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '), state })}`);
});

app.get<{ Querystring: { code?: string; error?: string; state?: string } }>('/auth/callback', async (request, reply) => {
  if (request.query.error) return reply.code(400).send(`Twitch login failed: ${request.query.error}`);
  if (!pendingOAuthState || request.query.state !== pendingOAuthState) return reply.code(400).send('Invalid or expired OAuth state. Start login again.');
  pendingOAuthState = undefined;
  if (!request.query.code || !clientId || !clientSecret) return reply.code(400).send('Missing authorization code or Twitch credentials.');
  const exchange = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: request.query.code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  });
  if (!exchange.ok) return reply.code(502).send(`Twitch token exchange failed: ${await exchange.text()}`);
  const result = await exchange.json() as { access_token: string; refresh_token: string; expires_in: number };
  const users = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-Id': clientId, Authorization: `Bearer ${result.access_token}` } });
  if (!users.ok) return reply.code(502).send(`Could not read Twitch account: ${await users.text()}`);
  const userBody = await users.json() as { data: TwitchUser[] };
  if (!userBody.data[0]) return reply.code(502).send('Twitch did not return a user for this login.');
  tokens = { ...result, expires_at: Date.now() + result.expires_in * 1000, user: userBody.data[0] };
  await saveTokens();
  app.log.info({ user: tokens.user.login }, 'Logged in with Twitch');
  if (eventSocket) eventSocket.close();
  connectEventSub();
  return reply.redirect('/');
});

async function start() {
  await rounds.load();
  await loadTokens();
  if (tokens) {
    app.log.info({ user: tokens.user.login }, 'Loaded saved Twitch login');
    connectEventSub();
  }
  await app.listen({ host: '0.0.0.0', port: 3000 });
}

start().catch((error) => {
  app.log.error(error, 'Could not start LiveBingo');
  process.exit(1);
});
