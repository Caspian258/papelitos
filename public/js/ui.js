/* ============================================================
   TRACKING DE PANTALLA ACTUAL
   ============================================================ */
var currentScreen = null;

/* Re-ejecuta el setup de la pantalla actual sin cambiar de pantalla.
   Llamado por client.js cuando llega un evento del servidor que
   actualiza el estado sin navegar. */
function setupCurrentScreen() {
  if (!currentScreen) return;
  var fn = {
    'home':             setupHome,
    'team-select':      setupTeamSelect,
    'register':         setupRegister,
    'lobby':            setupLobby,
    'round-transition': setupRoundTransition,
    'turn':             setupTurn,
    'spectator':        setupSpectator,
    'winner':           setupWinner,
  }[currentScreen];
  if (fn) fn();
}

/* ============================================================
   ICONOS DE RONDA (SVG dibujado a mano, trazo consistente)
   ============================================================ */
var ROUND_ICONS = {
  0: '<svg width="48" height="52" viewBox="0 0 48 52" fill="none" stroke="#2C1C0C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 4 Q40 3 42 12 Q44 21 41 30 Q38 36 30 37 L28 37 L20 49 L18 37 Q8 35 5 26 Q2 15 6 10 Q9 4 24 4Z"/><circle cx="16" cy="21" r="2.5" fill="#2C1C0C" stroke="none"/><circle cx="24" cy="21" r="2.5" fill="#2C1C0C" stroke="none"/><circle cx="32" cy="21" r="2.5" fill="#2C1C0C" stroke="none"/></svg>',

  1: '<svg width="44" height="60" viewBox="0 0 44 60" fill="none" stroke="#2C1C0C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="14" height="30" rx="7"/><line x1="16" y1="20" x2="26" y2="20" stroke-width="1.4" opacity=".5"/><path d="M6 34 Q5 44 9 50 Q13 56 22 57 Q31 56 35 50 Q39 44 38 34 L6 34Z"/><path d="M6 35 Q6 30 9.5 28 Q13 26 14 30"/><path d="M28 30 Q29 26 32.5 28 Q36 30 38 35"/></svg>',

  2: '<svg width="56" height="44" viewBox="0 0 56 44" fill="none" stroke="#2C1C0C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20 Q5 10 13 6 Q21 2 27 8 Q33 2 41 6 Q49 10 48 20 Q47 30 40 36 Q34 42 28 42 Q21 42 16 36 Q9 30 6 20Z"/><ellipse cx="18" cy="19" rx="3.2" ry="2.5"/><ellipse cx="36" cy="19" rx="3.2" ry="2.5"/><path d="M14 30 Q20 38 28 37 Q36 38 40 30"/><path d="M22 23 Q27 27 33 23" stroke-width="1.5" opacity=".6"/></svg>',
};

/* Mapeados al roundIndex (0-based) del backend */
var ROUND_DATA = {
  0: {
    label:    'Ronda 1',
    name:     'Describí como quieras',
    rule:     'Podés decir lo que quieras para que tu equipo adivine. Solo una restricción: <strong>no podés decir el nombre exacto</strong> del personaje.',
    btnText:  'Empezar Ronda 1',
    cardLabel:'describí como quieras',
  },
  1: {
    label:    'Ronda 2',
    name:     'Una sola palabra',
    rule:     'Solo podés decir <strong>una palabra</strong> como pista. Sin gestos, sin sonidos extra.',
    btnText:  'Empezar Ronda 2',
    cardLabel:'una sola palabra',
  },
  2: {
    label:    'Ronda 3',
    name:     'Mímica',
    rule:     '<strong>Sin hablar, sin sonidos.</strong> Solo podés actuar. Tu equipo tiene que adivinar mirándote.',
    btnText:  'Empezar Ronda 3',
    cardLabel:'mímica',
  },
};

/* Estado de registro de personajes (local, solo para la pantalla register) */
var characters = [];
var CHAR_LIMIT  = 5;
/* Personajes ya enviados en sesiones anteriores (reconexión mid-register).
   Se suma a characters.length para mostrar el conteo real. */
