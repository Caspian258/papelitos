const Room = require('../server/game/Room');

function assert(condition, msg) {
  if (!condition) throw new Error('FALLO: ' + msg);
}

const TURN_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const SEP = '─'.repeat(50);

function log(event, data) {
  const relevant = {};
  if (data.card !== undefined)          relevant.carta    = data.card;
  if (data.team !== undefined)          relevant.equipo   = data.team;
  if (data.scores !== undefined)        relevant.puntos   = data.scores;
  if (data.deckRemaining !== undefined) relevant.mazo     = data.deckRemaining;
  if (data.describerId !== undefined)   relevant.describe = data.describerId;
  if (data.nextDescriberId !== undefined) relevant.describe = data.nextDescriberId;
  if (data.round !== undefined)         relevant.ronda    = data.round.label;
  if (data.winner !== undefined)        relevant.ganador  = data.winner;
  if (data.roundIndex !== undefined)    relevant.ronda_idx = data.roundIndex;
  console.log(`  ▸ ${event.padEnd(22)}`, JSON.stringify(relevant));
}

function testDescriberValidation() {
  console.log(SEP);
  console.log('  PRUEBAS DE VALIDACIÓN DE DESCRIBER');
  console.log(SEP);

  const r = new Room('TST6', { onEvent: () => {}, turnDuration: 5000 });
  r.addPlayer('p1', 'Uno');
  r.addPlayer('p2', 'Dos');
  r.joinTeam('p1', 0);
  r.joinTeam('p2', 1);
  ['Mario', 'Zelda'].forEach(c => r.submitCharacter('p1', c));
  ['Link',  'Peach'].forEach(c => r.submitCharacter('p2', c));
  r.startGame('p1');

  /* p1 es el primer describer (equipo 0) */
  assert(r.getCurrentDescriberId() === 'p1', 'El primer describer debe ser p1');

  /* No-describer intenta arrancar el turno → rechazado */
  const r1 = r.startTurn('p2');
  assert(r1.error, 'startTurn por no-describer debe fallar');
  assert(!r.turnActive, 'El turno no debe estar activo tras rechazo');
  console.log('  ✓ startTurn rechazado para no-describer:', r1.error);

  /* Describer arranca el turno → aceptado */
  const r2 = r.startTurn('p1');
  assert(!r2.error, 'startTurn por describer debe pasar');
  assert(r.turnActive, 'El turno debe estar activo');
  console.log('  ✓ startTurn aceptado para describer');

  /* No-describer intenta marcar adivinado → rechazado */
  const r3 = r.markGuessed('p2');
  assert(r3.error, 'markGuessed por no-describer debe fallar');
  assert(r.scores[0] === 0, 'El puntaje no debe cambiar tras rechazo');
  console.log('  ✓ markGuessed rechazado para no-describer:', r3.error);

  /* Describer marca adivinado → aceptado */
  const r4 = r.markGuessed('p1');
  assert(!r4.error, 'markGuessed por describer debe pasar');
  assert(r.scores[0] === 1, 'El puntaje del equipo 0 debe ser 1');
  console.log('  ✓ markGuessed aceptado para describer');

  /* No-describer intenta reportar penalización → rechazado */
  const r5 = r.reportPenalty('p2');
  assert(r5.error, 'reportPenalty por no-describer debe fallar');
  console.log('  ✓ reportPenalty rechazado para no-describer:', r5.error);

  /* Describer reporta penalización → aceptado */
  const r6 = r.reportPenalty('p1');
  assert(!r6.error, 'reportPenalty por describer debe pasar');
  assert(!r.turnActive, 'El turno debe haber terminado tras penalización');
  console.log('  ✓ reportPenalty aceptado para describer');

  console.log(SEP);
}

