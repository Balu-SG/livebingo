const state = {
  status: 'idle',
  counts: { cardsInPlay: 0, squaresHit: 0, winners: 0 },
  pool: [],
  roundSquares: [],
  hits: {},
  dirty: false,
};

const $ = (selector) => document.querySelector(selector);
const editorList = $('#square-editor-list');
const manualGrid = $('#manual-grid');
const demoEvents = $('#demo-events');
const voiceList = $('#voice-square-list');
const recognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let speechOn = false;
let recognition;
let restartTimer;
let socket;

function setMessage(selector, message, error = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.toggle('error-text', error);
}

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function renderCounts() {
  $('#cards-count').textContent = String(state.counts.cardsInPlay);
  $('#hits-count').textContent = String(state.counts.squaresHit);
  $('#winners-count').textContent = String(state.counts.winners);
  const badge = $('#round-state');
  badge.textContent = state.status.toUpperCase();
  badge.classList.toggle('live', state.status === 'live');
  badge.classList.toggle('ended', state.status === 'ended');
  $('#start-round').disabled = state.status === 'live';
  $('#end-round').disabled = state.status !== 'live';
  $('#listen-toggle').disabled = !recognitionApi || state.status !== 'live';
  $('#create-demo-cards').disabled = state.status !== 'live';
  renderManualHits();
  renderVoiceSquares();
  renderDemoEvents();
  if (state.status !== 'live' && speechOn) stopRecognition();
}

function updateCounts(payload) {
  state.status = payload.status ?? state.status;
  state.counts = {
    cardsInPlay: payload.cardsInPlay ?? state.counts.cardsInPlay,
    squaresHit: payload.squaresHit ?? state.counts.squaresHit,
    winners: payload.winners ?? state.counts.winners,
  };
  renderCounts();
}

function renderManualHits() {
  const manual = state.roundSquares.filter((square) => square.trigger.type === 'manual');
  $('#manual-count').textContent = String(manual.length);
  manualGrid.replaceChildren();
  if (!manual.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = state.status === 'live' ? 'No manual squares in this round.' : 'Manual hits appear here when a round is live.';
    manualGrid.append(empty);
    return;
  }
  for (const square of manual) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `manual-hit${state.hits[square.id] ? ' hit' : ''}`;
    button.textContent = state.hits[square.id] ? `✓ ${square.label}` : square.label;
    button.disabled = state.status !== 'live' || Boolean(state.hits[square.id]);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await api(`/api/squares/${encodeURIComponent(square.id)}/hit`, 'POST'); }
      catch (error) { button.disabled = false; setMessage('#round-message', error.message, true); }
    });
    manualGrid.append(button);
  }
}

function renderVoiceSquares() {
  voiceList.replaceChildren();
  const voiceSquares = state.roundSquares.filter((square) => square.trigger.type === 'voice');
  for (const square of voiceSquares) {
    const chip = document.createElement('span');
    chip.className = `voice-chip${state.hits[square.id] ? ' hit' : ''}`;
    chip.textContent = square.label;
    voiceList.append(chip);
  }
}

function setDirty(value = true) {
  state.dirty = value;
  $('#save-pool').disabled = !value;
  if (value) setMessage('#pool-message', 'Unsaved changes. They will apply to the next round.');
}

function makeInput(labelText, value, update, { type = 'text', min, max, maxLength } = {}) {
  const label = document.createElement('label');
  label.className = 'field-label';
  label.append(document.createTextNode(labelText));
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (maxLength !== undefined) input.maxLength = maxLength;
  input.addEventListener('input', () => update(input.value));
  label.append(input);
  return label;
}

function createSelect(labelText, options, value, update) {
  const label = document.createElement('label');
  label.className = 'field-label';
  label.append(document.createTextNode(labelText));
  const select = document.createElement('select');
  for (const [optionValue, optionName] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionName;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => update(select.value));
  label.append(select);
  return label;
}

