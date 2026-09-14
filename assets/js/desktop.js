// Global variables
let activeWindow = null;
let selectedIcon = null;

// The work area: everything below the top panel and beside the dock.
// Window and icon coordinates are relative to it.
function workArea() {
    return document.getElementById('desktop').getBoundingClientRect();
}

// Initialize window system
function initializeWindows() {
    const windows = document.querySelectorAll('.window');
    const dockItems = document.querySelectorAll('.dock-item[data-window]');

    // Set initial z-index values
    windows.forEach((window, index) => {
        window.style.zIndex = 1000 + index;
        if (window.classList.contains('active')) window.classList.add('is-open');
    });

    // Setup window controls
    windows.forEach(window => {
        const controls = window.querySelectorAll('.window-control');
        const header = window.querySelector('.window-header');

        // Window control actions
        controls.forEach(control => {
            control.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = control.getAttribute('data-action');
                const windowId = window.id;

                switch(action) {
                    case 'close':
                        closeWindow(windowId);
                        break;
                    case 'minimize':
                        minimizeWindow(windowId);
                        break;
                    case 'maximize':
                        toggleMaximize(windowId);
                        break;
                }
            });
        });

        PointerDrag.bind(header, {
            ignore: e => e.target.closest('.window-control, button, a, input, .hb-btn') || window.classList.contains('maximized'),
            prepare: () => { const r = window.getBoundingClientRect(), area = workArea(); return { left: r.left - area.left, top: r.top - area.top }; },
            start: () => bringToFront(window),
            move: (e, start, dx, dy) => {
                const area = workArea(), rect = window.getBoundingClientRect();
                window.style.left = Math.max(0, Math.min(start.left + dx, Math.max(0, area.width - rect.width))) + 'px';
                window.style.top = Math.max(0, Math.min(start.top + dy, area.height - 46)) + 'px';
                window.style.right = 'auto'; window.style.transform = 'none';
            }
        });

        // Double-click the header bar to maximize, like GNOME
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-control, button, a, input, .hb-btn')) return;
            toggleMaximize(window.id);
        });

        // Click to focus
        window.addEventListener('pointerdown', () => {
            bringToFront(window);
        });
    });

    // Dock clicks: open/raise, or minimize when already focused
    document.querySelectorAll('.dock-item[data-action]:not([data-window])').forEach(item => {
        item.addEventListener('click', () => openIconTarget(item));
    });
    dockItems.forEach(item => {
        item.addEventListener('click', () => {
            const windowId = item.getAttribute('data-window');
            const window = document.getElementById(windowId);
            if (window.classList.contains('active') && activeWindow === windowId) {
                minimizeWindow(windowId);
            } else {
                openWindow(windowId);
            }
        });
    });

    // Initial state
    bringToFront(document.getElementById('hero-window'));
    updateDock();
}

// Window management functions
function focusVisibleWindow() {
    const visible = Array.from(document.querySelectorAll('.window.active'))
        .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    activeWindow = null;
    if (visible.length) bringToFront(visible[0]);
}

function bringToFront(window) {
    let maxZ = 1000;
    document.querySelectorAll('.window').forEach(w => {
        const z = parseInt(w.style.zIndex || 1000);
        if (z > maxZ) maxZ = z;
        w.classList.remove('focused');
    });

    window.style.zIndex = maxZ + 1;
    window.classList.add('focused');
    activeWindow = window.id;
    updateDock();
}

function openWindow(windowId, { navigateHome = true } = {}) {
    const window = document.getElementById(windowId);
    window.classList.remove('minimized');
    window.classList.add('active', 'is-open');
    bringToFront(window);
    if (windowId === 'music-window' || windowId === 'video-window') Media.prepare(windowId);
    if (windowId === 'browser-window' && navigateHome && Browser.history.length === 0) {
        Browser.navigate(BROWSER_HOME);
    }
}

function closeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active', 'focused', 'is-open');
    window.classList.add('minimized');
    if (windowId === 'browser-window') Browser.reset();
    if (windowId === 'music-window' || windowId === 'video-window') Media.close(windowId);
    if (PointerDrag.active?.element.closest('.window') === window) PointerDrag.stop();

    if (activeWindow === windowId) {
        focusVisibleWindow();
    }
    updateDock();
}

function minimizeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active', 'focused');
    window.classList.add('minimized');

    if (activeWindow === windowId) {
        focusVisibleWindow();
    }
    updateDock();
}

function toggleMaximize(windowId) {
    const window = document.getElementById(windowId);

    if (window.classList.contains('maximized')) {
        window.classList.remove('maximized');
        window.style.width = '';
        window.style.height = '';
        window.style.top = '';
        window.style.left = '';
        window.style.right = '';
        window.style.transform = '';
    } else {
        window.classList.add('maximized');
        window.style.width = '100%';
        window.style.height = '100%';
        window.style.top = '0';
        window.style.left = '0';
        window.style.right = 'auto';
        window.style.transform = 'none';
    }
}

function toggleWindow(windowId) {
    const window = document.getElementById(windowId);

    if (window.classList.contains('active')) {
        minimizeWindow(windowId);
    } else {
        openWindow(windowId);
    }
}

function updateDock() {
    document.querySelectorAll('.dock-item[data-window]').forEach(item => {
        const windowId = item.getAttribute('data-window');
        const window = document.getElementById(windowId);

        item.classList.remove('running', 'focused');

        if (window.classList.contains('is-open')) {
            item.classList.add('running');
            if (activeWindow === windowId) {
                item.classList.add('focused');
            }
        }
    });
}

// Desktop icons functionality
function initializeDesktopIcons() {
    const icons = document.querySelectorAll('.desktop-icon');

    icons.forEach(icon => {
        // Double-click to open
        icon.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openIconTarget(icon);
        });

        // Single click to select
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectIcon(icon);
        });

        icon.tabIndex = 0;
        icon.setAttribute('role', 'button');
        icon.setAttribute('aria-label', icon.querySelector('.icon-label').textContent);
        icon.addEventListener('keydown', e => {
            if (e.key === 'Enter') openIconTarget(icon);
            if (e.key === 'Delete') { e.preventDefault(); Session.trash(icon.dataset.entryId); }
        });
        icon.addEventListener('contextmenu', e => {
            e.preventDefault(); Files.openPath('/Desktop');
            const item = Files.els().grid.querySelector('[data-entry-id="' + CSS.escape(icon.dataset.entryId) + '"]');
            item?.click();
        });
        PointerDrag.bind(icon, {
            itemId: () => icon.dataset.entryId,
            prepare: () => { const r = icon.getBoundingClientRect(), area = workArea(); return { left: r.left - area.left, top: r.top - area.top }; },
            move: (e, start, dx, dy) => {
                if (getComputedStyle(icon).position !== 'absolute') return;
                const area = workArea(), r = icon.getBoundingClientRect();
                let x = Math.max(0, Math.min(start.left + dx, area.width - r.width));
                let y = Math.max(0, Math.min(start.top + dy, area.height - r.height));
                const snapX = Math.round((x - 16) / 96) * 96 + 16, snapY = Math.round((y - 16) / 100) * 100 + 16;
                if (Math.abs(x - snapX) < 16) x = Math.max(0, snapX);
                if (Math.abs(y - snapY) < 16) y = Math.max(0, snapY);
                icon.style.left = x + 'px'; icon.style.top = y + 'px';
            }
        });
    });

    // Global click to deselect
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.desktop-icon')) {
            deselectAllIcons();
        }
    });

}

function selectIcon(icon) {
    deselectAllIcons();
    icon.classList.add('selected');
    selectedIcon = icon;
}

function deselectAllIcons() {
    document.querySelectorAll('.desktop-icon').forEach(icon => {
        icon.classList.remove('selected');
    });
    selectedIcon = null;
}

