const matchForm = document.getElementById('matchForm');
const homeTeamInput = document.getElementById('homeTeam');
const awayTeamInput = document.getElementById('awayTeam');
const homeScoreInput = document.getElementById('homeScore');
const awayScoreInput = document.getElementById('awayScore');
const dateInput = document.getElementById('date');
const submitBtn = document.getElementById('submitBtn');
const matchesDiv = document.getElementById('matches');

// auth UI (from updated index.html)
const authStatus = document.getElementById("authStatus");
const logoutBtn = document.getElementById("logoutBtn");

// controls
const filterTeamInput = document.getElementById('filterTeam');
const sortSelect = document.getElementById('sortSelect');
const applyBtn = document.getElementById('applyBtn');
const resetBtn = document.getElementById('resetBtn');

let editingId = null;
let currentUser = null; // {id,email,role} when logged in

const API_BASE = '/api/matches';

//AUTH session

async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) {
      currentUser = null;
      if (authStatus) authStatus.textContent = "Not logged in";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (matchForm) matchForm.style.display = "none";
      return;
    }

    const data = await res.json();
    currentUser = data.user;

    if (authStatus) authStatus.textContent = `Logged in as ${currentUser.email} (${currentUser.role})`;
    if (logoutBtn) logoutBtn.style.display = "inline-block";

    // only organizer can create matches (by our server rules)
    if (matchForm) {
      matchForm.style.display = currentUser.role === "organizer" ? "block" : "none";
    }
  } catch (e) {
    currentUser = null;
    if (authStatus) authStatus.textContent = "Auth check failed";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (matchForm) matchForm.style.display = "none";
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login.html";
  });
}

//Url builder

function buildMatchesUrl() {
  const params = new URLSearchParams();

  const team = (filterTeamInput?.value || '').trim();
  if (team) params.set('team', team);

  const sort = sortSelect?.value || '';
  if (sort) params.set('sort', sort);

  const qs = params.toString();
  return qs ? `${API_BASE}?${qs}` : API_BASE;
}

//Load + REnder

async function loadMatches(customUrl) {
  try {
    const url = customUrl || buildMatchesUrl();

    // IMPORTANT: include cookies for session
    const response = await fetch(url, { credentials: "include" });

    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err?.error || err?.message || `Failed to load matches (${response.status})`);
    }

    const matches = await response.json();
    matchesDiv.innerHTML = '';

    matches.forEach(match => {
      const matchDiv = document.createElement('div');
      matchDiv.className = 'match';

      const homeTeam = match.homeTeam ?? '';
      const awayTeam = match.awayTeam ?? '';
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;
      const date = match.date ?? '';

      // role-based UI:
      // - organizer: edit + delete
      // - participant: edit only (you can change this)
      // - not logged in: no buttons
      const canEdit = !!currentUser; // logged in
      const canDelete = currentUser?.role === "organizer";

      matchDiv.innerHTML = `
        <strong>${escapeHtml(homeTeam)} vs ${escapeHtml(awayTeam)}</strong>
        - Score: ${homeScore}-${awayScore} on ${escapeHtml(date)}
        ${canEdit ? `<button class="edit-btn" data-id="${match._id}">Edit</button>` : ``}
        ${canDelete ? `<button class="delete-btn" data-id="${match._id}">Delete</button>` : ``}
      `;

      if (canEdit) {
        const editBtn = matchDiv.querySelector('.edit-btn');
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            editMatch(match._id, homeTeam, awayTeam, homeScore, awayScore, date);
          });
        }
      }

      if (canDelete) {
        const delBtn = matchDiv.querySelector('.delete-btn');
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            await deleteMatch(match._id);
          });
        }
      }

      matchesDiv.appendChild(matchDiv);
    });

  } catch (error) {
    console.error('Error loading matches:', error.message);
    alert(`Error loading matches: ${error.message}`);
  }
}

//CRUD protected 

async function addMatch(match) {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: "include", // IMPORTANT
      body: JSON.stringify(match)
    });

    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err?.error || err?.message || `Failed to add match (${response.status})`);
    }

    await response.json().catch(() => null);
    await loadMatches();
  } catch (error) {
    console.error('Error adding match:', error.message);
    alert(`Error adding match: ${error.message}`);
  }
}

async function updateMatch(id, match) {
  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: "include", // IMPORTANT
      body: JSON.stringify(match)
    });

    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err?.error || err?.message || `Failed to update match (${response.status})`);
    }

    await response.json().catch(() => null);
    await loadMatches();
  } catch (error) {
    console.error('Error updating match:', error.message);
    alert(`Error updating match: ${error.message}`);
  }
}

async function deleteMatch(id) {
  try {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      credentials: "include" // IMPORTANT
    });

    if (!response.ok) {
      const err = await safeJson(response);
      throw new Error(err?.error || err?.message || `Failed to delete match (${response.status})`);
    }

    await response.json().catch(() => null);
    await loadMatches();
  } catch (error) {
    console.error('Error deleting match:', error.message);
    alert(`Error deleting match: ${error.message}`);
  }
}

// Form and edit

function editMatch(id, homeTeam, awayTeam, homeScore, awayScore, date) {
  // if organizer-only create, editing should still be allowed for logged users (server allows requireAuth)
  homeTeamInput.value = homeTeam;
  awayTeamInput.value = awayTeam;
  homeScoreInput.value = homeScore;
  awayScoreInput.value = awayScore;
  dateInput.value = date;

  submitBtn.textContent = 'Update Match';
  editingId = id;
}

if (matchForm) {
  matchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const match = {
      homeTeam: homeTeamInput.value.trim(),
      awayTeam: awayTeamInput.value.trim(),
      homeScore: parseInt(homeScoreInput.value, 10),
      awayScore: parseInt(awayScoreInput.value, 10),
      date: dateInput.value
    };

    if (editingId) {
      await updateMatch(editingId, match);
      editingId = null;
      submitBtn.textContent = 'Add Match';
    } else {
      await addMatch(match);
    }

    homeTeamInput.value = '';
    awayTeamInput.value = '';
    homeScoreInput.value = '';
    awayScoreInput.value = '';
    dateInput.value = '';
  });
}

//Filter and sort

if (applyBtn) {
  applyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadMatches(buildMatchesUrl());
  });
}

if (resetBtn) {
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (filterTeamInput) filterTeamInput.value = '';
    if (sortSelect) sortSelect.value = '';
    loadMatches(API_BASE);
  });
}

//Helpers

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

//Init

// сначала узнаём кто пользователь (session), потом грузим матчи с правильными кнопками
(async () => {
  await checkAuth();
  await loadMatches();
})();