var caracteresPrevios = 0;

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.hidden = true; });
  var screen = document.getElementById('screen-' + id);
  if (!screen) { console.warn('Pantalla no encontrada:', id); return; }
  screen.hidden = false;

  /* Solo limpiar characters cuando se navega POR PRIMERA VEZ a register.
     Si currentScreen ya es 'register' (refresh de estado), no tocar el array. */
  if (id === 'register' && currentScreen !== 'register') {
    characters = [];
  }

  currentScreen = id;
  actualizarCodigoBadge();

  var setup = {
    'home':             setupHome,
    'team-select':      setupTeamSelect,
    'register':         setupRegister,
    'lobby':            setupLobby,
    'round-transition': setupRoundTransition,
    'turn':             setupTurn,
    'spectator':        setupSpectator,
    'winner':           setupWinner,
  };
  if (setup[id]) setup[id]();
}

/* ============================================================
   UTILIDAD — busca un jugador en appState.players por id
   ============================================================ */
function findPlayer(id) {
  return (appState.players || []).find(function(p) { return p.id === id; });
}

/* ============================================================
   PANTALLA HOME
   ============================================================ */
function setupHome() {
  characters        = [];
  caracteresPrevios = 0;
  appState.myTeam   = null;
  pararCronometro();
  /* Limpia estado de error del input de nombre y registra listener */
  var nameInput = document.getElementById('input-name');
  if (nameInput) {
    nameInput.classList.remove('text-input--error');
    nameInput.oninput = function() {
      nameInput.classList.remove('text-input--error');
      var err = document.getElementById('name-error');
      if (err) err.classList.remove('visible');
    };
  }
  var nameError = document.getElementById('name-error');
  if (nameError) nameError.classList.remove('visible');
}

/* ============================================================
   PANTALLA ELEGIR EQUIPO
   ============================================================ */
function setupTeamSelect() {
  /* appState.myTeam es 0 o 1 (number), o null */
  var continueBtn = document.getElementById('btn-team-continue');
  if (appState.myTeam === null || appState.myTeam === undefined) {
    if (continueBtn) continueBtn.hidden = true;
    ['a', 'b'].forEach(function(t) {
      var card = document.getElementById('team-card-' + t);
      if (card) card.classList.remove('is-chosen', 'is-dimmed');
    });
  } else {
    renderTeamChosen(appState.myTeam);
    if (continueBtn) continueBtn.hidden = false;
  }

  renderizarColumnaEquipoTS(0, 'ts-team-0-players', '#C25B3A');
  renderizarColumnaEquipoTS(1, 'ts-team-1-players', '#D49520');
}

var CHECK_SVG_TS = '<svg width="14" height="11" viewBox="0 0 14 11" fill="none"><path d="M1 5.5L4.5 9.5L13 1" stroke="#5E6C2A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderizarColumnaEquipoTS(teamIdx, containerId, libreColor) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var miembros = (appState.teams && appState.teams[teamIdx]) || [];
  var rows = miembros.filter(Boolean).map(function(jugador) {
    var nombre = jugador.name ? escapeHtml(jugador.name) : '?';
    var esYo   = jugador.id === appState.myId;
    if (esYo) nombre += ' <em style="opacity:.5; font-size:10px;">(vos)</em>';
    return (
      '<div class="player-row ready"><span>' + nombre + '</span>' + CHECK_SVG_TS + '</div>'
    );
  });

  /* Siempre muestra al menos un slot "libre" */
  rows.push(
    '<div class="player-row pending"><span>— libre —</span>' +
    '<svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5H13M9 1L13 5L9 9" ' +
    'stroke="' + libreColor + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/></svg>' +
    '</div>'
  );

  container.innerHTML = rows.join('');
}

/* team es 0 o 1 (mapeado a 'a'/'b' para el DOM) */
function elegirEquipo(team) {
  appState.myTeam = team;
  renderTeamChosen(team);
  var btn = document.getElementById('btn-team-continue');
  if (btn) btn.hidden = false;
}

function renderTeamChosen(teamIdx) {
  var ids = ['a', 'b'];
  ids.forEach(function(t, i) {
    var card = document.getElementById('team-card-' + t);
    if (!card) return;
    card.classList.toggle('is-chosen', i === teamIdx);
    card.classList.toggle('is-dimmed',  i !== teamIdx);
  });
}

