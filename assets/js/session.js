// Shared, in-memory desktop state. Nested desktop views use their root's session.
class DesktopState {
    constructor() {
        this.volume = 0.5;
        this.lastVolume = 0.5;
        this.eggs = new Set();
        this.listeners = new Set();
        this.views = new Map();
        this.seed = [];
        this.reset();
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    notify(kind = 'files') { this.listeners.forEach(fn => fn(kind)); }
    reset() {
        this.nodes = new Map(this.seed.map(n => [n.id, { ...n }]));
        this.trashed = new Set();
        this.starred = new Set();
        this.recent = [];
        this.notify('reset');
    }
    initialize(nodes) { if (!this.seed.length) { this.seed = nodes; this.reset(); } }
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, Number(value) || 0));
        if (this.volume) this.lastVolume = this.volume;
        this.notify('volume');
    }
    discover(id) {
        if (!['work', 'recursion', 'register'].includes(id) || this.eggs.has(id)) return;
        this.eggs.add(id); this.notify('eggs');
    }
    node(id) { return this.nodes.get(id); }
    unavailable(id) {
        let node = this.node(id);
        while (node) {
            if (this.trashed.has(node.id)) return true;
            node = this.node(node.parentId);
        }
        return false;
    }
    list(path, hidden = false) {
        let nodes;
        if (path === '/Trash') nodes = [...this.trashed].map(id => this.node(id));
        else if (path === '/Recent') nodes = this.recent.map(id => this.node(id));
        else if (path === '/Starred') nodes = [...this.starred].map(id => this.node(id));
        else nodes = [...this.nodes.values()].filter(n => n.parentId === path);
        return nodes.filter(n => n && (path === '/Trash' || !this.unavailable(n.id)) &&
            (hidden || path === '/Trash' || !n.name.startsWith('.')));
    }
    normalize(path = '~', cwd = '/') {
        let value = path.replace(/^\/home\/jordan(?=\/|$)/, '').replace(/^~(?=\/|$)/, '');
        if (path === '~' || path === '/home/jordan') return '/';
        if (path.startsWith('~') || path.startsWith('/home/jordan')) value = '/' + value.replace(/^\//, '');
        const parts = (value.startsWith('/') ? value : cwd + '/' + value).split('/');
        const clean = [];
        for (const part of parts) {
            if (!part || part === '.') continue;
            if (part === '..') clean.pop(); else clean.push(part);
        }
        return '/' + clean.join('/');
    }
    resolve(path, cwd = '/') {
        const id = this.normalize(path, cwd);
        let n = this.node(id);
        if (!n) {
            n = this.node('/');
            for (const part of id.split('/').filter(Boolean)) {
                n = n && [...this.nodes.values()].find(child => child.parentId === n.id &&
                    (child.name === part || child.id.split('/').at(-1) === part));
            }
        }
        return n && !this.unavailable(n.id) ? n : null;
    }
    target(node) { return node?.targetId ? this.node(node.targetId) : node; }
    read(node) {
        const target = this.target(node);
        if (!target || this.unavailable(target.id)) throw new Error('No such file or directory');
        if (target.type === 'folder') throw new Error('Is a directory');
        if (typeof target.content !== 'string') throw new Error('Binary file; open it in Files');
        return target.content;
    }
    opened(node) {
        // Aliases (the home-folder copies of Documents) count as their target so
        // Recent never lists one file twice.
        node = this.target(node) || node;
        if (!node || node.type === 'folder') return;
        this.recent = [node.id, ...this.recent.filter(id => id !== node.id)].slice(0, 60);
        this.notify();
    }
    star(id) {
        if (!this.node(id) || this.node(id).fixed || this.unavailable(id)) return;
        if (this.starred.has(id)) this.starred.delete(id); else this.starred.add(id);
        this.notify();
    }
    trash(id) {
        if (!this.node(id) || this.node(id).fixed || this.unavailable(id)) return false;
        this.trashed.add(id); this.notify(); return true;
    }
    restore(id) {
        let n = this.node(id);
        while (n) { this.trashed.delete(n.id); n = this.node(n.parentId); }
        this.notify();
    }
}

const parentDesktop = (() => {
    try {
        const host = window.parent !== window && window.parent.DesktopHost;
        return host && window.parent.location.origin === location.origin && host.child() === window ? host : null;
    } catch { return null; }
})();
const Session = parentDesktop ? parentDesktop.session : new DesktopState();
const DesktopHost = window.DesktopHost = {
    session: Session,
    root: parentDesktop ? parentDesktop.root : window,
    depth: parentDesktop ? parentDesktop.depth + 1 : 0,
    child: () => document.getElementById('browser-frame')?.contentWindow
};
Session.views.set(window, DesktopHost.depth);
window.addEventListener('pagehide', () => Session.views.delete(window));
