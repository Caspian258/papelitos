/* ============================================================
   ESTADO COMPARTIDO — leído por ui.js para renderizar cada pantalla
   ============================================================ */
var appState = {
  myId:   null,
  myName: null,
  myTeam: null,
  isHost: false,

  roomCode:           null,
  phase:              'lobby',
  hostId:             null,
  players:            [],
  teams:              { 0: [], 1: [] },
  scores:             { 0: 0, 1: 0 },
  roundIndex:         0,
  round:              null,
  currentTeam:        null,
  currentDescriberId: null,
  turnActive:         false,
  deckRemaining:      0,
  turnStartedAt:      null,
  turnDuration:       60000,
  charactersPerPlayer: 5,

  /* Solo para el jugador que describe: llega vía 'your_card', NUNCA por broadcast */
  currentCard: null,

  winner:      null,
  finalScores: null,

  /* Indica si screen-round-transition debe mostrar info de ronda (true)
     o de turno entrante (false) */
  showingRoundInfo: true,
};

/* ============================================================
   CONEXIÓN SOCKET.IO
   ============================================================ */
var socket = io();

socket.on('connect', function() {
  appState.myId = socket.id;
});

/* ── Estado completo (resync) ────────────────────────────────── */
socket.on('state', function(data) {
  Object.assign(appState, data);
  appState.isHost = (appState.myId === appState.hostId);
  /* Actualiza la pantalla actual sin cambiar de pantalla */
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

/* ── Jugadores ───────────────────────────────────────────────── */
socket.on('player_joined', function(data) {
  /* state seguirá; solo actualizamos por si llega antes */
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

socket.on('player_left', function() {
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

socket.on('host_changed', function(data) {
  appState.hostId = data.hostId;
  appState.isHost = (appState.myId === data.hostId);
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

/* ── Registro de personajes ──────────────────────────────────── */
socket.on('character_submitted', function(data) {
  appState.totalCharacters = data.total;
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

/* ── Inicio de partida ───────────────────────────────────────── */
socket.on('game_started', function(data) {
  Object.assign(appState, data);
  appState.currentDescriberId = data.nextDescriberId;
  appState.showingRoundInfo   = true;
  showScreen('round-transition');
});

/* ── Turno ───────────────────────────────────────────────────── */
socket.on('turn_started', function(data) {
  Object.assign(appState, data);
  appState.turnDuration  = data.duration || appState.turnDuration;
  appState.currentCard   = null;
  appState.turnActive    = true;
  /* El describer recibe 'your_card' justo después y navega a 'turn'.
     El resto va a 'spectator'. */
  if (data.describerId !== appState.myId) {
    showScreen('spectator');
  }
});

socket.on('your_card', function(data) {
  /* Solo llega al socket del jugador que describe */
  appState.currentCard  = data.card;
  appState.deckRemaining = data.deckRemaining;
  showScreen('turn');
});

socket.on('card_guessed', function(data) {
  Object.assign(appState, data);
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

socket.on('time_expired', function(data) {
  Object.assign(appState, data);
  pararCronometro();
});

socket.on('penalty', function(data) {
  Object.assign(appState, data);
  pararCronometro();
  if (typeof setupCurrentScreen === 'function') setupCurrentScreen();
});

socket.on('turn_ended', function(data) {
  Object.assign(appState, data);
  appState.currentDescriberId = data.nextDescriberId;
  appState.turnActive  = false;
  appState.currentCard = null;
  pararCronometro();
  appState.showingRoundInfo = false;
  showScreen('round-transition');
});

socket.on('round_ended', function(data) {
  Object.assign(appState, data);
});

socket.on('round_started', function(data) {
  Object.assign(appState, data);
  appState.currentDescriberId = data.nextDescriberId;
  appState.showingRoundInfo   = true;
  showScreen('round-transition');
});

socket.on('game_over', function(data) {
  appState.winner      = data.winner;
  appState.finalScores = data.scores;
  pararCronometro();
  showScreen('winner');
});

/* ============================================================
   CRONÓMETRO LOCAL (timestamp-based)
   El servidor es la autoridad del fin del turno; el cliente
   solo muestra la cuenta regresiva visualmente.
   ============================================================ */
var _timerInterval = null;

function iniciarCronometro() {
  pararCronometro();
  _timerInterval = setInterval(function() {
    var elapsed   = Date.now() - appState.turnStartedAt;
    var remaining = Math.max(0, Math.ceil((appState.turnDuration - elapsed) / 1000));

    var elTurnTimer = document.getElementById('turn-timer');
    var elSpecTimer = document.getElementById('spec-timer');
    if (elTurnTimer) elTurnTimer.textContent = remaining;
    if (elSpecTimer) elSpecTimer.textContent = remaining;

    if (remaining <= 0) pararCronometro();
  }, 250);
}

function pararCronometro() {
  clearInterval(_timerInterval);
  _timerInterval = null;
}

/* ============================================================
   ACCIONES QUE EL CLIENTE EMITE AL SERVIDOR
   ============================================================ */
/* Valida que el campo nombre no esté vacío.
   Si está vacío: resalta el input y muestra el mensaje de error en la UI.
   Devuelve el nombre limpio, o '' si falló la validación. */
function validarNombre() {
  var input = document.getElementById('input-name');
  var error = document.getElementById('name-error');
  var name  = input ? input.value.trim() : '';
  if (!name) {
    if (input) input.classList.add('text-input--error');
    if (error) error.classList.add('visible');
    if (input) input.focus();
    return '';
  }
  if (input) input.classList.remove('text-input--error');
  if (error) error.classList.remove('visible');
  return name;
}

function emitCreateRoom() {
  var name = validarNombre();
  if (!name) return;
  appState.myName = name;
  socket.emit('create_room', { name: name }, function(res) {
    if (res.error) { mostrarError(res.error); return; }
    appState.roomCode = res.code;
    showScreen('team-select');
  });
}

function emitJoinRoom() {
  var name = validarNombre();
  if (!name) return;
  var code = (document.getElementById('input-code') || {}).value;
  code = (code || '').trim().toUpperCase() || '';
  if (!code) { mostrarError('Escribí el código de sala'); return; }
  appState.myName = name;
  socket.emit('join_room', { name: name, code: code }, function(res) {
    if (res.error) { mostrarError(res.error); return; }
    appState.roomCode = res.code;

    if (res.reconnected) {
      Object.assign(appState, res);
      appState.isHost = (appState.myId === res.hostId);
      appState.myTeam = res.myTeam;
      if (res.currentCard) appState.currentCard = res.currentCard;
      /* caracteresPrevios vive en ui.js pero es global accesible desde aquí */
      caracteresPrevios = res.submittedCount || 0;
      showScreen(calcularPantallaReconexion(res));
    } else {
      showScreen('team-select');
    }
  });
}

/* Traduce fase + datos de reconexión a la pantalla correcta */
function calcularPantallaReconexion(res) {
  if (res.phase === 'finished') return 'winner';
  if (res.phase === 'playing') {
    if (!res.turnActive) return 'round-transition';
    return (res.currentDescriberId === appState.myId) ? 'turn' : 'spectator';
  }
  /* phase === 'lobby' */
  if (res.myTeam == null) return 'team-select';
  if (res.submittedCount >= res.charactersPerPlayer) return 'lobby';
  return 'register';
}

function emitJoinTeam(team) {
  socket.emit('join_team', { team: team }, function(res) {
    if (res.error) { mostrarError(res.error); return; }
    appState.myTeam = team;
    /* elegirEquipo en ui.js actualiza el badge visual */
    elegirEquipo(team);
  });
}

function emitSubmitCharacter(character) {
  socket.emit('submit_character', { character: character }, function(res) {
    if (res.error) { mostrarError(res.error); return; }
    /* agregarPersonaje en ui.js actualiza el contador y la pila */
    agregarPersonaje(character);
  });
}

function emitStartGame() {
  if (!appState.isHost) return;
  socket.emit('start_game', null, function(res) {
    if (res.error) { mostrarError(res.error); }
    /* Navegación la dispara el evento 'game_started' */
  });
}

function emitStartTurn() {
  socket.emit('start_turn', null, function(res) {
    if (res.error) { mostrarError(res.error); }
    /* Navegación la disparan 'turn_started' + 'your_card' */
  });
}

function emitMarkGuessed() {
  socket.emit('mark_guessed', null, function(res) {
    if (res.error) { mostrarError(res.error); }
  });
}

function emitReportPenalty() {
  socket.emit('report_penalty', null, function(res) {
    if (res.error) { mostrarError(res.error); }
  });
}

/* ============================================================
   UTILIDADES
   ============================================================ */
function mostrarError(msg) {
  /* Mensaje no intrusivo en consola; en producción puede mostrarse en UI */
  console.warn('[Papelitos]', msg);
}
