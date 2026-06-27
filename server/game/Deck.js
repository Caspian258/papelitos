class Deck {
  constructor() {
    this.masterList = [];
    this.active = [];
  }

  add(character) {
    this.masterList.push(character);
  }

  shuffle() {
    for (let i = this.active.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.active[i], this.active[j]] = [this.active[j], this.active[i]];
    }
  }

  drawNext() {
    return this.active.length > 0 ? this.active.shift() : null;
  }

  returnCard(card) {
    const pos = Math.floor(Math.random() * (this.active.length + 1));
    this.active.splice(pos, 0, card);
  }

  isEmpty() {
    return this.active.length === 0;
  }

  reset() {
    this.active = [...this.masterList];
    this.shuffle();
  }

  size() {
    return this.active.length;
  }

  total() {
    return this.masterList.length;
  }
}

module.exports = Deck;
