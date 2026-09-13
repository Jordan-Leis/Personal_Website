import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// The rules class is plain script, so evaluate the file in a bare context.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../../assets/js/solitaire.js', import.meta.url), 'utf8') + ';globalThis.Game = SolitaireGame', context);
const Game = context.Game;

const card = (rank, suit = '♠', up = true) => ({id: rank + suit, rank, suit, up});
const t = (pile, index) => ({type: 'tableau', pile, index});
const f = pile => ({type: 'foundation', pile});
const w = {type: 'waste'};
const fresh = () => new Game(() => 0.5);
const all = g => [...g.stock, ...g.waste, ...g.tableau.flat(), ...g.foundations.flat()];
const clear = g => { g.tableau = [[], [], [], [], [], [], []]; g.foundations = [[], [], [], []]; g.waste = []; g.stock = []; g.history = []; };

test('deal has 52 unique cards, 24 in stock, and one face-up card per column', () => {
  const g = fresh();
  assert.equal(all(g).length, 52);
  assert.equal(new Set(all(g).map(c => c.id)).size, 52);
  assert.equal(g.stock.length, 24);
  assert.deepEqual(Array.from(g.tableau, p => p.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(all(g).filter(c => c.up).length, 7);
});

test('draw and undo restore the exact state; the stock recycles without limit', () => {
  const g = fresh();
  const start = JSON.stringify(all(g));
  g.draw(); assert.equal(g.waste.length, 1);
  g.undo(); assert.equal(JSON.stringify(all(g)), start);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 24; i++) g.draw();
    assert.equal(g.stock.length, 0); assert.equal(g.waste.length, 24);
    g.draw();
    assert.equal(g.stock.length, 24); assert.equal(g.waste.length, 0);
    assert.equal(g.stock.some(c => c.up), false);
  }
});

test('foundations build by suit from ace to king', () => {
  const g = fresh(); clear(g);
  g.waste = [card(1)]; assert.equal(g.move(w, f(0)), true);
  g.waste = [card(2, '♥')]; assert.equal(g.move(w, f(0)), false);
  g.waste = [card(2)]; assert.equal(g.move(w, f(0)), true);
  assert.equal(g.move(f(0), f(1)), false);
});

test('only kings fill empty columns; sequences alternate colour descending', () => {
  const g = fresh(); clear(g);
  g.waste = [card(12)]; assert.equal(g.move(w, t(0)), false);
  g.waste = [card(13)]; assert.equal(g.move(w, t(0)), true);
  g.waste = [card(12, '♣')]; assert.equal(g.move(w, t(0)), false);
  g.waste = [card(12, '♥')]; assert.equal(g.move(w, t(0)), true);
});

test('moving a stack flips the exposed card and undo covers it again', () => {
  const g = fresh(); clear(g);
  g.tableau[0] = [card(6, '♠', false), card(12, '♥'), card(11, '♣')];
  g.tableau[1] = [card(13)];
  assert.equal(g.move(t(0, 0), t(1)), false);
  assert.equal(g.move(t(0, 1), t(1)), true);
  assert.equal(g.tableau[0][0].up, true);
  assert.equal(g.tableau[1].length, 3);
  g.undo();
  assert.equal(g.tableau[0][0].up, false);
  assert.equal(g.tableau[0].length, 3);
});

test('an invalid stack (same colour) cannot move and leaves no history', () => {
  const g = fresh(); clear(g);
  g.tableau[0] = [card(12, '♥'), card(11, '♦')];
  g.tableau[1] = [card(13)];
  assert.equal(g.move(t(0, 0), t(1)), false);
  assert.equal(g.history.length, 0);
});

test('the game is won only when all four foundations are complete', () => {
  const g = fresh(); clear(g);
  g.foundations = ['♠', '♥', '♣', '♦'].map(s => Array.from({length: 13}, (_, i) => card(i + 1, s)));
  assert.equal(g.won, true);
  g.waste = [g.foundations[3].pop()];
  assert.equal(g.won, false);
  assert.equal(g.move(w, f(3)), true);
  assert.equal(g.won, true);
  g.undo();
  assert.equal(g.won, false);
});
