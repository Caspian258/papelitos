const Room = require('./game/Room');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(options = {}) {
  const code = generateCode();
  const room = new Room(code, options);
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function deleteRoom(code) {
  rooms.delete(code);
}

function getRoomCount() {
  return rooms.size;
}

module.exports = { createRoom, getRoom, deleteRoom, getRoomCount };
