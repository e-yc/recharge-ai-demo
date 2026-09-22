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
  const SPEED = 3.6;                   // tiles per second: a walk, not a sprint
  const DWELL_MS = 4000;               // nobody leaves a spot they only just reached

  const C = {
    floorA: '#c79a6b', floorB: '#b98a5e', seam: '#a67a52', floorEdge: '#8f6746',
    rug: '#5e9a94', rugDark: '#4f847f', rugAccent: '#e8a17a', rugEdge: '#e9dcc4',
    wall: '#efe4cf', wallShade: '#d9c8aa', wallLine: '#b9a583', wallTop: '#f6efe1', baseboard: '#e2d3b5',
    sky: '#9fd0ea', skyLight: '#d5ecf7', cloud: '#ffffff', windowFrame: '#7a5a3f',
    wood: '#8b5a3c', woodDark: '#6b4530', woodEdge: '#4f3324', woodLight: '#a26d49', metal: '#5b6b7c', metalDark: '#43505e',
    monitor: '#2b2f38', screenOff: '#3d4450', screenOn: '#dff1ff',
    paper: '#fbfbf7', paperLine: '#b5bcc6', envelope: '#f0c85e', envelopeDark: '#c99a33',
    outline: '#2a1f1a', skin: '#f6d2b0', skinDark: '#d9a27c', blush: '#f0a3a3', hair: '#3b2a22', pants: '#3a4a66', shoe: '#2a1f1a',
    bubble: '#ffffff', bubbleEdge: '#d9d2c4', bad: '#E5695B', ok: '#5fbf87',
    plant: '#5fae74', plantDark: '#3f8a58', plantLight: '#8ccf9a', pot: '#c96f4a', potDark: '#9c5236',
    board: '#fbfbf7', boardFrame: '#6b4530', chair: '#4a5a6e', chairDark: '#36434f', cushion: '#e8a17a',
    book1: '#d96c5f', book2: '#5f9ed1', book3: '#e6bb5c', book4: '#6fbf8a', book5: '#a77be0', book6: '#f0a3a3',
    coffee: '#4b2e1e', mug: '#ffffff', couch: '#7a8fb0', couchDark: '#5f7291', couchLight: '#93a6c4',
    cat: '#3a3a3a', catLight: '#5a5a5a', shadow: 'rgba(80,50,30,.22)',
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
    '..krssssrk..',
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
    '..khhsrsk...',
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
  // Eyes closed for a frame every few seconds; the timing is offset per sprite so they don't blink in unison.
  const blinkRow = (rows) => withRows(rows, { 5: '..ksdssdsk..' });
  const SLEEP = withRows(FRONT, { 5: '..ksdssdsk..', 11: '.kbbbbbbbbk.', 12: '.kbbbbbbbbk.' });
  const Z = ['www', '.w.', 'www'];
  function drawZs(g, x, y, now) {
    const t = (now / 1400) % 1;
    drawRows(g, Z, x, y - Math.round(t * 8), { w: 'rgba(95,113,134,.9)' });
    if (t > 0.4) drawRows(g, Z, x + 4, y - 4 - Math.round((t - 0.4) * 8), { w: 'rgba(95,113,134,.6)' });
  }
  const blinking = (now, seed) => ((now + seed * 733) % 3400) < 130;

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
    const pal = { k: C.outline, s: C.skin, d: C.skinDark, r: C.blush, h: HAIR[role] || C.hair, b: lane, c: shade(lane, 0.72), p: C.pants, o: C.shoe, w: '#ffffff' };
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
    g.fillStyle = C.shadow; g.fillRect(x + 2, y + 14, 30, 2);
    g.fillStyle = C.woodEdge; g.fillRect(x + 1, y + 3, 30, 12);
    g.fillStyle = C.wood; g.fillRect(x + 1, y + 3, 30, 9);
    g.fillStyle = C.woodLight; g.fillRect(x + 2, y + 3, 28, 1);
    g.fillStyle = C.woodDark; g.fillRect(x + 1, y + 12, 30, 2);
    // monitor on the left half, screen toward the room (a cheat every office sim makes)
    g.fillStyle = C.monitor; g.fillRect(x + 4, y - 3, 11, 9); g.fillRect(x + 8, y + 6, 3, 2); g.fillRect(x + 6, y + 8, 7, 1);
    g.fillStyle = opts.on ? (opts.laneColor || C.screenOn) : C.screenOff; g.fillRect(x + 5, y - 2, 9, 7);
    if (opts.on) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 6, y - 1, 4, 1); g.fillRect(x + 6, y + 1, 6, 1); g.fillRect(x + 6, y + 3, 3, 1); }
    if (opts.papers > 0) { const n = Math.min(opts.papers, 3); for (let i = 0; i < n; i++) drawPaper(g, x + 22, y + 4 - i, opts.paperKind); }
    if (opts.mug) { g.fillStyle = C.mug; g.fillRect(x + 25, y + 6, 3, 3); g.fillStyle = C.coffee; g.fillRect(x + 25, y + 6, 3, 1); }
    if (opts.magnifier) { g.fillStyle = C.metal; g.fillRect(x + 23, y + 5, 4, 4); g.fillStyle = '#9fd0e8'; g.fillRect(x + 24, y + 6, 2, 2); g.fillStyle = C.metal; g.fillRect(x + 27, y + 9, 1, 1); g.fillRect(x + 28, y + 10, 1, 1); }
  }
  // A low seat with a slim back: tall chairs read as cabinets from above.
  function drawChair(g, tx, ty) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.shadow; g.fillRect(x + 3, y + 12, 10, 2);
    g.fillStyle = C.chairDark; g.fillRect(x + 3, y + 2, 10, 10);
    g.fillStyle = C.cushion; g.fillRect(x + 4, y + 3, 8, 7);
    g.fillStyle = C.chairDark; g.fillRect(x + 3, y - 1, 10, 3); g.fillStyle = C.chair; g.fillRect(x + 4, y, 8, 1);
  }
  function drawCouch(g, tx, ty, now) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.couchDark; g.fillRect(x + 1, y - 3, T * 2 - 2, 16);
    g.fillStyle = C.couch; g.fillRect(x + 2, y - 2, T * 2 - 4, 6);
    g.fillStyle = C.couchLight; g.fillRect(x + 3, y + 4, T - 4, 6); g.fillRect(x + T + 1, y + 4, T - 4, 6);
    g.fillStyle = C.cushion; g.fillRect(x + 4, y + 5, 5, 4);
    g.fillStyle = C.couchDark; g.fillRect(x + 1, y + 11, T * 2 - 2, 2);
    // the office cat, asleep on the right cushion; its tail moves now and then
    const cx = x + T + 3, cy = y + 3;
    g.fillStyle = C.cat; g.fillRect(cx, cy + 2, 9, 5); g.fillRect(cx + 6, cy, 4, 4); g.fillRect(cx + 6, cy - 1, 1, 1); g.fillRect(cx + 9, cy - 1, 1, 1);
    g.fillStyle = C.catLight; g.fillRect(cx + 1, cy + 3, 5, 3);
    const tail = Math.floor(now / 900) % 2; g.fillStyle = C.cat; g.fillRect(cx - 2, cy + 5 + tail, 3, 1); g.fillRect(cx - 3, cy + 4 + tail, 1, 1);
    if (Math.floor(now / 1600) % 2) { g.fillStyle = C.bubbleEdge; g.fillRect(cx + 11, cy - 3, 1, 1); g.fillRect(cx + 13, cy - 5, 1, 1); }
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
    const books = [C.book1, C.book2, C.book3, C.book4, C.book5, C.book6];
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
    g.fillStyle = C.shadow; g.fillRect(x + 4, y + T * 2 - 1, T * 4 - 6, 3);
    g.fillStyle = C.woodEdge; g.fillRect(x + 2, y + 2, T * 4 - 4, T * 2 - 2);
    g.fillStyle = C.wood; g.fillRect(x + 3, y + 3, T * 4 - 6, T * 2 - 6);
    g.fillStyle = C.woodLight; g.fillRect(x + 4, y + 3, T * 4 - 8, 1);
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
  function drawPlant(g, tx, ty, kind) {
    const x = tx * T, y = ty * T;
    g.fillStyle = C.shadow; g.fillRect(x + 3, y + 13, 10, 2);
    g.fillStyle = C.potDark; g.fillRect(x + 4, y + 8, 8, 6); g.fillStyle = C.pot; g.fillRect(x + 4, y + 7, 8, 2); g.fillRect(x + 5, y + 9, 2, 3);
    if (kind === 'small') {
      g.fillStyle = C.plantDark; g.fillRect(x + 4, y + 3, 8, 5); g.fillStyle = C.plant; g.fillRect(x + 5, y + 2, 3, 4); g.fillRect(x + 9, y + 3, 2, 3); g.fillStyle = C.plantLight; g.fillRect(x + 6, y + 2, 1, 1);
      return;
    }
    g.fillStyle = C.plantDark; g.fillRect(x + 2, y - 1, 5, 7); g.fillRect(x + 8, y - 3, 6, 9); g.fillRect(x + 5, y + 2, 5, 6);
    g.fillStyle = C.plant; g.fillRect(x + 3, y, 3, 5); g.fillRect(x + 9, y - 2, 3, 7); g.fillRect(x + 6, y + 3, 3, 4);
    g.fillStyle = C.plantLight; g.fillRect(x + 4, y + 1, 1, 2); g.fillRect(x + 10, y - 1, 1, 2);
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
  // Three spots at each counter, and three behind for when it's busy. A spot belongs to one sprite
  // until it walks away, so two never share a terminal.
  const SEARCH = { at: [9, 1], slots: [[9, 2], [10, 2], [11, 2], [9, 3], [10, 3], [11, 3]] };
  const LIBRARY = { at: [14, 1], slots: [[14, 2], [15, 2], [16, 2], [14, 3], [15, 3], [16, 3]] };
  const slotOwners = { search: Array(6).fill(null), library: Array(6).fill(null) };
  function claimSlot(station, key) {
    const owners = slotOwners[station];
    let i = owners.indexOf(key);
    if (i < 0) { i = owners.indexOf(null); if (i < 0) i = owners.length - 1; owners[i] = key; }
    return i;
  }
  function releaseSlots(key) { for (const owners of Object.values(slotOwners)) for (let i = 0; i < owners.length; i++) if (owners[i] === key) owners[i] = null; }
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
    for (const d of Object.values(DESK)) {
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
  let sparkles = [];         // a little glint where a paper just landed
  let lastNow = 0;

  function charFor(key) {
    let c = chars.get(key);
    if (!c) {
      const d = DESK[key];
      c = { key, role: d.role, x: d.home[0], y: d.home[1], path: [], facing: 'down', at: 'home', want: 'home', trips: [], trip: null, carry: null, slot: 0, active: null, seed: chars.size + 1, arrivedAt: 0 };
      chars.set(key, c);
    }
    return c;
  }
  function placeTile(c, place) {
    if (place === 'search') return SEARCH.slots[c.slot];
    if (place === 'library') return LIBRARY.slots[c.slot];
    return DESK[c.key].home;
  }
  // Agents narrate between searches, so the latest entry alone would send them home and back every
  // few seconds. A station stays wanted while any of the last three entries is a search or a page read.
  function wantedPlace(agent) {
    if (!agent || agent.status !== 'running') return 'home';
    const tail = agent.trace.slice(-3).reverse();
    for (const e of tail) { if (e.kind === 'search') return 'search'; if (e.kind === 'fetch') return 'library'; }
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
  function reset() { chars.clear(); flights = []; sparkles = []; for (const owners of Object.values(slotOwners)) owners.fill(null); }

  function inflightTo(targetKey) { let n = 0; for (const c of chars.values()) if (c.trip && c.trip.phase === 'go' && c.trip.targetKey === targetKey) n++; return n; }
  function pileCount(key) {
    const s = stateRef;
    const done = (id) => s.agents.get(id)?.status === 'completed';
    if (key === 'assembly') { let n = 0; for (const id of s.order) { const a = s.agents.get(id); if ((a.stage === 'research' || a.stage === 'followup') && a.status === 'completed') n++; } return Math.max(0, n - inflightTo('assembly')); }
    if (key.startsWith('followup')) return s.agents.get(key) ? Math.max(0, (done('assembly') ? 1 : 0) - inflightTo(key)) : 0;
    if (key === 'factcheck') return Math.max(0, (done('assembly-2') ? 1 : 0) - inflightTo('factcheck'));
    return 0;
  }

  /* ---------- render ---------- */
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d');
  let canvas = null, ctx = null, visible = false, raf = 0;

  function drawRoom(now) {
    g.fillStyle = '#14202E'; g.fillRect(0, 0, W, H);
    // oak planks: one plank per row, seams staggered every other row
    for (let y = 1; y < ROWS; y++) {
      g.fillStyle = y % 2 ? C.floorA : C.floorB; g.fillRect(0, y * T, W, T);
      g.fillStyle = C.seam; g.fillRect(0, y * T, W, 1);
      for (let x = (y % 2) * T; x < W; x += T * 2) g.fillRect(x + (y % 3) * 5, y * T, 1, T);
    }
    // rug under the meeting table, with a border and a simple diamond pattern
    g.fillStyle = C.rugEdge; g.fillRect(11 * T, 4 * T + 8, 6 * T, 5 * T);
    g.fillStyle = C.rug; g.fillRect(11 * T + 2, 4 * T + 10, 6 * T - 4, 5 * T - 4);
    g.fillStyle = C.rugDark; for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) g.fillRect(11 * T + 8 + i * 15, 4 * T + 16 + j * 15, 3, 3);
    g.fillStyle = C.rugAccent; g.fillRect(11 * T + 6, 4 * T + 14, 6 * T - 12, 1); g.fillRect(11 * T + 6, 9 * T + 1, 6 * T - 12, 1); g.fillRect(11 * T + 6, 4 * T + 14, 1, 5 * T - 12); g.fillRect(17 * T - 7, 4 * T + 14, 1, 5 * T - 12);
    // back wall: cream, a shadow band where it meets the floor, a baseboard
    g.fillStyle = C.wall; g.fillRect(0, 0, W, T + 4);
    g.fillStyle = C.wallTop; g.fillRect(0, 0, W, 3);
    g.fillStyle = C.wallShade; g.fillRect(0, T - 2, W, 6);
    g.fillStyle = C.baseboard; g.fillRect(0, T + 2, W, 2); g.fillStyle = C.wallLine; g.fillRect(0, T + 4, W, 1);
    // windows with sky and a slow cloud
    const drift = Math.floor(now / 400) % 40;
    for (const wx of [4, 6, 22, 24]) {
      g.fillStyle = C.windowFrame; g.fillRect(wx * T + 1, 3, 14, 13);
      g.fillStyle = C.sky; g.fillRect(wx * T + 2, 4, 12, 11); g.fillStyle = C.skyLight; g.fillRect(wx * T + 2, 12, 12, 3);
      g.fillStyle = C.cloud; const cx = wx * T + 2 + ((drift + wx * 3) % 16) - 4; g.fillRect(Math.max(wx * T + 2, cx), 7, Math.min(5, wx * T + 14 - Math.max(wx * T + 2, cx)), 2);
      g.fillStyle = C.windowFrame; g.fillRect(wx * T + 8, 4, 1, 11); g.fillRect(wx * T + 2, 9, 12, 1);
    }
    // pictures and a clock on the wall
    g.fillStyle = C.windowFrame; g.fillRect(12 * T + 4, 4, 9, 8); g.fillStyle = C.rugAccent; g.fillRect(12 * T + 5, 5, 7, 6); g.fillStyle = C.rug; g.fillRect(12 * T + 6, 8, 5, 3);
    g.fillStyle = C.windowFrame; g.fillRect(13 * T + 2, 5, 7, 7); g.fillStyle = C.book2; g.fillRect(13 * T + 3, 6, 5, 5); g.fillStyle = C.cloud; g.fillRect(13 * T + 5, 7, 1, 1);
    g.fillStyle = C.outline; g.fillRect(20 * T + 3, 4, 8, 8); g.fillStyle = C.cloud; g.fillRect(20 * T + 4, 5, 6, 6); g.fillStyle = C.outline; g.fillRect(20 * T + 6, 6, 1, 3); g.fillRect(20 * T + 7, 8, 2, 1);
    // side walls, door
    g.fillStyle = C.wall; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
    g.fillStyle = C.wallShade; g.fillRect(5, T + 4, 1, H); g.fillRect(W - 6, T + 4, 1, H);
    g.fillStyle = C.wallLine; g.fillRect(6, T + 4, 1, H); g.fillRect(W - 7, T + 4, 1, H);
    g.fillStyle = C.woodDark; g.fillRect(0, 10 * T, 6, 24); g.fillStyle = C.wood; g.fillRect(1, 10 * T + 1, 4, 22); g.fillStyle = C.envelope; g.fillRect(4, 10 * T + 11, 1, 2);
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
    for (const [key, d] of Object.entries(DESK)) {
      // Follow-up desks are always staffed; with no agent yet, the sprite sleeps at its desk.
      const agent = s.agents.get(key) || (key.startsWith('followup') ? { status: 'asleep', label: `Follow-up ${key.slice(-1)}`, trace: [] } : null);
      if (!agent) { chars.delete(key); continue; }
      const agent2 = key === 'assembly' ? s.agents.get('assembly-2') : null;
      const active = agent2 && agent2.status !== 'queued' ? agent2 : agent;
      const c = charFor(key);
      c.active = active;
      if (c.trip) {
        if (!step(c, dt)) {
          if (c.trip.phase === 'go') { sparkles.push({ x: c.x * T + 8, y: c.y * T - 6, start: now }); c.trip.phase = 'back'; c.carry = null; setPath(c, blocked, d.home); }
          else { c.trip = null; c.at = 'home'; c.want = 'home'; c.facing = 'down'; }
        }
        continue;
      }
      let want = c.trips.length ? 'home' : wantedPlace(active);
      // Hysteresis: stay put for a moment after arriving, unless a hand-off is waiting or the agent is done.
      if (want !== c.at && c.at !== 'moving' && !c.trips.length && active.status === 'running' && now - c.arrivedAt < DWELL_MS) want = c.at;
      if (want === 'search' || want === 'library') c.slot = claimSlot(want, key); else releaseSlots(key);
      if (c.trips.length && atTile(c, d.home) && !c.path.length) {
        c.trip = { ...c.trips.shift(), phase: 'go' };
        c.carry = c.trip.paperKind;
        setPath(c, blocked, dropTileFor(c.trip.targetKey) || d.home);
        continue;
      }
      const target = placeTile(c, want);
      if (want !== c.want || (!c.path.length && !atTile(c, target))) { c.want = want; setPath(c, blocked, target); }
      if (step(c, dt)) { c.at = 'moving'; continue; }
      if (c.at !== want) c.arrivedAt = now;
      c.at = want;
      c.facing = want === 'search' ? 'up' : 'down';
    }

    drawRoom(now);
    const items = [];
    const push = (depthY, draw) => items.push({ depthY, draw });

    PLANTS.forEach((p, i) => push(p[1] + 0.9, () => drawPlant(g, p[0], p[1], i % 2 ? 'small' : 'tall')));
    push(COFFEE[1] + 0.9, () => drawCoffeeMachine(g, COFFEE[0], COFFEE[1]));
    push(COUCH[1] + 0.9, () => drawCouch(g, COUCH[0], COUCH[1], now));
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
      const c = chars.get(key);
      const agent = s.agents.get(key) || c?.active;
      if (!agent) continue;
      const active = c?.active || agent;
      const on = active.status === 'running' && !!c && c.at === 'home';
      if (d.table) push(d.table[1] + 1.9, () => drawTable(g, d.table[0], d.table[1], pileCount('assembly')));
      else push(d.desk[1] + 0.9, () => drawDesk(g, d.desk[0], d.desk[1], { on, laneColor: shade(LANE[d.role], 0.9), papers: pileCount(key), paperKind: key.startsWith('followup') ? 'question' : 'paper', mug: active.status === 'queued' || active.status === 'asleep', magnifier: key === 'factcheck' }));
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
        const asleep = !moving && (a.status === 'queued' || a.status === 'asleep');
        if (asleep) rows = SLEEP;
        const bob = asleep ? Math.round(Math.sin(now / 1100 + c.x)) : !moving && a.status !== 'running' ? Math.round(Math.sin(now / 700 + c.x) * 0.5) : 0;
        g.fillStyle = C.shadow; g.fillRect(x + 2, y + 17, 8, 2); g.fillRect(x + 3, y + 19, 6, 1);
        if (view === 'front' && !moving && !asleep && blinking(now, c.seed)) rows = blinkRow(rows);
        drawCharacter(g, c.role, x, y + bob, rows, view, flip);
        if (asleep) drawZs(g, x + 13, y - 2, now + c.seed * 300);
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
    for (const sp of sparkles) {
      const t = (now - sp.start) / 550, r = 3 + t * 6;
      push(99, () => { g.fillStyle = t < 0.5 ? C.envelope : C.cloud; for (const [ax, ay] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) g.fillRect(Math.round(sp.x + ax), Math.round(sp.y + ay), 1, 1); });
    }
    sparkles = sparkles.filter((sp) => now - sp.start < 550);

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
      ctx.fillStyle = 'rgba(20,32,46,.86)'; ctx.beginPath(); ctx.roundRect(lx - wPx / 2, ly - dpr, wPx, hPx, 4 * dpr); ctx.fill();
      ctx.fillStyle = a.status === 'running' ? LANE[c.role] : a.status === 'failed' ? C.bad : a.status === 'completed' ? '#B8C4D0' : '#6F8194';
      ctx.fillText(a.label, lx, ly);
    }
    ctx.font = `600 ${Math.round(10.5 * dpr)}px "Bricolage Grotesque", system-ui, sans-serif`;
    const tag = (tx, ty, text, onWall) => { ctx.fillStyle = onWall ? '#8a7454' : 'rgba(255,255,255,.75)'; ctx.fillText(text, dx + tx * T * scale, dy + ty * T * scale); };
    // Station names go on the wall above them; the floor in front is where people stand.
    tag(10.5, 0.1, 'Search', true); tag(15.5, 0.1, 'Library', true); tag(14, 8.2, 'Assembly table'); tag(26, 10.15, 'Report'); tag(1.5, 6.05, 'Brief');
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