/* ============================================================
   PANTALLA REGISTRO DE PERSONAJES
   ============================================================ */
function setupRegister() {
  CHAR_LIMIT  = (appState && appState.charactersPerPlayer) ? appState.charactersPerPlayer : 5;
  actualizarRegistro();

  /* Regenerar dots según CHAR_LIMIT */
  var dotsContainer = document.getElementById('progress-dots');
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    for (var i = 0; i < CHAR_LIMIT; i++) {
      var dot = document.createElement('div');
      dot.className = 'dot';
      dotsContainer.appendChild(dot);
    }
  }

  var input = document.getElementById('input-character');
  if (input) {
    input.value = '';
    input.onkeydown = function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var nombre = input.value.trim();
        if (!nombre || caracteresPrevios + characters.length >= CHAR_LIMIT) return;
        input.value = '';
        if (typeof emitSubmitCharacter === 'function') {
          emitSubmitCharacter(nombre);
        } else {
          /* fallback sin socket (modo offline/demo) */
          agregarPersonaje(nombre);
        }
      }
    };
    input.focus();
  }

  var charWrap = document.getElementById('input-char-wrap');
  if (charWrap) charWrap.hidden = false;
}

/* Llamado por client.js luego de que el servidor confirma el personaje */
function agregarPersonaje(character) {
  characters.push(character);
  actualizarRegistro();
  var total = caracteresPrevios + characters.length;
  if (total >= CHAR_LIMIT) {
    var wrap = document.getElementById('input-char-wrap');
    if (wrap) wrap.hidden = true;
    var btn = document.getElementById('btn-listo');
    if (btn) btn.focus();
  } else {
    var inputEl = document.getElementById('input-character');
    if (inputEl) inputEl.focus();
  }
}

function actualizarRegistro() {
  /* n = total real (previos de sesiones anteriores + esta sesión) */
  var n = caracteresPrevios + characters.length;

  var countEl = document.getElementById('char-count');
  if (countEl) countEl.textContent = n;

  var label = document.getElementById('char-next-label');
  if (label) label.textContent = 'personaje #' + (n + 1);

  var dots = document.querySelectorAll('#progress-dots .dot');
  dots.forEach(function(dot, i) {
    dot.classList.toggle('done', i < n);
  });

  var btnListo = document.getElementById('btn-listo');
  if (btnListo) btnListo.classList.toggle('btn--dimmed', n < CHAR_LIMIT);

  renderizarPila();
}