function testHost() {
  console.log(SEP);
  console.log('  PRUEBAS DE AUTORIZACIÓN DE HOST');
  console.log(SEP);

  const r = new Room('TST1', { onEvent: () => {} });

  // El primer jugador en unirse queda como host
  r.addPlayer('ana', 'Ana');
  r.addPlayer('bob', 'Bob');
  assert(r.isHost('ana'), 'Ana debería ser host por unirse primero');
  assert(!r.isHost('bob'), 'Bob no debería ser host');
  assert(r.getState().hostId === 'ana', 'getState() debe exponer hostId');
  console.log('  ✓ Host asignado al primer jugador');

  r.joinTeam('ana', 0);
  r.joinTeam('bob', 1);
  r.submitCharacter('ana', 'Mario');
  r.submitCharacter('bob', 'Zelda');

  // No-host intenta iniciar el juego → rechazado
  const r1 = r.startGame('bob');
  assert(r1.error, 'startGame por no-host debe fallar');
  assert(r.phase === 'lobby', 'La fase no debe cambiar tras rechazo');
  console.log('  ✓ startGame rechazado para no-host:', r1.error);

  // Host inicia el juego → aceptado
  const r2 = r.startGame('ana');
  assert(!r2.error, 'startGame por host debe pasar');
  assert(r.phase === 'playing', 'Fase debe cambiar a playing');
  console.log('  ✓ startGame aceptado para host');
  console.log(SEP);
}

function testHostTransfer() {
  console.log(SEP);
  console.log('  PRUEBAS DE TRASPASO DE HOST');
  console.log(SEP);

  // ── Caso 1: traspaso al siguiente más antiguo ──────────────────────────
  const hostChangedEvents = [];
  const r = new Room('TST3', {
    onEvent: (event, data) => {
      if (event === 'host_changed') hostChangedEvents.push(data);
    },
  });

  r.addPlayer('p1', 'Primera');
  r.addPlayer('p2', 'Segunda');
  r.addPlayer('p3', 'Tercera');

  assert(r.isHost('p1'), 'p1 debe ser host inicial');

  r.removePlayer('p1');

  assert(r.isHost('p2'),             'p2 debe ser el nuevo host');
  assert(!r.isHost('p1'),            'p1 ya no debe ser host');
  assert(r.getState().hostId === 'p2', 'getState().hostId debe ser p2');
  assert(hostChangedEvents.length === 1,    'debe emitirse exactamente un host_changed');
  assert(hostChangedEvents[0].hostId === 'p2', 'host_changed debe indicar p2');
  console.log('  ✓ host_changed emitido con hostId:', hostChangedEvents[0].hostId);
  console.log('  ✓ Traspaso de host al siguiente jugador más antiguo');

  // Si p2 también sale, el host pasa a p3
  r.removePlayer('p2');
  assert(r.isHost('p3'), 'p3 debe ser host tras salida de p2');
  console.log('  ✓ Segundo traspaso encadenado funciona correctamente');

  // ── Caso 2: sin jugadores restantes → hostId queda null ───────────────
  const r2 = new Room('TST4', { onEvent: () => {} });
  r2.addPlayer('solo', 'Solo');
  r2.removePlayer('solo');
  assert(r2.hostId === null, 'Sin jugadores, hostId debe quedar null');
  console.log('  ✓ Sin jugadores restantes, hostId queda null');

  // ── Caso 3: nuevo host puede iniciar la partida ───────────────────────
  const r3 = new Room('TST5', { onEvent: () => {} });
  r3.addPlayer('anfitrion', 'Anfitrión');
  r3.addPlayer('nuevo',     'Nuevo');
  r3.addPlayer('extra',     'Extra');

  r3.joinTeam('anfitrion', 0);
  r3.joinTeam('nuevo',     1);
  r3.joinTeam('extra',     0);

  r3.removePlayer('anfitrion');   // host original sale
  assert(r3.isHost('nuevo'), 'nuevo debe ser el host tras salida del anfitrión');

  r3.submitCharacter('nuevo', 'Personaje A');
  r3.submitCharacter('extra', 'Personaje B');
  const res = r3.startGame('nuevo');
  assert(!res.error, 'El nuevo host debe poder iniciar el juego sin error');
  assert(r3.phase === 'playing', 'La sala debe pasar a playing');
  console.log('  ✓ Nuevo host puede iniciar la partida correctamente');

  // ── Caso 4: host se va DESPUÉS de iniciar → solo informativo ──────────
  // Si el host sale una vez que el juego empezó, el traspaso ocurre
  // pero no bloquea ni habilita ninguna acción de juego.
  r3.removePlayer('nuevo');
  assert(r3.isHost('extra'), 'extra debe ser host tras salida de nuevo (en partida)');
  assert(r3.phase === 'playing', 'La fase de juego no se ve afectada por el traspaso');
  console.log('  ✓ Traspaso durante partida es solo informativo, no altera la fase');

  console.log(SEP);
}

