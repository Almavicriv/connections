const STORAGE_KEY = 'connections-boards';
const DELETED_KEY = 'connections-deleted';
const LEVELS = ['קל מאוד', 'קל', 'בינוני', 'קשה'];
const MAX_TRIES = 5;

const $ = (id) => document.getElementById(id);

// ---------- אחסון ----------
// לוחות מגיעים משני מקורות: boards.js (מה שפורסם באתר) ו־localStorage (מה שנוצר או נערך בדפדפן).
// לוח מקומי עם אותו id גובר על הלוח שפורסם.

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadBoards() {
  const local = readStorage(STORAGE_KEY);
  const deleted = readStorage(DELETED_KEY);
  const localIds = new Set(local.map((b) => b.id));
  const shared = (window.SHARED_BOARDS || []).filter(
    (b) => !localIds.has(b.id) && !deleted.includes(b.id)
  );
  return [...shared, ...local];
}

function saveBoard(board) {
  const local = readStorage(STORAGE_KEY).filter((b) => b.id !== board.id);
  local.push(board);
  writeStorage(STORAGE_KEY, local);
}

function deleteBoard(id) {
  writeStorage(STORAGE_KEY, readStorage(STORAGE_KEY).filter((b) => b.id !== id));
  writeStorage(DELETED_KEY, [...readStorage(DELETED_KEY), id]);
}

// ---------- פרסום ל־GitHub ----------
// כותב את כל הלוחות לקובץ boards.js בריפו, ו־GitHub Pages מעדכן את האתר.

const REPO = 'Almavicriv/connections';
const BRANCH = 'main';
const TOKEN_KEY = 'connections-gh-token';

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function publishBoards() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = (prompt('הדביקי את מפתח הגישה (token) של GitHub. הוא יישמר רק בדפדפן הזה.') || '').trim();
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
  }

  const btn = $('btn-publish');
  btn.disabled = true;
  btn.textContent = 'מפרסם…';

  const url = `https://api.github.com/repos/${REPO}/contents/boards.js`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const content =
    '// הלוחות שמתפרסמים באתר. הקובץ נכתב מכפתור "פרסום" — לא צריך לערוך ידנית.\n' +
    'window.SHARED_BOARDS = ' + JSON.stringify(loadBoards(), null, 2) + ';\n';

  try {
    const current = await fetch(`${url}?ref=${BRANCH}`, { headers, cache: 'no-store' });
    if (current.status === 401) throw new Error('auth');
    const sha = current.ok ? (await current.json()).sha : undefined;

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'עדכון לוחות', content: toBase64(content), sha, branch: BRANCH }),
    });
    if (res.status === 401 || res.status === 403) throw new Error('auth');
    if (!res.ok) throw new Error(res.status);

    alert('פורסם! האתר יתעדכן תוך דקה־שתיים.');
  } catch (err) {
    if (err.message === 'auth') {
      localStorage.removeItem(TOKEN_KEY);
      alert('מפתח הגישה לא תקין או שאין לו הרשאה. נסי שוב עם מפתח אחר.');
    } else {
      alert('הפרסום נכשל. בדקי את החיבור לאינטרנט ונסי שוב.');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'פרסום';
  }
}

// ---------- ניווט ----------

function showView(name) {
  for (const v of ['list', 'edit', 'game']) {
    $('view-' + v).classList.toggle('hidden', v !== name);
  }
  window.scrollTo(0, 0);
}

// ---------- רשימת לוחות ----------

