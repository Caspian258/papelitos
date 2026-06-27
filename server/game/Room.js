const Deck = require('./Deck');
const { getRound, nextRoundIndex } = require('./rounds');

class Room {
  constructor(code, options = {}) {
    this.code = code;
    this.charactersPerPlayer = options.charactersPerPlayer ?? 5;
    this.turnDuration = options.turnDuration ?? 60000;
    this.onEvent = options.onEvent ?? (() => {});

    this.players = new Map();
    this.hostId = null;
    this.teams = { 0: [], 1: [] };
    this.teamPointers = { 0: 0, 1: 0 };
    this.scores = { 0: 0, 1: 0 };

    this.deck = new Deck();
    this.roundIndex = 0;
    this.currentTeam = 0;
    this.currentCard = null;
    this.turnTimer = null;
    this.turnStartedAt = null;
    this.phase = 'lobby';
    this.turnActive = false;

    // Fijado al arrancar un turno; nunca se recalcula mientras turnActive === true.
    this.activeDescriberId = null;
    // Índice en teams[] del describer activo; usado por _endTurn para avanzar
    // el pointer desde quien realmente describió (incluso si hubo skip de desconectados).
    this._activeDescriberIndex = null;
  }

  addPlayer(id, name) {
    if (this.phase !== 'lobby') return { error: 'La partida ya comenzó' };
    const trimmed = (name || '').trim();
    if (!trimmed) return { error: 'El nombre no puede estar vacío' };
    this.players.set(id, { id, name: trimmed, team: null, connected: true, submittedCount: 0 });
    if (this.hostId === null) this.hostId = id;
    this._emit('player_joined', { player: { id, name } });
    return { ok: true };
  }

  isHost(playerId) {
    return this.hostId !== null && this.hostId === playerId;
  }

  // Mientras hay turno activo devuelve activeDescriberId (sin recalcular).
  // Fuera de turno, busca el próximo conectado en la rotación.
  getCurrentDescriberId() {
    if (this.turnActive) return this.activeDescriberId;
    return this._currentDescriber();
  }

  findDisconnectedByName(name) {
    for (const [id, player] of this.players) {
      if (player.name === name && !player.connected) return id;
    }
    return null;
  }

  reconnectPlayer(oldId, newId) {
    const player = this.players.get(oldId);
    if (!player) return { error: 'Jugador no encontrado' };

    this.players.delete(oldId);
    player.id = newId;
    player.connected = true;
    this.players.set(newId, player);

    if (player.team !== null) {
      const arr = this.teams[player.team];
      const idx = arr.indexOf(oldId);
      if (idx !== -1) arr[idx] = newId;
    }

    if (this.activeDescriberId === oldId) this.activeDescriberId = newId;

    this._emit('player_reconnected', { playerId: newId, name: player.name });
    return { ok: true, team: player.team };
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return;

    // Marca desconectado pero conserva el registro y el slot en el equipo.
    // Permite reconexión y mantiene válido el pointer de round-robin.
    player.connected = false;
    this._emit('player_left', { playerId: id });

    if (this.hostId === id) {
      this.hostId = null;
      for (const [pid, p] of this.players) {
        if (p.connected) {
          this.hostId = pid;
          this._emit('host_changed', { hostId: this.hostId });
          break;
        }
      }
    }
  }

  joinTeam(playerId, team) {
    if (team !== 0 && team !== 1) return { error: 'Equipo inválido' };
    const player = this.players.get(playerId);
    if (!player) return { error: 'Jugador no encontrado' };

    if (player.team !== null) {
      const prev = this.teams[player.team];
      const idx = prev.indexOf(playerId);
      if (idx !== -1) prev.splice(idx, 1);
    }

    player.team = team;
    this.teams[team].push(playerId);
    this._emit('team_joined', { playerId, team });
    return { ok: true };
  }

  submitCharacter(playerId, character) {
    if (this.phase !== 'lobby') return { error: 'No es momento de registrar personajes' };
    const trimmed = character.trim();
    if (!trimmed) return { error: 'El personaje no puede estar vacío' };
    const player = this.players.get(playerId);
    if (player) player.submittedCount++;
    this.deck.add(trimmed);
    this._emit('character_submitted', { playerId, total: this.deck.total() });
    return { ok: true };
  }

  startGame(requesterId) {
    if (this.phase !== 'lobby') return { error: 'No es momento de iniciar' };
    if (!this.isHost(requesterId)) return { error: 'Solo el anfitrión puede iniciar la partida' };
    const connectedIn = (t) => this.teams[t].some(id => {
      const p = this.players.get(id); return p && p.connected;
    });
    if (!connectedIn(0) || !connectedIn(1)) {
      return { error: 'Cada equipo necesita al menos un jugador' };
    }
    if (this.deck.total() === 0) return { error: 'No hay personajes registrados' };

    this.roundIndex = 0;
    this.currentTeam = 0;
    this.deck.reset();
    this.phase = 'playing';

    this._emit('game_started', {
      round: getRound(0),
      deckSize: this.deck.size(),
      nextDescriberId: this._currentDescriber(),
    });
    return { ok: true };
  }

  startTurn(requesterId) {
    if (this.phase !== 'playing') return { error: 'La partida no está en curso' };
    if (this.turnActive) return { error: 'Ya hay un turno activo' };
    if (this.deck.isEmpty()) return { error: 'El mazo está vacío' };

    // Una sola llamada a _currentDescriber() fija activeDescriberId y _activeDescriberIndex.
    const describer = this._currentDescriber();
    if (describer !== requesterId) return { error: 'No es tu turno de describir' };

    const card = this.deck.drawNext();
    this.currentCard = card;
    this.turnActive = true;
    this.activeDescriberId = describer;
    this.turnStartedAt = Date.now();

    this._emit('turn_started', {
      team: this.currentTeam,
      describerId: this.activeDescriberId,
      card,
      duration: this.turnDuration,
      turnStartedAt: this.turnStartedAt,
      deckRemaining: this.deck.size(),
    });

    this.turnTimer = setTimeout(() => this._onTimeExpired(), this.turnDuration);
    return { ok: true };
  }