function testReconexionDescriber() {
  console.log(SEP);
  console.log('  PRUEBA DE RECONEXIÓN — Describer se desconecta a mitad de turno');
  console.log(SEP);

  const r = new Room('TST_REC', {
    onEvent: () => {},
    turnDuration: 5000,
  });

  /* Equipo 0: Ana (s1) y Carlos (s2); Equipo 1: Bob (s3) */
  r.addPlayer('s1', 'Ana');
  r.addPlayer('s2', 'Carlos');
  r.addPlayer('s3', 'Bob');
  r.joinTeam('s1', 0);
  r.joinTeam('s2', 0);
  r.joinTeam('s3', 1);

  ['Carta A', 'Carta B'].forEach(c => r.submitCharacter('s1', c));
  ['Carta C', 'Carta D'].forEach(c => r.submitCharacter('s2', c));
  ['Carta E', 'Carta F'].forEach(c => r.submitCharacter('s3', c));

  r.startGame('s1');

  /* Turno 0: Ana (equipo 0, pointer=0) */
  assert(r.getCurrentDescriberId() === 's1', 'Ana debe ser la primera describer');

  const t = r.startTurn('s1');
  assert(!t.error, 'startTurn debe funcionar');
  assert(r.turnActive, 'Turno debe estar activo');
  assert(r.activeDescriberId === 's1', 'activeDescriberId debe ser s1');
  console.log('  ✓ Ana arranca el turno normalmente');

  /* Ana marca una carta */
  const m1 = r.markGuessed('s1');
  assert(!m1.error, 'Primera markGuessed debe funcionar');
  assert(r.scores[0] === 1, 'Equipo 0 debe tener 1 punto');

  /* ── Ana se desconecta ────────────────────────────────────── */
  r.removePlayer('s1');
  assert(!r.players.get('s1').connected, 'Ana debe estar marcada como desconectada');
  assert(r.teams[0].includes('s1'), 'Ana debe seguir en el equipo 0 (slot preservado)');
  assert(r.turnActive, 'El turno debe seguir activo tras la desconexión');
  assert(r.activeDescriberId === 's1', 'activeDescriberId no debe cambiar por la desconexión');
  console.log('  ✓ Desconexión: turno activo, registro conservado, slot en equipo intacto');

  /* ── getCurrentDescriberId() mientras turnActive con describer desconectado ── */
  /* Simula un state broadcast disparado por otro jugador (ej. Carlos pide estado) */
  const duranteDesconexion = r.getCurrentDescriberId();
  assert(duranteDesconexion === 's1',
    'getCurrentDescriberId() debe devolver s1 (no s2/Carlos) mientras turnActive');
  console.log('  ✓ getCurrentDescriberId() devuelve s1 (no Carlos) durante turno activo');

  /* ── Reconexión ───────────────────────────────────────────── */
  const oldId = r.findDisconnectedByName('Ana');
  assert(oldId === 's1', 'findDisconnectedByName debe encontrar a Ana');

  const recon = r.reconnectPlayer('s1', 's1-nuevo');
  assert(!recon.error, 'reconnectPlayer debe tener éxito');
  assert(r.players.get('s1-nuevo').connected, 'Ana (s1-nuevo) debe estar conectada');
  assert(r.teams[0].includes('s1-nuevo'), 'El nuevo socket debe estar en equipo 0');
  assert(!r.teams[0].includes('s1'), 'El socket viejo no debe estar en el equipo');
  assert(r.getCurrentDescriberId() === 's1-nuevo',
    'getCurrentDescriberId() debe devolver s1-nuevo tras reconexión');
  console.log('  ✓ Reconexión exitosa: s1-nuevo es el describer activo');

  /* ── Verifica payload de reconexión (lo que armaría index.js) ── */
  const state = r.getState();
  assert(state.phase === 'playing',            'Payload: fase debe ser playing');
  assert(state.roundIndex === 0,               'Payload: ronda debe ser 0');
  assert(state.scores[0] === 1,               'Payload: equipo 0 debe tener 1 punto');
  assert(state.currentDescriberId === 's1-nuevo', 'Payload: currentDescriberId debe ser s1-nuevo');
  const anaRecord = r.players.get('s1-nuevo');
  assert(anaRecord.submittedCount === 2, 'Payload: submittedCount de Ana debe ser 2');
  console.log('  ✓ Payload: fase, ronda, marcador y submittedCount correctos');

  /* ── Ana retoma el turno ──────────────────────────────────── */
  const m2 = r.markGuessed('s1-nuevo');
  assert(!m2.error, 'markGuessed con s1-nuevo debe funcionar sin error');
  assert(r.scores[0] === 2, 'Equipo 0 debe tener 2 puntos tras retomar el turno');
  console.log('  ✓ Ana retoma el turno y marca otra carta');

  console.log(SEP);
}

