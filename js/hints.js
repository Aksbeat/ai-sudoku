// AI hint / tutoring engine: detects the next logical technique and explains it.
// Operates on the player's current grid. Attaches to window.SudokuHints.

(function (global) {
  "use strict";

  const SIZE = 9;
  const E = global.SudokuEngine;
  const idx = (r, c) => r * SIZE + c;
  const rc = (i) => [Math.floor(i / SIZE), i % SIZE];

  // 27 units: 9 rows, 9 columns, 9 boxes.
  const UNITS = [];
  for (let r = 0; r < SIZE; r++) {
    const u = [];
    for (let c = 0; c < SIZE; c++) u.push(idx(r, c));
    UNITS.push(u);
  }
  for (let c = 0; c < SIZE; c++) {
    const u = [];
    for (let r = 0; r < SIZE; r++) u.push(idx(r, c));
    UNITS.push(u);
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const u = [];
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) u.push(idx(br * 3 + i, bc * 3 + j));
      UNITS.push(u);
    }
  }

  function candMask(grid, r, c) {
    // Bitmask of possible values for an EMPTY cell; 0 if filled or invalid.
    if (grid[r][c] !== 0) return 0;
    let mask = 0;
    for (let n = 1; n <= SIZE; n++) {
      if (isValid(grid, r, c, n)) mask |= 1 << n;
    }
    return mask;
  }

  function isValid(grid, r, c, val) {
    const peers = peerList[r * SIZE + c];
    for (const p of peers) {
      if (grid[Math.floor(p / SIZE)][p % SIZE] === val) return false;
    }
    return true;
  }

  // Peer lists (recomputed locally to avoid cross-module coupling).
  const peerList = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const s = new Set();
      for (let i = 0; i < SIZE; i++) {
        s.add(r * SIZE + i);
        s.add(i * SIZE + c);
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) s.add((br + i) * SIZE + (bc + j));
      s.delete(idx(r, c));
      peerList.push([...s]);
    }
  }

  function candidates(grid) {
    const cand = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) row.push(candMask(grid, r, c));
      cand.push(row);
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

  function label(i) {
    const [r, c] = rc(i);
    return "R" + (r + 1) + "C" + (c + 1);
  }

  function boxLabel(i) {
    const [r, c] = rc(i);
    return "box " + (Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1);
  }

  // ---- Detectors (return null or a hint object) ----

  function detectConflict(grid) {
    for (let i = 0; i < 81; i++) {
      const [r, c] = rc(i);
      if (grid[r][c] === 0) continue;
      const v = grid[r][c];
      for (const p of peerList[i]) {
        const [pr, pc] = rc(p);
        if (grid[pr][pc] === v) {
          return {
            technique: "conflict",
            title: "Conflict found",
            explanation:
              "The " +
              v +
              " in " +
              label(i) +
              " repeats in " +
              label(p) +
              ". One of them is wrong — fix it before continuing.",
            highlight: [i, p],
            action: "fix",
          };
        }
      }
    }
    return null;
  }

  function detectNakedSingle(grid, cand) {
    for (let i = 0; i < 81; i++) {
      const [r, c] = rc(i);
      if (grid[r][c] !== 0) continue;
      if (popcount(cand[r][c]) === 1) {
        const val = Math.log2(cand[r][c]);
        return {
          technique: "naked-single",
          title: "Naked Single",
          explanation:
            "Cell " +
            label(i) +
            " can only be " +
            val +
            " — every other digit is already used in its row, column, or box.",
          highlight: [i],
          target: i,
          value: val,
          action: "fill",
        };
      }
    }
    return null;
  }

  function detectHiddenSingle(grid, cand) {
    for (const unit of UNITS) {
      for (let n = 1; n <= SIZE; n++) {
        const bit = 1 << n;
        const spots = [];
        for (const cell of unit) {
          const [r, c] = rc(cell);
          if (grid[r][c] === 0 && cand[r][c] & bit) spots.push(cell);
        }
        if (spots.length === 1) {
          const cell = spots[0];
          return {
            technique: "hidden-single",
            title: "Hidden Single",
            explanation:
              "In " +
              unitName(unit) +
              ", the digit " +
              n +
              " can only fit in " +
              label(cell) +
              ". Every other empty cell in that " +
              unitType(unit) +
              " already excludes " +
              n +
              ".",
            highlight: [cell, ...unit],
            target: cell,
            value: n,
            action: "fill",
          };
        }
      }
    }
    return null;
  }

  function detectNakedPair(grid, cand) {
    for (const unit of UNITS) {
      for (let a = 0; a < unit.length; a++) {
        const ca = unit[a];
        const [ar, ac] = rc(ca);
        if (grid[ar][ac] !== 0 || popcount(cand[ar][ac]) !== 2) continue;
        for (let b = a + 1; b < unit.length; b++) {
          const cb = unit[b];
          const [br, bc] = rc(cb);
          if (grid[br][bc] !== 0 || cand[br][bc] !== cand[ar][ac]) continue;
          const pairMask = cand[ar][ac];
          const affected = [];
          for (const cell of unit) {
            const [r, c] = rc(cell);
            if (cell === ca || cell === cb || grid[r][c] !== 0) continue;
            if (cand[r][c] & pairMask) affected.push(cell);
          }
          if (affected.length > 0) {
            const v1 = Math.log2(pairMask & -pairMask);
            const v2 = Math.log2(pairMask & ~(pairMask & -pairMask));
            return {
              technique: "naked-pair",
              title: "Naked Pair",
              explanation:
                "Cells " +
                label(ca) +
                " and " +
                label(cb) +
                " in " +
                unitName(unit) +
                " can only contain {" +
                v1 +
                ", " +
                v2 +
                "}. That pair locks those digits for the unit, so " +
                v1 +
                " and " +
                v2 +
                " can be removed as candidates from the highlighted cells.",
              highlight: [ca, cb, ...affected],
              action: "eliminate",
            };
          }
        }
      }
    }
    return null;
  }

  function detectPointing(grid, cand) {
    for (let n = 1; n <= SIZE; n++) {
      const bit = 1 << n;
      for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
          // cells in this box
          const boxCells = [];
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
              boxCells.push(idx(br * 3 + i, bc * 3 + j));
          const spots = boxCells.filter((cell) => {
            const [r, c] = rc(cell);
            return grid[r][c] === 0 && cand[r][c] & bit;
          });
          if (spots.length < 2) continue;
          // same row?
          const rows = new Set(spots.map((s) => rc(s)[0]));
          if (rows.size === 1) {
            const r = [...rows][0];
            const affected = [];
            for (let c = 0; c < SIZE; c++) {
              const cell = idx(r, c);
              if (!boxCells.includes(cell) && grid[r][c] === 0 && cand[r][c] & bit)
                affected.push(cell);
            }
            if (affected.length)
              return pointingHint(n, spots, affected, "row " + (r + 1), "box");
          }
          // same column?
          const cols = new Set(spots.map((s) => rc(s)[1]));
          if (cols.size === 1) {
            const c = [...cols][0];
            const affected = [];
            for (let r = 0; r < SIZE; r++) {
              const cell = idx(r, c);
              if (!boxCells.includes(cell) && grid[r][c] === 0 && cand[r][c] & bit)
                affected.push(cell);
            }
            if (affected.length)
              return pointingHint(n, spots, affected, "column " + (c + 1), "box");
          }
        }
      }
    }
    return null;
  }

  function pointingHint(n, spots, affected, where, unitKind) {
    return {
      technique: "pointing",
      title: "Pointing / Locked Candidates",
      explanation:
        "The digit " +
        n +
        " can only appear in " +
        where +
        " within this " +
        unitKind +
        " (cells " +
        spots.map(label).join(", ") +
        "). So " +
        n +
        " must lie on that line, and can be eliminated from the rest of the " +
        unitKind +
        " outside the line.",
      highlight: [...spots, ...affected],
      action: "eliminate",
    };
  }

  function detectXWing(grid, cand) {
    for (let n = 1; n <= SIZE; n++) {
      const bit = 1 << n;
      // For each row, columns where n is a candidate.
      const rowCols = [];
      for (let r = 0; r < SIZE; r++) {
        const cols = [];
        for (let c = 0; c < SIZE; c++)
          if (grid[r][c] === 0 && cand[r][c] & bit) cols.push(c);
        rowCols.push(cols);
      }
      for (let r1 = 0; r1 < SIZE; r1++) {
        if (rowCols[r1].length !== 2) continue;
        for (let r2 = r1 + 1; r2 < SIZE; r2++) {
          if (
            rowCols[r2].length === 2 &&
            rowCols[r1][0] === rowCols[r2][0] &&
            rowCols[r1][1] === rowCols[r2][1]
          ) {
            const [c1, c2] = rowCols[r1];
            const affected = [];
            for (let r = 0; r < SIZE; r++) {
              if (r === r1 || r === r2) continue;
              for (const c of [c1, c2])
                if (grid[r][c] === 0 && cand[r][c] & bit) affected.push(idx(r, c));
            }
            if (affected.length) {
              return {
                technique: "x-wing",
                title: "X-Wing",
                explanation:
                  "The digit " +
                  n +
                  " forms an X-Wing on rows " +
                  (r1 + 1) +
                  " and " +
                  (r2 + 1) +
                  " at columns " +
                  (c1 + 1) +
                  " and " +
                  (c2 + 1) +
                  ". Because the pattern is locked, " +
                  n +
                  " can be eliminated from those two columns in all other rows.",
                highlight: [
                  idx(r1, c1),
                  idx(r1, c2),
                  idx(r2, c1),
                  idx(r2, c2),
                  ...affected,
                ],
                action: "eliminate",
              };
            }
          }
        }
      }
    }
    return null;
  }

  function unitName(unit) {
    const first = rc(unit[0]);
    // Heuristic: detect type by scanning.
    const rows = new Set(unit.map((i) => rc(i)[0]));
    const cols = new Set(unit.map((i) => rc(i)[1]));
    if (rows.size === 1) return "row " + (first[0] + 1);
    if (cols.size === 1) return "column " + (first[1] + 1);
    return boxLabel(unit[0]);
  }

  function unitType(unit) {
    const rows = new Set(unit.map((i) => rc(i)[0]));
    const cols = new Set(unit.map((i) => rc(i)[1]));
    if (rows.size === 1) return "row";
    if (cols.size === 1) return "column";
    return "box";
  }

  const ORDER = [
    detectConflict,
    detectNakedSingle,
    detectHiddenSingle,
    detectNakedPair,
    detectPointing,
    detectXWing,
  ];

  // Returns the next teaching hint for the current board, or null if solved.
  function getHint(grid) {
    if (E.isComplete(grid)) {
      return { technique: "solved", title: "Solved!", explanation: "Puzzle complete. Nicely done.", highlight: [], action: "none" };
    }
    const cand = candidates(grid);
    for (const detector of ORDER) {
      const h = detector(grid, cand);
      if (h) return h;
    }
    return {
      technique: "guess",
      title: "No simple technique found",
      explanation:
        "The remaining steps need advanced logic or careful trial. Try the technique tutorials, or place a candidate and see what happens.",
      highlight: [],
      action: "none",
    };
  }

  // Rate a freshly generated puzzle by the hardest technique its logical
  // solution requires. Returns { solvable, techniques: [] }.
  function rateDifficulty(puzzle) {
    const grid = E.cloneGrid(puzzle);
    const used = new Set();
    let progress = true;
    let guard = 0;
    while (!E.isComplete(grid) && progress && guard < 200) {
      guard++;
      progress = false;
      const cand = candidates(grid);
      for (const detector of [
        detectNakedSingle,
        detectHiddenSingle,
        detectNakedPair,
        detectPointing,
        detectXWing,
      ]) {
        const h = detector(grid, cand);
        if (h && h.target !== undefined) {
          const [r, c] = rc(h.target);
          grid[r][c] = h.value;
          used.add(h.technique);
          progress = true;
          break;
        }
        if (h && h.action === "eliminate") {
          // Apply elimination conceptually: mark technique used.
          used.add(h.technique);
          progress = true;
          break;
        }
      }
    }
    return { solvable: E.isComplete(grid), techniques: [...used] };
  }

  global.SudokuHints = {
    getHint,
    rateDifficulty,
    candidates,
    popcount,
    UNITS,
    label,
  };
})(typeof window !== "undefined" ? window : globalThis);
