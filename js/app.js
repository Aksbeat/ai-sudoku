// AI Sudoku — UI controller. Depends on window.SudokuEngine and window.SudokuHints.
(function () {
  "use strict";

  const SIZE = 9;
  const E = window.SudokuEngine;
  const H = window.SudokuHints;

  const boardEl = document.getElementById("board");
  const numPadEl = document.getElementById("numPad");
  const statusEl = document.getElementById("status");
  const hintBox = document.getElementById("hintBox");
  const hintTitle = document.getElementById("hintTitle");
  const hintText = document.getElementById("hintText");
  const lbModal = document.getElementById("lbModal");
  const lbList = document.getElementById("lbList");

  // Leaderboard backend.
  // Option A (local demo): serve via server.js and leave API_BASE as "" (same origin).
  // Option B (published app / permanent): create a FREE Supabase project, run the
  //   SQL in supabase-scores.sql, then paste your project URL + anon key below.
  const API_BASE = "";
  const SUPABASE = {
    url: "", // e.g. "https://abcd1234.supabase.co"
    anonKey: "", // anon public key (safe to ship in client)
  };
  const useSupabase = () => !!(SUPABASE.url && SUPABASE.anonKey);

  async function fetchScores(date) {
    if (useSupabase()) {
      const r = await fetch(
        `${SUPABASE.url}/rest/v1/scores?select=name,timeMs&date=eq.${date}&order=timeMs.asc&limit=25`,
        {
          headers: {
            apikey: SUPABASE.anonKey,
            Authorization: "Bearer " + SUPABASE.anonKey,
          },
        }
      );
      const rows = await r.json();
      return Array.isArray(rows)
        ? rows.map((s) => ({ name: s.name, timeMs: s.timeMs }))
        : [];
    }
    const r = await fetch(API_BASE + "/api/leaderboard?date=" + date);
    const d = await r.json();
    return (d && d.scores) || [];
  }

  async function postScore(payload) {
    if (useSupabase()) {
      await fetch(`${SUPABASE.url}/rest/v1/scores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE.anonKey,
          Authorization: "Bearer " + SUPABASE.anonKey,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          date: payload.date,
          name: payload.name,
          timeMs: payload.timeMs,
          difficulty: payload.difficulty,
          mode: payload.mode,
        }),
      });
      return;
    }
    await fetch(API_BASE + "/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  const state = {
    puzzle: null,
    solution: null,
    grid: null,
    notes: null,
    given: null,
    selected: null,
    noteMode: false,
    mistakes: 0,
    history: [],
    timer: 0,
    timerId: null,
    solved: false,
    mode: "classic",
    dailyDate: null,
  };

  const STORE_KEY = "ai-sudoku-save-v1";

  // ---------- Persistence ----------
  function save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          puzzle: state.puzzle,
          solution: state.solution,
          grid: state.grid,
          notes: state.notes,
          given: state.given,
          mistakes: state.mistakes,
          timer: state.timer,
          mode: state.mode,
          dailyDate: state.dailyDate,
          difficulty: document.getElementById("difficulty").value,
        })
      );
    } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d.grid) return false;
      state.puzzle = d.puzzle;
      state.solution = d.solution;
      state.grid = d.grid;
      state.notes = d.notes;
      state.given = d.given;
      state.mistakes = d.mistakes || 0;
      state.timer = d.timer || 0;
      state.mode = d.mode || "classic";
      state.dailyDate = d.dailyDate || null;
      document.getElementById("difficulty").value = d.difficulty || "medium";
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- Board build ----------
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const cell = document.createElement("div");
      cell.className = "cell";
      if (c === 2 || c === 5) cell.classList.add("box-right");
      if (r === 2 || r === 5) cell.classList.add("box-bottom");
      cell.dataset.i = i;
      cell.addEventListener("click", () => selectCell(i));
      boardEl.appendChild(cell);
    }
  }

  function buildNumPad() {
    numPadEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement("button");
      b.className = "num-btn";
      b.textContent = n;
      b.dataset.n = n;
      b.addEventListener("click", () => inputNumber(n));
      numPadEl.appendChild(b);
    }
  }

  // ---------- Rendering ----------
  function render() {
    const sel = state.selected;
    const peers = sel != null ? peersOf(sel) : new Set();
    const selVal = sel != null ? state.grid[Math.floor(sel / SIZE)][sel % SIZE] : 0;

    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const cell = boardEl.children[i];
      const v = state.grid[r][c];
      cell.className = "cell";
      if (c === 2 || c === 5) cell.classList.add("box-right");
      if (r === 2 || r === 5) cell.classList.add("box-bottom");
      if (state.given[r][c]) cell.classList.add("given");
      if (i === sel) cell.classList.add("selected");
      else if (peers.has(i)) cell.classList.add("peer");
      if (v !== 0 && !state.given[r][c] && v !== state.solution[r][c])
        cell.classList.add("error");

      if (v !== 0) {
        cell.textContent = v;
      } else {
        cell.textContent = "";
        const noteSet = state.notes[r][c];
        if (noteSet && noteSet.length) {
          const notes = document.createElement("div");
          notes.className = "notes";
          for (let n = 1; n <= 9; n++) {
            const s = document.createElement("span");
            s.textContent = noteSet.includes(n) ? n : "";
            notes.appendChild(s);
          }
          cell.appendChild(notes);
        }
      }
    }
    updateNumPadState();
    document.getElementById("mistakes").textContent =
      "Mistakes: " + state.mistakes;
    save();
  }

  function updateNumPadState() {
    const counts = new Array(10).fill(0);
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (state.grid[r][c] !== 0) counts[state.grid[r][c]]++;
    for (const b of numPadEl.children) {
      const n = +b.dataset.n;
      b.classList.toggle("done", counts[n] >= 9);
    }
  }

  function peersOf(i) {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const s = new Set();
    for (let k = 0; k < SIZE; k++) {
      s.add(r * SIZE + k);
      s.add(k * SIZE + c);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) s.add((br + a) * SIZE + (bc + b));
    s.delete(i);
    return s;
  }

  // ---------- Interaction ----------
  function selectCell(i) {
    state.selected = i;
    render();
  }

  function inputNumber(n) {
    const i = state.selected;
    if (i == null) {
      flash("Tap a cell first");
      return;
    }
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    if (state.given[r][c]) return;

    if (state.noteMode) {
      if (state.grid[r][c] !== 0) return;
      const noteSet = state.notes[r][c];
      if (noteSet.includes(n)) noteSet.splice(noteSet.indexOf(n), 1);
      else noteSet.push(n);
      render();
      return;
    }

    if (state.grid[r][c] === n) {
      state.grid[r][c] = 0; // toggle off
      render();
      return;
    }

    pushHistory();
    state.grid[r][c] = n;
    state.notes[r][c] = [];
    autoCleanNotes(r, c, n);
    if (n !== state.solution[r][c]) {
      state.mistakes++;
      if (state.mistakes >= 3) flash("Three mistakes — use a Hint to learn!");
    }
    render();
    checkSolved();
  }

  function autoCleanNotes(r, c, n) {
    const ps = peersOf(r * SIZE + c);
    for (const p of ps) {
      const pr = Math.floor(p / SIZE);
      const pc = p % SIZE;
      const arr = state.notes[pr][pc];
      const idxN = arr.indexOf(n);
      if (idxN !== -1) arr.splice(idxN, 1);
    }
  }

  function eraseCell() {
    const i = state.selected;
    if (i == null) return;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    if (state.given[r][c]) return;
    if (state.grid[r][c] === 0 && state.notes[r][c].length === 0) return;
    pushHistory();
    state.grid[r][c] = 0;
    state.notes[r][c] = [];
    render();
  }

  function pushHistory() {
    state.history.push(
      JSON.stringify({
        grid: state.grid,
        notes: state.notes,
        mistakes: state.mistakes,
      })
    );
    if (state.history.length > 100) state.history.shift();
  }

  function undo() {
    const prev = state.history.pop();
    if (!prev) return;
    const d = JSON.parse(prev);
    state.grid = d.grid;
    state.notes = d.notes;
    state.mistakes = d.mistakes;
    render();
  }

  // ---------- Hint ----------
  function showHint() {
    const h = H.getHint(state.grid);
    if (!h) return;
    hintTitle.textContent = h.title;
    hintText.textContent = h.explanation;
    hintBox.classList.remove("hidden");

    // clear previous hl
    for (const cell of boardEl.children) cell.classList.remove("hl");
    if (h.highlight && h.highlight.length) {
      for (const i of h.highlight) boardEl.children[i].classList.add("hl");
    }
    currentHint = h;
  }
  let currentHint = null;

  document.getElementById("hintApply").addEventListener("click", () => {
    if (currentHint && currentHint.action === "fill" && currentHint.target != null) {
      const i = currentHint.target;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      if (!state.given[r][c]) {
        state.grid[r][c] = currentHint.value;
        state.notes[r][c] = [];
        currentHint = null;
        hintBox.classList.add("hidden");
        render();
        checkSolved();
        return;
      }
    }
    hintBox.classList.add("hidden");
    currentHint = null;
  });

  document.getElementById("hintClose").addEventListener("click", () => {
    hintBox.classList.add("hidden");
  });

  // ---------- Game lifecycle ----------
  function newGame() {
    const diff = document.getElementById("difficulty").value;
    state.mode = "classic";
    state.dailyDate = null;
    flash("Generating " + diff + " puzzle…");
    // allow UI paint
    setTimeout(() => {
      const { puzzle, solution } = E.generate(diff);
      state.puzzle = puzzle;
      state.solution = solution;
      state.grid = E.cloneGrid(puzzle);
      state.notes = Array.from({ length: SIZE }, () =>
        Array.from({ length: SIZE }, () => [])
      );
      state.given = puzzle.map((row) => row.map((v) => v !== 0));
      state.selected = null;
      state.mistakes = 0;
      state.history = [];
      state.solved = false;
      state.timer = 0;
      startTimer();
      hintBox.classList.add("hidden");
      render();
      flash("");
    }, 30);
  }

  function startDaily() {
    const dateStr = new Date().toISOString().slice(0, 10);
    const { puzzle, solution } = E.generateSeeded(dateStr, "medium");
    state.mode = "daily";
    state.dailyDate = dateStr;
    state.puzzle = puzzle;
    state.solution = solution;
    state.grid = E.cloneGrid(puzzle);
    state.notes = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => [])
    );
    state.given = puzzle.map((row) => row.map((v) => v !== 0));
    state.selected = null;
    state.mistakes = 0;
    state.history = [];
    state.solved = false;
    state.timer = 0;
    startTimer();
    hintBox.classList.add("hidden");
    render();
    flash("📅 Daily puzzle — solve fast and top the leaderboard!");
  }

  function showLeaderboard() {
    const date = state.dailyDate || new Date().toISOString().slice(0, 10);
    fetchScores(date)
      .then((list) => {
        renderLb(list);
        lbModal.classList.remove("hidden");
      })
      .catch(() => {
        lbList.innerHTML =
          '<div class="lb-empty">Leaderboard unavailable (backend offline).</div>';
        lbModal.classList.remove("hidden");
      });
  }

  function renderLb(list) {
    if (!list.length) {
      lbList.innerHTML =
        '<div class="lb-empty">No scores yet — be the first!</div>';
      return;
    }
    lbList.innerHTML = "";
    for (const s of list) {
      const li = document.createElement("li");
      const n = document.createElement("span");
      n.className = "lb-name";
      n.textContent = s.name;
      const t = document.createElement("span");
      t.className = "lb-time";
      t.textContent = fmt(Math.round(s.timeMs / 1000));
      li.appendChild(n);
      li.appendChild(t);
      lbList.appendChild(li);
    }
  }

  function submitDailyScore() {
    const name =
      (window.prompt(
        "🎉 You solved the daily! Name for the leaderboard:",
        "Player"
      ) || "Player").slice(0, 24);
    const payload = {
      date: state.dailyDate,
      name: name,
      timeMs: state.timer * 1000,
      difficulty: "medium",
      mode: "daily",
    };
    postScore(payload)
      .then(() => showLeaderboard())
      .catch(() => flash("Couldn't reach leaderboard (backend offline?)"));
  }

  function checkSolved() {
    if (E.isComplete(state.grid)) {
      // verify correctness
      let ok = true;
      for (let r = 0; r < SIZE && ok; r++)
        for (let c = 0; c < SIZE; c++)
          if (state.grid[r][c] !== state.solution[r][c]) ok = false;
      if (ok) {
        state.solved = true;
        stopTimer();
        flash("Solved! 🎉 Time " + fmt(state.timer));
        if (state.mode === "daily") submitDailyScore();
      }
    }
  }

  function flash(msg) {
    statusEl.textContent = msg;
  }

  // ---------- Timer ----------
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      state.timer++;
      document.getElementById("timer").textContent = fmt(state.timer);
    }, 1000);
  }
  function stopTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }
  function fmt(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return m + ":" + ss;
  }

  // ---------- Theme ----------
  function toggleTheme() {
    document.body.classList.toggle("light");
    localStorage.setItem(
      "ai-sudoku-theme",
      document.body.classList.contains("light") ? "light" : "dark"
    );
  }

  // ---------- Wire up ----------
  document.getElementById("newBtn").addEventListener("click", newGame);
  document.getElementById("dailyBtn").addEventListener("click", startDaily);
  document.getElementById("lbBtn").addEventListener("click", showLeaderboard);
  document.getElementById("lbClose").addEventListener("click", () =>
    lbModal.classList.add("hidden")
  );
  lbModal.addEventListener("click", (e) => {
    if (e.target === lbModal) lbModal.classList.add("hidden");
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("eraseBtn").addEventListener("click", eraseCell);
  document.getElementById("hintBtn").addEventListener("click", showHint);
  document.getElementById("themeBtn").addEventListener("click", toggleTheme);
  document.getElementById("noteBtn").addEventListener("click", (e) => {
    state.noteMode = !state.noteMode;
    e.currentTarget.classList.toggle("active", state.noteMode);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "9") inputNumber(+e.key);
    if (e.key === "Backspace" || e.key === "Delete") eraseCell();
    if (e.key === "h" || e.key === "H") showHint();
  });

  // ---------- Init ----------
  function init() {
    if (localStorage.getItem("ai-sudoku-theme") === "light")
      document.body.classList.add("light");
    buildBoard();
    buildNumPad();
    if (load() && !E.isComplete(state.grid)) {
      startTimer();
      render();
      flash("Resumed your game");
    } else {
      newGame();
    }
  }

  init();
})();