function renderList() {
  const boards = loadBoards();
  const list = $('board-list');
  list.innerHTML = '';
  $('empty-msg').classList.toggle('hidden', boards.length > 0);
  $('btn-publish').classList.toggle('hidden', boards.length === 0);

  boards.forEach((board) => {
    const li = document.createElement('li');
    li.className = 'board-item';

    const name = document.createElement('button');
    name.className = 'board-name';
    name.textContent = board.name;
    name.onclick = () => startGame(board.id);

    const edit = document.createElement('button');
    edit.className = 'btn btn-small';
    edit.textContent = 'עריכה';
    edit.onclick = () => openEditor(board.id);

    const del = document.createElement('button');
    del.className = 'btn btn-small btn-danger';
    del.textContent = 'מחיקה';
    del.onclick = () => {
      if (confirm(`למחוק את "${board.name}"?`)) {
        deleteBoard(board.id);
        renderList();
      }
    };

    li.append(name, edit, del);
    list.appendChild(li);
  });

  showView('list');
}

// ---------- יצירה / עריכה ----------

let editingId = null;

function buildFormFields() {
  const container = $('groups-fields');
  container.innerHTML = '';
  LEVELS.forEach((level, i) => {
    const fs = document.createElement('fieldset');
    fs.className = `group-fieldset level-${i}`;
    fs.innerHTML = `
      <legend>${level}</legend>
      <input type="text" data-group="${i}" data-role="connection" placeholder="הקשר">
      <div class="words-inputs">
        ${[0, 1, 2, 3].map((w) =>
          `<input type="text" data-group="${i}" data-word="${w}" placeholder="מילה ${w + 1}">`
        ).join('')}
      </div>`;
    container.appendChild(fs);
  });
}

function openEditor(id = null) {
  editingId = id;
  buildFormFields();
  $('form-error').textContent = '';

  const board = id ? loadBoards().find((b) => b.id === id) : null;
  $('edit-title').textContent = board ? 'עריכת לוח' : 'לוח חדש';
  $('board-name').value = board ? board.name : '';

  if (board) {
    board.groups.forEach((g, i) => {
      document.querySelector(`[data-group="${i}"][data-role="connection"]`).value = g.connection;
      g.words.forEach((w, j) => {
        document.querySelector(`[data-group="${i}"][data-word="${j}"]`).value = w;
      });
    });
  }

  showView('edit');
}

function handleSave(e) {
  e.preventDefault();
  const groups = LEVELS.map((_, i) => ({
    connection: document.querySelector(`[data-group="${i}"][data-role="connection"]`).value.trim(),
    words: [0, 1, 2, 3].map((j) =>
      document.querySelector(`[data-group="${i}"][data-word="${j}"]`).value.trim()
    ),
  }));

  if (groups.some((g) => !g.connection || g.words.some((w) => !w))) {
    $('form-error').textContent = 'יש למלא את כל השדות.';
    return;
  }
  const allWords = groups.flatMap((g) => g.words);
  if (new Set(allWords).size !== allWords.length) {
    $('form-error').textContent = 'כל 16 המילים צריכות להיות שונות זו מזו.';
    return;
  }

  const boards = loadBoards();
  const name = $('board-name').value.trim();

  if (editingId) {
    const board = boards.find((b) => b.id === editingId);
    saveBoard({ ...board, name: name || board.name, groups });
  } else {
    saveBoard({
      id: Date.now().toString(),
      name: name || `לוח ${boards.length + 1}`,
      groups,
    });
  }

  renderList();
}

// ---------- משחק ----------

let game = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame(id) {
  const board = loadBoards().find((b) => b.id === id);
  if (!board) return;

  const tiles = board.groups.flatMap((g, level) => g.words.map((word) => ({ word, level })));

  game = {
    board,
    remaining: shuffle(tiles),
    solved: [],          // רמות הקבוצות שנפתרו, לפי סדר הפתרון
    selected: new Set(), // מילים שנבחרו
    hintUsed: false,
    triesLeft: MAX_TRIES,
  };

  $('game-title').textContent = board.name;
  hideMessage();
  $('win').classList.add('hidden');
  $('game-actions').classList.remove('hidden');
  renderGame();
  showView('game');
}

