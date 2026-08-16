// Sudoku engine: generator, solver, unique-solution check, candidate tracking.
// Pure logic, no DOM. Attaches to window.SudokuEngine.

(function (global) {
  "use strict";

  const SIZE = 9;
  const BOX = 3;

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  }

  function cloneGrid(g) {
    return g.map((row) => row.slice());
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function peers(r, c) {
    const set = new Set();
    for (let i = 0; i < SIZE; i++) {
      set.add(r * SIZE + i); // row
      set.add(i * SIZE + c); // col
    }
    const br = Math.floor(r / BOX) * BOX;
    const bc = Math.floor(c / BOX) * BOX;
    for (let i = 0; i < BOX; i++) {
      for (let j = 0; j < BOX; j++) {
        set.add((br + i) * SIZE + (bc + j));
      }
    }
    set.delete(r * SIZE + c);
    return set;
  }

  // Precompute peer index lists once.
  const PEERS = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      PEERS.push([...peers(r, c)]);
    }
  }

  function isValidPlacement(grid, r, c, val) {
    for (const p of PEERS[r * SIZE + c]) {
      if (grid[Math.floor(p / SIZE)][p % SIZE] === val) return false;
    }
    return true;
  }

  // Fill a complete valid solution via randomized backtracking.
  function fillSolution(grid) {
    const idx = grid.flat().indexOf(0);
    if (idx === -1) return true;
    const r = Math.floor(idx / SIZE);
    const c = idx % SIZE;
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of nums) {
      if (isValidPlacement(grid, r, c, n)) {
        grid[r][c] = n;
        if (fillSolution(grid)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  // Count solutions up to `limit` (stops early when reached).
  function countSolutions(grid, limit = 2) {
    let count = 0;
    function solve() {
      const idx = grid.flat().indexOf(0);
      if (idx === -1) {
        count++;
        return count >= limit;
      }
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      for (let n = 1; n <= SIZE; n++) {
        if (isValidPlacement(grid, r, c, n)) {
          grid[r][c] = n;
          if (solve()) {
            grid[r][c] = 0;
            return true;
          }
          grid[r][c] = 0;
        }
      }
      return false;
    }
    solve();
    return count;
  }

  // Compute candidates for every empty cell given current grid.
  function computeCandidates(grid) {
    const cand = [];
    for (let r = 0; r < SIZE; r++) {
      cand.push(new Array(SIZE).fill(0));
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 0) {
          cand[r][c] = 0;
          continue;
        }
        let mask = 0;
        for (let n = 1; n <= SIZE; n++) {
          if (isValidPlacement(grid, r, c, n)) mask |= 1 << n;
        }
        cand[r][c] = mask;
      }
    }
    return cand;
  }

  function popcount(mask) {
    let c = 0;
    while (mask) {
      mask &= mask - 1;
      c++;
    }
    return c;
  }

  function isComplete(grid) {
    return grid.every((row) => row.every((v) => v !== 0));
  }

  // Generate a puzzle with a unique solution.
  // difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  const GIVENS = { easy: 42, medium: 34, hard: 28, expert: 24 };

  function generate(difficulty = "medium") {
    const solution = emptyGrid();
    fillSolution(solution);
    const puzzle = cloneGrid(solution);

    const target = GIVENS[difficulty] || GIVENS.medium;
    // Order of cells to attempt removal (randomized).
    const cells = shuffle(
      Array.from({ length: SIZE * SIZE }, (_, i) => i)
    );

    let removed = 0;
    const totalToRemove = SIZE * SIZE - target;

    for (const cellIdx of cells) {
      if (removed >= totalToRemove) break;
      const r = Math.floor(cellIdx / SIZE);
      const c = cellIdx % SIZE;
      if (puzzle[r][c] === 0) continue;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      const test = cloneGrid(puzzle);
      if (countSolutions(test, 2) !== 1) {
        puzzle[r][c] = backup; // revert, would break uniqueness
      } else {
        removed++;
      }
    }

    return { puzzle, solution, difficulty };
  }

  global.SudokuEngine = {
    SIZE,
    BOX,
    emptyGrid,
    cloneGrid,
    fillSolution,
    countSolutions,
    computeCandidates,
    popcount,
    isComplete,
    generate,
    GIVENS,
  };
})(typeof window !== "undefined" ? window : globalThis);
