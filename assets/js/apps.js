const Apps = {
    window(id, title, body, classes = '') {
        const win = document.createElement('div'); win.id = id; win.className = 'window extra-window ' + classes;
        const header = document.querySelector('#about-window .window-header').cloneNode(true);
        header.querySelector('.window-title').textContent = title;
        const content = document.createElement('div'); content.className = 'window-content'; content.innerHTML = body;
        win.append(header, content); document.getElementById('desktop').append(win);
        return win;
    },
    launcher(name, iconName, attrs, desktop = true) {
        const image = '/assets/icons/yaru/' + iconName + '.png';
        const make = cls => {
            const el = document.createElement('div'); el.className = cls;
            const img = document.createElement('img'); img.src = image; img.alt = '';
            Object.assign(el.dataset, attrs); el.append(img);
            if (cls === 'desktop-icon') { img.className = 'icon-image'; const label = document.createElement('div'); label.className = 'icon-label'; label.textContent = name; el.append(label); }
            else { el.append(document.createTextNode(name)); el.tabIndex = 0; el.setAttribute('role', 'button'); }
            return el;
        };
        document.querySelector('.app-grid-inner').append(make('app-launcher'));
        if (desktop) {
            const el = make('desktop-icon'); const index = document.querySelectorAll('.desktop-icon').length - 9;
            el.style.left = (208 + Math.floor(index / 5) * 96) + 'px'; el.style.top = (16 + (index % 5) * 100) + 'px';
            document.querySelector('.desktop-icons').append(el);
        }
    },
    init() {
        this.window('notes-window', 'Text Editor', '<pre id="notes-content"></pre>', 'editor-app');
        this.window('photo-window', 'Image Viewer', '<div class="photo-toolbar"><button id="photo-prev" aria-label="Previous photo">‹</button><span id="photo-name"></span><button id="photo-next" aria-label="Next photo">›</button></div><div class="photo-stage"><img id="photo-image" alt=""></div>', 'photo-app');
        for (const [id, title] of [['music', 'Music'], ['video', 'Videos']]) {
            this.window(id + '-window', title, `<div id="${id}-player" class="youtube-stage"><button class="media-start" data-media="${id}">Play ${id === 'music' ? 'playlist' : 'video'}</button></div>
                <div class="media-info" id="${id}-info">${id === 'music' ? 'mem · YouTube playlist' : 'secret.mp4'}</div>
                <div class="media-controls"><button data-media-action="previous" data-player="${id}" aria-label="Previous track">⏮</button><button data-media-action="play" data-player="${id}" aria-label="Play or pause">▶</button><button data-media-action="next" data-player="${id}" aria-label="Next track">⏭</button><input type="range" min="0" max="100" value="0" data-media-seek="${id}" aria-label="Playback position"><span id="${id}-time">0:00</span></div>
                <p class="media-message" id="${id}-message">Press Play to start.</p><a class="media-external" id="${id}-external" target="_blank" rel="noopener">Open ${id === 'music' ? 'playlist' : 'video'} on YouTube ↗</a>`, 'media-app');
        }
        this.window('solitaire-window', 'Solitaire', '<div class="game-toolbar"><button id="game-new">New Game</button><button id="game-undo" disabled>Undo</button><span id="game-status" aria-live="polite">Klondike · Draw one</span></div><div id="game-board" class="game-board" aria-label="Solitaire table"></div>', 'solitaire-app');
        for (const [name, icon] of [['Desktop', 'user-desktop'], ['Documents', 'folder-documents'], ['Downloads', 'folder-download'], ['Photos', 'folder-pictures']]) this.launcher(name, icon, { path: '/' + name });
        this.launcher('Music', 'audio-x-generic', { window: 'music-window' });
        this.launcher('Solitaire', 'applications-games', { window: 'solitaire-window' });
        // New app-grid entries use the same keyboard activation as clicks.
        document.querySelectorAll('.app-launcher, .dock-item, #activities').forEach(el => {
            el.tabIndex = 0; el.setAttribute('role', 'button');
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
        });
        document.querySelectorAll('.window-control').forEach(el => {
            el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', el.title);
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
        });
        document.getElementById('files-trash').onclick = () => Files.go('/Trash');
    }
};

const SystemUI = {
    init() {
        const toggle = document.getElementById('system-toggle'), menu = document.getElementById('system-menu');
        const setOpen = on => { menu.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); };
        toggle.onclick = () => setOpen(menu.hidden);
        document.addEventListener('click', e => { if (!menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !menu.hidden) { setOpen(false); e.preventDefault(); e.stopImmediatePropagation(); toggle.focus(); }
        }, true);
        const slider = document.getElementById('system-volume');
        slider.oninput = () => Session.setVolume(slider.value / 100);
        document.getElementById('system-mute').onclick = () => Session.setVolume(Session.volume ? 0 : Session.lastVolume);
        const tracker = document.getElementById('egg-tracker');
        tracker.onclick = () => { if (Session.eggs.size === 3) Media.show('video', true); };
        const sync = () => {
            slider.value = Math.round(Session.volume * 100); document.getElementById('volume-value').textContent = slider.value + '%';
            document.getElementById('system-mute').textContent = Session.volume ? '♪' : '×';
            document.getElementById('system-mute').setAttribute('aria-label', Session.volume ? 'Mute' : 'Unmute');
            tracker.hidden = Session.eggs.size === 0; tracker.textContent = 'Easter eggs: ' + Session.eggs.size + '/3';
            document.body.classList.toggle('has-eggs', Session.eggs.size > 0);
            tracker.classList.toggle('complete', Session.eggs.size === 3);
            tracker.setAttribute('aria-disabled', String(Session.eggs.size !== 3));
        };
        const unsubscribe = Session.subscribe(sync); window.addEventListener('pagehide', unsubscribe, { once: true }); sync();
    }
};
