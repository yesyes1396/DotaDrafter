// Game UI elements
const input = document.getElementById('guessInput');
const submitBtn = document.getElementById('submitBtn');
const surrenderBtn = document.getElementById('surrenderBtn');
const restartBtn = document.getElementById('restartBtn');
const message = document.getElementById('message');
const guessesTableBody = document.querySelector('#guesses tbody');
const viewAllHeroesBtn = document.getElementById('viewAllHeroesBtn');
const allHeroesModal = new bootstrap.Modal(document.getElementById('allHeroesModal'));
const modeClassicBtn = document.getElementById('modeClassicBtn');
const modeDailyBtn = document.getElementById('modeDailyBtn');
const hardModeToggle = document.getElementById('hardModeToggle');
const modeHelpEl = document.getElementById('modeHelp');
const statsSummaryEl = document.getElementById('statsSummary');

// Game state
let heroes = [];
let secret = null;
let gameOver = false;
let mode = 'daily'; // 'classic' | 'daily'
let hardMode = false;
let attempts = 0;
const HARD_MAX_ATTEMPTS = 6;

const SETTINGS_KEY = 'dotaguesser_settings';
const DAILY_PROGRESS_KEY = 'dotaguesser_daily_progress';

let dailyTimerInterval = null;

const attrMap = {STR: 'Strength', AGI: 'Agility', INT: 'Intelligence', UNI: 'Universal'};
const attackMap = {Melee: 'Melee', Ranged: 'Ranged'};

function mapComplexity(raw){
  if(!raw) return '-';
  const s = String(raw).trim().toLowerCase();
  if(!s || s==='-' || s==='—') return '-';
  if(s.includes('легк') || s==='easy') return 'Easy';
  if(s.includes('сред') || s==='medium' || s==='normal') return 'Medium';
  if(s.includes('слож') || s==='hard') return 'Hard';
  return raw;
}

function canonicalGender(g){
  if(!g) return null;
  const s = String(g).trim().toLowerCase();
  if(!s || s==='-' || s==='—' || s==='нет' || s==='none') return null;
  if(['male','m','мужской','мужчина'].includes(s)) return 'male';
  if(['female','f','женский','женщина'].includes(s)) return 'female';
  return s;
}

function displayGender(g){
  const c = canonicalGender(g);
  if(c==='male') return 'Male';
  if(c==='female') return 'Female';
  if(!g) return '-';
  const s = String(g).trim();
  return s || '-';
}

// Load heroes from JSON
function loadHeroes(){
  return fetch('heroes.json?v=3', { cache: 'no-store' }).then(r=>r.json()).then(base=>{
    let overrides = null;
    try{ const raw = localStorage.getItem('dotadle_heroes'); if(raw) overrides = JSON.parse(raw); }catch(e){ overrides = null; }
    const map = new Map();
    (base||[]).forEach(h=> map.set(normalize(h.name), Object.assign({}, h)));
    if(Array.isArray(overrides)){
      overrides.forEach(o=>{
        const key = normalize(o.name||'');
        if(!key) return;
        const baseEntry = map.get(key) || {};
        const merged = Object.assign({}, baseEntry);
        Object.keys(o).forEach(k=>{
          const v = o[k];
          if(k==='name') return;
          if(Array.isArray(v)){
            if(v.length>0) merged[k]=v;
            return;
          }
          if(v===undefined || v===null) return;
          if(typeof v === 'string'){
            const t = v.trim();
            if(t==='' || t==='-' || t==='—') return;
            merged[k]=v;
            return;
          }
          merged[k]=v;
        });
        map.set(key, merged);
      });
    }
    heroes = Array.from(map.values());
  }).catch(()=>{ heroes = []; });
}

loadHeroes().then(()=>{
  localStorage.removeItem('dotadle_heroes');
  
  heroes = heroes.map(h=>({
    name: h.name || 'Unknown',
    gender: h.gender || '—',
    types: h.types || h.videos || [],
    roles: h.roles || h.positions || [],
    attr: h.attr || h.atribut || h.attribute || null,
    attack: h.attack || null,
    complexity: mapComplexity(h.complexity || h.сложность || h['complexity'] || '-'),
    year: h.year || h['год'] || '-',
    internal: h.internal || null,
  }));
  loadSettings();
  applySettingsToUI();
  startNew();
});