function renderGame() {
  // שורות שנפתרו
  const solved = $('solved');
  solved.innerHTML = '';
  game.solved.forEach((level) => {
    const g = game.board.groups[level];
    const row = document.createElement('div');
    row.className = `solved-row level-${level}`;
    const conn = document.createElement('div');
    conn.className = 'connection';
    conn.textContent = g.connection;
    const words = document.createElement('div');
    words.className = 'words';
    words.textContent = g.words.join(', ');
    row.append(conn, words);
    solved.appendChild(row);
  });

  // הלוח שנותר
  const grid = $('grid');
  grid.innerHTML = '';
  game.remaining.forEach((tile) => {
    const btn = document.createElement('button');
    btn.className = 'tile' + (game.selected.has(tile.word) ? ' selected' : '');
    btn.textContent = tile.word;
    btn.onclick = () => toggleTile(tile.word);
    grid.appendChild(btn);
  });

  // ניסיונות שנותרו
  $('tries').innerHTML = 'ניסיונות שנותרו: ' + '<span class="dot"></span>'.repeat(game.triesLeft);
  $('tries').classList.toggle('hidden', game.remaining.length === 0);

  $('btn-submit').disabled = game.selected.size !== 4;
  $('btn-hint').disabled = game.hintUsed;
}

function toggleTile(word) {
  if (game.selected.has(word)) {
    game.selected.delete(word);
  } else if (game.selected.size < 4) {
    game.selected.add(word);
  }
  hideMessage();
  renderGame();
}

function submitGuess() {
  if (game.selected.size !== 4) return;

  const picked = game.remaining.filter((t) => game.selected.has(t.word));
  const counts = {};
  picked.forEach((t) => { counts[t.level] = (counts[t.level] || 0) + 1; });
  const max = Math.max(...Object.values(counts));

  if (max === 4) {
    const level = picked[0].level;
    game.solved.push(level);
    game.remaining = game.remaining.filter((t) => t.level !== level);
    game.selected.clear();
    hideMessage();
    renderGame();
    if (game.remaining.length === 0) {
      endGame('כל הכבוד! מצאתם את כל הקשרים 🎉');
    }
    return;
  }

  playErrorSound();
  game.triesLeft--;
  showMessage(max === 3 ? '3/4' : 'לא נכון');

  if (game.triesLeft === 0) {
    // חושפים את הקבוצות שלא נפתרו
    const levels = [...new Set(game.remaining.map((t) => t.level))].sort();
    game.solved.push(...levels);
    game.remaining = [];
    game.selected.clear();
    hideMessage();
    renderGame();
    endGame('נגמרו הניסיונות 😕');
  } else {
    renderGame();
  }
}

let messageTimer = null;

function showMessage(text) {
  const el = $('message');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(hideMessage, 1000);
}

function hideMessage() {
  clearTimeout(messageTimer);
  $('message').classList.remove('show');
}

function endGame(text) {
  $('game-actions').classList.add('hidden');
  $('win-text').textContent = text;
  $('win').classList.remove('hidden');
}

let audioCtx = null;

function playErrorSound() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.12].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 150;
      gain.gain.setValueAtTime(0.12, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  } catch {
    // אין תמיכה בסאונד — ממשיכים בלי
  }
}

function useHint() {
  if (game.hintUsed) return;
  const hardest = Math.max(...game.remaining.map((t) => t.level));
  const words = game.remaining.filter((t) => t.level === hardest).slice(0, 2);
  game.selected = new Set(words.map((t) => t.word));
  game.hintUsed = true;
  hideMessage();
  renderGame();
}

// ---------- אירועים ----------

$('btn-add').onclick = () => openEditor();
$('btn-publish').onclick = publishBoards;
$('btn-cancel').onclick = renderList;
$('board-form').onsubmit = handleSave;
$('btn-back').onclick = renderList;
$('btn-win-back').onclick = renderList;
$('btn-submit').onclick = submitGuess;
$('btn-hint').onclick = useHint;

renderList();
