const ICON = name => '/assets/icons/yaru/' + name + '.png';
// Text from markup: trim each source line, keep single blank lines between paragraphs.
const lines = text => (text || '').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const Files = {
    path: '/Projects', history: ['/Projects'], index: 0, selected: null, showHidden: false,
    els() {
        return Object.fromEntries(['grid', 'empty', 'status', 'path', 'details', 'back', 'forward'].map(key =>
            [key, document.getElementById('files-' + key)]));
    },
    seed() {
        const nodes = [];
        const add = (id, type, extra = {}) => {
            const slash = id.lastIndexOf('/');
            nodes.push({ id, parentId: id === '/' ? null : id.slice(0, slash) || '/', name: id.slice(slash + 1) || 'Home', type, ...extra });
        };
        add('/', 'folder', { fixed: true });
        for (const name of ['Desktop', 'Documents', 'Downloads', 'Photos', 'Projects', 'posts', 'Trash']) add('/' + name, 'folder', { fixed: true });
        for (const name of ['Recent', 'Starred']) add('/' + name, 'folder', { fixed: true, parentId: null });
        for (const f of PROJECT_FOLDERS) {
            add('/Projects/' + f.id, 'folder');
            PROJECTS.filter(p => p.folder === f.id).forEach(p => add('/Projects/' + f.id + '/' + p.slug, 'project', { name: p.name, project: p, content: p.description }));
        }
        // The source windows are not rendered at seed time, so innerText keeps the
        // markup's indentation; trim each line instead.
        const text = selector => lines(document.querySelector(selector)?.textContent);
        const about = [...document.querySelectorAll('.about-text h2, .about-text p')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join('\n\n');
        add('/Documents/about.md', 'text', { content: about, app: 'about-window' });
        // contact.json is the Contact window's document; looking_for.txt is its "looking_for" lines.
        const contact = document.getElementById('contact-json').textContent.trim();
        add('/Documents/contact.json', 'text', { content: contact, app: 'contact-window' });
        add('/Documents/experience.txt', 'text', { content: text('#about-window pre') });
        add('/Documents/mission.txt', 'text', { content: text('#mission-text') });
        add('/Documents/looking_for.txt', 'text', { content: JSON.parse(contact).looking_for.join('\n') });
        add('/Documents/Resume.pdf', 'pdf', { url: LINKS.resume });
        for (const name of ['about.md', 'contact.json', 'mission.txt', 'looking_for.txt', 'Resume.pdf']) add('/' + name, 'alias', { targetId: '/Documents/' + name });
        add('/Downloads/secret.mp4', 'video');
        add('/Downloads/.notes.txt', 'text', { content: 'What do peons say all day?\nRecursiveness is dangerous.\nVivado hates this one trick.' });
        for (const photo of GALLERY_PHOTOS) add('/Photos/' + photo.name, 'photo', photo);
        document.getElementById('posts-data').content.querySelectorAll('.post-entry').forEach(a =>
            add('/posts/' + a.getAttribute('href').split('/').filter(Boolean).pop() + '.md', 'post',
                { name: a.textContent.trim(), date: a.dataset.date, url: a.getAttribute('href'), content: a.textContent.trim() + '\n' + a.getAttribute('href') }));
        document.querySelectorAll('.desktop-icon').forEach(icon => {
            const name = icon.querySelector('.icon-label').textContent;
            const id = '/Desktop/' + name;
            icon.dataset.entryId = id;
            icon.dataset.initialStyle = icon.getAttribute('style') || '';
            add(id, 'shortcut', { icon: icon.querySelector('img').getAttribute('src'),
                windowId: icon.dataset.window, path: icon.dataset.path, action: icon.dataset.action,
                fixed: icon.dataset.action === 'trash' });
        });
        Session.initialize(nodes);
    },
    list(path) { return Session.list(path, this.showHidden); },
    openPath(path) { openWindow('projects-window'); this.go(path); },
    go(path) {
        if (path !== this.path) {
            this.history = this.history.slice(0, this.index + 1);
            this.history.push(path); this.index = this.history.length - 1;
        }
        this.selected = null; this.render(path);
    },
    back() { if (this.index > 0) { this.selected = null; this.render(this.history[--this.index]); } },
    forward() { if (this.index < this.history.length - 1) { this.selected = null; this.render(this.history[++this.index]); } },
    // A project's primary action (paper, then repo, then site) decides how it opens.
    primary(project) { return project.paper ? 'paper' : project.repo ? 'repo' : project.site ? 'site' : null; },
    icon(node) {
        const n = Session.target(node);
        if (n.project) {
            const primary = this.primary(n.project);
            if (primary === 'paper') return ICON(/\.pdf(#|$)/.test(n.project.paper) ? 'application-pdf' : 'text-html');
            return ICON(primary === 'site' ? 'text-html' : 'folder');
        }
        return n.icon || ICON(({ folder: 'folder', text: 'text-markdown', pdf: 'application-pdf', post: 'text-markdown',
            video: 'video-x-generic', photo: 'folder-pictures' })[n.type] || 'folder');
    },
    render(path = this.path) {
        if (Session.unavailable(path)) path = '/';
        this.path = path;
        const el = this.els(); el.path.replaceChildren();
        const parts = path.split('/').filter(Boolean);
        const crumbs = [{ name: 'Home', path: '/' }]; let acc = '';
        for (const name of parts) { acc += '/' + name; crumbs.push({ name, path: acc }); }
        crumbs.forEach((crumb, i) => {
            if (i) { const sep = document.createElement('span'); sep.className = 'crumb-sep'; sep.textContent = '›'; el.path.append(sep); }
            const button = document.createElement('button'); button.className = 'crumb' + (i === crumbs.length - 1 ? ' current' : '');
            button.textContent = crumb.name; button.onclick = () => this.go(crumb.path); el.path.append(button);
        });
        el.path.scrollLeft = el.path.scrollWidth;
        el.back.disabled = this.index <= 0; el.forward.disabled = this.index >= this.history.length - 1;
        const items = this.list(path);
        el.grid.replaceChildren(...items.map(node => this.renderItem(node)));
        el.grid.hidden = !items.length; el.empty.hidden = !!items.length;
        document.getElementById('files-empty-sub').textContent = path === '/posts' ? 'First post coming.' : '';
        el.status.textContent = items.length + (items.length === 1 ? ' item' : ' items');
        document.querySelectorAll('.sb-item[data-path]').forEach(e => e.classList.toggle('current', e.dataset.path === path));
        document.getElementById('files-hidden').setAttribute('aria-pressed', String(this.showHidden));
        this.details();
    },
    renderItem(node) {
        const div = document.createElement('div'); div.className = 'fs-item fs-' + node.type;
        div.tabIndex = 0; div.setAttribute('role', 'button'); div.setAttribute('aria-label', node.name);
        div.dataset.entryId = node.id;
        if (node.project) div.dataset.project = node.project.id;
        if (node.id === this.selected) div.classList.add('selected');
        const wrap = document.createElement('div'); wrap.className = 'fs-icon';
        const img = document.createElement('img'); img.alt = ''; img.src = node.type === 'photo' ? node.thumbnail : this.icon(node); img.loading = 'lazy'; wrap.append(img);
        if (node.project && this.primary(node.project) === 'repo') {
            const emblem = document.createElement('span'); emblem.className = 'fs-repo-emblem'; emblem.textContent = 'git'; wrap.append(emblem);
        }
        const label = document.createElement('div'); label.className = 'fs-label'; label.textContent = node.name; div.append(wrap, label);
        if (node.type === 'folder') {
            const count = document.createElement('div'); count.className = 'fs-count'; count.textContent = Session.list(node.id, this.showHidden).length + ' items'; div.append(count);
        }
        const select = () => {
            this.selected = node.id;
            this.els().grid.querySelectorAll('.fs-item').forEach(e => e.classList.toggle('selected', e === div));
            this.details();
        };
        div.onclick = e => { e.stopPropagation(); select(); };
        div.ondblclick = e => { e.stopPropagation(); if (this.path !== '/Trash') this.open(node); };
        div.onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); select(); if (this.path !== '/Trash') this.open(node); }
            if (e.key === ' ') { e.preventDefault(); select(); }
            if (e.key === 'Delete') { e.preventDefault(); Session.trash(node.id); }
        };
        PointerDrag.bind(div, { itemId: () => node.id });
        return div;
    },
    details() {
        const el = this.els().details;
        const node = Session.node(this.selected);
        el.replaceChildren(); el.hidden = !node || (this.path !== '/Trash' && Session.unavailable(node.id));
        if (el.hidden) return;
        const n = Session.target(node);
        const head = document.createElement('div'); head.className = 'dt-head';
        const img = document.createElement('img'); img.alt = ''; img.src = n.type === 'photo' ? n.thumbnail : this.icon(node);
        const name = document.createElement('div'); name.className = 'dt-name'; name.textContent = node.name;
        const sub = document.createElement('div'); sub.className = 'dt-sub'; sub.textContent = n.project?.subtitle || node.date || (node.type === 'folder' ? Session.list(node.id).length + ' items' : node.type);
        head.append(img, name, sub); el.append(head);
        const close = document.createElement('button'); close.className = 'dt-close'; close.title = 'Close details'; close.textContent = '×'; close.onclick = () => { this.selected = null; this.details(); }; el.append(close);
        if (n.project) {
            const p = document.createElement('p'); p.className = 'dt-desc'; p.textContent = n.project.description; el.append(p);
            const tags = document.createElement('div'); tags.className = 'dt-tags';
            n.project.tags.forEach(t => { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = t; tags.append(chip); }); el.append(tags);
        }
        const actions = document.createElement('div'); actions.className = 'dt-actions'; el.append(actions);
        const button = (text, fn, primary = false) => { const b = document.createElement('button'); b.className = 'dt-btn' + (primary ? ' primary' : ''); b.textContent = text; b.onclick = fn; actions.append(b); };
        if (this.path === '/Trash') { button('Restore', () => Session.restore(node.id), true); return; }
        if (n.project) {
            const p = n.project;
            for (const [key, label] of [['paper', 'Open paper'], ['repo', 'Open on GitHub'], ['site', 'Open site']]) if (p[key]) button(label, () => { Session.opened(node); openUrl(p[key]); }, key === 'paper' || !p.paper && key === 'repo');
            if (!p.paper && !p.repo && !p.site) { const note = document.createElement('p'); note.className = 'dt-note'; note.textContent = 'Repository not public yet.'; actions.append(note); }
        } else button('Open', () => this.open(node), true);
        if (!node.fixed) {
            button(Session.starred.has(node.id) ? 'Remove from Starred' : 'Add to Starred', () => Session.star(node.id));
            button('Move to Trash', () => Session.trash(node.id));
        }
    },
    open(node) {
        const n = Session.target(node);
        if (!n || Session.unavailable(node.id) || Session.unavailable(n.id)) return;
        if (n.type === 'folder') { this.go(n.id); return; }
        // Record after dispatch so the current grid is not rebuilt between double-clicks.
        if (n.type === 'shortcut') {
            if (n.path) this.openPath(n.path);
            else if (n.windowId) openWindow(n.windowId);
            else openIconTarget({ getAttribute: key => key === 'data-action' ? n.action : null, dataset: {} });
        } else if (n.type === 'project') { const url = n.project.paper || n.project.repo || n.project.site; if (url) openUrl(url); }
        else if (n.type === 'photo') Gallery.open(n.id);
        else if (n.type === 'video') Media.show('video', true);
        else if (n.type === 'text') {
            if (n.app) openWindow(n.app);
            else { document.querySelector('#notes-window .window-title').textContent = n.name; document.getElementById('notes-content').textContent = n.content; openWindow('notes-window'); }
        } else if (n.url) openUrl(new URL(n.url, location.origin).href);
        Session.opened(node);
    },
    // Desktop icons sit on a 96x100 grid from (16,16), filled column by column.
    slotStyle(index) {
        const rows = Math.max(1, Math.floor((workArea().height - 16) / 100));
        return 'top: ' + (16 + (index % rows) * 100) + 'px; left: ' + (16 + Math.floor(index / rows) * 96) + 'px;';
    },
    syncDesktop(kind) {
        const icons = [...document.querySelectorAll('.desktop-icon')];
        const occupied = () => icons.filter(i => !i.hidden).map(i => Math.round(parseFloat(i.style.left)) + ',' + Math.round(parseFloat(i.style.top)));
        const key = style => { const m = /left:\s*([\d.]+)px.*?top:\s*([\d.]+)px|top:\s*([\d.]+)px.*?left:\s*([\d.]+)px/.exec(style); return m ? Math.round(m[1] ?? m[4]) + ',' + Math.round(m[2] ?? m[3]) : ''; };
        icons.forEach(icon => {
            const gone = Session.unavailable(icon.dataset.entryId);
            if (kind === 'reset') icon.setAttribute('style', icon.dataset.initialStyle);
            else if (gone && !icon.hidden) icon.setAttribute('style', icon.dataset.initialStyle);
            else if (!gone && icon.hidden) {
                // Restored: the original slot if free, else the first empty one.
                const taken = occupied();
                let style = icon.dataset.initialStyle;
                for (let i = 0; taken.includes(key(style)) && i < 200; i++) style = this.slotStyle(i);
                icon.setAttribute('style', style);
            }
            icon.hidden = gone;
        });
    },
    init() {
        this.seed();
        const el = this.els(); el.back.onclick = () => this.back(); el.forward.onclick = () => this.forward();
        document.querySelectorAll('.sb-item[data-path]').forEach(e => e.onclick = () => this.go(e.dataset.path));
        document.getElementById('files-hidden').onclick = () => { this.showHidden = !this.showHidden; this.render(); };
        el.grid.onclick = () => { this.selected = null; this.details(); };
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key.toLowerCase() === 'h' && activeWindow === 'projects-window') { e.preventDefault(); this.showHidden = !this.showHidden; this.render(); }
        });
        const unsubscribe = Session.subscribe(kind => {
            if (kind === 'volume' || kind === 'eggs') return;
            if (kind === 'reset') { this.path = '/Projects'; this.history = ['/Projects']; this.index = 0; this.selected = null; this.showHidden = false; }
            this.syncDesktop(kind); this.render();
        });
        window.addEventListener('pagehide', unsubscribe, { once: true });
        this.syncDesktop(); this.render();
    }
};