function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(data && typeof data === 'object'){
      if(data.mode === 'classic' || data.mode === 'daily') mode = data.mode;
      if(typeof data.hardMode === 'boolean') hardMode = data.hardMode;
    }
  }catch(e){}
}

function saveSettings(){
  try{
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({mode, hardMode}));
  }catch(e){}
}

function getMsToNextLocalMidnight(){
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

function formatRemaining(ms){
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2,'0');
  const m = String(Math.floor((total % 3600)/60)).padStart(2,'0');
  const s = String(total % 60).padStart(2,'0');
  return `${h}:${m}:${s}`;
}

function startDailyTimer(){
  if(!statsSummaryEl) return;
  if(dailyTimerInterval) window.clearInterval(dailyTimerInterval);
  const tick = ()=>{
    const ms = getMsToNextLocalMidnight();
    statsSummaryEl.textContent = `Next daily hero in ${formatRemaining(ms)}.`;
  };
  tick();
  dailyTimerInterval = window.setInterval(tick, 1000);
}

function stopDailyTimer(){
  if(dailyTimerInterval){
    window.clearInterval(dailyTimerInterval);
    dailyTimerInterval = null;
  }
  if(statsSummaryEl){
    statsSummaryEl.textContent = '';
  }
}

function getTodayKey(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function loadDailyProgress(){
  try{
    const raw = localStorage.getItem(DAILY_PROGRESS_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || typeof data !== 'object') return null;
    if(data.date !== getTodayKey()) return null;
    return data;
  }catch(e){
    return null;
  }
}

function saveDailyProgress(status){
  try{
    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify({
      date: getTodayKey(),
      status: status
    }));
  }catch(e){}
}

function applySettingsToUI(){
  if(modeClassicBtn && modeDailyBtn){
    if(mode === 'daily'){
      modeDailyBtn.classList.add('active');
      modeClassicBtn.classList.remove('active');
    } else {
      modeClassicBtn.classList.add('active');
      modeDailyBtn.classList.remove('active');
    }
  }
  if(hardModeToggle){
    hardModeToggle.checked = hardMode;
  }
  updateModeHelp();
  if(mode === 'daily') startDailyTimer();
  else stopDailyTimer();
}

function updateModeHelp(){
  if(!modeHelpEl) return;
  let text = '';
  if(mode === 'daily'){
    text = 'Daily mode: one fixed hero per day.';
  } else {
    text = 'Classic mode: random hero every game.';
  }
  if(hardMode){
    text += ' Hard mode: limited number of attempts.';
  }
  modeHelpEl.textContent = text;
}

function saveHeroes(){
  try{ localStorage.setItem('dotadle_heroes', JSON.stringify(heroes)); }catch(e){}
}

function pickRandom(){
  return heroes[Math.floor(Math.random()*heroes.length)];
}

function getDailyHero(){
  if(!heroes.length) return null;
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const epoch = Date.UTC(2024,0,1);
  const days = Math.floor((utc - epoch) / 86400000);
  const idx = ((days % heroes.length) + heroes.length) % heroes.length;
  return heroes[idx];
}

// Start new game
function startNew(){
  if(!heroes || heroes.length === 0){
    message.textContent = 'Failed to load hero list.';
    return;
  }
  secret = (mode === 'daily') ? getDailyHero() : pickRandom();
  attempts = 0;
  guessesTableBody.innerHTML = '';
  gameOver = false;
  input.disabled = false;
  input.value = '';
  let baseMsg = 'Game started. Type hero name and press "Guess".';
  if(mode === 'daily'){
    baseMsg = 'Daily game. One hero for today — try to guess it!';
    const progress = loadDailyProgress();
    if(progress && progress.status){
      const letters = letterMatches(secret.name, secret.name);
      renderGuessRow(secret, letters);
      gameOver = true;
      input.disabled = true;
      message.textContent = 'Today\'s daily hero is already completed. Come back tomorrow for a new one.';
      return;
    }
  }
  if(hardMode){
    baseMsg += ` Hard mode: you have ${HARD_MAX_ATTEMPTS} attempts.`;
  }
  message.textContent = baseMsg;
  input.focus();
}