function defaultTrigger(type) {
  if (type === 'event') return { type, event: 'follow' };
  if (type === 'chatBurst') return { type, keyword: 'hype', minUsers: 6, windowSec: 20 };
  if (type === 'voice') return { type, phrases: ['no shot'] };
  return { type: 'manual' };
}

function renderPool() {
  $('#pool-count').textContent = String(state.pool.length);
  editorList.replaceChildren();
  if (!state.pool.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No squares in the pool yet.';
    editorList.append(empty);
  }
  for (const square of state.pool) {
    const card = document.createElement('article');
    card.className = 'square-editor';
    const header = document.createElement('div');
    header.className = 'editor-head';
    const id = document.createElement('span');
    id.className = 'square-id';
    id.textContent = square.id;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-square';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${square.label}`);
    remove.addEventListener('click', () => {
      state.pool = state.pool.filter((item) => item.id !== square.id);
      setDirty();
      renderPool();
    });
    header.append(id, remove);
    const fields = document.createElement('div');
    fields.className = 'square-fields';
    fields.append(makeInput('Square label (max 28)', square.label, (value) => { square.label = value; setDirty(); }, { maxLength: 28 }));
    const typeOptions = [['event', 'Twitch event'], ['chatBurst', 'Chat burst'], ['voice', 'Voice phrase'], ['manual', 'Manual']];
    fields.append(createSelect('Trigger type', typeOptions, square.trigger.type, (type) => {
      square.trigger = defaultTrigger(type);
      setDirty();
      renderPool();
    }));
    const triggerFields = document.createElement('div');
    triggerFields.className = 'trigger-fields';
    const trigger = square.trigger;
    if (trigger.type === 'event') {
      triggerFields.append(createSelect('Event', [['raid', 'Raid'], ['follow', 'Follow'], ['sub', 'Subscription'], ['giftsub', 'Gift sub'], ['cheer', 'Cheer']], trigger.event, (value) => { trigger.event = value; if (value !== 'cheer') delete trigger.minBits; setDirty(); renderPool(); }));
      if (trigger.event === 'cheer') triggerFields.append(makeInput('Minimum bits (optional)', trigger.minBits, (value) => { if (value === '') delete trigger.minBits; else trigger.minBits = Number(value); setDirty(); }, { type: 'number', min: 0 }));
    } else if (trigger.type === 'chatBurst') {
      triggerFields.append(makeInput('Keyword', trigger.keyword, (value) => { trigger.keyword = value; setDirty(); }));
      triggerFields.append(makeInput('Unique viewers', trigger.minUsers, (value) => { trigger.minUsers = Number(value); setDirty(); }, { type: 'number', min: 1 }));
      triggerFields.append(makeInput('Window (seconds)', trigger.windowSec, (value) => { trigger.windowSec = Number(value); setDirty(); }, { type: 'number', min: 1 }));
    } else if (trigger.type === 'voice') {
      triggerFields.append(makeInput('Phrases (comma separated)', trigger.phrases.join(', '), (value) => { trigger.phrases = value.split(',').map((phrase) => phrase.trim()).filter(Boolean); setDirty(); }));
    } else {
      const note = document.createElement('span');
      note.className = 'hint';
      note.textContent = 'Tap it in Manual hits while a round is live.';
      triggerFields.append(note);
    }
    card.append(header, fields, triggerFields);
    editorList.append(card);
  }
  setDirty(state.dirty);
}

function renderDemoEvents() {
  demoEvents.replaceChildren();
  const events = [
    ['follow', 'Follow'], ['raid', 'Raid'], ['sub', 'Sub'], ['giftsub', 'Gift sub'], ['cheer?bits=500', 'Cheer · 500 bits'],
  ];
  for (const [path, label] of events) addDemoButton(`/api/demo/${path}`, `Demo ${label}`);
  const activePool = state.status === 'live' ? state.roundSquares : state.pool;
  for (const square of activePool.filter((item) => item.trigger.type === 'chatBurst')) {
    addDemoButton(`/api/demo/chatburst/${encodeURIComponent(square.id)}`, `Burst · ${square.label}`);
  }
}

