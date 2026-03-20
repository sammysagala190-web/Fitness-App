const STORAGE_KEY = 'fitness-app-web-v2';
const difficulties = ['Beginner', 'Intermediate', 'Advanced'];
const focuses = ['Full Body', 'Abs', 'Chest', 'Legs', 'Arms', 'Butt'];
const feedbackOptions = ['Too Easy', 'Just Right', 'Too Hard'];

const defaultState = {
  name: 'Sam',
  difficultyLevel: 0,
  focus: 'Full Body',
  notes: '',
  sessions: {},
  github: {
    owner: 'sammysagala190-web',
    repo: 'Fitness-App',
    branch: 'main',
    filePath: 'fitness-data.json',
    token: '',
    autoSync: false,
    lastSyncedAt: ''
  }
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mergeState(raw = {}) {
  const github = { ...defaultState.github, ...(raw.github || {}) };
  return { ...defaultState, ...raw, github };
}

function loadState() {
  try {
    return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return mergeState();
  }
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState({ skipAutoSync = false } = {}) {
  persistLocalState();
  if (!skipAutoSync && state.github.autoSync && state.github.token) {
    scheduleGithubPush();
  }
}

let state = loadState();
let syncTimer = null;

function getUploadableState() {
  return {
    ...state,
    github: {
      ...state.github,
      token: ''
    }
  };
}

function base64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function githubConfigIsReady() {
  return Boolean(
    state.github.owner &&
    state.github.repo &&
    state.github.branch &&
    state.github.filePath &&
    state.github.token
  );
}

function setGithubStatus(message) {
  document.getElementById('githubStatus').textContent = message;
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${state.github.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `GitHub request failed with ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

async function pushStateToGitHub() {
  if (!githubConfigIsReady()) {
    throw new Error('Fill owner, repo, branch, file path, and token first.');
  }

  const baseUrl = `https://api.github.com/repos/${state.github.owner}/${state.github.repo}/contents/${state.github.filePath}`;
  let existingSha = undefined;

  try {
    const existing = await githubRequest(`${baseUrl}?ref=${encodeURIComponent(state.github.branch)}`);
    existingSha = existing.sha;
  } catch (error) {
    if (!String(error.message).includes('404')) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.status !== '404') throw error;
      } catch {
        throw error;
      }
    }
  }

  const content = JSON.stringify(getUploadableState(), null, 2);
  await githubRequest(baseUrl, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Update fitness data ${new Date().toISOString()}`,
      content: base64EncodeUnicode(content),
      branch: state.github.branch,
      sha: existingSha
    })
  });

  state.github.lastSyncedAt = new Date().toISOString();
  persistLocalState();
  setGithubStatus(`Saved to GitHub at ${new Date(state.github.lastSyncedAt).toLocaleString()}`);
}

async function pullStateFromGitHub() {
  if (!githubConfigIsReady()) {
    throw new Error('Fill owner, repo, branch, file path, and token first.');
  }

  const url = `https://api.github.com/repos/${state.github.owner}/${state.github.repo}/contents/${state.github.filePath}?ref=${encodeURIComponent(state.github.branch)}`;
  const remote = await githubRequest(url);
  const remoteState = mergeState(JSON.parse(base64DecodeUnicode(remote.content.replace(/\n/g, ''))));
  remoteState.github = {
    ...remoteState.github,
    owner: state.github.owner,
    repo: state.github.repo,
    branch: state.github.branch,
    filePath: state.github.filePath,
    token: state.github.token,
    autoSync: state.github.autoSync,
    lastSyncedAt: new Date().toISOString()
  };
  state = remoteState;
  persistLocalState();
  render();
  setGithubStatus(`Restored from GitHub at ${new Date(state.github.lastSyncedAt).toLocaleString()}`);
}

function scheduleGithubPush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      setGithubStatus('Saving to GitHub...');
      await pushStateToGitHub();
    } catch (error) {
      setGithubStatus(`Sync failed: ${cleanGithubError(error)}`);
    }
  }, 1200);
}

function cleanGithubError(error) {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || 'Unknown GitHub error';
  } catch {
    return error.message || 'Unknown error';
  }
}

