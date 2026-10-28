(() => {
  const params = new URLSearchParams(location.search);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toast = document.querySelector('#hit-toast');
  const toastText = toast.querySelector('.toast-text');
  const celebration = document.querySelector('#bingo-celebration');
  const winnerName = celebration.querySelector('.winner-name');
  const winnerRank = celebration.querySelector('.winner-rank');
  const panel = document.querySelector('#mini-panel');
  panel.hidden = params.get('panel') !== '1';
  let status = 'idle', cardsInPlay = 0, topWinners = [];
  const hitQueue = [], bingoQueue = [];
  let showingHit = false, showingBingo = false;
  const soundOn = params.get('sound') === '1';
  let audio;
  function tone(frequency, start, duration, type = 'sine', volume = .06) {
    if (!soundOn) return;
    try {
      audio ??= new AudioContext();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audio.currentTime + start);
      gain.gain.setValueAtTime(.0001, audio.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(volume, audio.currentTime + start + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + start + duration);
      oscillator.connect(gain).connect(audio.destination); oscillator.start(audio.currentTime + start); oscillator.stop(audio.currentTime + start + duration + .03);
    } catch (error) { console.warn('Overlay audio unavailable', error); }
  }
  function ding() { tone(880, 0, .35); }
  function fanfare() { tone(523, 0, .22); tone(659, .16, .24); tone(784, .34, .42); tone(1047, .62, .65, 'triangle', .08); }
  function updatePanel() {
    if (panel.hidden) return;
    panel.querySelector('.panel-status b').textContent = status;
    panel.querySelector('.panel-cards b').textContent = String(cardsInPlay);
    const list = panel.querySelector('.panel-winners'); list.replaceChildren();
    topWinners.slice(0, 3).forEach((winner) => { const item = document.createElement('li'); item.textContent = `#${winner.rank} ${winner.user}`; list.append(item); });
  }
  function showNextHit() {
    if (showingHit || !hitQueue.length) return;
    showingHit = true;
    const item = hitQueue.shift();
    toastText.textContent = `🎯 ${item.label} — ${item.markedCards} cards marked`;
    toast.setAttribute('aria-hidden', 'false'); toast.classList.add('visible'); ding();
    setTimeout(() => { toast.classList.remove('visible'); toast.setAttribute('aria-hidden', 'true'); setTimeout(() => { showingHit = false; showNextHit(); }, 380); }, 6000);
  }
  const canvas = document.querySelector('#confetti'), ctx = canvas.getContext('2d');
  let particles = [], confettiFrame;
  function burstConfetti() {
    if (reducedMotion || !ctx) return;
    canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    particles = Array.from({ length: 130 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 12, vy: (Math.random() - .9) * 13, size: 4 + Math.random() * 7, spin: Math.random() * 6, color: ['#a6ff00','#ffdf5d','#49e7ff','#ff5e8a'][Math.floor(Math.random()*4)] }));
    cancelAnimationFrame(confettiFrame);
    const draw = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      particles = particles.filter(p => p.y < innerHeight + 30);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += .22; p.spin += .12; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillStyle = p.color; ctx.fillRect(-p.size/2, -p.size/3, p.size, p.size*.65); ctx.restore(); }
      if (particles.length && showingBingo) confettiFrame = requestAnimationFrame(draw); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    draw();
  }
  function showNextBingo() {
    if (showingBingo || !bingoQueue.length) return;
    showingBingo = true;
    const item = bingoQueue.shift();
    winnerName.textContent = item.user;
    winnerRank.textContent = `#${item.rank}`;
    celebration.setAttribute('aria-hidden', 'false'); celebration.classList.add('visible'); fanfare(); burstConfetti();
    setTimeout(() => { celebration.classList.remove('visible'); celebration.setAttribute('aria-hidden', 'true'); showingBingo = false; setTimeout(showNextBingo, 300); }, 5000);
  }
  function receive(event) {
    if (event.type === 'round_state') { status = event.status ?? status; updatePanel(); }
    if (event.type === 'overlay_state' || event.type === 'dashboard_counts') {
      status = event.status ?? status; cardsInPlay = event.cardsInPlay ?? cardsInPlay;
      const winners = event.topWinners ?? event.winnersList ?? (Array.isArray(event.winners) ? event.winners : undefined);
      topWinners = winners ?? topWinners; updatePanel();
    }
    if (event.type === 'square_hit') { hitQueue.push({ label: String(event.label ?? 'Square'), markedCards: Number(event.markedCards ?? 0) }); showNextHit(); }
    if (event.type === 'bingo') { bingoQueue.push({ user: String(event.user ?? 'A viewer'), rank: Number(event.rank ?? 1) }); topWinners = [...topWinners, bingoQueue.at(-1)].slice(0, 3); updatePanel(); showNextBingo(); }
  }
  let retry = 500;
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws?role=overlay`);
    socket.addEventListener('open', () => { retry = 500; });
    socket.addEventListener('message', ({ data }) => { try { receive(JSON.parse(data)); } catch (error) { console.warn('Invalid overlay message', error); } });
    socket.addEventListener('error', (error) => console.warn('Overlay WebSocket error', error));
    socket.addEventListener('close', () => { setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); });
  }
  addEventListener('message', (message) => { if (message.origin === location.origin && message.data?.type === 'overlay_test_event') receive(message.data.event); });
  updatePanel(); connect();
})();