  markGuessed(requesterId) {
    if (!this.turnActive || this.currentCard === null) return { error: 'No hay turno activo' };
    if (this.getCurrentDescriberId() !== requesterId) return { error: 'Solo quien describe puede marcar adivinado' };

    this.scores[this.currentTeam]++;
    const guessedCard = this.currentCard;

    this._emit('card_guessed', {
      card: guessedCard,
      team: this.currentTeam,
      scores: { ...this.scores },
      deckRemaining: this.deck.size(),
    });

    if (this.deck.isEmpty()) {
      this._endRound();
      return { ok: true };
    }

    const next = this.deck.drawNext();
    this.currentCard = next;
    this._emit('next_card', { card: next, deckRemaining: this.deck.size() });
    return { ok: true };
  }

  reportPenalty(requesterId) {
    if (!this.turnActive || this.currentCard === null) return { error: 'No hay turno activo' };
    if (this.getCurrentDescriberId() !== requesterId) return { error: 'Solo quien describe puede reportar penalización' };

    this.deck.returnCard(this.currentCard);
    this.scores[this.currentTeam]--;
    const penalizedTeam = this.currentTeam;

    this._emit('penalty', { team: penalizedTeam, scores: { ...this.scores } });
    this._endTurn({ cardReturned: true });
    return { ok: true };
  }

  _onTimeExpired() {
    if (!this.turnActive) return;
    this._emit('time_expired', { deckRemaining: this.deck.size() });
    this._endTurn({ cardReturned: false });
  }

  _endTurn({ cardReturned }) {
    clearTimeout(this.turnTimer);
    this.turnTimer = null;

    if (!cardReturned && this.currentCard !== null) {
      this.deck.returnCard(this.currentCard);
    }

    this.currentCard = null;
    this.turnActive = false;
    this.activeDescriberId = null;

    const team = this.currentTeam;
    // Avanza desde el slot del jugador que describió (puede ser distinto al pointer
    // si se saltaron desconectados), garantizando rotación correcta.
    const baseIndex = this._activeDescriberIndex !== null
      ? this._activeDescriberIndex
      : this.teamPointers[team];
    this.teamPointers[team] = this.teams[team].length > 0
      ? (baseIndex + 1) % this.teams[team].length
      : 0;
    this._activeDescriberIndex = null;
    this.currentTeam = team === 0 ? 1 : 0;

    this._emit('turn_ended', {
      nextTeam: this.currentTeam,
      nextDescriberId: this._currentDescriber(),
      scores: { ...this.scores },
      deckRemaining: this.deck.size(),
    });
  }

  _endRound() {
    clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.currentCard = null;
    this.turnActive = false;
    this.activeDescriberId = null;
    this._activeDescriberIndex = null;

    this.currentTeam = this.currentTeam === 0 ? 1 : 0;

    this._emit('round_ended', { roundIndex: this.roundIndex, scores: { ...this.scores } });

    const next = nextRoundIndex(this.roundIndex);
    if (next === null) { this._endGame(); return; }

    this.roundIndex = next;
    this.deck.reset();

    this._emit('round_started', {
      round: getRound(this.roundIndex),
      deckSize: this.deck.size(),
      nextDescriberId: this._currentDescriber(),
    });
  }

  _endGame() {
    this.phase = 'finished';
    const s = this.scores;
    const winner = s[0] > s[1] ? 0 : s[1] > s[0] ? 1 : null;
    this._emit('game_over', { scores: { ...s }, winner });
  }

  // Busca el primer jugador conectado empezando desde el pointer del equipo actual.
  // Guarda el índice encontrado para que _endTurn pueda avanzar correctamente.
  // Si todo el equipo está desconectado, devuelve null.
  _currentDescriber() {
    const teamIdx = this.currentTeam;
    const team = this.teams[teamIdx];
    if (!team || team.length === 0) {
      this._activeDescriberIndex = null;
      return null;
    }
    const pointer = this.teamPointers[teamIdx];
    for (let offset = 0; offset < team.length; offset++) {
      const idx = (pointer + offset) % team.length;
      const pid = team[idx];
      const player = this.players.get(pid);
      if (player && player.connected) {
        this._activeDescriberIndex = idx;
        return pid;
      }
    }
    this._activeDescriberIndex = null;
    return null;
  }

  _emit(event, data) {
    this.onEvent(event, data);
  }

  getState() {
    return {
      code:               this.code,
      phase:              this.phase,
      roundIndex:         this.roundIndex,
      round:              getRound(this.roundIndex),
      currentTeam:        this.currentTeam,
      currentDescriberId: this.getCurrentDescriberId(),
      turnActive:         this.turnActive,
      turnStartedAt:      this.turnStartedAt || null,
      turnDuration:       this.turnDuration,
      scores:             { ...this.scores },
      deckRemaining:      this.deck.size(),
      hostId:             this.hostId,
      charactersPerPlayer: this.charactersPerPlayer,
      players:            [...this.players.values()],
      teams: {
        0: this.teams[0].map(id => this.players.get(id)),
        1: this.teams[1].map(id => this.players.get(id)),
      },
    };
  }
}

module.exports = Room;