// Desktop icons and app-grid launchers share this
function openIconTarget(icon) {
    if (icon.dataset.path) { Files.openPath(icon.dataset.path); return; }
    if (icon.dataset.entryId) Session.opened(Session.node(icon.dataset.entryId));
    const windowId = icon.getAttribute('data-window');
    const action = icon.getAttribute('data-action');

    if (windowId) {
        openWindow(windowId);
    } else if (action) {
        switch(action) {
            case 'resume':
                openUrl(LINKS.resume);
                break;
            case 'github':
                openUrl(LINKS.github);
                break;
            case 'linkedin':
                openUrl(LINKS.linkedin);
                break;
            case 'blog':
                openUrl(BROWSER_HOME);
                break;
            case 'browser':
                openWindow('browser-window');
                break;
            case 'terminal':
                openWindow('hero-window');
                break;
            case 'trash':
                openWindow('projects-window');
                Files.go('/Trash');
                break;
        }
    }
}

// Contact links share the desktop browser routing.
function initializeContactLinks() {
    document.querySelectorAll('#contact-window a[href]').forEach(link => {
        link.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            openUrl(link.href);
        });
    });
}

// Links that leave the desktop
const LINKS = {
    resume: 'https://drive.google.com/file/d/1jHbSPjZX3hLAVGLmC30Kj_MwDdtXkR9Z/view?usp=sharing',
    github: 'https://github.com/Jordan-Leis',
    linkedin: 'https://www.linkedin.com/in/jordan-leis/'
};
const BROWSER_HOME = location.origin + '/blog/';

// Hosts that refuse to be framed (X-Frame-Options / frame-ancestors).
// These open in a real tab instead of the browser window.
const NO_EMBED = ['linkedin.com'];