function normalize(s){
  // Normalize unicode, remove diacritics, unify dashes/apostrophes and collapse spaces
  if(!s) return '';
  try{
    let t = String(s);
    t = t.normalize && t.normalize('NFD') || t;
    t = t.replace(/\p{Diacritic}/gu, '');
    t = t.replace(/[\u2010-\u2015\u2212]/g, '-');
    t = t.replace(/[’‘`ʼ⁄]/g, "'");
    t = t.replace(/\s+/g, ' ');
    return t.trim().toLowerCase();
  }catch(e){
    return String(s||'').trim().toLowerCase();
  }
}

function normalizeLetters(s){
  const n = normalize(s);
  return n.replace(/[^a-z0-9]/g,'');
}

function getInitials(name){
  return normalize(name)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .map(w=>w[0])
    .join('');
}

// Search hero by name, abbreviation or initials
function findHeroByName(name){
  const n = normalize(name);
  const compact = normalizeLetters(name);
  const initials = getInitials(name);
  return heroes.find(h=>{
    const hn = normalize(h.name);
    if(hn === n) return true;
    const hc = normalizeLetters(h.name);
    if(compact && hc === compact) return true;
    const hi = getInitials(h.name);
    if(initials && hi === initials) return true;
    return false;
  });
}

const suggestionsEl = document.getElementById('suggestions');

// Generate autocomplete suggestions
function updateSuggestions(prefix){
  const q = normalize(prefix);
  const qLetters = normalizeLetters(prefix);
  if(!q && !qLetters){ suggestionsEl.style.display='none'; return; }
  const all = heroes.filter(h=>{
    const hn = normalize(h.name);
    const hl = normalizeLetters(h.name);
    const hi = getInitials(h.name);
    if(q && hn.includes(q)) return true;
    if(qLetters && hl.startsWith(qLetters)) return true;
    if(qLetters && hi.startsWith(qLetters)) return true;
    return false;
  });
  all.sort((a,b)=>{
    const na = normalize(a.name);
    const nb = normalize(b.name);
    // Exact match - highest priority
    if(na === q && nb !== q) return -1;
    if(nb === q && na !== q) return 1;
    // Exact word match (after space/dash) second priority
    const aWordStart = na.startsWith(q) || /[\s\-]/.test(na.charAt(q.length-1)) && na.includes(' '+q) || na.includes('-'+q);
    const bWordStart = nb.startsWith(q) || /[\s\-]/.test(nb.charAt(q.length-1)) && nb.includes(' '+q) || nb.includes('-'+q);
    if(aWordStart && !bWordStart) return -1;
    if(bWordStart && !aWordStart) return 1;
    // Starts with query string
    const aStarts = na.startsWith(q);
    const bStarts = nb.startsWith(q);
    if(aStarts && !bStarts) return -1;
    if(bStarts && !aStarts) return 1;
    // Position of first occurrence
    const ai = na.indexOf(q);
    const bi = nb.indexOf(q);
    if(ai !== bi) return ai - bi;
    // Shorter names are usually better matches
    if(na.length !== nb.length) return na.length - nb.length;
    // Alphabetical as last resort
    return na.localeCompare(nb);
  });
  const matches = all.slice(0,12);
  suggestionsEl.innerHTML = '';
  if(matches.length===0){ suggestionsEl.style.display='none'; return; }
  matches.forEach(m=>{
    const item = document.createElement('button');
    item.type='button';
    item.className='list-group-item list-group-item-action bg-transparent text-white';
    item.textContent = m.name;
    item.addEventListener('click',()=>{ 
      suggestionsEl.style.display='none'; 
      processGuessWithHero(m);
    });
    suggestionsEl.appendChild(item);
  });
  const first = suggestionsEl.querySelector('.list-group-item');
  if(first) first.classList.add('active');
  suggestionsEl.style.display='block';
}

input.addEventListener('input',e=>{
  updateSuggestions(e.target.value);
});

document.addEventListener('click',e=>{ if(!e.target.closest('#suggestions') && !e.target.closest('#guessInput')) suggestionsEl.style.display='none'; });

function letterMatches(a,b){
  const aa = (a||'').replace(/[^a-zA-Z]/g,'').toLowerCase();
  const bb = (b||'').replace(/[^a-zA-Z]/g,'').toLowerCase();
  const setB = new Set(bb.split(''));
  return [...new Set(aa.split(''))].filter(ch=>setB.has(ch)).length;
}

function makePill(text, match){
  const span = document.createElement('span');
  span.className = 'pill';
  if(match) span.classList.add('match');
  span.textContent = text;
  return span;
}

// Render guess row in the table
function renderGuessRow(guessHero, lettersCount){
  const tr = document.createElement('tr');

  const tdName = document.createElement('td');
  tdName.dataset.label = 'Hero';
  tdName.className = 'name-cell';
  const img = document.createElement('img');
  img.className = 'hero-icon';
  const internal = guessHero.internal || (normalize(guessHero.name).replace(/[^a-z0-9]+/g,'_'));
  img.src = `assets/icons/${internal}.png`;
  img.onerror = function(){
    if(!this.dataset.attempt){
      this.dataset.attempt = 'png_failed';
      this.src = `assets/icons/${internal}.svg`;
      return;
    }
    if(this.dataset.attempt === 'png_failed'){
      this.dataset.attempt = 'svg_failed';
      this.src = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/${internal}_icon.png`;
      return;
    }
    this.src = 'assets/icons/unknown.svg';
  };
  const nameEl = document.createElement('strong');
  nameEl.className = 'hero-name';
  nameEl.textContent = guessHero.name;
  tdName.appendChild(img);
  tdName.appendChild(nameEl);
  tr.appendChild(tdName);

  const tdGender = document.createElement('td');
  tdGender.dataset.label = 'Gender';
  const gRaw = guessHero.gender || '—';
  const gText = displayGender(gRaw);
  const gMatch = canonicalGender(guessHero.gender) && canonicalGender(secret.gender) && (canonicalGender(guessHero.gender) === canonicalGender(secret.gender));
  tdGender.appendChild(makePill(gText, gMatch));
  tr.appendChild(tdGender);

  const tdTypes = document.createElement('td');
  tdTypes.dataset.label = 'Race';
  const types = guessHero.types || [];
  if(types.length===0) tdTypes.appendChild(makePill('-'));
  types.forEach(t=>{
    const match = secret.types && secret.types.includes(t);
    tdTypes.appendChild(makePill(t, match));
  });
  tr.appendChild(tdTypes);

  const tdPos = document.createElement('td');
  tdPos.dataset.label = 'Roles';
  const pos = guessHero.roles || [];
  if(pos.length===0) tdPos.appendChild(makePill('-'));
  pos.forEach(p=>{
    const match = secret.roles && secret.roles.includes(p);
    tdPos.appendChild(makePill(p, match));
  });
  tr.appendChild(tdPos);

  const tdAttr = document.createElement('td');
  tdAttr.dataset.label = 'Attribute';
  const attr = attrMap[guessHero.attr]||guessHero.attr||'-';
  const attrMatch = guessHero.attr && secret.attr && guessHero.attr===secret.attr;
  tdAttr.appendChild(makePill(attr, attrMatch));
  tr.appendChild(tdAttr);

  const tdAttack = document.createElement('td');
  tdAttack.dataset.label = 'Attack type';
  const att = attackMap[guessHero.attack]||guessHero.attack||'-';
  const attMatch = guessHero.attack && secret.attack && guessHero.attack===secret.attack;
  tdAttack.appendChild(makePill(att, attMatch));
  tr.appendChild(tdAttack);

  const tdComp = document.createElement('td');
  tdComp.dataset.label = 'Complexity';
  const comp = guessHero.complexity || '-';
  const compMatch = secret.complexity && comp===secret.complexity;
  tdComp.appendChild(makePill(comp, compMatch));
  tr.appendChild(tdComp);

  const tdYear = document.createElement('td');
  tdYear.dataset.label = 'Release';
  const rawYearGuess = guessHero.year;
  const rawYearSecret = secret.year;
  const year = rawYearGuess || '-';
  const yearMatch = rawYearGuess && rawYearSecret && rawYearGuess === rawYearSecret;
  let yearText = year;
  if(rawYearGuess && rawYearSecret && rawYearGuess !== '-' && rawYearSecret !== '-'){
    const yg = Number(rawYearGuess);
    const ys = Number(rawYearSecret);
    if(!Number.isNaN(yg) && !Number.isNaN(ys)){
      if(yg < ys){
        yearText = `${year} ↑`;
      } else if(yg > ys){
        yearText = `${year} ↓`;
      }
    }
  }
  tdYear.appendChild(makePill(yearText, yearMatch));
  tr.appendChild(tdYear);

  const tdActions = document.createElement('td');
  tdActions.dataset.label = '';
  tr.appendChild(tdActions);

  if(guessesTableBody.firstChild) guessesTableBody.insertBefore(tr, guessesTableBody.firstChild);
  else guessesTableBody.appendChild(tr);
}

viewAllHeroesBtn.addEventListener('click', ()=> allHeroesModal.show());

// Process hero guess
function processGuessWithHero(hero){
  if(gameOver){ return; }
  if(!hero){ message.textContent = 'Hero not found. Check spelling (use English hero names).'; return; }
  const letters = letterMatches(hero.name, secret.name);
  renderGuessRow(hero, letters);
  attempts += 1;
  if(hero.name===secret.name){
    gameOver = true;
    input.disabled = true;
    message.textContent = `🎉 Correct! The hero is ${secret.name}.`;
    if(mode === 'daily'){
      saveDailyProgress('win');
    }
  } else if(hardMode && attempts >= HARD_MAX_ATTEMPTS){
    gameOver = true;
    input.disabled = true;
    message.textContent = `No attempts left (${attempts}/${HARD_MAX_ATTEMPTS}). The hero was: ${secret.name}.`;
    if(mode === 'daily'){
      saveDailyProgress('lose');
    }
  } else {
    let msg = `No, this is not ${hero.name}. Check the hints in the row.`;
    if(hardMode){
      msg += ` Attempts: ${attempts}/${HARD_MAX_ATTEMPTS}.`;
    }
    message.textContent = msg;
  }
  input.value = '';
  if(!gameOver) input.focus();
}

// Process guess from input
function processGuess(){
  if(gameOver){ return; }
  const val = input.value.trim();
  if(!val){ message.textContent = 'Type a hero name.'; return; }
  const found = findHeroByName(val);
  if(!found){ message.textContent = 'Hero not found. Check spelling (use English hero names).'; return; }
  processGuessWithHero(found);
}

submitBtn.addEventListener('click',()=>{
  processGuess();
});

input.addEventListener('keydown',e=>{
  const items = suggestionsEl.querySelectorAll('.list-group-item');
  const suggestionsVisible = suggestionsEl.style.display==='block' && items.length>0;

  if(e.key==='Tab' && suggestionsVisible){
    e.preventDefault();
    const active = suggestionsEl.querySelector('.list-group-item.active');
    if(active){ 
      const heroName = active.textContent.trim();
      input.value = heroName;
      suggestionsEl.style.display='none';
      updateSuggestions(heroName);
    }
    return;
  }

  if(e.key==='Enter' && suggestionsVisible){
    e.preventDefault();
    const inputValue = input.value.trim();
    const heroObj = findHeroByName(inputValue);
    if(heroObj){
      suggestionsEl.style.display='none';
      processGuessWithHero(heroObj);
      return;
    }
    const active = suggestionsEl.querySelector('.list-group-item.active');
    if(active){ 
      const heroName = active.textContent.trim();
      const heroObj2 = findHeroByName(heroName);
      if(heroObj2){
        suggestionsEl.style.display='none';
        processGuessWithHero(heroObj2);
      }
    }
    return;
  }

  if(e.key==='Enter') processGuess();
});

restartBtn.addEventListener('click',()=>{
  startNew();
});

surrenderBtn.addEventListener('click',()=>{
  if(!secret) return;
  const letters = letterMatches(secret.name, secret.name);
  renderGuessRow(secret, letters);
  gameOver = true;
  input.disabled = true;
  message.textContent = `😢 You gave up. The hero was: ${secret.name}.`;
  if(mode === 'daily'){
    saveDailyProgress('surrender');
  }
});

if(modeClassicBtn && modeDailyBtn){
  modeClassicBtn.addEventListener('click',()=>{
    if(mode === 'classic') return;
    mode = 'classic';
    saveSettings();
    applySettingsToUI();
    startNew();
  });
  modeDailyBtn.addEventListener('click',()=>{
    if(mode === 'daily') return;
    mode = 'daily';
    saveSettings();
    applySettingsToUI();
    startNew();
  });
}

if(hardModeToggle){
  hardModeToggle.addEventListener('change', e=>{
    hardMode = !!e.target.checked;
    saveSettings();
    updateModeHelp();
    startNew();
  });
}
