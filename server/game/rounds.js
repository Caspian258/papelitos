const ROUNDS = [
  { index: 0, name: 'descripcion', label: 'Descripción libre' },
  { index: 1, name: 'palabra',     label: 'Una sola palabra'  },
  { index: 2, name: 'mimica',      label: 'Mímica'            },
];

function getRound(index) {
  return ROUNDS[index] || null;
}

function nextRoundIndex(currentIndex) {
  const next = currentIndex + 1;
  return next < ROUNDS.length ? next : null;
}

function isLastRound(index) {
  return index === ROUNDS.length - 1;
}

module.exports = { ROUNDS, getRound, nextRoundIndex, isLastRound };
