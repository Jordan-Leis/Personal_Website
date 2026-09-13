// Klondike rules are independent of rendering so moves and undo can be verified.
class SolitaireGame {
    constructor(random = Math.random) {
        this.stock = []; this.waste = []; this.foundations = [[], [], [], []]; this.tableau = [[], [], [], [], [], [], []]; this.history = [];
        const deck = ['♠', '♥', '♣', '♦'].flatMap((suit, s) => Array.from({ length: 13 }, (_, i) => ({ id: s * 13 + i, suit, rank: i + 1, up: false })));
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        this.tableau.forEach((pile, i) => { for (let j = 0; j <= i; j++) pile.push(deck.pop()); pile.at(-1).up = true; });
        this.stock = deck;
    }
    save() { this.history.push(JSON.stringify({ stock: this.stock, waste: this.waste, foundations: this.foundations, tableau: this.tableau })); }
    undo() { if (!this.history.length) return false; Object.assign(this, JSON.parse(this.history.pop())); return true; }
    pile(ref) { return ref.type === 'tableau' ? this.tableau[ref.pile] : ref.type === 'foundation' ? this.foundations[ref.pile] : ref.type === 'waste' ? this.waste : null; }
    red(card) { return card.suit === '♥' || card.suit === '♦'; }
    draw() {
        if (!this.stock.length && !this.waste.length) return false;
        this.save();
        if (this.stock.length) { const card = this.stock.pop(); card.up = true; this.waste.push(card); }
        else { this.stock = this.waste.reverse(); this.stock.forEach(c => c.up = false); this.waste = []; }
        return true;
    }
    move(from, to) {
        const source = this.pile(from), destination = this.pile(to);
        if (!source || !destination || source === destination || to.type === 'waste') return false;
        const index = from.index ?? source.length - 1, cards = source.slice(index);
        if (index < 0 || !cards.length || cards.some(c => !c.up)) return false;
        if (from.type !== 'tableau' && cards.length !== 1) return false;
        for (let i = 1; i < cards.length; i++) if (cards[i - 1].rank !== cards[i].rank + 1 || this.red(cards[i - 1]) === this.red(cards[i])) return false;
        const card = cards[0], top = destination.at(-1);
        if (to.type === 'foundation') {
            if (cards.length !== 1 || (top ? top.suit !== card.suit || top.rank + 1 !== card.rank : card.rank !== 1)) return false;
        } else if (top ? top.rank !== card.rank + 1 || this.red(top) === this.red(card) : card.rank !== 13) return false;
        this.save(); destination.push(...source.splice(index));
        if (from.type === 'tableau' && source.length) source.at(-1).up = true;
        return true;
    }
    get won() { return this.foundations.every(pile => pile.length === 13); }
}
const Solitaire = {
    game: null, selected: null, ghost: null,
    init() {
        document.getElementById('game-new').onclick = () => this.reset();
        document.getElementById('game-undo').onclick = () => { this.game.undo(); this.selected = null; this.render(); };
        this.reset();
    },
    reset() { this.game = new SolitaireGame(); this.selected = null; this.ghost?.remove(); this.render(); },
    destination(ref) { if (this.selected && this.game.move(this.selected, ref)) { this.selected = null; this.render(); return true; } return false; },
    card(card, ref) {
        const el = document.createElement('button'); el.className = 'playing-card' + (!card.up ? ' card-back' : this.game.red(card) ? ' card-red' : '');
        const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank;
        el.textContent = card.up ? rank + card.suit : '◇'; el.setAttribute('aria-label', card.up ? rank + ' of ' + ({ '♠': 'spades', '♥': 'hearts', '♣': 'clubs', '♦': 'diamonds' })[card.suit] : 'Face-down card');
        el.dataset.cardId = card.id; el.dataset.pileType = ref.type; el.dataset.pile = ref.pile ?? 0; el.style.setProperty('--card-index', ref.index || 0);
        if (this.selected && ref.type === this.selected.type && ref.pile === this.selected.pile && ref.index >= this.selected.index) el.classList.add('card-selected');
        el.onclick = e => {
            e.stopPropagation(); if (!card.up) return;
            if (!this.destination(ref)) { this.selected = ref; this.render(); }
        };
        if (card.up) PointerDrag.bind(el, {
            start: () => { this.selected = ref; this.ghost = el.cloneNode(true); this.ghost.classList.add('card-ghost'); this.ghost.style.width = el.getBoundingClientRect().width + 'px'; document.body.append(this.ghost); },
            move: e => { this.ghost.style.left = e.clientX - 20 + 'px'; this.ghost.style.top = e.clientY - 20 + 'px'; },
            drop: (e, data, target) => { const pile = target?.closest('[data-pile-type]'); if (pile) this.destination({ type: pile.dataset.pileType, pile: Number(pile.dataset.pile) }); },
            end: () => { this.ghost?.remove(); this.ghost = null; }
        });
        return el;
    },
    pile(type, index, cards) {
        const el = document.createElement('div'); el.className = 'card-pile ' + type + '-pile'; el.dataset.pileType = type; el.dataset.pile = index;
        el.setAttribute('aria-label', type + ' ' + (index + 1)); el.tabIndex = 0; el.setAttribute('role', 'button');
        const empty = document.createElement('span'); empty.className = 'pile-empty'; empty.textContent = type === 'foundation' ? 'A' : type === 'tableau' ? 'K' : ''; el.append(empty);
        el.onclick = () => this.destination({ type, pile: index });
        el.onkeydown = e => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); } };
        if (type === 'tableau') {
            el.style.setProperty('--pile-count', Math.max(1, cards.length)); cards.forEach((c, i) => el.append(this.card(c, { type, pile: index, index: i })));
        } else if (cards.length) el.append(this.card(cards.at(-1), { type, pile: index, index: cards.length - 1 }));
        return el;
    },
    render() {
        if (!this.game) return;
        const board = document.getElementById('game-board'); board.replaceChildren();
        const top = document.createElement('div'); top.className = 'game-top';
        const stock = document.createElement('button'); stock.className = 'stock-pile playing-card' + (this.game.stock.length ? ' card-back' : ''); stock.id = 'game-stock';
        stock.textContent = this.game.stock.length ? '◇' : '↻'; stock.setAttribute('aria-label', this.game.stock.length ? 'Draw card' : 'Recycle stock');
        stock.onclick = () => { this.game.draw(); this.selected = null; this.render(); };
        top.append(stock, this.pile('waste', 0, this.game.waste), document.createElement('div'));
        this.game.foundations.forEach((cards, i) => top.append(this.pile('foundation', i, cards)));
        const tableau = document.createElement('div'); tableau.className = 'game-tableau';
        this.game.tableau.forEach((cards, i) => tableau.append(this.pile('tableau', i, cards))); board.append(top, tableau);
        document.getElementById('game-undo').disabled = !this.game.history.length;
        document.getElementById('game-status').textContent = this.game.won ? 'You won! All four foundations complete.' : 'Klondike · Draw one';
    }
};