function renderizarPila() {
  var container = document.getElementById('pile-container');
  if (!container) return;

  if (characters.length === 0) {
    container.style.height = '0px';
    container.innerHTML = '';
    return;
  }

  var visible  = characters.slice(-3);
  var n        = visible.length;
  var rotaciones  = [2.8,  -1.8, 0.8];
  var desplazados = [26,    13,   0  ];
  var opacidades  = [0.55,  0.72, 1.0];
  var offset   = 3 - n;
  var rots  = rotaciones.slice(offset);
  var tops  = desplazados.slice(offset);
  var ops   = opacidades.slice(offset);
  var alturas = [0, 70, 100, 130];
  container.style.height = alturas[n] + 'px';

  container.innerHTML = visible.map(function(nombre, i) {
    var esTop  = i === n - 1;
    var sombra = esTop
      ? 'drop-shadow(2px 3px 10px rgba(44,28,12,.28))'
      : 'drop-shadow(1px 2px 6px rgba(44,28,12,.16))';
    return (
      '<div class="card-wrap" style="position:absolute; width:100%; top:' + tops[i] + 'px; transform:rotate(' + rots[i] + 'deg);">' +
        '<div class="paper-card paper-card--pile" style="filter:' + sombra + '; padding:14px 18px;">' +
          '<span style="font-family:var(--font-marker); font-size:15px; color:var(--brown); opacity:' + ops[i] + ';">' +
            escapeHtml(nombre) +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function finalizarRegistro() {
  if (caracteresPrevios + characters.length < CHAR_LIMIT) return;
  showScreen('lobby');
}

/* ============================================================
   PANTALLA LOBBY
   ============================================================ */
var CHECK_SVG = '<svg width="12" height="9" viewBox="0 0 14 11" fill="none"><path d="M1 5.5L4.5 9.5L13 1" stroke="#5E6C2A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

var ROTACIONES_LOBBY = [0.3, -0.4, 0.2, -0.3, 0.5, 0.1, -0.2, 0.4];

function setupLobby() {
  var codeEl = document.getElementById('lobby-room-code');
  if (codeEl) codeEl.textContent = appState.roomCode || '—';

  var countEl = document.getElementById('lobby-player-count');
  var total   = (appState.players || []).length;
  if (countEl) countEl.textContent = total + (total === 1 ? ' jugador' : ' jugadores');

  renderizarColumnaEquipo(0, 'lobby-team-0-players');
  renderizarColumnaEquipo(1, 'lobby-team-1-players');

  /* El botón "Empezar partida" solo es accionable para el host */
  var startBtn = document.getElementById('lobby-start-btn');
  if (startBtn) {
    startBtn.classList.toggle('btn--dimmed', !appState.isHost);
  }
}

function renderizarColumnaEquipo(teamIdx, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var miembros = (appState.teams && appState.teams[teamIdx]) || [];
  if (miembros.length === 0) {
    container.innerHTML =
      '<div class="player-row pending" style="font-size:11px;"><span>esperando...</span></div>';
    return;
  }

  container.innerHTML = miembros.map(function(jugador, i) {
    var rot = ROTACIONES_LOBBY[i % ROTACIONES_LOBBY.length];
    var esYo = jugador && jugador.id === appState.myId;
    var nombre = (jugador && jugador.name) ? escapeHtml(jugador.name) : '?';
    if (esYo) nombre += ' <em style="opacity:.5; font-size:10px;">(vos)</em>';
    return (
      '<div class="player-row ready" style="transform:rotate(' + rot + 'deg); font-size:11px;">' +
        '<span>' + nombre + '</span>' +
        CHECK_SVG +
      '</div>'
    );
  }).join('');
}

/* ============================================================
   PANTALLA TRANSICIÓN DE RONDA
   ============================================================ */
function setupRoundTransition() {
  var idx = appState.roundIndex || 0;
  var rd  = ROUND_DATA[idx];
  if (!rd) return;

  document.getElementById('rt-round-label').textContent = rd.label;
  document.getElementById('rt-icon').innerHTML          = ROUND_ICONS[idx];
  document.getElementById('rt-round-name').textContent  = rd.name;
  document.getElementById('rt-rule').innerHTML          = rd.rule;

  var scores = appState.scores || { 0: 0, 1: 0 };
  document.getElementById('rt-score-a').textContent = scores[0] || 0;
  document.getElementById('rt-score-b').textContent = scores[1] || 0;

  /* Botón: solo el próximo describer puede iniciarlo */
  var soyDescriber = appState.currentDescriberId === appState.myId;
  var btn      = document.getElementById('rt-btn');
  var btnText  = document.getElementById('rt-btn-text');
  if (!btn || !btnText) return;

  if (soyDescriber) {
    btn.classList.remove('btn--dimmed');
    btnText.textContent = rd.btnText;
  } else {
    btn.classList.add('btn--dimmed');
    var proximo = findPlayer(appState.currentDescriberId);
    btnText.textContent = proximo ? 'Le toca a ' + proximo.name + '...' : 'Esperando...';
  }
}

/* ============================================================
   PANTALLA TURNO ACTIVO (quien describe)
   ============================================================ */
function setupTurn() {
  var idx = appState.roundIndex || 0;
  var rd  = ROUND_DATA[idx];

  var labelEl = document.getElementById('turn-round-label');
  if (labelEl && rd) labelEl.textContent = rd.cardLabel;

  var charEl = document.getElementById('turn-character');
  if (charEl) charEl.textContent = appState.currentCard || '…';

  var remainEl = document.getElementById('turn-remaining');
  if (remainEl) remainEl.textContent = appState.deckRemaining || 0;

  /* Equipo actual */
  var teamName  = (appState.currentTeam === 0) ? 'Equipo A' : 'Equipo B';
  var stripName = document.getElementById('turn-team-name');
  if (stripName) stripName.textContent = teamName;

  /* Clase de color del strip */
  var strip = document.querySelector('.team-strip');
  if (strip) {
    strip.classList.toggle('team-strip--a', appState.currentTeam === 0);
    strip.classList.toggle('team-strip--b', appState.currentTeam === 1);
  }

  iniciarCronometro();
}

/* ============================================================
   PANTALLA ESPECTADOR
   ============================================================ */
function setupSpectator() {
  var scores = appState.scores || { 0: 0, 1: 0 };
  var scoreA = document.getElementById('spec-score-a');
  var scoreB = document.getElementById('spec-score-b');
  if (scoreA) scoreA.textContent = scores[0] || 0;
  if (scoreB) scoreB.textContent = scores[1] || 0;

  var remainEl = document.getElementById('spec-remaining');
  if (remainEl) remainEl.textContent = appState.deckRemaining || 0;

  /* Quién describe */
  var describer = findPlayer(appState.currentDescriberId);
  var teamIdx   = appState.currentTeam;
  var teamLabel = (teamIdx === 0) ? 'Equipo A' : 'Equipo B';
  var specDesc  = document.getElementById('spec-describer');
  if (specDesc) {
    specDesc.textContent = describer
      ? describer.name + ' · ' + teamLabel
      : teamLabel;
  }

  /* Color del strip "Está describiendo" */
  var strip = document.querySelector('#screen-spectator [style*="background:var(--color-"]');
  if (strip) {
    strip.style.background = (teamIdx === 0) ? 'var(--color-a)' : 'var(--color-b)';
    strip.style.boxShadow  = (teamIdx === 0)
      ? '0 2px 8px rgba(194,91,58,.35)'
      : '0 2px 8px rgba(212,149,32,.35)';
  }

  iniciarCronometro();
}

/* ============================================================
   PANTALLA GANADOR
   ============================================================ */
function setupWinner() {
  var scores  = appState.finalScores || appState.scores || { 0: 0, 1: 0 };
  var winner  = appState.winner;           /* 0, 1, o null (empate) */

  var teamName, winPoints, winColor, bgColor;

  if (winner === 0) {
    teamName  = 'Equipo A';
    winPoints = scores[0] || 0;
    winColor  = 'var(--color-a)';
    bgColor   = '#C25B3A';
  } else if (winner === 1) {
    teamName  = 'Equipo B';
    winPoints = scores[1] || 0;
    winColor  = 'var(--color-b)';
    bgColor   = '#D49520';
  } else {
    teamName  = '¡Empate!';
    winPoints = scores[0] || 0;
    winColor  = 'var(--navy, #1D3D50)';
    bgColor   = '#1D3D50';
  }

  var badge = document.getElementById('winner-badge');
  if (badge) {
    badge.textContent = '¡' + teamName + '!';
    var badgeWrap = badge.parentElement;
    if (badgeWrap) {
      badgeWrap.style.background  = bgColor;
      badgeWrap.style.boxShadow   = '0 4px 0 rgba(0,0,0,.25), 0 5px 14px rgba(0,0,0,.2)';
    }
  }

  var pointsEl = document.getElementById('winner-points');
  if (pointsEl) {
    pointsEl.textContent = winPoints;
    pointsEl.style.color = winColor;
  }

  var wScoreA = document.getElementById('winner-score-a');
  var wScoreB = document.getElementById('winner-score-b');
  if (wScoreA) wScoreA.textContent = scores[0] || 0;
  if (wScoreB) wScoreB.textContent = scores[1] || 0;
}

/* ============================================================
   BADGE DE CÓDIGO DE SALA
   ============================================================ */
function actualizarCodigoBadge() {
  var badge  = document.getElementById('room-code-badge');
  var codeEl = document.getElementById('room-code-badge-text');
  if (!badge || !codeEl) return;
  var code    = appState && appState.roomCode;
  var visible = !!(code && currentScreen !== 'home');
  badge.hidden = !visible;
  if (code) codeEl.textContent = code;
}

/* ============================================================
   INICIO
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
  showScreen('home');
});
