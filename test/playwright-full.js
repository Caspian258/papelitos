'use strict';
/* ============================================================
   Test de integración completo con Playwright.
   Arranca su propio servidor en el puerto 3001 y lo cierra al terminar
   — nunca deja procesos colgados.
   ============================================================ */
const path   = require('path');
const { spawn }   = require('child_process');
const { chromium } = require('playwright');

const PORT   = 3001;
const BASE   = `http://localhost:${PORT}`;
const SEP    = '─'.repeat(52);

/* Duración de turno corta para que el test no espere 60 s en caso
   de error, pero suficiente para los ~4 s que dura el sub-test de
   visibilitychange dentro de un turno activo. */
const TURN_MS = 15000;

function log(msg) { console.log('  ' + msg); }

function assert(cond, msg) {
  if (!cond) throw new Error('FALLO: ' + msg);
}

/* ── Arrancar el servidor ──────────────────────────────────── */
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = spawn('node', [path.join(__dirname, '../server/index.js')], {
      env: { ...process.env, PORT: String(PORT), TURN_DURATION_MS: String(TURN_MS) },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const t = setTimeout(
      () => { srv.kill(); reject(new Error('Timeout arrancando el servidor')); },
      8000
    );
    srv.stdout.on('data', (d) => {
      if (d.toString().includes('Servidor corriendo')) {
        clearTimeout(t);
        resolve(srv);
      }
    });
    srv.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

/* ── Helpers de navegación ─────────────────────────────────── */
async function crearSala(page, nombre) {
  await page.goto(BASE);
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.fill('#input-name', nombre);
  await page.click('button[onclick="emitCreateRoom()"]');
  await page.waitForSelector('#screen-team-select:not([hidden])', { timeout: 6000 });
  await page.waitForTimeout(300);
  return page.evaluate(() => appState.roomCode);
}

async function unirseASala(page, nombre, codigo) {
  await page.goto(BASE);
  await page.waitForSelector('#screen-home:not([hidden])');
  await page.fill('#input-name', nombre);
  await page.fill('#input-code', codigo);
  await page.click('button[onclick="emitJoinRoom()"]');
  await page.waitForSelector('#screen-team-select:not([hidden])', { timeout: 6000 });
}

async function elegirEquipoYRegistrar(page, teamIdx, personajes) {
  await page.click(teamIdx === 0 ? '#team-card-a' : '#team-card-b');
  await page.waitForTimeout(400);
  await page.click('#btn-team-continue');
  await page.waitForSelector('#screen-register:not([hidden])', { timeout: 4000 });
  for (const n of personajes) {
    await page.fill('#input-character', n);
    await page.press('#input-character', 'Enter');
    await page.waitForTimeout(400);
  }
}

async function irAlLobby(page) {
  await page.click('#btn-listo');
  await page.waitForSelector('#screen-lobby:not([hidden])', { timeout: 4000 });
}

/* Espera hasta que currentCard cambie O la pantalla deje de ser 'turn' */
async function marcarCarta(descPage) {
  const oldCard = await descPage.evaluate(() => appState.currentCard);
  await descPage.evaluate(() => emitMarkGuessed());
  await descPage.waitForFunction(
    (old) => currentScreen !== 'turn' || (appState.currentCard !== null && appState.currentCard !== old),
    oldCard,
    { timeout: 6000 }
  );
  return descPage.evaluate(() => currentScreen);
}

/* Corre el turno entero marcando todas las cartas */
async function correrTurnoCompleto(descPage, labelTurno) {
  await descPage.waitForSelector('#screen-turn:not([hidden])', { timeout: 6000 });
  let iters = 0;
  while (iters++ < 20) {
    const [screen, card] = await descPage.evaluate(() => [currentScreen, appState.currentCard]);
    if (screen !== 'turn') return screen;
    if (!card) { await descPage.waitForTimeout(200); continue; }
    log(`  ${labelTurno}: marca "${card}"`);
    const next = await marcarCarta(descPage);
    if (next !== 'turn') return next;
  }
  throw new Error('correrTurnoCompleto: límite de iteraciones alcanzado');
}

/* ══════════════════════════════════════════════════════════════
   TEST 1 — Partida completa 3 rondas (2 jugadores, 2 chars c/u)
           Incluye sub-test de visibilitychange en ronda 1.
   ══════════════════════════════════════════════════════════════ */
async function testJuegoCompleto(browser) {
  console.log('\n' + SEP);
  console.log('  TEST 1 — Partida completa (3 rondas) + visibilitychange');
  console.log(SEP);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  // ── Setup ──────────────────────────────────────────────────
  const code = await crearSala(p1, 'Ana');
  log(`Sala creada: ${code}`);

  await elegirEquipoYRegistrar(p1, 0, ['Mario', 'Zelda', 'Link', 'Peach', 'Yoshi']);
  log('P1 (Ana): equipo 0, 5 personajes');

  await unirseASala(p2, 'Bob', code);
  await elegirEquipoYRegistrar(p2, 1, ['Samus', 'Kirby', 'Fox', 'Pikachu', 'Bowser']);
  log('P2 (Bob): equipo 1, 5 personajes');

  await irAlLobby(p1);
  await irAlLobby(p2);
  await p1.waitForTimeout(300);
  log('Ambos en lobby');

  // ── Iniciar partida ─────────────────────────────────────────
  await p1.click('#lobby-start-btn');
  await Promise.all([
    p1.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
    p2.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
  ]);
  assert(await p1.textContent('#rt-round-label') === 'Ronda 1', 'Label debe ser "Ronda 1"');
  log('✓ Ambos en round-transition — Ronda 1');

  // Ana (equipo 0) debe ser la primera en describir
  const anaId  = await p1.evaluate(() => appState.myId);
  const descId1 = await p1.evaluate(() => appState.currentDescriberId);
  assert(descId1 === anaId, 'Ana debe ser la primera describer');
  log('✓ Ana es describer (ronda 1)');

  // ── RONDA 1 ── Ana describe ────────────────────────────────
  await p1.click('#rt-btn');
  await Promise.all([
    p1.waitForSelector('#screen-turn:not([hidden])',      { timeout: 5000 }),
    p2.waitForSelector('#screen-spectator:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ P1 → screen-turn | P2 → screen-spectator');

  // ── Sub-test: visibilitychange ─────────────────────────────
  log('  → Sub-test visibilitychange:');
  await p1.waitForTimeout(1500);  // dejar que el timer baje ~1 s

  const timerAntes = parseInt(await p1.textContent('#turn-timer'));

  await p1.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  log(`    dispatch 'hidden' (timer=${timerAntes}s)`);

  await p1.waitForTimeout(2100);  // simular 2 s en segundo plano

  await p1.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  log(`    dispatch 'visible'`);

  await p1.waitForTimeout(500);   // un par de ticks del setInterval

  const timerDespues = parseInt(await p1.textContent('#turn-timer'));
  const bajada = timerAntes - timerDespues;
  log(`    Timer antes: ${timerAntes}s → después: ${timerDespues}s (bajada: ${bajada}s)`);

  /* Pasaron ≥ 3.5 s en total → el timer debe reflejar eso */
  assert(bajada >= 3, `Timer debe haber bajado ≥3 s, bajó: ${bajada}s`);
  log('  ✓ Timer recalcula correctamente desde el timestamp del servidor');
  // ───────────────────────────────────────────────────────────

  // Correr turno completo (Ana marca Mario, Zelda, Link, Peach — las 4 cartas)
  const fin1 = await correrTurnoCompleto(p1, 'Ronda 1 · Ana');
  await p2.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 });
  assert(fin1 === 'round-transition', `P1 debe estar en round-transition, estaba en: ${fin1}`);
  assert(await p1.textContent('#rt-round-label') === 'Ronda 2', 'Debe avanzar a Ronda 2');
  const s1 = await p1.evaluate(() => appState.scores);
  assert(s1[0] === 10, `Equipo 0 debe tener 10 pts tras ronda 1, tiene: ${s1[0]}`);
  log(`✓ Ronda 1 terminada — Equipo 0: ${s1[0]} | Equipo 1: ${s1[1]}`);

  // ── RONDA 2 ── Bob describe (equipo 1 arranca tras el flip) ─
  const bobId   = await p2.evaluate(() => appState.myId);
  const descId2 = await p2.evaluate(() => appState.currentDescriberId);
  assert(descId2 === bobId, 'Bob debe ser el describer en Ronda 2');
  log('✓ Bob es describer (ronda 2)');

  await p2.click('#rt-btn');
  await Promise.all([
    p2.waitForSelector('#screen-turn:not([hidden])',      { timeout: 5000 }),
    p1.waitForSelector('#screen-spectator:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ P2 → screen-turn | P1 → screen-spectator');

  const fin2 = await correrTurnoCompleto(p2, 'Ronda 2 · Bob');
  await p1.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 });
  assert(fin2 === 'round-transition', `P2 debe estar en round-transition, estaba en: ${fin2}`);
  assert(await p2.textContent('#rt-round-label') === 'Ronda 3', 'Debe avanzar a Ronda 3');
  const s2 = await p1.evaluate(() => appState.scores);
  assert(s2[1] === 10, `Equipo 1 debe tener 10 pts tras ronda 2, tiene: ${s2[1]}`);
  log(`✓ Ronda 2 terminada — Equipo 0: ${s2[0]} | Equipo 1: ${s2[1]}`);

  // ── RONDA 3 ── Ana describe (equipo 0 de nuevo tras el flip) ─
  const descId3 = await p1.evaluate(() => appState.currentDescriberId);
  assert(descId3 === anaId, 'Ana debe ser describer en Ronda 3');
  log('✓ Ana es describer (ronda 3)');

  await p1.click('#rt-btn');
  await Promise.all([
    p1.waitForSelector('#screen-turn:not([hidden])',      { timeout: 5000 }),
    p2.waitForSelector('#screen-spectator:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ P1 → screen-turn | P2 → screen-spectator');

  const fin3 = await correrTurnoCompleto(p1, 'Ronda 3 · Ana');
  await Promise.all([
    p1.waitForSelector('#screen-winner:not([hidden])', { timeout: 5000 }),
    p2.waitForSelector('#screen-winner:not([hidden])', { timeout: 5000 }),
  ]);
  assert(fin3 === 'winner', `P1 debe estar en screen-winner, estaba en: ${fin3}`);
  log('✓ Ambos en screen-winner');

  const winner = await p1.evaluate(() => appState.winner);
  const fs     = await p1.evaluate(() => appState.finalScores);
  /* 5 chars × 2 jugadores = 10 cartas por ronda.
     Equipo 0 gana rondas 1 y 3 → 10+10 = 20 pts.
     Equipo 1 gana ronda 2 → 10 pts. */
  assert(winner === 0, `Ganador debe ser equipo 0, fue: ${winner}`);
  assert(fs[0] === 20, `Equipo 0 debe tener 20 pts, tiene: ${fs[0]}`);
  assert(fs[1] === 10, `Equipo 1 debe tener 10 pts, tiene: ${fs[1]}`);
  const badge = await p1.textContent('#winner-badge');
  assert(badge === '¡Equipo A!', `Badge debe decir "¡Equipo A!", dijo: ${badge}`);
  log(`✓ Ganador: ${badge} con ${fs[0]} pts (Equipo B: ${fs[1]})`);

  await ctx1.close();
  await ctx2.close();
  log('✓ TEST 1 PASÓ\n');
}

/* ══════════════════════════════════════════════════════════════
   TEST 2 — Espectador se desconecta a mitad de turno
   El describer debe poder seguir marcando cartas sin error.
   ══════════════════════════════════════════════════════════════ */
async function testDesconexionEspectador(browser) {
  console.log(SEP);
  console.log('  TEST 2 — Desconexión del espectador a mitad de turno');
  console.log(SEP);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  /* 5 chars por jugador para que el CHAR_LIMIT local se active y el
     botón "Listo" funcione. El mazo tendrá 10 cartas — el turno
     no termina por marcar solo 2. */
  const code = await crearSala(p1, 'Lara');
  log(`Sala creada: ${code}`);

  await elegirEquipoYRegistrar(p1, 0, ['A1', 'A2', 'A3', 'A4', 'A5']);
  await unirseASala(p2, 'Dani', code);
  await elegirEquipoYRegistrar(p2, 1, ['B1', 'B2', 'B3', 'B4', 'B5']);
  await irAlLobby(p1);
  await irAlLobby(p2);
  await p1.waitForTimeout(300);

  await p1.click('#lobby-start-btn');
  await Promise.all([
    p1.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
    p2.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ Ambos en round-transition');

  // Lara (equipo 0) describe primero
  await p1.click('#rt-btn');
  await Promise.all([
    p1.waitForSelector('#screen-turn:not([hidden])',      { timeout: 5000 }),
    p2.waitForSelector('#screen-spectator:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ P1 describe | P2 es espectador');

  // Marca una carta antes de la desconexión
  const carta1 = await p1.evaluate(() => appState.currentCard);
  const screen1 = await marcarCarta(p1);
  assert(screen1 === 'turn', 'P1 debe seguir en screen-turn tras la primera marca');
  log(`✓ Primera carta marcada ("${carta1}") — turno sigue activo`);

  // ── Desconectar el espectador ──────────────────────────────
  log('  → Cerrando contexto del espectador (P2)...');
  await ctx2.close();          // cierra la pestaña y el WebSocket
  await p1.waitForTimeout(600); // dejar que player_left llegue al servidor

  /* Verificar que P1 recibió el evento (player_left actualiza appState).
     El jugador desconectado sigue en el array con connected:false (para reconexión),
     así que contamos solo los conectados. */
  const jugadores = await p1.evaluate(() =>
    (appState.players || []).filter(function(p) { return p.connected; }).length
  );
  assert(jugadores === 1, `Solo debe quedar 1 jugador conectado, hay: ${jugadores}`);
  log(`✓ player_left recibido — jugadores restantes: ${jugadores}`);

  // P1 sigue en screen-turn y puede marcar otra carta
  const screenActual = await p1.evaluate(() => currentScreen);
  assert(screenActual === 'turn', `P1 debe seguir en screen-turn, está en: ${screenActual}`);

  const carta2 = await p1.evaluate(() => appState.currentCard);
  let errorEnMarca = null;
  try {
    const screen2 = await marcarCarta(p1);
    assert(screen2 === 'turn', `P1 debe seguir en screen-turn tras la segunda marca, estaba en: ${screen2}`);
    log(`✓ Segunda carta marcada ("${carta2}") tras desconexión del espectador — OK`);
  } catch (e) {
    errorEnMarca = e;
  }
  assert(!errorEnMarca, `Marcar tras desconexión del espectador no debe fallar: ${errorEnMarca}`);

  const fase = await p1.evaluate(() => appState.phase);
  assert(fase === 'playing', `El juego debe seguir en fase "playing", está en: ${fase}`);
  log(`✓ Fase del juego: "${fase}" — no se bloqueó`);

  await ctx1.close();
  log('✓ TEST 2 PASÓ\n');
}

/* ══════════════════════════════════════════════════════════════
   TEST 3 — Flujo "Crear sala nueva":
     · Validación de nombre vacío con error visible
     · Nombre real llega a team-select (sin demo hardcodeados)
     · Reconexión exitosa del host creado vía create_room
   ══════════════════════════════════════════════════════════════ */
async function testCrearSalaYReconexion(browser) {
  console.log(SEP);
  console.log('  TEST 3 — Crear sala + validación nombre + reconexión host');
  console.log(SEP);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1   = await ctx1.newPage();
  const p2   = await ctx2.newPage();

  await p1.goto(BASE);
  await p1.waitForSelector('#screen-home:not([hidden])');

  // ── 1. Nombre vacío → error visible ───────────────────────
  await p1.click('button[onclick="emitCreateRoom()"]');
  await p1.waitForTimeout(150);

  const errorVisible = await p1.evaluate(() =>
    document.getElementById('name-error').classList.contains('visible')
  );
  assert(errorVisible, 'El mensaje #name-error debe ser visible al crear sin nombre');

  const inputRojo = await p1.evaluate(() =>
    document.getElementById('input-name').classList.contains('text-input--error')
  );
  assert(inputRojo, 'El input debe tener la clase text-input--error');
  log('✓ Nombre vacío → error visible al intentar "Crear sala nueva"');

  // ── 2. Escribir nombre → error desaparece ─────────────────
  await p1.fill('#input-name', 'Anfitrión');
  await p1.waitForTimeout(100);
  const errorGone = await p1.evaluate(() =>
    !document.getElementById('name-error').classList.contains('visible')
  );
  assert(errorGone, 'El error debe desaparecer al escribir el nombre');
  log('✓ Al tipear nombre, el error desaparece');

  // ── 3. Crear sala con nombre real ──────────────────────────
  await p1.click('button[onclick="emitCreateRoom()"]');
  await p1.waitForSelector('#screen-team-select:not([hidden])', { timeout: 6000 });
  await p1.waitForTimeout(400);

  const code = await p1.evaluate(() => appState.roomCode);
  assert(code && code.length > 0, 'Debe haber un código de sala válido');
  log(`✓ Sala creada: ${code}`);

  // ── 4. team-select no tiene nombres de demo ────────────────
  const hayDemo = await p1.evaluate(() => {
    const html = document.getElementById('screen-team-select').innerHTML;
    return ['Marcos', 'Laura', 'Carlos'].some(n => html.includes(n));
  });
  assert(!hayDemo, 'No deben aparecer nombres de demo en team-select');
  log('✓ team-select sin nombres de demo');

  // ── 5. Segundo jugador entra; verifica nombre real en team-select ──
  await unirseASala(p2, 'Participante', code);
  await p2.waitForTimeout(300);

  // Anfitrión elige equipo A
  await p1.click('#team-card-a');
  await p1.waitForTimeout(600); // broadcast llega a p2

  const anfitrionEnP2 = await p2.evaluate(() =>
    document.getElementById('screen-team-select').innerHTML.includes('Anfitrión')
  );
  assert(anfitrionEnP2, '"Anfitrión" debe aparecer en team-select del segundo jugador');
  log('✓ Nombre "Anfitrión" visible en team-select del otro jugador');

  // ── 6. Completar setup → lobby → iniciar partida ──────────
  await p1.click('#btn-team-continue');
  await p1.waitForSelector('#screen-register:not([hidden])', { timeout: 4000 });
  for (const c of ['P1', 'P2', 'P3', 'P4', 'P5']) {
    await p1.fill('#input-character', c);
    await p1.press('#input-character', 'Enter');
    await p1.waitForTimeout(350);
  }
  await irAlLobby(p1);

  await p2.click('#team-card-b');
  await p2.waitForTimeout(300);
  await p2.click('#btn-team-continue');
  await p2.waitForSelector('#screen-register:not([hidden])', { timeout: 4000 });
  for (const c of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) {
    await p2.fill('#input-character', c);
    await p2.press('#input-character', 'Enter');
    await p2.waitForTimeout(350);
  }
  await irAlLobby(p2);
  await p1.waitForTimeout(400);

  await p1.click('#lobby-start-btn');
  await Promise.all([
    p1.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
    p2.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
  ]);
  log('✓ Partida iniciada — ambos en round-transition');

  // ── 7. Host (Anfitrión) se desconecta ─────────────────────
  await ctx1.close();
  await p2.waitForTimeout(800);

  const nuevoHostId = await p2.evaluate(() => appState.hostId);
  const p2Id        = await p2.evaluate(() => appState.myId);
  assert(nuevoHostId === p2Id, 'El host debe haber pasado a Participante');
  log('✓ Host transferido a Participante tras desconexión');

  // ── 8. Reconexión del host original ───────────────────────
  const ctx1b = await browser.newContext();
  const p1b   = await ctx1b.newPage();

  await p1b.goto(BASE);
  await p1b.waitForSelector('#screen-home:not([hidden])');
  await p1b.fill('#input-name', 'Anfitrión');
  await p1b.fill('#input-code', code);
  await p1b.click('button[onclick="emitJoinRoom()"]');

  /* Juego en playing + turnActive=false → round-transition */
  await p1b.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 6000 });
  await p1b.waitForTimeout(400);

  const reconPhase = await p1b.evaluate(() => appState.phase);
  const reconTeam  = await p1b.evaluate(() => appState.myTeam);
  const esHost     = await p1b.evaluate(() => appState.isHost);

  assert(reconPhase === 'playing',   `Fase debe ser playing, es: ${reconPhase}`);
  assert(reconTeam  === 0,           `Equipo debe ser 0 (A), es: ${reconTeam}`);
  assert(!esHost,                    'Host original reconectado NO debe recuperar rol de host');
  log('✓ Host reconectado: fase correcta, equipo correcto, sin rol de host');

  /* P2 debe ver a Anfitrión de vuelta */
  await p2.waitForTimeout(600);
  const jugadoresP2 = await p2.evaluate(() =>
    (appState.players || []).filter(p => p.connected).map(p => p.name)
  );
  assert(jugadoresP2.includes('Anfitrión'),
    `"Anfitrión" debe volver a aparecer como conectado: ${JSON.stringify(jugadoresP2)}`);
  log(`✓ P2 ve a Anfitrión reconectado. Conectados: ${JSON.stringify(jugadoresP2)}`);

  await ctx1b.close();
  await ctx2.close();
  log('✓ TEST 3 PASÓ\n');
}

/* ══════════════════════════════════════════════════════════════
   TEST 4 — Registro de más personajes que el mínimo:
     · Botón "Listo" se habilita exactamente en el 5to
     · Sigue habilitado y el input sigue visible en el 6to, 7mo, 8vo
     · El mazo al iniciar tiene los 8+5=13 personajes (no solo los 5 del mínimo)
   ══════════════════════════════════════════════════════════════ */
async function testMasDelMinimo(browser) {
  console.log(SEP);
  console.log('  TEST 4 — Registro por encima del mínimo de personajes');
  console.log(SEP);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1   = await ctx1.newPage();
  const p2   = await ctx2.newPage();

  const code = await crearSala(p1, 'Extra');
  await unirseASala(p2, 'Normal', code);

  // P1 elige equipo A y llega a registro
  await p1.click('#team-card-a');
  await p1.waitForTimeout(300);
  await p1.click('#btn-team-continue');
  await p1.waitForSelector('#screen-register:not([hidden])', { timeout: 4000 });

  // ── Personajes 1-4: botón debe seguir dimmed ───────────────
  for (const c of ['E1', 'E2', 'E3', 'E4']) {
    await p1.fill('#input-character', c);
    await p1.press('#input-character', 'Enter');
    await p1.waitForTimeout(350);
  }
  const dimmedEn4 = await p1.evaluate(() =>
    document.getElementById('btn-listo').classList.contains('btn--dimmed')
  );
  assert(dimmedEn4, 'Con 4 personajes el botón Listo debe seguir dimmed');
  log('✓ Con 4 personajes: botón Listo todavía dimmed');

  // ── Personaje 5 (mínimo): botón debe activarse ─────────────
  await p1.fill('#input-character', 'E5');
  await p1.press('#input-character', 'Enter');
  await p1.waitForTimeout(350);

  const dimmedEn5 = await p1.evaluate(() =>
    document.getElementById('btn-listo').classList.contains('btn--dimmed')
  );
  assert(!dimmedEn5, 'Con 5 personajes el botón Listo debe estar habilitado');
  log('✓ Con 5 personajes (mínimo): botón Listo habilitado');

  // Input debe seguir visible y activo
  const inputVisible = await p1.evaluate(() =>
    !document.getElementById('input-char-wrap').hidden
  );
  assert(inputVisible, 'El input debe seguir visible después del mínimo');
  log('✓ Input sigue visible y activo después del mínimo');

  // ── Personajes 6, 7, 8: botón debe seguir habilitado ───────
  for (const c of ['E6', 'E7', 'E8']) {
    await p1.fill('#input-character', c);
    await p1.press('#input-character', 'Enter');
    await p1.waitForTimeout(350);
  }

  const dimmedEn8 = await p1.evaluate(() =>
    document.getElementById('btn-listo').classList.contains('btn--dimmed')
  );
  assert(!dimmedEn8, 'Con 8 personajes el botón Listo debe seguir habilitado');

  const contadorEl = await p1.evaluate(() =>
    parseInt(document.getElementById('char-count').textContent, 10)
  );
  assert(contadorEl === 8, `El contador debe mostrar 8, muestra: ${contadorEl}`);

  const inputSigueVisible = await p1.evaluate(() =>
    !document.getElementById('input-char-wrap').hidden
  );
  assert(inputSigueVisible, 'El input debe seguir visible con 8 personajes');
  log('✓ Con 8 personajes: botón habilitado, contador en 8, input visible');

  // ── P1 va al lobby ──────────────────────────────────────────
  await irAlLobby(p1);

  // ── P2 completa el mínimo (5) ───────────────────────────────
  await p2.click('#team-card-b');
  await p2.waitForTimeout(300);
  await elegirEquipoYRegistrar(p2, 1, ['N1', 'N2', 'N3', 'N4', 'N5']);
  await irAlLobby(p2);
  await p1.waitForTimeout(400);

  // ── Iniciar partida ─────────────────────────────────────────
  await p1.click('#lobby-start-btn');
  await Promise.all([
    p1.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
    p2.waitForSelector('#screen-round-transition:not([hidden])', { timeout: 5000 }),
  ]);

  // ── Mazo debe tener 8+5=13 cartas ──────────────────────────
  const mazo = await p1.evaluate(() => appState.deckRemaining);
  assert(mazo === 13, `El mazo debe tener 13 cartas (8+5), tiene: ${mazo}`);
  log(`✓ Mazo inicial: ${mazo} cartas — los 8 de P1 más los 5 de P2`);

  await ctx1.close();
  await ctx2.close();
  log('✓ TEST 4 PASÓ\n');
}

/* ══════════════════════════════════════════════════════════════
   MAIN
   ══════════════════════════════════════════════════════════════ */
async function main() {
  let server  = null;
  let browser = null;
  let exitCode = 0;

  try {
    server  = await startServer();
    console.log(`\nServidor de test arrancado en ${BASE}`);
    browser = await chromium.launch({ headless: true });

    await testJuegoCompleto(browser);
    await testDesconexionEspectador(browser);
    await testCrearSalaYReconexion(browser);
    await testMasDelMinimo(browser);

    console.log(SEP);
    console.log('  ✓ TODOS LOS TESTS PASARON');
    console.log(SEP + '\n');

  } catch (e) {
    console.error('\n' + SEP);
    console.error('  ✗ ' + e.message);
    console.error(SEP + '\n');
    exitCode = 1;
  } finally {
    /* Limpieza garantizada — nunca deja procesos colgados */
    if (browser) await browser.close().catch(() => {});
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 600));
    }
    process.exit(exitCode);
  }
}

main();