// The in-desktop browser. The address bar always shows the real URL;
// the iframe loads whatever `resolve` maps it to.
const Browser = {
    history: [],
    index: -1,
    loadTimer: null,

    els() {
        return {
            win: document.getElementById('browser-window'),
            frame: document.getElementById('browser-frame'),
            address: document.getElementById('browser-address'),
            title: document.getElementById('browser-tab-title'),
            external: document.getElementById('browser-external'),
            back: document.getElementById('browser-back'),
            forward: document.getElementById('browser-forward'),
            reload: document.getElementById('browser-reload'),
            loading: document.getElementById('browser-loading'),
            fallback: document.getElementById('browser-fallback'),
            fallbackLink: document.getElementById('browser-fallback-link')
        };
    },

    // github.com can't be framed; github1s.com renders the same repo.
    // Drive's /view page can't either; its /preview page can.
    resolve(url) {
        let u;
        try { u = new URL(url); } catch (e) { return url; }
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'jordanleis.com') u = new URL(u.pathname + u.search + u.hash, location.origin);
        if (u.origin === location.origin && ['/', '/index.html'].includes(u.pathname)) {
            // Distinct URLs let browsers render bounded, real nested documents.
            u.searchParams.set('desktop-depth', DesktopHost.depth + 1);
            return u.href;
        }
        if (host === 'jordanleis.com') return u.href;
        if (host === 'github.com') {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts.length === 1) return 'https://github1s.com/' + parts[0] + '/' + parts[0];
            return 'https://github1s.com' + u.pathname;
        }
        if (host === 'drive.google.com') {
            const m = u.pathname.match(/^\/file\/d\/([^/]+)/);
            if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
        }
        return url;
    },

    canEmbed(url) {
        try {
            const host = new URL(url).hostname.replace(/^www\./, '');
            return !NO_EMBED.some(h => host === h || host.endsWith('.' + h));
        } catch (e) { return false; }
    },

    display(url) {
        return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    },

    hostname(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
    },

    navigate(url) {
        const target = new URL(this.resolve(url), location.origin);
        if (target.origin === location.origin && ['/', '/index.html'].includes(target.pathname) && DesktopHost.depth >= 2) {
            DesktopHost.root.postMessage({ type: 'desktop:recursion' }, location.origin); return;
        }
        this.history = this.history.slice(0, this.index + 1);
        this.history.push(url);
        this.index = this.history.length - 1;
        this.load(url);
    },

    load(url) {
        const el = this.els();
        if (!el.frame) return;
        el.address.value = this.display(url);
        el.title.textContent = this.hostname(url);
        el.external.href = url;
        el.fallbackLink.href = url;
        el.fallback.classList.remove('on');
        el.loading.classList.add('on');
        clearTimeout(this.loadTimer);
        this.loadTimer = setTimeout(() => this.fail(), 15000);
        el.frame.src = this.resolve(url);
        this.updateNav();
    },

    fail() {
        if (this.index < 0) return;
        clearTimeout(this.loadTimer);
        const el = this.els();
        el.loading.classList.remove('on');
        el.fallback.classList.add('on');
    },

    // Same-origin pages (the blog) report where they went; the address
    // bar follows. Cross-origin frames keep whatever was last set.
    onLoad() {
        if (this.index < 0) return;
        const el = this.els();
        let href, title;
        try {
            href = el.frame.contentWindow.location.href;
            title = el.frame.contentDocument && el.frame.contentDocument.title;
        } catch (e) {
            clearTimeout(this.loadTimer);
            el.loading.classList.remove('on');
            el.fallback.classList.remove('on');
            return;
        }
        if (!href || href === 'about:blank') return;
        if (href === this.resolve(this.history[this.index])) href = this.history[this.index];
        clearTimeout(this.loadTimer);
        el.loading.classList.remove('on');
        el.fallback.classList.remove('on');
        if (href !== this.history[this.index]) {
            this.history = this.history.slice(0, this.index + 1);
            this.history.push(href);
            this.index = this.history.length - 1;
        }
        // Don't clobber an address the visitor is typing.
        if (document.activeElement !== el.address) el.address.value = this.display(href);
        el.title.textContent = title || this.hostname(href);
        el.external.href = href;
        el.fallbackLink.href = href;
        this.updateNav();
    },

    back() {
        if (this.index <= 0) return;
        this.index -= 1;
        this.load(this.history[this.index]);
    },

    forward() {
        if (this.index >= this.history.length - 1) return;
        this.index += 1;
        this.load(this.history[this.index]);
    },

    reload() {
        if (this.index >= 0) this.load(this.history[this.index]);
    },

    // Closing the window blanks the frame so nothing keeps running
    reset() {
        const el = this.els();
        if (!el.frame) return;
        clearTimeout(this.loadTimer);
        this.history = [];
        this.index = -1;
        el.frame.removeAttribute('src');
        el.address.value = '';
        el.external.removeAttribute('href');
        el.fallbackLink.removeAttribute('href');
        el.title.textContent = 'New Tab';
        el.loading.classList.remove('on');
        el.fallback.classList.remove('on');
        this.updateNav();
    },

    updateNav() {
        const el = this.els();
        el.back.disabled = this.index <= 0;
        el.forward.disabled = this.index >= this.history.length - 1;
    },

    init() {
        const el = this.els();
        if (!el.frame) return;
        el.frame.addEventListener('load', () => this.onLoad());
        el.frame.addEventListener('error', () => this.fail());
        el.back.addEventListener('click', () => this.back());
        el.forward.addEventListener('click', () => this.forward());
        el.reload.addEventListener('click', () => this.reload());
        document.getElementById('browser-location').onsubmit = e => {
            e.preventDefault(); let value = el.address.value.trim();
            if (!value) return;
            // A bare host gets https; the displayed form of this site's own address stays on this origin.
            if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('/')) {
                value = (value === location.host || value.startsWith(location.host + '/') ? location.protocol + '//' : 'https://') + value;
            }
            try { openUrl(new URL(value, location.origin).href); } catch { el.address.value = this.history[this.index] || ''; }
            el.address.blur();
        };
    }
};