function addDemoButton(path, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button secondary';
  button.textContent = label;
  button.disabled = state.status !== 'live';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api(path, 'POST');
      setMessage('#round-message', `${label} demo trigger sent.`);
    } catch (error) {
      setMessage('#round-message', error.message, true);
    } finally {
      button.disabled = state.status !== 'live';
    }
  });
  demoEvents.append(button);
}

function applySnapshot(snapshot) {
  state.status = snapshot.status;
  state.counts = { cardsInPlay: snapshot.cardsInPlay, squaresHit: snapshot.squaresHit, winners: snapshot.winners };
  state.pool = snapshot.configuredPool;
  state.roundSquares = snapshot.roundSquares;
  state.hits = snapshot.hits;
  renderCounts();
  renderPool();
  renderDemoEvents();
}

function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=dashboard`);
  socket.addEventListener('open', () => {
    $('#connection-dot').classList.add('connected');
    $('#connection-label').textContent = 'Live updates connected';
  });
  socket.addEventListener('close', () => {
    $('#connection-dot').classList.remove('connected');
    $('#connection-label').textContent = 'Reconnecting…';
    setTimeout(connectSocket, 2000);
  });
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.type === 'dashboard_state') applySnapshot(event);
    if (event.type === 'dashboard_counts') updateCounts(event);
    if (event.type === 'square_hit') state.hits[event.squareId] = event.at;
    if (event.type === 'square_hit') renderCounts();
    if (event.type === 'bingo') setMessage('#round-message', `🎉 ${event.user} got BINGO #${event.rank}`);
    if (event.type === 'configured_pool') {
      state.pool = event.squares;
      setDirty(false);
      renderPool();
      renderDemoEvents();
    }
  });
}

async function refreshDashboard() {
  try {
    applySnapshot(await api('/api/dashboard/state'));
  } catch (error) {
    setMessage('#round-message', error.message, true);
  }
}

$('#start-round').addEventListener('click', async () => {
  try {
    await api('/api/round/start', 'POST');
    setMessage('#round-message', 'Round started. New cards can join from chat with !bingo.');
  } catch (error) { setMessage('#round-message', error.message, true); }
});

$('#end-round').addEventListener('click', async () => {
  try {
    await api('/api/round/end', 'POST');
    setMessage('#round-message', 'Round ended.');
  } catch (error) { setMessage('#round-message', error.message, true); }
});

$('#add-square').addEventListener('click', () => {
  const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
  state.pool.push({ id, label: 'New moment', trigger: { type: 'manual' } });
  setDirty();
  renderPool();
});

$('#save-pool').addEventListener('click', async () => {
  try {
    const result = await api('/api/squares/pool', 'POST', { squares: state.pool });
    state.pool = result.squares;
    setDirty(false);
    setMessage('#pool-message', result.message);
    renderPool();
    renderDemoEvents();
  } catch (error) { setMessage('#pool-message', error.message, true); }
});

$('#reset-pool').addEventListener('click', async () => {
  try {
    const result = await api('/api/squares/reset', 'POST');
    state.pool = result.squares;
    setDirty(false);
    setMessage('#pool-message', result.message);
    renderPool();
    renderDemoEvents();
  } catch (error) { setMessage('#pool-message', error.message, true); }
});

$('#suggest-squares').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setMessage('#pool-message', 'Checking channel details and suggesting squares…');
  try {
    const result = await api('/api/squares/suggest', 'POST', { notes: $('#streamer-notes').value });
    state.pool = result.squares;
    setDirty(false);
    setMessage('#pool-message', result.message);
    renderPool();
    renderDemoEvents();
  } catch (error) { setMessage('#pool-message', error.message, true); }
  finally { button.disabled = false; }
});