function getAdaptivePlan(level, focus, previousFeedback) {
  let adjustedLevel = Math.max(0, Math.min(2, level));
  if (previousFeedback === 'Too Easy') adjustedLevel = Math.min(2, adjustedLevel + 1);
  if (previousFeedback === 'Too Hard') adjustedLevel = Math.max(0, adjustedLevel - 1);

  const presets = {
    Beginner: { rounds: 2, work: 30, rest: 40, duration: 16, intensity: 'Low to moderate' },
    Intermediate: { rounds: 3, work: 40, rest: 30, duration: 24, intensity: 'Moderate' },
    Advanced: { rounds: 4, work: 45, rest: 20, duration: 32, intensity: 'Moderate to high' },
  };

  const bank = {
    'Full Body': ['Jumping Jacks', 'Bodyweight Squats', 'Push Ups', 'Mountain Climbers', 'Glute Bridges', 'Plank'],
    'Abs': ['Dead Bug', 'Bicycle Crunches', 'Leg Raises', 'Plank', 'Heel Taps', 'Russian Twists'],
    'Chest': ['Push Ups', 'Wide Push Ups', 'Incline Push Ups', 'Pike Push Ups', 'Wall Push Ups', 'Slow Negative Push Ups'],
    'Legs': ['Bodyweight Squats', 'Reverse Lunges', 'Wall Sit', 'Calf Raises', 'Split Squats', 'Pulse Squats'],
    'Arms': ['Push Ups', 'Triceps Dips on Chair', 'Plank Up Downs', 'Arm Circles', 'Diamond Push Ups', 'Shoulder Taps'],
    'Butt': ['Glute Bridges', 'Donkey Kicks', 'Fire Hydrants', 'Sumo Squats', 'Hip Thrusts', 'Curtsy Lunges'],
  };

  const difficulty = difficulties[adjustedLevel];
  const preset = presets[difficulty];
  const exercises = bank[focus].slice(0, Math.min(6, preset.rounds + 3));

  return {
    title: `${difficulty} ${focus} Session`,
    focus,
    durationMin: preset.duration,
    intensity: `${preset.intensity}, ${preset.rounds} rounds, ${preset.work}s work`,
    exercises,
    restSeconds: preset.rest,
  };
}

function getTodayPlan() {
  const feedback = state.sessions[todayKey()]?.feedback;
  return getAdaptivePlan(state.difficultyLevel, state.focus, feedback);
}

function completedSessions() {
  return Object.values(state.sessions).filter(s => s.completed).length;
}

function currentStreak() {
  let count = 0;
  const cursor = new Date();
  while (true) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (state.sessions[key]?.completed) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return count;
}

function thisWeekCount() {
  return Object.values(state.sessions).filter(s => {
    const d = new Date(`${s.date}T00:00:00`);
    const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return s.completed && diffDays >= 0 && diffDays < 7;
  }).length;
}

function renderChips(containerId, options, activeValue, onClick) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  options.forEach(option => {
    const btn = document.createElement('button');
    btn.className = `chip${option === activeValue ? ' active' : ''}`;
    btn.textContent = option;
    btn.onclick = () => onClick(option);
    container.appendChild(btn);
  });
}

function renderPlan() {
  const plan = getTodayPlan();
  const box = document.getElementById('planBox');
  box.innerHTML = `
    <div class="plan-title">${plan.title}</div>
    <div class="plan-meta">Duration: ${plan.durationMin} min</div>
    <div class="plan-meta">Intensity: ${plan.intensity}</div>
    <div class="plan-meta">Rest: ${plan.restSeconds} sec</div>
    ${plan.exercises.map(ex => `<div class="exercise-item">• ${ex}</div>`).join('')}
  `;
}

function renderStats() {
  document.getElementById('completedCount').textContent = completedSessions();
  document.getElementById('streakCount').textContent = currentStreak();
  document.getElementById('weekCount').textContent = thisWeekCount();
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  document.getElementById('monthLabel').textContent = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    grid.appendChild(empty);
  }

  const today = todayKey();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const cell = document.createElement('div');
    cell.className = 'day';
    if (state.sessions[key]?.completed) cell.classList.add('done');
    if (key === today) cell.classList.add('today');
    cell.textContent = day;
    grid.appendChild(cell);
  }
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const sessions = Object.values(state.sessions).sort((a, b) => b.date.localeCompare(a.date));
  if (!sessions.length) {
    list.innerHTML = '<div class="small">No sessions saved yet.</div>';
    return;
  }
  list.innerHTML = sessions.map(session => `
    <div class="history-card">
      <div class="history-item"><strong>${session.date}</strong></div>
      <div class="history-item">${session.routineTitle}</div>
      <div class="history-item small">${session.focus}, ${session.durationMin} min</div>
      <div class="history-item small">Feedback: ${session.feedback || 'Not set'}</div>
    </div>
  `).join('');
}