// Every link on the desktop goes through here.
function openUrl(url) {
    if (typeof url !== 'string' || !url) return;
    if (url.startsWith('mailto:')) {
        window.location.href = url;
        return;
    }
    // Relative site paths (e.g. a project's `site: '/linxicon-solver/'`) resolve against this origin.
    try { url = new URL(url, location.origin).href; } catch { return; }
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return;
    if (!Browser.canEmbed(url)) {
        window.open(url, '_blank', 'noopener');
        return;
    }
    openWindow('browser-window', { navigateHome: false });
    Browser.navigate(url);
}

// index.html?open=/blog/some-post/ opens the browser on a same-origin page
function deepLinkTarget() {
    const path = new URLSearchParams(location.search).get('open');
    if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
    try {
        const target = new URL(path, location.origin);
        return target.origin === location.origin ? target.href : null;
    } catch (e) {
        return null;
    }
}

// The terminal's `tree ~/work` output, from the same data
function renderWorkTree() {
    const pre = document.getElementById('work-tree');
    if (!pre) return;
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const pad = (t, n) => t + ' '.repeat(Math.max(1, n - t.length));
    const lines = [];
    PROJECT_FOLDERS.forEach((f, i) => {
        if (i > 0) lines.push('');
        lines.push('<span class="success">' + pad('~/' + f.id + '/', 21) + '</span><span class="dir-comment"># ' + esc(f.comment) + '</span>');
        PROJECTS.filter(p => p.folder === f.id).forEach(p => {
            const name = '<span class="success">' + p.slug + '/</span>';
            lines.push('  ' + (p.note ? name + ' '.repeat(Math.max(1, 21 - p.slug.length - 1)) + esc(p.note) : name));
        });
    });
    pre.innerHTML = lines.join('\n');
}

// Panel clock: "Sep 12  12:50"
function updateClock() {
    const now = new Date();
    const clock = document.getElementById('panel-clock');
    if (!clock) return;

    const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    clock.textContent = dateString + '  ' + timeString;
}

// App grid (Activities / Show Applications)
function initializeAppGrid() {
    const grid = document.getElementById('app-grid');
    const activities = document.getElementById('activities');
    const showApps = document.getElementById('show-apps');
    if (!grid) return;

    const setOpen = (open) => {
        grid.classList.toggle('open', open);
        if (activities) activities.classList.toggle('open', open);
    };
    const toggle = () => setOpen(!grid.classList.contains('open'));

    if (activities) activities.addEventListener('click', toggle);
    if (showApps) showApps.addEventListener('click', toggle);

    grid.addEventListener('click', (e) => {
        if (e.target === grid) setOpen(false);
    });

    grid.querySelectorAll('.app-launcher').forEach(launcher => {
        launcher.addEventListener('click', () => {
            setOpen(false);
            openIconTarget(launcher);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && grid.classList.contains('open')) {
            e.stopImmediatePropagation();
            setOpen(false);
        }
    }, true);
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    Apps.init();
    Files.init();
    PointerDrag.init();
    initializeWindows();
    initializeDesktopIcons();
    initializeContactLinks();
    initializeAppGrid();
    Browser.init();
    renderWorkTree();
    Terminal.init();
    Media.init();
    Solitaire.init();
    SystemUI.init();

    // Start clock
    const clockTimer = setInterval(updateClock, 1000);
    window.addEventListener('pagehide', () => clearInterval(clockTimer), { once: true });
    updateClock();

    // Start with all windows closed except main terminal
    document.querySelectorAll('.window:not(.hero-window)').forEach(window => {
        closeWindow(window.id);
    });

    Terminal.prepare();
    Boot.run().then(() => {
        Terminal.introduce();
        const target = deepLinkTarget();
        if (target) openUrl(target);
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        const activeWindows = Array.from(document.querySelectorAll('.window.is-open'));
        if (activeWindows.length > 0) {
            const currentIndex = activeWindows.findIndex(w => w.id === activeWindow);
            const nextIndex = (currentIndex + 1) % activeWindows.length;
            openWindow(activeWindows[nextIndex].id);
        }
    }

    if (e.key === 'Escape' && activeWindow && !e.defaultPrevented) {
        closeWindow(activeWindow);
    }
});
