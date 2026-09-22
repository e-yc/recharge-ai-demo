/*
 * The pixel office, top-down. Each agent is a sprite with a desk; where it stands is
 * derived from the run state every frame — searching puts it at the search counter,
 * reading a page at the library, otherwise at its desk — so a replay seek just snaps
 * everyone to the right place. Only the hand-offs (walking a paper to the next desk)
 * are event-driven, because they are moments, not states.
 */
(() => {
  const T = 16;                        // tile size in logical pixels
  const COLS = 30, ROWS = 13;          // row 0 is the back wall
  const W = COLS * T, H = ROWS * T;
  const SPEED = 5.5;                   // tiles per second

  const C = {
    floorA: '#2a3a4d', floorB: '#26364a', rug: '#33455c', rugEdge: '#3c5069',
    wall: '#1b2a3b', wallTop: '#33455c', wallLine: '#0e1620', window: '#5f8fb3', windowLight: '#8fb8d8', windowFrame: '#243447',
    wood: '#a8845c', woodDark: '#7d6043', woodEdge: '#5c4532', metal: '#3b4c60', metalDark: '#2b3b4e',
    monitor: '#0e1620', screenOff: '#1e2b3a', screenOn: '#cfe8ff',
    paper: '#f4f6f8', paperLine: '#9fb0c2', envelope: '#e8c46b', envelopeDark: '#b8923f',
    outline: '#0e1620', skin: '#f1c9a5', skinDark: '#c98f6a', hair: '#3b2a22', pants: '#2d3e55', shoe: '#0e1620',
    bubble: '#f4f6f8', bubbleEdge: '#c7d3de', bad: '#E5695B', ok: '#6FCF97',
    plant: '#4f9d69', plantDark: '#35774b', pot: '#b3603f', potDark: '#8a4a30',
    board: '#f4f6f8', boardFrame: '#3b4c60', chair: '#243447', chairDark: '#182636',
    book1: '#c9625a', book2: '#5f9ed1', book3: '#e0b25c', book4: '#6fbf8a', book5: '#a77be0',
    coffee: '#4b2e1e', mug: '#e5e9ee',
  };
  const LANE = { macro: '#4DB6C8', trends: '#A77BE0', competitors: '#F0876A', assembly: '#d8e0e8', followup: '#E8C46B', factcheck: '#6FCF97' };
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };

  /* ---------- sprites (12 wide × 18 tall) ----------
     k outline · s skin · d skin shadow · h hair · b body · c body shade · p pants · o shoe · w white · . empty */
  const FRONT = [
    '....kkkk....',
    '...khhhhk...',
    '..khhhhhhk..',
    '..khhhhhhk..',
    '..khsssshk..',
    '..kskssksk..',
    '..kssssssk..',
    '...ksddsk...',
    '....kssk....',
    '..kbbbbbbk..',
    '.kbbbbbbbbk.',
    '.kcbbbbbbck.',
    '.ksbbbbbbsk.',
    '..kbbbbbbk..',
    '..kppppppk..',
    '..kppkkppk..',
    '..kpp..ppk..',
    '..koo..ook..',
  ];
  const BACK = FRONT.slice();
  BACK[4] = '..khhhhhhk..'; BACK[5] = '..khhhhhhk..'; BACK[6] = '..khhhhhhk..'; BACK[7] = '...khhhhk...';
  const SIDE = [
    '....kkkk....',
    '...khhhhk...',
    '..khhhhhhk..',
    '..khhhhhhk..',
    '..khhhsssk..',
    '..khhsskss..',
    '..khhsssk...',
    '...khsssk...',
    '....kssk....',
    '...kbbbbk...',
    '..kbbbbbbk..',
    '..kbbbbcbk..',
    '..kbbbbsbk..',
    '...kbbbbk...',
    '...kppppk...',
    '...kppppk...',
    '...kpkkpk...',
    '...kokkok...',
  ];
  const withRows = (base, rows) => { const out = base.slice(); for (const [i, r] of Object.entries(rows)) out[i] = r; return out; };
  const FRONT_WALK = [withRows(FRONT, { 15: '..kppkkppk..', 16: '..kpp...pk..', 17: '.koo...ook..' }), withRows(FRONT, { 15: '..kppkkppk..', 16: '..kp...ppk..', 17: '..koo...ook.' })];
  const BACK_WALK = [withRows(BACK, { 15: '..kppkkppk..', 16: '..kpp...pk..', 17: '.koo...ook..' }), withRows(BACK, { 15: '..kppkkppk..', 16: '..kp...ppk..', 17: '..koo...ook.' })];
  const SIDE_WALK = [withRows(SIDE, { 15: '..kpppppk...', 16: '..kpk..kpk..', 17: '..kok..kok..' }), withRows(SIDE, { 15: '...kpppk....', 16: '....kpk.....', 17: '....kok.....' })];
  const FRONT_TYPE = [withRows(FRONT, { 11: '.ksbbbbbbsk.', 12: '.kbbbbbbbbk.' }), FRONT];
  const BACK_TYPE = [withRows(BACK, { 11: '.ksbbbbbbsk.', 12: '.kbbbbbbbbk.' }), BACK];
  const FRONT_READ = withRows(FRONT, { 11: '.kbbbbbbbbk.', 12: '.kbbbbbbbbk.' });

  // Small per-role tells. Headwear shows from every side; the rest only from the front.
  const HEADWEAR = {
    trends: [[1, 3, 'b'], [1, 4, 'b'], [10, 3, 'b'], [10, 4, 'b'], [3, 0, 'b'], [4, 0, 'b'], [5, 0, 'b'], [6, 0, 'b'], [7, 0, 'b'], [8, 0, 'b']], // headphones
    competitors: [[3, 0, 'b'], [4, 0, 'b'], [5, 0, 'b'], [6, 0, 'b'], [7, 0, 'b'], [8, 0, 'b'], [2, 1, 'b'], [9, 1, 'b'], [2, 2, 'b'], [9, 2, 'b']], // beanie
    followup: [[3, 0, 'c'], [4, 0, 'c'], [5, 0, 'c'], [6, 0, 'c'], [7, 0, 'c'], [8, 0, 'c'], [2, 1, 'c'], [9, 1, 'c'], [2, 2, 'c'], [3, 2, 'c'], [8, 2, 'c'], [9, 2, 'c'], [10, 2, 'c'], [11, 2, 'c']], // cap with peak
  };
  const FACEWEAR = {
    macro: [[3, 5, 'k'], [4, 5, 'w'], [5, 5, 'k'], [6, 5, 'k'], [7, 5, 'w'], [8, 5, 'k']], // glasses
    assembly: [[5, 9, 'w'], [6, 9, 'w'], [5, 10, 'w'], [6, 10, 'w'], [5, 11, 'w'], [6, 11, 'w'], [5, 12, 'w'], [6, 12, 'w']], // shirt front
    factcheck: [[4, 4, 'k'], [7, 4, 'k']], // heavy brows
  };
  const HAIR = { assembly: '#8a8f96', factcheck: '#6b3f2a', trends: '#2a1f3d', competitors: '#4a3326', macro: '#3b2a22', followup: '#2f2a2a' };

  const ICON = {
    write: ['.....ww', '....www', '...www.', '..www..', '.www...', 'ww.....', 'w......'],
    think: ['.......', '.......', '.......', 'ww.ww.w', 'ww.ww.w', '.......', '.......'],
    done: ['.......', '......w', '.....ww', 'w...ww.', 'ww.ww..', '.www...', '..w....'],
    fail: ['..ww...', '..ww...', '..ww...', '..ww...', '..ww...', '.......', '..ww...'],
  };

  function drawRows(g, rows, x, y, pal, flip) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = pal[row[c]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x + (flip ? row.length - 1 - c : c), y + r, 1, 1);
      }
    }
  }
  function drawCharacter(g, role, x, y, rows, view, flip) {
    const lane = LANE[role] || LANE.assembly;
    const pal = { k: C.outline, s: C.skin, d: C.skinDark, h: HAIR[role] || C.hair, b: lane, c: shade(lane, 0.72), p: C.pants, o: C.shoe, w: '#ffffff' };
    drawRows(g, rows, x, y, pal, flip);
    const px = (c) => x + (flip ? 11 - c : c);
    for (const [c, r, key] of HEADWEAR[role] || []) { g.fillStyle = pal[key]; g.fillRect(px(c), y + r, 1, 1); }
    if (view === 'front') for (const [c, r, key] of FACEWEAR[role] || []) { g.fillStyle = pal[key]; g.fillRect(px(c), y + r, 1, 1); }
  }
  function drawPaper(g, x, y, kind) {
    if (kind === 'question') { g.fillStyle = C.envelope; g.fillRect(x, y, 7, 5); g.fillStyle = C.envelopeDark; g.fillRect(x, y, 7, 1); g.fillRect(x + 3, y + 2, 1, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 4, y + 1, 1, 1); return; }
    g.fillStyle = C.paper; g.fillRect(x, y, 6, 7);
    g.fillStyle = C.paperLine; g.fillRect(x + 1, y + 2, 4, 1); g.fillRect(x + 1, y + 4, 3, 1);
  }
  function drawBubble(g, x, y, icon, color) {
    g.fillStyle = C.bubbleEdge; g.fillRect(x - 1, y, 11, 10); g.fillRect(x, y - 1, 9, 12);
    g.fillStyle = C.bubble; g.fillRect(x, y, 9, 10);
    g.fillRect(x + 3, y + 10, 2, 1); g.fillRect(x + 4, y + 11, 1, 1);
    drawRows(g, ICON[icon], x + 1, y + 1, { w: color || C.outline });
  }

  /* ---------- furniture (tile coords; x,y is the top-left tile) ---------- */
  function drawDesk(g, tx, ty, opts) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.woodEdge; g.fillRect(x + 1, y + 3, 30, 12);
    g.fillStyle = C.wood; g.fillRect(x + 1, y + 3, 30, 9);
    g.fillStyle = C.woodDark; g.fillRect(x + 1, y + 12, 30, 2);
    // monitor on the left half, screen toward the room (a cheat every office sim makes)
    g.fillStyle = C.monitor; g.fillRect(x + 4, y - 3, 11, 9); g.fillRect(x + 8, y + 6, 3, 2); g.fillRect(x + 6, y + 8, 7, 1);
    g.fillStyle = opts.on ? (opts.laneColor || C.screenOn) : C.screenOff; g.fillRect(x + 5, y - 2, 9, 7);
    if (opts.on) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 6, y - 1, 4, 1); g.fillRect(x + 6, y + 1, 6, 1); g.fillRect(x + 6, y + 3, 3, 1); }
    if (opts.papers > 0) { const n = Math.min(opts.papers, 3); for (let i = 0; i < n; i++) drawPaper(g, x + 22, y + 4 - i, opts.paperKind); }
    if (opts.mug) { g.fillStyle = C.mug; g.fillRect(x + 25, y + 6, 3, 3); g.fillStyle = C.coffee; g.fillRect(x + 25, y + 6, 3, 1); }
    if (opts.magnifier) { g.fillStyle = C.metal; g.fillRect(x + 23, y + 5, 4, 4); g.fillStyle = '#9fd0e8'; g.fillRect(x + 24, y + 6, 2, 2); g.fillStyle = C.metal; g.fillRect(x + 27, y + 9, 1, 1); g.fillRect(x + 28, y + 10, 1, 1); }
  }
  function drawChair(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.chairDark; g.fillRect(x + 2, y - 2, 12, 14);
    g.fillStyle = C.chair; g.fillRect(x + 3, y - 1, 10, 12);
    g.fillStyle = C.metalDark; g.fillRect(x + 2, y - 4, 12, 3);
  }
  function drawCouch(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = '#7a4b3a'; g.fillRect(x + 1, y - 2, T * 2 - 2, 14);
    g.fillStyle = '#9a6248'; g.fillRect(x + 2, y + 3, T * 2 - 4, 8);
    g.fillStyle = '#b87556'; g.fillRect(x + 3, y + 4, T - 4, 6); g.fillRect(x + T + 1, y + 4, T - 4, 6);
    g.fillStyle = '#5c3a2c'; g.fillRect(x + 1, y + 11, T * 2 - 2, 1);
  }
  function drawCooler(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.metalDark; g.fillRect(x + 5, y + 2, 6, 12);
    g.fillStyle = '#9fd0e8'; g.fillRect(x + 5, y - 6, 6, 8); g.fillStyle = '#cfe8ff'; g.fillRect(x + 6, y - 5, 2, 5);
  }
  function drawSearchCounter(g, tx, ty, slotsOn) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.metalDark; g.fillRect(x, y + 6, T * 3, 10);
    g.fillStyle = C.metal; g.fillRect(x, y + 6, T * 3, 7);
    for (let i = 0; i < 3; i++) {
      const mx = x + i * T + 2;
      g.fillStyle = C.monitor; g.fillRect(mx, y - 2, 12, 10);
      const on = slotsOn[i];
      g.fillStyle = on ? shade(on, 0.9) : C.screenOff; g.fillRect(mx + 1, y - 1, 10, 8);
      if (on) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(mx + 3, y + 1, 5, 5); g.fillStyle = shade(on, 0.9); g.fillRect(mx + 4, y + 2, 3, 3); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(mx + 8, y + 6, 2, 1); }
    }
  }
  function drawLibrary(g, tx, ty, readers) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.woodEdge; g.fillRect(x, y - 6, T * 3, 22);
    g.fillStyle = C.woodDark; g.fillRect(x + 1, y - 5, T * 3 - 2, 20);
    const books = [C.book1, C.book2, C.book3, C.book4, C.book5];
    for (let shelf = 0; shelf < 2; shelf++) {
      const sy = y - 4 + shelf * 9;
      let bx = x + 2, i = shelf * 3;
      while (bx < x + T * 3 - 3) { const w = 2 + (i % 3); g.fillStyle = books[i % books.length]; g.fillRect(bx, sy + (i % 2), w, 7 - (i % 2)); bx += w + 1; i++; }
      g.fillStyle = C.wood; g.fillRect(x + 1, sy + 7, T * 3 - 2, 1);
    }
    if (readers) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y + 16, T * 3, 2); }
  }
  function drawTable(g, tx, ty, papers) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.woodEdge; g.fillRect(x + 2, y + 2, T * 4 - 4, T * 2 - 2);
    g.fillStyle = C.wood; g.fillRect(x + 3, y + 3, T * 4 - 6, T * 2 - 6);
    g.fillStyle = C.woodDark; g.fillRect(x + 3, y + T * 2 - 4, T * 4 - 6, 2);
    const n = Math.min(papers, 8);
    for (let i = 0; i < n; i++) drawPaper(g, x + 12 + (i % 4) * 9, y + 8 + Math.floor(i / 4) * 8 - (i % 2), 'paper');
    if (papers > 8) { g.fillStyle = C.outline; g.fillRect(x + 50, y + 22, 1, 1); g.fillRect(x + 52, y + 22, 1, 1); g.fillRect(x + 54, y + 22, 1, 1); }
  }
  function drawBoard(g, tx, ty, pinned, tally) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.boardFrame; g.fillRect(x + 1, y - 14, T * 2 - 2, 22);
    g.fillStyle = C.board; g.fillRect(x + 2, y - 13, T * 2 - 4, 20);
    g.fillStyle = C.metalDark; g.fillRect(x + 6, y + 8, 2, 7); g.fillRect(x + T * 2 - 8, y + 8, 2, 7); g.fillRect(x + 4, y + 14, T * 2 - 8, 1);
    if (pinned) {
      g.fillStyle = C.paperLine;
      for (let i = 0; i < 6; i++) g.fillRect(x + 5, y - 10 + i * 3, 12 + ((i * 7) % 8), 1);
      g.fillStyle = C.ok; g.fillRect(x + 22, y - 11, 4, 4);
      if (tally && tally.unsupported) { g.fillStyle = C.bad; g.fillRect(x + 22, y - 5, 4, 4); }
    } else { g.fillStyle = C.bubbleEdge; g.fillRect(x + 8, y - 4, 14, 1); }
  }
  function drawPrinter(g, tx, ty, busy) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.metalDark; g.fillRect(x + 2, y + 4, 12, 10);
    g.fillStyle = C.metal; g.fillRect(x + 2, y + 4, 12, 6);
    g.fillStyle = busy ? C.ok : C.screenOff; g.fillRect(x + 11, y + 6, 2, 1);
    if (busy) drawPaper(g, x + 5, y - 2, 'paper');
  }
  function drawInbox(g, tx, ty, envelope) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.woodEdge; g.fillRect(x + 2, y + 4, 12, 10); g.fillStyle = C.wood; g.fillRect(x + 2, y + 4, 12, 7);
    if (envelope) { g.fillStyle = C.envelope; g.fillRect(x + 4, y + 1, 8, 5); g.fillStyle = C.envelopeDark; g.fillRect(x + 4, y + 1, 8, 1); g.fillRect(x + 7, y + 3, 2, 1); g.fillRect(x + 6, y + 2, 1, 1); g.fillRect(x + 9, y + 2, 1, 1); }
  }
  function drawPlant(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.potDark; g.fillRect(x + 4, y + 8, 8, 6); g.fillStyle = C.pot; g.fillRect(x + 4, y + 7, 8, 2);
    g.fillStyle = C.plantDark; g.fillRect(x + 2, y - 1, 5, 7); g.fillRect(x + 8, y - 3, 6, 9);
    g.fillStyle = C.plant; g.fillRect(x + 3, y, 3, 5); g.fillRect(x + 9, y - 2, 3, 7); g.fillRect(x + 6, y + 3, 4, 5);
  }
  function drawCoffeeMachine(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.metalDark; g.fillRect(x + 3, y - 4, 10, 18);
    g.fillStyle = C.metal; g.fillRect(x + 4, y - 3, 8, 6);
    g.fillStyle = C.bad; g.fillRect(x + 6, y - 1, 1, 1);
    g.fillStyle = C.mug; g.fillRect(x + 6, y + 7, 4, 3);
  }

  /* ---------- the room ---------- */
  // Places: where a sprite stands and which way it faces. Desks have a home; stations have slots.
  const DESK = {
    macro: { desk: [3, 3], home: [4, 2], role: 'macro' },
    trends: { desk: [3, 6], home: [4, 5], role: 'trends' },
    competitors: { desk: [3, 9], home: [4, 8], role: 'competitors' },
    assembly: { table: [12, 6], home: [14, 5], role: 'assembly', drop: [11, 7] },
    'followup-1': { desk: [20, 3], home: [21, 2], role: 'followup', drop: [19, 3] },
    'followup-2': { desk: [20, 6], home: [21, 5], role: 'followup', drop: [19, 6] },
    'followup-3': { desk: [20, 9], home: [21, 8], role: 'followup', drop: [19, 9] },
    factcheck: { desk: [25, 5], home: [26, 4], role: 'factcheck', drop: [24, 5] },
  };
  const SEARCH = { at: [9, 1], slots: [[9, 2], [10, 2], [11, 2]] };
  const LIBRARY = { at: [14, 1], slots: [[14, 2], [15, 2], [16, 2]] };
  const INBOX = [1, 5];
  const BOARD = { at: [25, 9], drop: [24, 9] };
  const PRINTER = [27, 9];
  const PLANTS = [[1, 1], [28, 1], [1, 11], [28, 11], [17, 11]];
  const COUCH = [13, 10];
  const COOLER = [9, 11];
  const COFFEE = [19, 1];

  const deskOf = (agentId) => (agentId === 'assembly-2' ? 'assembly' : agentId);

  function blockedTiles(s) {
    const b = new Set();
    const block = (x, y, w = 1, h = 1) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) b.add(`${x + i},${y + j}`); };
    for (let x = 0; x < COLS; x++) block(x, 0);
    for (let y = 0; y < ROWS; y++) { block(0, y); block(COLS - 1, y); }
    for (const [key, d] of Object.entries(DESK)) {
      if (key.startsWith('followup') && !s.agents.get(key)) continue;
      if (d.desk) block(d.desk[0], d.desk[1], 2, 1);
      if (d.table) block(d.table[0], d.table[1], 4, 2);
    }
    block(SEARCH.at[0], SEARCH.at[1], 3, 1);
    block(LIBRARY.at[0], LIBRARY.at[1], 3, 1);
    block(INBOX[0], INBOX[1]);
    block(BOARD.at[0], BOARD.at[1], 2, 1); block(PRINTER[0], PRINTER[1]);
    for (const p of PLANTS) block(p[0], p[1]);
    block(COFFEE[0], COFFEE[1]); block(COUCH[0], COUCH[1], 2, 1); block(COOLER[0], COOLER[1]);
    return b;
  }
  // Breadth-first on the walkability grid: shortest route, no cutting through desks.
  function findPath(blocked, from, to) {
    const key = (x, y) => `${x},${y}`;
    if (from[0] === to[0] && from[1] === to[1]) return [];
    const prev = new Map([[key(...from), null]]);
    const queue = [from];
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev.has(k)) continue;
        if (blocked.has(k) && !(nx === to[0] && ny === to[1])) continue;
        prev.set(k, [x, y]);
        if (nx === to[0] && ny === to[1]) {
          const path = [[nx, ny]];
          let cur = [x, y];
          while (cur && !(cur[0] === from[0] && cur[1] === from[1])) { path.push(cur); cur = prev.get(key(...cur)); }
          return path.reverse();
        }
        queue.push([nx, ny]);
      }
    }
    return [to];
  }

  /* ---------- runtime ---------- */
  let stateRef = null, muted = false;
  const chars = new Map();   // deskKey -> character
  let flights = [];          // the brief gliding to each research desk
  let lastNow = 0;

  function charFor(key) {
    let c = chars.get(key);
    if (!c) {
      const d = DESK[key];
      c = { key, role: d.role, x: d.home[0], y: d.home[1], path: [], facing: 'down', at: 'home', want: 'home', trips: [], trip: null, carry: null, slot: 0, active: null };
      chars.set(key, c);
    }
    return c;
  }
  function placeTile(c, place) {
    if (place === 'search') return SEARCH.slots[c.slot % 3];
    if (place === 'library') return LIBRARY.slots[c.slot % 3];
    return DESK[c.key].home;
  }
  function wantedPlace(agent) {
    if (!agent || agent.status !== 'running') return 'home';
    const e = agent.trace[agent.trace.length - 1];
    if (!e) return 'home';
    if (e.kind === 'search') return 'search';
    if (e.kind === 'fetch') return 'library';
    return 'home';
  }
  const atTile = (c, t) => Math.round(c.x) === t[0] && Math.round(c.y) === t[1];
  function setPath(c, blocked, to) { c.path = findPath(blocked, [Math.round(c.x), Math.round(c.y)], to); }
  function step(c, dt) {
    if (!c.path.length) return false;
    const [tx, ty] = c.path[0];
    const dx = tx - c.x, dy = ty - c.y;
    const dist = Math.hypot(dx, dy);
    const move = SPEED * dt;
    if (dist <= move) { c.x = tx; c.y = ty; c.path.shift(); }
    else { c.x += (dx / dist) * move; c.y += (dy / dist) * move; }
    if (Math.abs(dx) > Math.abs(dy)) c.facing = dx > 0 ? 'right' : 'left'; else if (dy !== 0) c.facing = dy > 0 ? 'down' : 'up';
    return true;
  }

  /* ---------- hand-offs (events) ---------- */
  function queueTrip(agentId, targetKey, paperKind) { charFor(deskOf(agentId)).trips.push({ targetKey, paperKind }); }
  const dropTileFor = (targetKey) => (targetKey === 'report' ? BOARD.drop : DESK[targetKey]?.drop || null);
  function onEvent(ev) {
    if (muted || !stateRef) return;
    const s = stateRef;
    if (ev.type === 'agent.started' && s.agents.get(ev.agentId)?.stage === 'research' && !flights.length) {
      const others = s.order.filter((id) => { const a = s.agents.get(id); return a.stage === 'research' && a.status !== 'queued' && id !== ev.agentId; });
      if (others.length === 0) for (const id of ['macro', 'trends', 'competitors']) flights.push({ to: DESK[id].desk, start: performance.now(), dur: 900 });
    }
    if (ev.type !== 'agent.completed') return;
    const a = s.agents.get(ev.agentId);
    if (!a) return;
    if (a.stage === 'research' || a.stage === 'followup') queueTrip(a.id, 'assembly', 'paper');
    else if (a.stage === 'assembly') for (const id of s.order.filter((id) => s.agents.get(id).stage === 'followup')) queueTrip('assembly', id, 'question');
    else if (a.stage === 'assembly-2') queueTrip('assembly-2', 'factcheck', 'paper');
    else if (a.stage === 'factcheck') queueTrip('factcheck', 'report', 'paper');
  }
  function onQueued(agentId) {
    if (muted || !stateRef) return;
    const a = stateRef.agents.get(agentId), asm = stateRef.agents.get('assembly');
    if (a?.stage !== 'followup' || asm?.status !== 'completed') return;
    const c = charFor('assembly');
    if (c.trip?.targetKey === agentId || c.trips.some((t) => t.targetKey === agentId)) return;
    queueTrip('assembly', agentId, 'question');
  }
  function reset() { chars.clear(); flights = []; }

  function inflightTo(targetKey) { let n = 0; for (const c of chars.values()) if (c.trip && c.trip.phase === 'go' && c.trip.targetKey === targetKey) n++; return n; }
  function pileCount(key) {
    const s = stateRef;
    const done = (id) => s.agents.get(id)?.status === 'completed';
    if (key === 'assembly') { let n = 0; for (const id of s.order) { const a = s.agents.get(id); if ((a.stage === 'research' || a.stage === 'followup') && a.status === 'completed') n++; } return Math.max(0, n - inflightTo('assembly')); }
    if (key.startsWith('followup')) return Math.max(0, (done('assembly') ? 1 : 0) - inflightTo(key));
    if (key === 'factcheck') return Math.max(0, (done('assembly-2') ? 1 : 0) - inflightTo('factcheck'));
    return 0;
  }

  /* ---------- render ---------- */
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d');
  let canvas = null, ctx = null, visible = false, raf = 0;

  function drawRoom() {
    g.fillStyle = '#14202E'; g.fillRect(0, 0, W, H);
    for (let y = 1; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.fillStyle = (x + y) % 2 ? C.floorA : C.floorB; g.fillRect(x * T, y * T, T, T); }
    g.fillStyle = C.rugEdge; g.fillRect(11 * T, 4 * T + 8, 6 * T, 5 * T); g.fillStyle = C.rug; g.fillRect(11 * T + 2, 4 * T + 10, 6 * T - 4, 5 * T - 4);
    g.fillStyle = C.wall; g.fillRect(0, 0, W, T + 4); g.fillStyle = C.wallTop; g.fillRect(0, 0, W, 3); g.fillStyle = C.wallLine; g.fillRect(0, T + 4, W, 1);
    for (const wx of [4, 6, 22, 24]) { g.fillStyle = C.windowFrame; g.fillRect(wx * T + 1, 4, 14, 12); g.fillStyle = C.window; g.fillRect(wx * T + 2, 5, 12, 10); g.fillStyle = C.windowLight; g.fillRect(wx * T + 3, 6, 4, 3); g.fillStyle = C.windowFrame; g.fillRect(wx * T + 8, 5, 1, 10); }
    g.fillStyle = C.wall; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
    g.fillStyle = C.wallLine; g.fillRect(6, T + 4, 1, H); g.fillRect(W - 7, T + 4, 1, H);
    g.fillStyle = C.woodDark; g.fillRect(0, 10 * T, 6, 24); g.fillStyle = C.wood; g.fillRect(1, 10 * T + 1, 4, 22); g.fillStyle = C.envelopeDark; g.fillRect(4, 10 * T + 11, 1, 2);
  }

  function frame(now) {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (!stateRef) return;
    const s = stateRef;
    const dt = Math.min(0.1, lastNow ? (now - lastNow) / 1000 : 0); lastNow = now;
    const blocked = blockedTiles(s);
    const running = s.status === 'running';

    // Decide where everyone should be, then move them. Hand-off trips take priority once the sprite is home.
    let searchSlot = 0, librarySlot = 0;
    for (const [key, d] of Object.entries(DESK)) {
      const agent = s.agents.get(key);
      if (!agent) { chars.delete(key); continue; }
      const agent2 = key === 'assembly' ? s.agents.get('assembly-2') : null;
      const active = agent2 && agent2.status !== 'queued' ? agent2 : agent;
      const c = charFor(key);
      c.active = active;
      if (c.trip) {
        if (!step(c, dt)) {
          if (c.trip.phase === 'go') { c.trip.phase = 'back'; c.carry = null; setPath(c, blocked, d.home); }
          else { c.trip = null; c.at = 'home'; c.want = 'home'; c.facing = 'down'; }
        }
        continue;
      }
      const want = c.trips.length ? 'home' : wantedPlace(active);
      if (want === 'search') c.slot = searchSlot++;
      if (want === 'library') c.slot = librarySlot++;
      if (c.trips.length && atTile(c, d.home) && !c.path.length) {
        c.trip = { ...c.trips.shift(), phase: 'go' };
        c.carry = c.trip.paperKind;
        setPath(c, blocked, dropTileFor(c.trip.targetKey) || d.home);
        continue;
      }
      const target = placeTile(c, want);
      if (want !== c.want || (!c.path.length && !atTile(c, target))) { c.want = want; setPath(c, blocked, target); }
      if (step(c, dt)) { c.at = 'moving'; continue; }
      c.at = want;
      c.facing = want === 'search' ? 'up' : 'down';
    }

    drawRoom();
    const items = [];
    const push = (depthY, draw) => items.push({ depthY, draw });

    for (const p of PLANTS) push(p[1] + 0.9, () => drawPlant(g, p[0], p[1]));
    push(COFFEE[1] + 0.9, () => drawCoffeeMachine(g, COFFEE[0], COFFEE[1]));
    push(COUCH[1] + 0.9, () => drawCouch(g, COUCH[0], COUCH[1]));
    push(COOLER[1] + 0.9, () => drawCooler(g, COOLER[0], COOLER[1]));
    push(INBOX[1] + 0.9, () => drawInbox(g, INBOX[0], INBOX[1], !!s.brief));
    const searchOn = [null, null, null]; let readers = 0;
    for (const c of chars.values()) { if (c.at === 'search') searchOn[c.slot % 3] = LANE[c.role]; if (c.at === 'library') readers++; }
    push(SEARCH.at[1] + 0.9, () => drawSearchCounter(g, SEARCH.at[0], SEARCH.at[1], searchOn));
    push(LIBRARY.at[1] + 0.9, () => drawLibrary(g, LIBRARY.at[0], LIBRARY.at[1], readers));
    const reportDone = s.agents.get('report')?.status === 'completed';
    push(BOARD.at[1] + 0.9, () => drawBoard(g, BOARD.at[0], BOARD.at[1], reportDone && inflightTo('report') === 0, s.counts));
    push(PRINTER[1] + 0.9, () => drawPrinter(g, PRINTER[0], PRINTER[1], s.agents.get('factcheck')?.status === 'running'));

    for (const [key, d] of Object.entries(DESK)) {
      const agent = s.agents.get(key);
      if (!agent) continue;
      const c = chars.get(key);
      const active = c?.active || agent;
      const on = active.status === 'running' && !!c && c.at === 'home';
      if (d.table) push(d.table[1] + 1.9, () => drawTable(g, d.table[0], d.table[1], pileCount('assembly')));
      else push(d.desk[1] + 0.9, () => drawDesk(g, d.desk[0], d.desk[1], { on, laneColor: shade(LANE[d.role], 0.9), papers: pileCount(key), paperKind: key.startsWith('followup') ? 'question' : 'paper', mug: active.status === 'queued', magnifier: key === 'factcheck' }));
      push(d.home[1] + 0.5, () => drawChair(g, d.home[0], d.home[1]));
    }

    for (const c of chars.values()) {
      const a = c.active;
      if (!a) continue;
      push(c.y + 0.95, () => {
        const x = Math.round(c.x * T) + 2, y = Math.round(c.y * T) - 6;
        const moving = c.path.length > 0;
        const f = Math.floor(now / 140) % 2;
        let rows, view = 'front', flip = false;
        if (moving) {
          if (c.facing === 'up') { rows = BACK_WALK[f]; view = 'back'; }
          else if (c.facing === 'down') rows = FRONT_WALK[f];
          else { rows = SIDE_WALK[f]; view = 'side'; flip = c.facing === 'left'; }
        } else if (c.at === 'search') { rows = a.status === 'running' ? BACK_TYPE[Math.floor(now / 260) % 2] : BACK; view = 'back'; }
        else if (c.at === 'library') rows = FRONT_READ;
        else if (a.status === 'running' && c.at === 'home') rows = FRONT_TYPE[Math.floor(now / 260) % 2];
        else rows = FRONT;
        const bob = !moving && a.status !== 'running' ? Math.round(Math.sin(now / 700 + c.x) * 0.5) : 0;
        drawCharacter(g, c.role, x, y + bob, rows, view, flip);
        if (c.at === 'library' && !moving) drawPaper(g, x + 3, y + 10, 'paper');
        if (c.carry) drawPaper(g, x + (c.facing === 'left' ? -3 : 9), y + 8, c.carry);
        if (!moving && !c.trip) {
          if (a.status === 'failed') drawBubble(g, x + 12, y - 11, 'fail', C.bad);
          else if (a.status === 'completed' && !running) drawBubble(g, x + 12, y - 11, 'done', C.ok);
          else if (a.status === 'running' && c.at === 'home') {
            const e = a.trace[a.trace.length - 1];
            drawBubble(g, x + 12, y - 11, e && e.kind === 'thinking' ? 'think' : 'write', C.outline);
          }
        }
      });
    }
    for (const fl of flights) {
      const t = Math.min(1, (now - fl.start) / fl.dur), e = t * (2 - t);
      const x = (INBOX[0] + (fl.to[0] + 1 - INBOX[0]) * e) * T, y = (INBOX[1] + (fl.to[1] - INBOX[1]) * e) * T - Math.sin(t * Math.PI) * 12;
      push(99, () => drawPaper(g, Math.round(x), Math.round(y), 'paper'));
    }
    flights = flights.filter((fl) => now - fl.start < fl.dur);

    items.sort((p, q) => p.depthY - q.depthY);
    for (const it of items) it.draw();

    // Blit at an integer scale so every pixel stays a crisp square, then name tags in the page font.
    const cw = canvas.width, ch = canvas.height;
    const scale = Math.max(1, Math.floor(Math.min(cw / W, ch / H)));
    const dx = Math.round((cw - W * scale) / 2), dy = Math.round((ch - H * scale) / 2);
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, dx, dy, W * scale, H * scale);
    const dpr = devicePixelRatio;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.round(11 * dpr)}px "Bricolage Grotesque", system-ui, sans-serif`;
    const placed = [];
    for (const c of [...chars.values()].sort((p, q) => p.x - q.x)) {
      const a = c.active; if (!a) continue;
      const lx = dx + (c.x * T + 8) * scale;
      let ly = dy + (c.y * T + 13) * scale;
      const wPx = ctx.measureText(a.label).width + 8 * dpr, hPx = 14 * dpr;
      for (let tries = 0; tries < 3; tries++) {
        const hit = placed.some((r) => lx - wPx / 2 < r.x + r.w && lx + wPx / 2 > r.x && ly < r.y + r.h && ly + hPx > r.y);
        if (!hit) break;
        ly += hPx + dpr;
      }
      placed.push({ x: lx - wPx / 2, y: ly - dpr, w: wPx, h: hPx + dpr });
      ctx.fillStyle = 'rgba(20,32,46,.82)'; ctx.fillRect(lx - wPx / 2, ly - dpr, wPx, hPx);
      ctx.fillStyle = a.status === 'running' ? LANE[c.role] : a.status === 'failed' ? C.bad : a.status === 'completed' ? '#B8C4D0' : '#7F91A3';
      ctx.fillText(a.label, lx, ly);
    }
    ctx.fillStyle = '#6B7E92'; ctx.font = `${Math.round(10.5 * dpr)}px "Bricolage Grotesque", system-ui, sans-serif`;
    const tag = (tx, ty, text) => ctx.fillText(text, dx + tx * T * scale, dy + ty * T * scale);
    // Station names go on the wall above them; the floor in front is where people stand.
    tag(10.5, 0.15, 'Search'); tag(15.5, 0.15, 'Library'); tag(14, 8.2, 'Assembly table'); tag(26, 10.15, 'Report'); tag(1.5, 6.05, 'Brief');
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
  }

  window.Office = {
    init({ canvas: el, getState }) {
      canvas = el; ctx = el.getContext('2d');
      stateRef = getState();
      window.addEventListener('resize', resize);
      resize();
    },
    setVisible(v) { visible = v; if (v) { resize(); lastNow = 0; if (!raf) raf = requestAnimationFrame(frame); } },
    onEvent, onQueued, reset,
    setMuted(v) { muted = v; },
    debug() {
      const walking = [...chars.values()].filter((c) => c.path.length).map((c) => `${c.key}→${c.trip ? 'trip-' + c.trip.phase : c.want}`);
      const at = [...chars.values()].map((c) => `${c.key}@${c.at}`);
      return { walking, at, trips: [...chars.values()].reduce((n, c) => n + c.trips.length + (c.trip ? 1 : 0), 0), flights: flights.length };
    },
  };
})();