$('#create-demo-cards').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api('/api/demo/cards', 'POST', { count: 5 });
    const cardsBox = $('#demo-cards');
    cardsBox.replaceChildren();
    for (const card of result.cards) {
      const link = document.createElement('a');
      link.className = 'demo-card-link';
      link.href = `/c/${encodeURIComponent(card.id)}`;
      link.textContent = `${card.user} card`;
      link.target = '_blank';
      link.rel = 'noopener';
      cardsBox.append(link);
    }
    setMessage('#round-message', 'Five demo cards created.');
  } catch (error) { setMessage('#round-message', error.message, true); }
  finally { button.disabled = state.status !== 'live'; }
});

function normalizeWords(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function editDistanceAtMostOne(first, second) {
  const a = Array.from(first);
  const b = Array.from(second);
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return edits;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits;
}

function fuzzyPhraseMatch(transcript, phrase) {
  const words = normalizeWords(transcript);
  const target = normalizeWords(phrase);
  if (!target.length || words.length < target.length) return false;
  for (let start = 0; start <= words.length - target.length; start += 1) {
    let edits = 0;
    for (let index = 0; index < target.length; index += 1) {
      edits += editDistanceAtMostOne(words[start + index], target[index]);
      if (edits > 1) break;
    }
    if (edits <= 1) return true;
  }
  return false;
}

async function handleFinalTranscript(text) {
  const voiceSquares = state.roundSquares.filter((square) => square.trigger.type === 'voice' && !state.hits[square.id]);
  for (const square of voiceSquares) {
    if (!square.trigger.phrases.some((phrase) => fuzzyPhraseMatch(text, phrase))) continue;
    try {
      await api(`/api/voice/${encodeURIComponent(square.id)}/hit`, 'POST');
      state.hits[square.id] = new Date().toISOString();
      $('#last-match').textContent = `Last match: ${square.label} · “${text}”`;
      renderVoiceSquares();
    } catch (error) { setMessage('#speech-support', error.message, true); }
  }
}

function startRecognition() {
  if (!speechOn || !recognitionApi) return;
  recognition = new recognitionApi();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = $('#speech-language').value;
  recognition.onresult = (event) => {
    let displayed = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      displayed += result[0].transcript;
      if (result.isFinal) void handleFinalTranscript(result[0].transcript.trim());
    }
    if (displayed) $('#transcript').textContent = displayed.trim();
  };
  recognition.onerror = (event) => {
    setMessage('#speech-support', `Microphone: ${event.error}. Allow access in Chrome to continue.`, true);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') stopRecognition();
  };
  recognition.onend = () => {
    if (speechOn) restartTimer = setTimeout(startRecognition, 350);
  };
  try { recognition.start(); }
  catch { restartTimer = setTimeout(startRecognition, 500); }
}

function stopRecognition() {
  speechOn = false;
  clearTimeout(restartTimer);
  try { recognition?.stop(); } catch { /* recognition may already be stopped */ }
  $('#listen-toggle').textContent = 'Listen to my mic';
  $('#transcript').textContent = 'Microphone listening is off.';
}

$('#listen-toggle').addEventListener('click', () => {
  if (speechOn) { stopRecognition(); return; }
  speechOn = true;
  $('#listen-toggle').textContent = 'Stop listening';
  $('#transcript').textContent = 'Starting microphone…';
  setMessage('#speech-support', 'Voice recognition works in Chrome. Allow microphone access when prompted.');
  startRecognition();
});

$('#speech-language').addEventListener('change', () => {
  if (speechOn) {
    try { recognition?.stop(); } catch { startRecognition(); }
  }
});

if (!recognitionApi) {
  $('#listen-toggle').disabled = true;
  setMessage('#speech-support', 'Speech recognition is unavailable here. Open this dashboard in Chrome to use voice triggers.');
}

refreshDashboard();
connectSocket();