function render() {
  document.getElementById('nameInput').value = state.name;
  document.getElementById('notesInput').value = state.notes;
  document.getElementById('githubOwnerInput').value = state.github.owner;
  document.getElementById('githubRepoInput').value = state.github.repo;
  document.getElementById('githubBranchInput').value = state.github.branch;
  document.getElementById('githubFilePathInput').value = state.github.filePath;
  document.getElementById('githubTokenInput').value = state.github.token;
  document.getElementById('githubAutoSyncInput').checked = state.github.autoSync;

  renderChips('difficultyRow', difficulties, difficulties[state.difficultyLevel], value => {
    state.difficultyLevel = difficulties.indexOf(value);
    saveState();
    render();
  });

  renderChips('focusRow', focuses, state.focus, value => {
    state.focus = value;
    saveState();
    render();
  });

  renderChips('feedbackRow', feedbackOptions, state.sessions[todayKey()]?.feedback || '', value => {
    const plan = getTodayPlan();
    const key = todayKey();
    state.sessions[key] = {
      date: key,
      completed: state.sessions[key]?.completed || false,
      routineTitle: state.sessions[key]?.routineTitle || plan.title,
      durationMin: state.sessions[key]?.durationMin || plan.durationMin,
      focus: state.sessions[key]?.focus || plan.focus,
      feedback: value,
    };
    saveState();
    render();
  });

  renderPlan();
  renderStats();
  renderCalendar();
  renderHistory();

  if (state.github.lastSyncedAt) {
    setGithubStatus(`Last GitHub sync: ${new Date(state.github.lastSyncedAt).toLocaleString()}`);
  }
}

document.getElementById('nameInput').addEventListener('input', e => {
  state.name = e.target.value;
  saveState();
});

document.getElementById('notesInput').addEventListener('input', e => {
  state.notes = e.target.value;
  saveState();
});

document.getElementById('githubOwnerInput').addEventListener('input', e => {
  state.github.owner = e.target.value.trim();
  saveState({ skipAutoSync: true });
});

document.getElementById('githubRepoInput').addEventListener('input', e => {
  state.github.repo = e.target.value.trim();
  saveState({ skipAutoSync: true });
});

document.getElementById('githubBranchInput').addEventListener('input', e => {
  state.github.branch = e.target.value.trim() || 'main';
  saveState({ skipAutoSync: true });
});

document.getElementById('githubFilePathInput').addEventListener('input', e => {
  state.github.filePath = e.target.value.trim() || 'fitness-data.json';
  saveState({ skipAutoSync: true });
});

document.getElementById('githubTokenInput').addEventListener('input', e => {
  state.github.token = e.target.value.trim();
  saveState({ skipAutoSync: true });
});

document.getElementById('githubAutoSyncInput').addEventListener('change', e => {
  state.github.autoSync = e.target.checked;
  saveState({ skipAutoSync: true });
});

document.getElementById('completeBtn').addEventListener('click', () => {
  const plan = getTodayPlan();
  const key = todayKey();
  state.sessions[key] = {
    date: key,
    completed: true,
    routineTitle: plan.title,
    durationMin: plan.durationMin,
    focus: plan.focus,
    feedback: state.sessions[key]?.feedback,
  };
  saveState();
  render();
});

document.getElementById('pushGithubBtn').addEventListener('click', async () => {
  try {
    setGithubStatus('Saving to GitHub...');
    await pushStateToGitHub();
  } catch (error) {
    setGithubStatus(`Sync failed: ${cleanGithubError(error)}`);
  }
});

document.getElementById('pullGithubBtn').addEventListener('click', async () => {
  try {
    setGithubStatus('Restoring from GitHub...');
    await pullStateFromGitHub();
  } catch (error) {
    setGithubStatus(`Restore failed: ${cleanGithubError(error)}`);
  }
});

render();
