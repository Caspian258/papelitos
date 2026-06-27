const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createRoom, getRoom, deleteRoom } = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

/* Mapa global socketId → socket para envíos privados (your_card) */
const allSockets = new Map();

function broadcastState(room) {
  io.to(room.code).emit('state', room.getState());
}

/* Rutea los eventos de Room evitando que el nombre del personaje
   llegue a quienes no están describiendo. */
function makeOnEvent(room) {
  return function(event, data) {
    if (event === 'turn_started') {
      const { card, ...publicData } = data;
      io.to(room.code).emit('turn_started', publicData);
      const sock = allSockets.get(data.describerId);
      if (sock) sock.emit('your_card', { card, deckRemaining: publicData.deckRemaining });

    } else if (event === 'next_card') {
      const sock = allSockets.get(room.getCurrentDescriberId());
      if (sock) sock.emit('your_card', { card: data.card, deckRemaining: data.deckRemaining });

    } else if (event === 'time_expired') {
      io.to(room.code).emit('time_expired', { deckRemaining: data.deckRemaining });

    } else {
      io.to(room.code).emit(event, data);
    }
  };
}

io.on('connection', (socket) => {
  allSockets.set(socket.id, socket);

  let currentRoom = null;
  let currentPlayerId = socket.id;

  socket.on('create_room', ({ name }, cb) => {
    if (!(name || '').trim()) return cb({ error: 'El nombre no puede estar vacío' });
    const turnMs = process.env.TURN_DURATION_MS ? parseInt(process.env.TURN_DURATION_MS) : undefined;
    const roomOpts = turnMs ? { turnDuration: turnMs } : {};
    const room = createRoom(roomOpts);
    room.onEvent = makeOnEvent(room);
    currentRoom = room;
    socket.join(room.code);

    const result = room.addPlayer(currentPlayerId, name.trim());
    if (result.error) return cb({ error: result.error });

    cb({ ok: true, code: room.code });
    broadcastState(room);
  });

  socket.on('join_room', ({ code, name }, cb) => {
    if (!(name || '').trim()) return cb({ error: 'El nombre no puede estar vacío' });
    const room = getRoom(code.toUpperCase());
    if (!room) return cb({ error: 'Sala no encontrada' });

    // ── Intento de reconexión: nombre coincide con jugador desconectado ──
    const oldId = room.findDisconnectedByName(name);
    if (oldId !== null) {
      const result = room.reconnectPlayer(oldId, socket.id);
      if (result.error) return cb({ error: result.error });

      currentRoom = room;
      currentPlayerId = socket.id;
      socket.join(room.code);

      const player = room.players.get(socket.id);
      const state  = room.getState();
      const isActiveDescriber = room.turnActive && room.getCurrentDescriberId() === socket.id;

      cb({
        ok:             true,
        reconnected:    true,
        code:           room.code,
        ...state,
        myTeam:         player.team,
        submittedCount: player.submittedCount,
        currentCard:    isActiveDescriber ? room.currentCard : undefined,
      });

      // Si reconecta como describer con turno activo, le mandamos la carta actual
      if (isActiveDescriber) {
        socket.emit('your_card', { card: room.currentCard, deckRemaining: room.deck.size() });
      }

      broadcastState(room);
      return;
    }

    // ── Nombre ya en uso por jugador activo ───────────────────────────
    for (const [, p] of room.players) {
      if (p.name === name && p.connected) {
        return cb({ error: 'Ese nombre ya está en uso en esta sala' });
      }
    }

    // ── Jugador nuevo ─────────────────────────────────────────────────
    currentRoom = room;
    socket.join(room.code);

    const result = room.addPlayer(socket.id, name);
    if (result.error) return cb({ error: result.error });

    cb({ ok: true, code: room.code });
    broadcastState(room);
  });

  socket.on('join_team', ({ team }, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.joinTeam(currentPlayerId, team);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('submit_character', ({ character }, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.submitCharacter(currentPlayerId, character);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('start_game', (_, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.startGame(currentPlayerId);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('start_turn', (_, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.startTurn(currentPlayerId);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('mark_guessed', (_, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.markGuessed(currentPlayerId);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('report_penalty', (_, cb) => {
    if (!currentRoom) return cb?.({ error: 'Sin sala' });
    const result = currentRoom.reportPenalty(currentPlayerId);
    if (result?.error) return cb?.({ error: result.error });
    cb?.({ ok: true });
    broadcastState(currentRoom);
  });

  socket.on('disconnect', () => {
    allSockets.delete(socket.id);
    if (currentRoom) {
      currentRoom.removePlayer(currentPlayerId);
      const hasConnected = [...currentRoom.players.values()].some(p => p.connected);
      if (!hasConnected && currentRoom.phase === 'lobby') {
        // Sala vacía en lobby: limpiamos de memoria
        deleteRoom(currentRoom.code);
      } else if (hasConnected) {
        broadcastState(currentRoom);
      }
      // Sala en playing/finished sin conectados: queda en memoria hasta reinicio del servidor
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