async function main() {
  testDescriberValidation();
  testHost();
  testHostTransfer();
  testReconexionDescriber();

  console.log(SEP);
  console.log('  SIMULACIÓN DE PARTIDA COMPLETA');
  console.log(SEP);

  const room = new Room('SIM01', {
    charactersPerPlayer: 3,
    turnDuration: TURN_MS,
    onEvent: log,
  });

  console.log('\n[Setup] Jugadores y equipos');
  room.addPlayer('ana',    'Ana');
  room.addPlayer('bob',    'Bob');
  room.addPlayer('carlos', 'Carlos');
  room.addPlayer('diana',  'Diana');

  room.joinTeam('ana',    0);
  room.joinTeam('bob',    1);
  room.joinTeam('carlos', 0);
  room.joinTeam('diana',  1);

  console.log('\n[Setup] Registro de personajes (3 por jugador = 12 en total)');
  ['Harry Potter', 'Gandalf',    'Batman'].forEach(c => room.submitCharacter('ana',    c));
  ['Superman',     'Frodo',      'Yoda'  ].forEach(c => room.submitCharacter('bob',    c));
  ['Hermione',     'Dumbledore', 'Sauron'].forEach(c => room.submitCharacter('carlos', c));
  ['Darth Vader',  'Legolas',    'Dobby' ].forEach(c => room.submitCharacter('diana',  c));

  room.startGame('ana');
  /* Desde aquí cada acción se valida contra el describer actual */

  // ─── RONDA 1: Descripción libre ───────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('  RONDA 1 — Descripción libre');
  console.log(SEP);

  // Turno 1 (Equipo 0 — Ana describe): adivina 2 cartas, tiempo agota la 3ª
  console.log('\n[Turno 1] Equipo 0 — Ana describe');
  room.startTurn(room.getCurrentDescriberId());
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 0
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 0
  await sleep(TURN_MS + 100); // tiempo agotado → carta vuelve al mazo

  // Turno 2 (Equipo 1 — Bob describe): adivina 3 cartas
  console.log('\n[Turno 2] Equipo 1 — Bob describe');
  room.startTurn(room.getCurrentDescriberId());
  await sleep(40);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 1
  await sleep(40);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 1
  await sleep(40);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 1
  await sleep(TURN_MS + 100); // tiempo agotado → carta vuelve

  // Turno 3 (Equipo 0 — Carlos describe): adivina 2, luego tiempo agota
  console.log('\n[Turno 3] Equipo 0 — Carlos describe');
  room.startTurn(room.getCurrentDescriberId());
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 0
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());   // +1 equipo 0
  await sleep(TURN_MS + 100);

  // Turno 4 (Equipo 1 — Diana describe): adivina todo lo que quede en el mazo
  console.log('\n[Turno 4] Equipo 1 — Diana describe: vacía el mazo');
  room.startTurn(room.getCurrentDescriberId());
  // Con 12 cartas iniciales: T1 adivinó 2, T2 adivinó 3, T3 adivinó 2 → quedan 5 en mazo
  // (las 3 cartas que no se adivinaron volvieron al mazo)
  // Diana va a adivinar todas las que pueda antes del tiempo, luego repetimos hasta vaciar
  for (let i = 0; i < 6; i++) {
    await sleep(30);
    room.markGuessed(room.getCurrentDescriberId());
  }
  // Si el mazo se vació antes de los 6 intentos, markGuessed devuelve error que ignoramos.
  // Si todavía hay cartas, esperamos al timer y seguimos con otro turno.
  await sleep(TURN_MS + 100);

  // Si la ronda no terminó (el mazo no estaba vacío), hacemos turnos rápidos hasta vaciarlo
  while (room.phase === 'playing' && room.roundIndex === 0) {
    console.log('\n[Turno extra] Vaciando mazo para cerrar ronda 1');
    room.startTurn(room.getCurrentDescriberId());
    for (let i = 0; i < 12; i++) {
      await sleep(20);
      const r = room.markGuessed(room.getCurrentDescriberId());
      if (r.error) break;
    }
    await sleep(TURN_MS + 100);
  }

  // ─── RONDA 2: Una sola palabra ────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('  RONDA 2 — Una sola palabra');
  console.log(SEP);

  // Turno 1 de ronda 2 (Equipo 0): adivina 1, luego PENALIZACIÓN
  console.log('\n[Turno R2-1] Equipo 0 — adivina 1, luego penalización');
  room.startTurn(room.getCurrentDescriberId());
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());    // +1 equipo 0
  await sleep(50);
  room.reportPenalty(room.getCurrentDescriberId());  // carta vuelve, -1 equipo 0 → turno termina

  // Turno 2 de ronda 2 (Equipo 1): adivina 2
  console.log('\n[Turno R2-2] Equipo 1 — adivina 2');
  room.startTurn(room.getCurrentDescriberId());
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());
  await sleep(50);
  room.markGuessed(room.getCurrentDescriberId());
  await sleep(TURN_MS + 100);

  // Turnos hasta vaciar el mazo en ronda 2
  while (room.phase === 'playing' && room.roundIndex === 1) {
    console.log('\n[Turno extra R2] Vaciando mazo para cerrar ronda 2');
    room.startTurn(room.getCurrentDescriberId());
    for (let i = 0; i < 12; i++) {
      await sleep(20);
      const r = room.markGuessed(room.getCurrentDescriberId());
      if (r.error) break;
    }
    await sleep(TURN_MS + 100);
  }

  // ─── RONDA 3: Mímica ──────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('  RONDA 3 — Mímica');
  console.log(SEP);

  while (room.phase === 'playing' && room.roundIndex === 2) {
    console.log('\n[Turno R3] Vaciando mazo ronda 3');
    room.startTurn(room.getCurrentDescriberId());
    for (let i = 0; i < 12; i++) {
      await sleep(20);
      const r = room.markGuessed(room.getCurrentDescriberId());
      if (r.error) break;
    }
    await sleep(TURN_MS + 100);
  }

  // ─── Resultado ────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  const state = room.getState();
  console.log('  FIN DE PARTIDA');
  console.log(`  Puntos equipo 0: ${state.scores[0]}`);
  console.log(`  Puntos equipo 1: ${state.scores[1]}`);
  if (state.scores[0] > state.scores[1])      console.log('  Gana: Equipo 0');
  else if (state.scores[1] > state.scores[0]) console.log('  Gana: Equipo 1');
  else                                         console.log('  Empate');
  console.log(SEP);
}

main().catch(err => {
  console.error('Error en la simulación:', err);
  process.exit(1);
});
