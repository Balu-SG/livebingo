const cardId = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) ?? '');
const grid = document.querySelector('#bingo-grid');
const name = document.querySelector('#viewer-name');
const status = document.querySelector('#round-status');
const banner = document.querySelector('#bingo-banner');
const rank = document.querySelector('#winner-rank');
const channel = document.querySelector('#channel-name');
const progress = document.querySelector('#marked-progress');
const errorMessage = document.querySelector('#error-message');
const tilesById = new Map();

function showCard(card) {
  name.textContent = card.user;
  channel.textContent = card.channelName ? `on ${card.channelName}` : '';
  status.textContent = card.status === 'live' ? 'ROUND LIVE' : card.status === 'ended' ? 'ROUND ENDED' : 'WAITING FOR ROUND';
  grid.replaceChildren();
  tilesById.clear();
  for (const square of card.squares) {
    const tile = document.createElement('div');
    tile.className = `tile${square.id === 'FREE' ? ' free' : ''}${square.hitAt ? ' hit' : ''}`;
    tile.setAttribute('role', 'gridcell');
    tile.setAttribute('aria-label', `${square.label}${square.hitAt ? ', marked' : ''}`);
    const label = document.createElement('span');
    label.textContent = square.label;
    tile.append(label);
    grid.append(tile);
    if (square.id !== 'FREE') tilesById.set(square.id, tile);
  }
  if (card.wonAt) showBingo(card.rank);
  updateProgress();
}

function updateProgress() {
  const marked = [...tilesById.values()].filter((tile) => tile.classList.contains('hit')).length;
  progress.textContent = `${marked}/24 squares`;
}

function markSquare(squareId) {
  const tile = tilesById.get(squareId);
  if (!tile || tile.classList.contains('hit')) return;
  tile.classList.add('hit');
  tile.setAttribute('aria-label', `${tile.textContent}, marked`);
  updateProgress();
}

function showBingo(cardRank) {
  banner.hidden = false;
  rank.textContent = cardRank ? `#${cardRank} winner` : '';
}

async function connect() {
  try {
    const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'This round has ended — type !bingo in chat for a new card.');
    }
    showCard(await response.json());
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws?card=${encodeURIComponent(cardId)}`);
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'round_state') {
        status.textContent = event.status === 'live' ? 'ROUND LIVE' : event.status === 'ended' ? 'ROUND ENDED' : 'WAITING FOR ROUND';
        for (const squareId of Object.keys(event.hits ?? {})) markSquare(squareId);
      } else if (event.type === 'square_hit') {
        markSquare(event.squareId);
      } else if (event.type === 'bingo' && event.cardId === cardId) {
        showBingo(event.rank);
      }
    });
    socket.addEventListener('close', () => { status.textContent = 'RECONNECTING…'; });
  } catch (error) {
    errorMessage.textContent = error instanceof Error ? error.message : 'Could not load your card.';
    errorMessage.hidden = false;
    name.textContent = error instanceof Error && error.message.includes('round has ended') ? 'This round has ended' : 'Card unavailable';
  }
}

connect();
