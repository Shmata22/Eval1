const APP_VERSION = '1.0.0';
const SESSION_SIZE = 10;
const BANK_SIZE = 100;

const screens = {
  home: document.getElementById('homeScreen'),
  maths: document.getElementById('mathsScreen'),
  lesson: document.getElementById('lessonScreen'),
  evaluation: document.getElementById('evaluationScreen'),
  exercise: document.getElementById('exerciseScreen'),
  results: document.getElementById('resultsScreen'),
};

const titles = {
  home: 'Tableau de bord',
  maths: 'Maths',
  lesson: 'Leçon',
  evaluation: 'Évaluation',
  exercise: 'Session d’exercices',
  results: 'Résultats',
};

const difficultyNames = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
};

const state = {
  route: 'home',
  history: ['home'],
  currentDifficulty: 'easy',
  session: [],
  sessionIndex: 0,
  answers: [],
  sessionStartedAt: null,
};

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function integerBetween(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function makeExercise(difficulty, index, random) {
  let divisor;
  let quotient;
  let remainder;

  if (difficulty === 'easy') {
    divisor = integerBetween(random, 1, 9);
    quotient = integerBetween(random, 3, 110);
    remainder = random() < 0.5 ? 0 : integerBetween(random, 0, Math.max(0, divisor - 1));
    let dividend = divisor * quotient + remainder;

    // Garantie : dividende jusqu'à 3 chiffres.
    while (dividend > 999) {
      quotient = integerBetween(random, 2, 99);
      remainder = random() < 0.5 ? 0 : integerBetween(random, 0, Math.max(0, divisor - 1));
      dividend = divisor * quotient + remainder;
    }

    return buildExercise(difficulty, index, dividend, divisor, quotient, remainder);
  }

  if (difficulty === 'medium') {
    divisor = integerBetween(random, 10, 99);
    quotient = integerBetween(random, 8, 9800);
    remainder = random() < 0.45 ? 0 : integerBetween(random, 0, divisor - 1);
    return buildExercise(difficulty, index, divisor * quotient + remainder, divisor, quotient, remainder);
  }

  divisor = integerBetween(random, 100, 999);
  quotient = integerBetween(random, 12, 78000);
  remainder = random() < 0.4 ? 0 : integerBetween(random, 0, divisor - 1);
  return buildExercise(difficulty, index, divisor * quotient + remainder, divisor, quotient, remainder);
}

function buildExercise(difficulty, index, dividend, divisor, quotient, remainder) {
  return {
    id: `${difficulty}-${index}-${dividend}-${divisor}`,
    difficulty,
    dividend,
    divisor,
    quotient,
    remainder,
  };
}

function buildBank(difficulty) {
  const seeds = { easy: 9811, medium: 49157, hard: 81799 };
  const random = mulberry32(seeds[difficulty]);
  const map = new Map();
  let safety = 0;

  while (map.size < BANK_SIZE && safety < 5000) {
    const exercise = makeExercise(difficulty, map.size + safety, random);
    const key = `${exercise.dividend}/${exercise.divisor}`;
    if (!map.has(key)) map.set(key, { ...exercise, id: `${difficulty}-${map.size + 1}` });
    safety += 1;
  }

  return Array.from(map.values());
}

const banks = {
  easy: buildBank('easy'),
  medium: buildBank('medium'),
  hard: buildBank('hard'),
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function defaultStats() {
  return {
    version: APP_VERSION,
    sessions: 0,
    attempts: 0,
    correct: 0,
    byDifficulty: {
      easy: { sessions: 0, attempts: 0, correct: 0 },
      medium: { sessions: 0, attempts: 0, correct: 0 },
      hard: { sessions: 0, attempts: 0, correct: 0 },
    },
    lastSessions: [],
  };
}

function getStats() {
  const stats = readJson('cm1-maths-division-stats', defaultStats());
  return { ...defaultStats(), ...stats, byDifficulty: { ...defaultStats().byDifficulty, ...stats.byDifficulty } };
}

function saveStats(stats) {
  writeJson('cm1-maths-division-stats', stats);
}

function getSeen(difficulty) {
  return new Set(readJson(`cm1-maths-division-seen-${difficulty}`, []));
}

function saveSeen(difficulty, seenSet) {
  writeJson(`cm1-maths-division-seen-${difficulty}`, Array.from(seenSet));
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickSessionExercises(difficulty) {
  const bank = banks[difficulty];
  let seen = getSeen(difficulty);
  const selected = [];

  while (selected.length < SESSION_SIZE) {
    let remaining = bank.filter(ex => !seen.has(ex.id) && !selected.some(sel => sel.id === ex.id));

    if (remaining.length === 0) {
      seen = new Set();
      remaining = bank.filter(ex => !selected.some(sel => sel.id === ex.id));
    }

    const nextPool = shuffle(remaining);
    const needed = SESSION_SIZE - selected.length;
    const chunk = nextPool.slice(0, needed);
    selected.push(...chunk);
    chunk.forEach(ex => seen.add(ex.id));
  }

  saveSeen(difficulty, seen);
  return selected;
}

function routeTo(route, push = true) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[route].classList.add('active');
  document.getElementById('screenTitle').textContent = titles[route];
  document.getElementById('backBtn').classList.toggle('hidden', route === 'home');

  state.route = route;
  if (push && state.history[state.history.length - 1] !== route) state.history.push(route);

  if (route === 'home') renderDashboardStats();
  if (route === 'evaluation') renderEvaluationStats();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  if (state.history.length <= 1) return routeTo('home', false);
  state.history.pop();
  routeTo(state.history[state.history.length - 1], false);
}

function renderDashboardStats() {
  const stats = getStats();
  const success = percent(stats.correct, stats.attempts);
  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card"><strong>${stats.sessions}</strong><span>sessions terminées</span></div>
    <div class="stat-card"><strong>${stats.attempts}</strong><span>exercices faits</span></div>
    <div class="stat-card"><strong>${success}%</strong><span>réussite globale</span></div>
    <div class="stat-card"><strong>${BANK_SIZE}</strong><span>exercices par niveau</span></div>
  `;
}

function renderEvaluationStats() {
  const stats = getStats();
  const globalSuccess = percent(stats.correct, stats.attempts);
  document.getElementById('globalStats').innerHTML = `
    <div class="stat-card"><strong>${stats.sessions}</strong><span>sessions</span></div>
    <div class="stat-card"><strong>${stats.correct}/${stats.attempts}</strong><span>bonnes réponses</span></div>
    <div class="stat-card"><strong>${globalSuccess}%</strong><span>réussite</span></div>
    <div class="stat-card"><strong>${stats.lastSessions.length}</strong><span>sessions récentes gardées</span></div>
  `;

  Object.keys(difficultyNames).forEach(difficulty => {
    const seenCount = getSeen(difficulty).size;
    const label = document.getElementById(`progress-${difficulty}`);
    label.textContent = `${seenCount}/${BANK_SIZE} exercices déjà tirés dans la boucle actuelle.`;
  });
}

function startSession(difficulty) {
  state.currentDifficulty = difficulty;
  state.session = pickSessionExercises(difficulty);
  state.sessionIndex = 0;
  state.answers = [];
  state.sessionStartedAt = Date.now();
  routeTo('exercise');
  renderExercise();
}

function renderExercise() {
  const exercise = state.session[state.sessionIndex];
  const index = state.sessionIndex + 1;
  const progress = Math.round(((index - 1) / SESSION_SIZE) * 100);

  document.getElementById('difficultyLabel').textContent = `Niveau ${difficultyNames[state.currentDifficulty]}`;
  document.getElementById('exerciseTitle').textContent = `Exercice ${index}`;
  document.getElementById('exerciseCounter').textContent = `${index} / ${SESSION_SIZE}`;
  document.getElementById('sessionProgress').style.width = `${progress}%`;
  document.getElementById('questionText').textContent = 'Trouve le quotient et le reste de cette division euclidienne.';
  document.getElementById('divisionBox').textContent = `${exercise.dividend} ÷ ${exercise.divisor}`;
  document.getElementById('quotientInput').value = '';
  document.getElementById('remainderInput').value = '';
  document.getElementById('feedback').className = 'feedback hidden';
  document.getElementById('feedback').innerHTML = '';
  document.getElementById('nextActionRow').classList.add('hidden');
  document.getElementById('checkBtn').disabled = false;
  document.getElementById('quotientInput').disabled = false;
  document.getElementById('remainderInput').disabled = false;
  setTimeout(() => document.getElementById('quotientInput').focus(), 50);
}

function buildExplanation(exercise, userQuotient, userRemainder, isCorrect) {
  const expected = `${exercise.dividend} = ${exercise.divisor} × ${exercise.quotient} + ${exercise.remainder}`;
  const userCheck = `${exercise.divisor} × ${userQuotient || 0} + ${userRemainder || 0} = ${exercise.divisor * (userQuotient || 0) + (userRemainder || 0)}`;
  const restRule = exercise.remainder < exercise.divisor
    ? `Le reste ${exercise.remainder} est bien plus petit que le diviseur ${exercise.divisor}.`
    : `Attention : le reste doit être plus petit que le diviseur.`;

  if (isCorrect) {
    return `<strong class="correct-text">Correct.</strong> Vérification : ${expected}. ${restRule}`;
  }

  return `<strong class="incorrect-text">Incorrect.</strong> Ta vérification donne ${userCheck}. La bonne réponse est : quotient ${exercise.quotient}, reste ${exercise.remainder}. Vérification : ${expected}. ${restRule}`;
}

function handleAnswer(event) {
  event.preventDefault();
  const exercise = state.session[state.sessionIndex];
  const quotient = Number.parseInt(document.getElementById('quotientInput').value, 10);
  const remainder = Number.parseInt(document.getElementById('remainderInput').value, 10);
  const isCorrect = quotient === exercise.quotient && remainder === exercise.remainder;
  const explanation = buildExplanation(exercise, quotient, remainder, isCorrect);

  state.answers.push({
    exercise,
    quotient,
    remainder,
    isCorrect,
    explanation: explanation.replace(/<[^>]*>/g, ''),
  });

  const feedback = document.getElementById('feedback');
  feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
  feedback.innerHTML = explanation;
  document.getElementById('nextBtn').textContent = state.sessionIndex === SESSION_SIZE - 1 ? 'Voir les résultats' : 'Exercice suivant';
  document.getElementById('nextActionRow').classList.remove('hidden');
  document.getElementById('checkBtn').disabled = true;
  document.getElementById('quotientInput').disabled = true;
  document.getElementById('remainderInput').disabled = true;
  document.getElementById('sessionProgress').style.width = `${Math.round((state.answers.length / SESSION_SIZE) * 100)}%`;
}

function nextExercise() {
  if (state.sessionIndex >= SESSION_SIZE - 1) {
    finishSession();
    return;
  }
  state.sessionIndex += 1;
  renderExercise();
}

function finishSession() {
  const durationSeconds = Math.max(1, Math.round((Date.now() - state.sessionStartedAt) / 1000));
  const correct = state.answers.filter(answer => answer.isCorrect).length;
  const stats = getStats();
  const difficulty = state.currentDifficulty;

  stats.sessions += 1;
  stats.attempts += state.answers.length;
  stats.correct += correct;
  stats.byDifficulty[difficulty].sessions += 1;
  stats.byDifficulty[difficulty].attempts += state.answers.length;
  stats.byDifficulty[difficulty].correct += correct;
  stats.lastSessions.unshift({
    date: new Date().toISOString(),
    difficulty,
    correct,
    total: state.answers.length,
    durationSeconds,
  });
  stats.lastSessions = stats.lastSessions.slice(0, 20);
  saveStats(stats);

  routeTo('results');
  renderResults(durationSeconds);
}

function renderResults(durationSeconds) {
  const correct = state.answers.filter(answer => answer.isCorrect).length;
  const total = state.answers.length;
  const success = percent(correct, total);
  const difficultyStats = getStats().byDifficulty[state.currentDifficulty];

  document.getElementById('scoreSummary').innerHTML = `
    <span class="score-pill">Score : ${correct}/${total}</span>
    <span class="score-pill">Réussite : ${success}%</span>
    <span class="score-pill">Niveau : ${difficultyNames[state.currentDifficulty]}</span>
    <span class="score-pill">Temps : ${formatDuration(durationSeconds)}</span>
  `;

  document.getElementById('correctionList').innerHTML = state.answers.map((answer, index) => {
    const ex = answer.exercise;
    const userAnswer = `quotient ${Number.isNaN(answer.quotient) ? '—' : answer.quotient}, reste ${Number.isNaN(answer.remainder) ? '—' : answer.remainder}`;
    return `
      <div class="correction-item ${answer.isCorrect ? 'correct' : 'incorrect'}">
        <strong>${index + 1}. ${ex.dividend} ÷ ${ex.divisor}</strong>
        <p>Ta réponse : ${userAnswer}.</p>
        <p>Réponse attendue : quotient ${ex.quotient}, reste ${ex.remainder}.</p>
        <p>Explication : ${ex.dividend} = ${ex.divisor} × ${ex.quotient} + ${ex.remainder}. Le reste ${ex.remainder} est plus petit que ${ex.divisor}.</p>
      </div>
    `;
  }).join('');

  document.getElementById('sessionStats').innerHTML = `
    <div class="stat-card"><strong>${success}%</strong><span>réussite de la session</span></div>
    <div class="stat-card"><strong>${total - correct}</strong><span>erreurs à retravailler</span></div>
    <div class="stat-card"><strong>${percent(difficultyStats.correct, difficultyStats.attempts)}%</strong><span>réussite sur ce niveau</span></div>
    <div class="stat-card"><strong>${getSeen(state.currentDifficulty).size}/${BANK_SIZE}</strong><span>progression banque ${difficultyNames[state.currentDifficulty]}</span></div>
  `;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest} s`;
  return `${minutes} min ${rest.toString().padStart(2, '0')} s`;
}

function resetStats() {
  const confirmed = window.confirm('Réinitialiser les statistiques et la progression des exercices ?');
  if (!confirmed) return;
  localStorage.removeItem('cm1-maths-division-stats');
  Object.keys(difficultyNames).forEach(difficulty => localStorage.removeItem(`cm1-maths-division-seen-${difficulty}`));
  renderEvaluationStats();
  renderDashboardStats();
}

function bindEvents() {
  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => routeTo(button.dataset.route));
  });

  document.querySelectorAll('[data-difficulty]').forEach(button => {
    button.addEventListener('click', () => startSession(button.dataset.difficulty));
  });

  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('answerForm').addEventListener('submit', handleAnswer);
  document.getElementById('nextBtn').addEventListener('click', nextExercise);
  document.getElementById('retrySameBtn').addEventListener('click', () => startSession(state.currentDifficulty));
  document.getElementById('resetStatsBtn').addEventListener('click', resetStats);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // L'application reste utilisable même si le navigateur refuse le service worker.
      });
    });
  }
}

bindEvents();
renderDashboardStats();
registerServiceWorker();
