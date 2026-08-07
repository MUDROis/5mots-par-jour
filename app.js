'use strict';
const PROGRESS_KEY = '5mots_par_jour_progress';
const TASK_COUNT = 4;
const GROUP_SIZE = 4;
const TOTAL_WEEKS = typeof WEEKS !== 'undefined' ? WEEKS.length : 52;
let progress = {};
function themeGroup(w){ return Math.floor((w - 1) / 4); }
function dayKey(w, d){ return w + '-' + d; }
function loadProgress(){
  try{ progress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch(e){ progress = {}; }
}
function saveProgress(){
  try{
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    showSaveIndicator();
  }catch(e){}
  if(typeof window.syncProgressToFirestore === 'function') window.syncProgressToFirestore();
}
function showSaveIndicator(){
  const el = document.getElementById('saveIndicator');
  if(!el) return;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.classList.remove('show'); }, 2000);
}
function getDayData(w, d){
  const k = dayKey(w, d);
  if(!progress[k]) progress[k] = { stars: 0, tasks: {}, done: false };
  return progress[k];
}
function dayDone(w, d){
  const k = dayKey(w, d);
  return !!(progress[k] && progress[k].done);
}
function weekDone(w){ return [1,2,3,4,5].every(function(d){ return dayDone(w, d); }); }
function awardTaskStar(w, d, t){
  const data = getDayData(w, d);
  if(!data.tasks[t]){
    data.tasks[t] = true;
    data.stars = Object.keys(data.tasks).length;
    if(data.stars >= TASK_COUNT) data.done = true;
    saveProgress();
  }
}
function visibleWeek(){
  let v = GROUP_SIZE;
  while(v < TOTAL_WEEKS && groupDay5Done(v)){
    v = Math.min(TOTAL_WEEKS, v + GROUP_SIZE);
  }
  return v;
}
function maxOpenWeek(){
  if(typeof isAdminUser === 'function' && isAdminUser()) return TOTAL_WEEKS;
  if(typeof currentUser === 'function' && currentUser()){
    const a = (typeof currentAccess === 'function') ? currentAccess() : null;
    if(a === 'denied') return 0;
    if(a === 'full') return TOTAL_WEEKS;
    return visibleWeek();
  }
  return 1;
}
function canAccessWeek(w){ return w <= maxOpenWeek(); }
function canAccessAll(){ return maxOpenWeek() >= TOTAL_WEEKS; }
function groupDay5Done(end){
  const start = Math.max(1, end - GROUP_SIZE + 1);
  for(let w = start; w <= end; w++){
    if(!dayDone(w, 5)) return false;
  }
  return true;
}
function searchWeek(){
  const input = document.getElementById('weekSearch');
  const hint = document.getElementById('searchHint');
  const val = parseInt(input.value, 10);
  if(!val || val < 1 || val > TOTAL_WEEKS){
    input.classList.add('bad');
    hint.textContent = 'Введи номер недели от 1 до ' + TOTAL_WEEKS;
    setTimeout(function(){
      input.classList.remove('bad');
      hint.textContent = '';
    }, 2000);
    return;
  }
  if(val > maxOpenWeek()){
    showLockedWeek(val);
    return;
  }
  openWeek(val);
}
function shuffle(arr){ return arr.map(function(v){ return [Math.random(), v]; }).sort(function(a,b){ return a[0]-b[0]; }).map(function(v){ return v[1]; }); }
function toWord(a){ return { fr: a[0], ru: a[1], emoji: a[2] || '⭐' }; }
function getWords(w, d){
  const wk = WEEKS[w - 1];
  if(!wk) return [];
  if(d === 5){
    const all = [];
    for(let i = 0; i < 4; i++) all.push.apply(all, wk.days[i] || []);
    return all;
  }
  return wk.days[d - 1] || [];
}
let currentWeek = 11;
let currentDay = 1;
let gameWords = [];
function showScreen(id){
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  window.scrollTo(0, 0);
}
function showHome(){
  renderHome();
  showScreen('screen-home');
}
function openWeek(w){
  if(!canAccessWeek(w)){
    showLockedWeek(w);
    return;
  }
  currentWeek = w;
  document.body.setAttribute('data-theme', themeGroup(w));
  renderWeek(w);
  showScreen('screen-week');
}
function startDay(w, d){
  currentWeek = w;
  currentDay = d;
  document.body.setAttribute('data-theme', themeGroup(w));
  gameWords = getWords(w, d).map(toWord);
  document.getElementById('gameTitle').textContent = 'Неделя ' + w + ' • День ' + d;
  renderWelcome();
  updateGameHeader();
  showScreen('screen-game');
  showGameScreen(0);
}
function showGameScreen(n){
  document.querySelectorAll('.gscreen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('gscreen' + n).classList.add('active');
  window.scrollTo(0, 0);
}
function goTo(n){
  showGameScreen(n);
  if(n === 1) initFlashcards();
  if(n === 2) initTrace();
  if(n === 3) initDictation();
  if(n === 4) initMatch();
  if(n === 5) showFinal();
}
function renderHome(){
  const openMax = maxOpenWeek();
  const user = (typeof currentUser === 'function') ? currentUser() : null;
  const denied = !!user && (typeof currentAccess === 'function') && currentAccess() === 'denied';
  const guest = !user;
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  let daysDone = 0;
  for(let w = 1; w <= TOTAL_WEEKS; w++){
    const doneInWeek = [1,2,3,4,5].filter(function(d){ return dayDone(w, d); }).length;
    daysDone += doneInWeek;
  }
  const renderMax = (guest || denied) ? Math.min(GROUP_SIZE, TOTAL_WEEKS) : openMax;
  for(let w = 1; w <= renderMax; w++){
    const open = !denied && w <= openMax;
    const doneInWeek = [1,2,3,4,5].filter(function(d){ return dayDone(w, d); }).length;
    const starsInWeek = [1,2,3,4,5].reduce(function(s, d){ return s + getDayData(w, d).stars; }, 0);
    const card = document.createElement('button');
    card.className = 'week-card' + (open ? '' : ' locked');
    card.setAttribute('data-theme', themeGroup(w));
    let dots = '';
    for(let d = 1; d <= 5; d++) dots += '<span class="dot' + (getDayData(w, d).done ? ' done' : '') + '"></span>';
    card.innerHTML =
      '<div class="week-num">Неделя ' + w + '</div>' +
      '<div class="week-dots">' + dots + '</div>' +
      '<div class="week-badge">' + (open ? (doneInWeek === 5 ? '🏆' : '⭐ ' + starsInWeek) : '🔒') + '</div>';
    card.onclick = (function(ww){ return function(){ if(!denied && ww <= openMax) openWeek(ww); else showLockedWeek(ww); }; })(w);
    grid.appendChild(card);
  }
  const pct = Math.round(daysDone / (TOTAL_WEEKS * 5) * 100);
  document.getElementById('homeStats').textContent = '📅 Пройдено: ' + pct + '%';
  renderHomeHint();
}
function renderHomeHint(){
  const hint = document.getElementById('homeRevealHint');
  if(!hint) return;
  const user = (typeof currentUser === 'function') ? currentUser() : null;
  const acc = (typeof currentAccess === 'function') ? currentAccess() : null;
  if(user && acc === 'denied'){
    hint.textContent = '⛔ Доступ заблокирован. Обратись к преподавателю.';
    hint.className = 'reveal-hint';
    return;
  }
  if(!user){
    hint.textContent = '🔒 Пока доступна неделя 1. Войди в аккаунт, чтобы открыть недели 2–4 и все следующие по мере прохождения.';
    hint.className = 'reveal-hint';
    return;
  }
  if(canAccessAll()){
    hint.textContent = '🎉 Открыты все ' + TOTAL_WEEKS + ' недель — ты большая умница!';
    hint.className = 'reveal-hint reveal-ok';
  } else {
    hint.textContent = '📖 Пока открыты недели 1–' + visibleWeek() + '. Чтобы открыть следующие, пройди день 5 (повторение) в каждой из открытых недель.';
    hint.className = 'reveal-hint';
  }
}
function showLockedWeek(w){
  const hint = document.getElementById('homeRevealHint');
  const user = (typeof currentUser === 'function') ? currentUser() : null;
  const acc = (typeof currentAccess === 'function') ? currentAccess() : null;
  if(user && acc === 'denied'){
    hint.textContent = '⛔ Доступ заблокирован. Обратись к преподавателю.';
  } else if(!user){
    hint.textContent = '🔒 Войди в аккаунт, чтобы заниматься дальше. Пока тебе доступна неделя 1.';
  } else {
    hint.textContent = '📖 Неделя ' + w + ' ещё закрыта. Открывается после прохождения предыдущих недель (день 5 — повторение).';
  }
  hint.className = 'reveal-hint';
  window.scrollTo(0, hint.offsetTop - 10);
}
function renderWeek(w){
  document.getElementById('weekTitle').textContent = 'Неделя ' + w;
  document.getElementById('weekTrophy').textContent = weekDone(w) ? '🏆 Неделя пройдена — отлично!' : '';
  const list = document.getElementById('dayList');
  list.innerHTML = '';
  for(let d = 1; d <= 5; d++){
    const data = getDayData(w, d);
    const count = getWords(w, d).length;
    const wk = WEEKS[w - 1];
    const theme = wk && wk.theme ? wk.theme[d - 1] : '';
    const btn = document.createElement('button');
    btn.className = 'day-card' + (data.done ? ' done' : '');
    const label = d === 5 ? 'Повторение • ' + count + ' слов' : 'Новые слова • ' + count;
    btn.innerHTML =
      '<div><div class="day-num">День ' + d + '</div><div class="day-title">' + label + '</div>' +
      (theme ? '<div class="day-theme">🎯 Тема: ' + theme + '</div>' : '') + '</div>' +
      '<div class="day-status">' + (data.done ? '✅ Пройден' : '⭐ ' + data.stars + ' / 4') + '</div>';
    btn.onclick = (function(dd){ return function(){ startDay(w, dd); }; })(d);
    list.appendChild(btn);
  }
}
function renderWelcome(){
  const title = document.getElementById('welcomeTitle');
  title.textContent = currentDay === 5
    ? 'Привет! Повторяем все ' + gameWords.length + ' слов этой недели 🎉'
    : 'Привет! Сегодня учим ' + gameWords.length + ' новых слов 🚀';
  const list = document.getElementById('welcomeList');
  list.innerHTML = '';
  gameWords.forEach(function(w){
    const row = document.createElement('div');
    row.className = 'welcome-row';
    row.textContent = w.emoji + ' ' + w.fr + ' — ' + w.ru;
    list.appendChild(row);
  });
}
function renderFinalList(){
  const list = document.getElementById('finalList');
  list.innerHTML = '';
  gameWords.forEach(function(w){
    const row = document.createElement('div');
    row.className = 'welcome-row';
    row.textContent = w.emoji + ' ' + w.fr + ' — ' + w.ru;
    list.appendChild(row);
  });
}
function showFinal(){
  const data = getDayData(currentWeek, currentDay);
  document.getElementById('finalBadge').textContent = data.done ? '🏆' : '🏅';
  document.getElementById('finalTitle').textContent = data.done ? 'Bravo! День пройден! 🎉' : 'Тренировка завершена!';
  document.getElementById('finalStars').textContent = '⭐ '.repeat(data.stars) + '(' + data.stars + ' / 4 звёзд)';
  document.getElementById('finalWeekCup').textContent = weekDone(currentWeek) ? '🏆 Вся неделя пройдена — молодец!' : '';
  document.getElementById('finalDays').textContent =
    'Дней пройдено в неделе: ' + [1,2,3,4,5].filter(function(d){ return dayDone(currentWeek, d); }).length + ' / 5';
  renderFinalList();
  const nextBtn = document.getElementById('nextDayBtn');
  if(currentDay < 5){
    nextBtn.style.display = 'inline-block';
  } else {
    nextBtn.style.display = 'none';
  }
}
function nextDay(){ startDay(currentWeek, currentDay + 1); }
function updateGameHeader(){
  const data = getDayData(currentWeek, currentDay);
  document.getElementById('progressFill').style.width = (data.stars / TASK_COUNT * 100) + '%';
  document.getElementById('progressText').textContent = data.stars + ' / ' + TASK_COUNT + ' заданий';
  document.getElementById('starsDisplay').textContent = '⭐ ' + data.stars + ' / ' + TASK_COUNT;
}
function speak(text){
  if('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'){
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } else {
    alert('Браузер не поддерживает озвучку. Используй Chrome/Edge/Safari.');
  }
}
let currentFcIdx = 0, currentFcWord = '', fcOrder = [], flashcardsLearned = 0, fcAllDone = false;
function initFlashcards(){
  fcOrder = shuffle(gameWords.map(function(_, i){ return i; }));
  currentFcIdx = 0;
  flashcardsLearned = 0;
  fcAllDone = false;
  document.getElementById('flashcardsDone').style.display = 'none';
  showFlashcard();
}
function showFlashcard(){
  const w = gameWords[fcOrder[currentFcIdx]];
  currentFcWord = w.fr;
  document.getElementById('fcEmoji').textContent = w.emoji;
  document.getElementById('fcWord').textContent = w.fr;
  document.getElementById('fcEmojiBack').textContent = w.emoji;
  document.getElementById('fcWordBack').textContent = w.ru;
  document.getElementById('cardCounter').textContent = (currentFcIdx + 1) + ' / ' + gameWords.length;
  document.getElementById('flashcard').classList.remove('flipped');
  setTimeout(function(){ speak(w.fr); }, 300);
}
function flipCard(){
  document.getElementById('flashcard').classList.toggle('flipped');
}
function nextCard(){
  if(currentFcIdx < gameWords.length - 1){
    currentFcIdx++;
    showFlashcard();
  }
}
function prevCard(){
  if(currentFcIdx > 0){
    currentFcIdx--;
    showFlashcard();
  }
}
function markLearned(){
  if(fcAllDone) return;
  flashcardsLearned++;
  if(flashcardsLearned >= gameWords.length){
    fcAllDone = true;
    document.getElementById('flashcardsDone').style.display = 'inline-block';
    awardTaskStar(currentWeek, currentDay, 1);
    updateGameHeader();
  }
}
let traceIdx = 0, traceWord = '', traceChecked = false, traceOrder = [];
function initTrace(){
  traceOrder = shuffle(gameWords.map(function(_, i){ return i; }));
  traceIdx = 0;
  fitCanvas();
  showTrace();
}
function showTrace(){
  const idx = traceOrder[traceIdx];
  traceWord = gameWords[idx].fr;
  const display = document.getElementById('traceWordDisplay');
  display.textContent = traceWord;
  if(traceWord.length > 12){
    display.classList.add('long-phrase');
    display.innerHTML = traceWord.split(' ').map(function(w){ return '<span>' + w + '</span>'; }).join(' ');
  } else {
    display.classList.remove('long-phrase');
  }
  document.getElementById('traceRuDisplay').textContent = gameWords[idx].ru + ' ' + gameWords[idx].emoji;
  document.getElementById('traceCounter').textContent = 'Слово ' + (traceIdx + 1) + ' / ' + gameWords.length;
  document.getElementById('traceFeedback').textContent = '';
  document.getElementById('traceNext').style.display = 'none';
  traceChecked = false;
  clearCanvas();
  drawTraceGuide(traceWord);
}
const canvas = document.getElementById('traceCanvas');
const ctx = canvas.getContext('2d');
let drawing = false, lastX = 0, lastY = 0, hasDrawn = false;
let canvasScale = 1;
function fitCanvas(){
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasScale = dpr;
  canvas.width = Math.max(100, Math.round(r.width * dpr));
  canvas.height = Math.max(100, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function getPos(e){
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX || e.touches[0].clientX) - r.left;
  const y = (e.clientY || e.touches[0].clientY) - r.top;
  return { x: x * (canvas.width / r.width) / canvasScale, y: y * (canvas.height / r.height) / canvasScale };
}
function startDraw(e){ e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
function draw(e){
  if(!drawing) return;
  e.preventDefault();
  const p = getPos(e);
  ctx.strokeStyle = '#A55EEA';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  lastX = p.x;
  lastY = p.y;
  hasDrawn = true;
}
function stopDraw(){ drawing = false; }
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw);
canvas.addEventListener('touchmove', draw);
canvas.addEventListener('touchend', stopDraw);
window.addEventListener('resize', function(){
  if(document.getElementById('gscreen2').classList.contains('active')){
    fitCanvas();
    clearCanvas();
  }
});
function clearCanvas(){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); hasDrawn = false; drawTraceGuide(traceWord); }
function drawTraceGuide(word){
  ctx.fillStyle = '#F0E6FF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = canvas.width / canvasScale;
  const h = canvas.height / canvasScale;
  const parts = word.split(' ');
  let lines;
  if(parts.length > 1){
    const mid = Math.ceil(parts.length / 2);
    lines = [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')];
  } else {
    lines = [word];
  }
  let size = lines.length > 1
    ? Math.min(64, Math.floor(h / 2.5))
    : Math.min(110, Math.floor(h * 0.7));
  ctx.font = 'bold ' + size + 'px Comic Sans MS, sans-serif';
  while(size > 20 && lines.some(function(l){ return ctx.measureText(l).width > w - 16; })){
    size -= 4;
    ctx.font = 'bold ' + size + 'px Comic Sans MS, sans-serif';
  }
  const cy = h / 2;
  if(lines.length > 1){
    const step = Math.min(70, h / 2.2);
    lines.forEach(function(line, i){
      ctx.fillText(line, w / 2, cy + (i - (lines.length - 1) / 2) * step);
    });
  } else {
    ctx.fillText(word, w / 2, cy);
  }
}
function checkTrace(){
  if(traceChecked) return;
  if(!hasDrawn){
    document.getElementById('traceFeedback').textContent = '✏️ Сначала обведи буквы!';
    document.getElementById('traceFeedback').className = 'feedback bad';
    return;
  }
  traceChecked = true;
  document.getElementById('traceFeedback').textContent = '✨ Magnifique! Ты написал: ' + traceWord;
  document.getElementById('traceFeedback').className = 'feedback good';
  document.getElementById('traceNext').style.display = 'inline-block';
}
function nextTrace(){
  traceIdx++;
  if(traceIdx < gameWords.length){
    showTrace();
  } else {
    awardTaskStar(currentWeek, currentDay, 2);
    updateGameHeader();
    goTo(3);
  }
}
let currentDictationIdx = 0, currentDictationWord = '', dictChecked = false, dictationOrder = [];
function initDictation(){
  dictationOrder = shuffle(gameWords.map(function(_, i){ return i; }));
  currentDictationIdx = 0;
  showDictation();
}
function showDictation(){
  const idx = dictationOrder[currentDictationIdx];
  currentDictationWord = gameWords[idx].fr;
  document.getElementById('dictationInput').value = '';
  document.getElementById('dictationInput').className = 'dictation-input';
  document.getElementById('dictationCounter').textContent = 'Слово ' + (currentDictationIdx + 1) + ' / ' + gameWords.length;
  document.getElementById('dictationFeedback').textContent = '';
  document.getElementById('dictationNext').style.display = 'none';
  dictChecked = false;
  setTimeout(function(){ speak(currentDictationWord); }, 400);
}
function playDictation(){ speak(currentDictationWord); }
function normalizeFr(s){
  return String(s).toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function checkDictation(){
  const input = normalizeFr(document.getElementById('dictationInput').value);
  const correct = normalizeFr(currentDictationWord);
  if(input === correct){
    if(dictChecked) return;
    dictChecked = true;
    document.getElementById('dictationInput').classList.add('correct');
    document.getElementById('dictationFeedback').textContent = '✅ Excellent! ' + currentDictationWord;
    document.getElementById('dictationFeedback').className = 'feedback good';
    document.getElementById('dictationNext').style.display = 'inline-block';
  } else {
    document.getElementById('dictationInput').classList.add('wrong');
    document.getElementById('dictationFeedback').textContent = '❌ Попробуй ещё раз! Правильно: ' + currentDictationWord;
    document.getElementById('dictationFeedback').className = 'feedback bad';
  }
}
function nextDictation(){
  currentDictationIdx++;
  if(currentDictationIdx < gameWords.length){
    showDictation();
  } else {
    awardTaskStar(currentWeek, currentDay, 3);
    updateGameHeader();
    goTo(4);
  }
}
let matchSelected = null, matchPairs = 0;
function initMatch(){
  matchPairs = 0;
  matchSelected = null;
  const left = shuffle(gameWords.map(function(w, i){ return { text: w.fr, type: 'fr', idx: i }; }));
  const right = shuffle(gameWords.map(function(w, i){ return { text: w.ru + ' ' + w.emoji, type: 'ru', idx: i }; }));
  const grid = document.getElementById('matchGrid');
  grid.innerHTML = '';
  left.concat(right).forEach(function(item){
    const d = document.createElement('div');
    d.className = 'match-item';
    d.textContent = item.text;
    d.dataset.idx = item.idx;
    d.dataset.type = item.type;
    d.onclick = function(){ selectMatch(d); };
    grid.appendChild(d);
  });
  document.getElementById('matchFeedback').textContent = '';
  document.getElementById('matchNext').style.display = 'none';
}
function selectMatch(el){
  if(el.classList.contains('matched')) return;
  if(!matchSelected){
    matchSelected = el;
    el.classList.add('selected');
    return;
  }
  if(matchSelected === el){
    el.classList.remove('selected');
    matchSelected = null;
    return;
  }
  if(matchSelected.dataset.type === el.dataset.type){
    matchSelected.classList.remove('selected');
    matchSelected = el;
    el.classList.add('selected');
    return;
  }
  if(matchSelected.dataset.idx === el.dataset.idx){
    matchSelected.classList.remove('selected');
    matchSelected.classList.add('matched');
    el.classList.add('matched');
    matchPairs++;
    if(matchPairs === gameWords.length){
      awardTaskStar(currentWeek, currentDay, 4);
      updateGameHeader();
      document.getElementById('matchFeedback').textContent = '🎉 Все пары найдены!';
      document.getElementById('matchFeedback').className = 'feedback good';
      document.getElementById('matchNext').style.display = 'inline-block';
    }
    matchSelected = null;
    return;
  }
  const wrong = matchSelected;
  matchSelected = null;
  wrong.classList.remove('selected');
  wrong.style.background = '#FFD4D4';
  el.style.background = '#FFD4D4';
  setTimeout(function(){
    wrong.style.background = '';
    el.style.background = '';
  }, 500);
}
window.onAuthChanged = function(){
  renderHome();
};
loadProgress();
document.body.setAttribute('data-theme', themeGroup(currentWeek));
const searchInput = document.getElementById('weekSearch');
if(searchInput){
  searchInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      searchWeek();
    }
  });
}
showHome();