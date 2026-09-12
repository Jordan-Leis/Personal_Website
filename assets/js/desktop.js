// Global variables
let activeWindow = null;
let dragData = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    element: null
};
let selectedIcon = null;
let iconDragData = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    element: null
};

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

        // Make window draggable
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control')) return;
            if (window.classList.contains('maximized')) return;

            startDrag(e, window);
            bringToFront(window);
        });

        // Double-click the header bar to maximize, like GNOME
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-control')) return;
            toggleMaximize(window.id);
        });

        // Click to focus
        window.addEventListener('mousedown', () => {
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

    // Global mouse events for dragging
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);

    // Initial state
    bringToFront(document.getElementById('hero-window'));
    updateDock();
}

// Window drag functions
function startDrag(e, window) {
    dragData.isDragging = true;
    dragData.element = window;
    dragData.startX = e.clientX;
    dragData.startY = e.clientY;

    const rect = window.getBoundingClientRect();
    const area = workArea();
    dragData.startLeft = rect.left - area.left;
    dragData.startTop = rect.top - area.top;

    window.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
}

function handleDrag(e) {
    if (!dragData.isDragging || !dragData.element) return;

    const deltaX = e.clientX - dragData.startX;
    const deltaY = e.clientY - dragData.startY;

    let newLeft = dragData.startLeft + deltaX;
    let newTop = dragData.startTop + deltaY;

    // Keep the header bar reachable inside the work area
    const windowRect = dragData.element.getBoundingClientRect();
    const area = workArea();
    const maxLeft = area.width - windowRect.width;
    const maxTop = area.height - 46;

    newLeft = Math.max(Math.min(0, maxLeft), Math.min(newLeft, Math.max(0, maxLeft)));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    dragData.element.style.left = newLeft + 'px';
    dragData.element.style.top = newTop + 'px';
    dragData.element.style.right = 'auto';
    dragData.element.style.transform = 'none';
}

function stopDrag() {
    if (dragData.element) {
        dragData.element.style.cursor = '';
    }
    document.body.style.userSelect = '';
    dragData.isDragging = false;
    dragData.element = null;
}

// Window management functions
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

function openWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('minimized');
    window.classList.add('active');
    bringToFront(window);
    if (windowId === 'browser-window' && Browser.history.length === 0) {
        Browser.navigate(BROWSER_HOME);
    }
}

function closeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active', 'focused');
    window.classList.add('minimized');
    if (windowId === 'browser-window') Browser.reset();

    if (activeWindow === windowId) {
        const openWindows = document.querySelectorAll('.window.active');
        if (openWindows.length > 0) {
            bringToFront(openWindows[0]);
        } else {
            activeWindow = null;
        }
    }
    updateDock();
}

function minimizeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active', 'focused');
    window.classList.add('minimized');

    if (activeWindow === windowId) {
        activeWindow = null;
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

        if (window.classList.contains('active')) {
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

        // Drag functionality
        icon.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                startIconDrag(e, icon);
                selectIcon(icon);
            }
        });
    });

    // Global click to deselect
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.desktop-icon')) {
            deselectAllIcons();
        }
    });

    // Global mouse events for icon dragging
    document.addEventListener('mousemove', handleIconDrag);
    document.addEventListener('mouseup', stopIconDrag);
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
                break;
        }
    }
}

function startIconDrag(e, icon) {
    iconDragData.isDragging = true;
    iconDragData.element = icon;
    iconDragData.startX = e.clientX;
    iconDragData.startY = e.clientY;

    const rect = icon.getBoundingClientRect();
    const area = workArea();
    iconDragData.startLeft = rect.left - area.left;
    iconDragData.startTop = rect.top - area.top;

    icon.style.cursor = 'grabbing';
    icon.style.zIndex = '1000';
    document.body.style.userSelect = 'none';
}

function handleIconDrag(e) {
    if (!iconDragData.isDragging || !iconDragData.element) return;
    if (window.getComputedStyle(iconDragData.element).position !== 'absolute') return;

    const deltaX = e.clientX - iconDragData.startX;
    const deltaY = e.clientY - iconDragData.startY;

    let newLeft = iconDragData.startLeft + deltaX;
    let newTop = iconDragData.startTop + deltaY;

    // Boundary constraints
    const desktopRect = workArea();
    const iconRect = iconDragData.element.getBoundingClientRect();

    newLeft = Math.max(0, Math.min(newLeft, desktopRect.width - iconRect.width));
    newTop = Math.max(0, Math.min(newTop, desktopRect.height - iconRect.height));

    // Grid snapping (matches the 96x100 icon grid)
    const snappedLeft = Math.round((newLeft - 16) / 96) * 96 + 16;
    const snappedTop = Math.round((newTop - 16) / 100) * 100 + 16;

    if (Math.abs(newLeft - snappedLeft) < 20) newLeft = snappedLeft;
    if (Math.abs(newTop - snappedTop) < 20) newTop = snappedTop;

    iconDragData.element.style.left = newLeft + 'px';
    iconDragData.element.style.top = newTop + 'px';
}

function stopIconDrag() {
    if (iconDragData.element) {
        iconDragData.element.style.cursor = '';
        iconDragData.element.style.zIndex = '';
    }
    document.body.style.userSelect = '';
    iconDragData.isDragging = false;
    iconDragData.element = null;
}

// Project card clicks
function initializeProjectCards() {
    document.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
            const url = card.getAttribute('data-url');
            if (url && url !== '#') {
                openUrl(url);
            }
        });
    });

    document.querySelectorAll('.post-entry').forEach(entry => {
        entry.addEventListener('click', (e) => {
            e.preventDefault();
            openUrl(entry.href);
        });
    });
}

// Contact card clicks
function initializeContactCards() {
    document.querySelectorAll('.contact-card').forEach(card => {
        card.addEventListener('click', () => {
            const url = card.getAttribute('data-url');
            if (url) {
                if (url.startsWith('mailto:')) {
                    window.location.href = url;
                } else {
                    openUrl(url);
                }
            }
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
        this.history = this.history.slice(0, this.index + 1);
        this.history.push(url);
        this.index = this.history.length - 1;
        this.load(url);
    },

    load(url) {
        const el = this.els();
        if (!el.frame) return;
        el.address.textContent = this.display(url);
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
        const el = this.els();
        el.loading.classList.remove('on');
        el.fallback.classList.add('on');
    },

    // Same-origin pages (the blog) report where they went; the address
    // bar follows. Cross-origin frames keep whatever was last set.
    onLoad() {
        const el = this.els();
        clearTimeout(this.loadTimer);
        el.loading.classList.remove('on');
        let href, title;
        try {
            href = el.frame.contentWindow.location.href;
            title = el.frame.contentDocument && el.frame.contentDocument.title;
        } catch (e) { return; }
        if (!href || href === 'about:blank') return;
        if (href !== this.history[this.index]) {
            this.history = this.history.slice(0, this.index + 1);
            this.history.push(href);
            this.index = this.history.length - 1;
        }
        el.address.textContent = this.display(href);
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
        el.address.textContent = '';
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
        el.back.addEventListener('click', () => this.back());
        el.forward.addEventListener('click', () => this.forward());
        el.reload.addEventListener('click', () => this.reload());
    }
};

// Every link on the desktop goes through here.
function openUrl(url) {
    if (url.startsWith('mailto:')) {
        window.location.href = url;
        return;
    }
    if (!Browser.canEmbed(url)) {
        window.open(url, '_blank', 'noopener');
        return;
    }
    openWindow('browser-window');
    Browser.navigate(url);
}

// index.html?open=/blog/some-post/ opens the browser on a same-origin page
function deepLinkTarget() {
    const path = new URLSearchParams(location.search).get('open');
    if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
    return location.origin + path;
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

// Boot sequence + hello line
// Edit these arrays to change what plays on first visit.
// A line starting with "[  OK  ]" gets the green systemd treatment.
const BOOT_LINES = [
    ['[  OK  ] Started JORDAN-OS v3B (University of Waterloo build).', 350],
    ['[  OK  ] Found device Zynq UltraScale+ MPSoC. Fabric online.', 300],
    ['[  OK  ] Loaded kernel modules: research.ko ml.ko software.ko hardware.ko.', 400],
    ['[  OK  ] Mounted /home/jordan/hardware.', 200],
    ['[  OK  ] Mounted /home/jordan/research.', 200],
    ['[  OK  ] Mounted /home/jordan/software.', 200],
    ['[  OK  ] Mounted /home/jordan/posts.', 250],
    ['[  OK  ] Reached target Timing Closure. No phys_opt_design required.', 350],
    ['         Starting Display Manager...', 400]
];
const HELLO_PREFIX = "Hi, I'm Jordan. ";
const HELLO_ROLES = [
    "I'm a research engineer.",
    "I'm a hardware engineer.",
    "I'm a software engineer.",
    "I'm an ML engineer."
];
const HELLO_FINAL = "I like to build.";
const TYPE_MS = 35, DELETE_MS = 15, HOLD_MS = 650;

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sessionFlag(key, value) {
    try {
        if (value === undefined) return sessionStorage.getItem(key);
        sessionStorage.setItem(key, value);
    } catch (e) { return null; }
}

// Resolves when the user presses a key or taps, or when the timer ends.
function waitOrSkip(ms, onSkip) {
    return new Promise(resolve => {
        let done = false;
        const finish = (skipped) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            document.removeEventListener('keydown', skip);
            document.removeEventListener('pointerdown', skip);
            if (skipped && onSkip) onSkip();
            resolve(skipped);
        };
        const skip = () => finish(true);
        const timer = setTimeout(() => finish(false), ms);
        document.addEventListener('keydown', skip);
        document.addEventListener('pointerdown', skip);
    });
}

function appendBootLine(log, text) {
    const OK = '[  OK  ]';
    if (text.startsWith(OK)) {
        const tag = document.createElement('span');
        tag.className = 'ok';
        tag.append('[  ');
        const b = document.createElement('b');
        b.textContent = 'OK';
        tag.append(b, '  ]');
        log.append(tag, text.slice(OK.length) + '\n');
    } else {
        log.append(text + '\n');
    }
}

function runBoot() {
    const screen = document.getElementById('boot-screen');
    const log = document.getElementById('boot-log');
    if (!screen || !log || reducedMotion || sessionFlag('booted')) {
        if (screen) screen.remove();
        return Promise.resolve();
    }

    screen.classList.add('on');
    let skipped = false;

    const showLines = async () => {
        for (const [text, delay] of BOOT_LINES) {
            if (skipped) break;
            appendBootLine(log, text);
            skipped = await waitOrSkip(delay);
        }
    };

    return showLines().then(() => {
        sessionFlag('booted', '1');
        screen.classList.add('off');
        return new Promise(resolve => setTimeout(resolve, 450));
    }).then(() => screen.remove());
}

function runHello() {
    const text = document.getElementById('hello-text');
    const cursor = document.getElementById('hello-cursor');
    if (!text || !cursor || reducedMotion || sessionFlag('hello')) return;

    let cancelled = false;
    const finish = () => {
        cancelled = true;
        text.textContent = HELLO_PREFIX + HELLO_FINAL;
        cursor.classList.add('done');
        sessionFlag('hello', '1');
        document.removeEventListener('keydown', finish);
        document.removeEventListener('pointerdown', finish);
    };
    document.addEventListener('keydown', finish);
    document.addEventListener('pointerdown', finish);

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const typeTo = async (target) => {
        while (!cancelled && text.textContent.length > 0 && !target.startsWith(text.textContent)) {
            text.textContent = text.textContent.slice(0, -1);
            await sleep(DELETE_MS);
        }
        while (!cancelled && text.textContent.length < target.length) {
            text.textContent = target.slice(0, text.textContent.length + 1);
            await sleep(TYPE_MS);
        }
    };

    (async () => {
        text.textContent = '';
        cursor.classList.remove('done');
        for (const role of HELLO_ROLES) {
            await typeTo(HELLO_PREFIX + role);
            if (cancelled) return;
            await sleep(HOLD_MS);
        }
        await typeTo(HELLO_PREFIX + HELLO_FINAL);
        if (cancelled) return;
        await sleep(2000);
        finish();
    })();
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    initializeWindows();
    initializeDesktopIcons();
    initializeProjectCards();
    initializeContactCards();
    initializeAppGrid();
    Browser.init();

    // Start clock
    setInterval(updateClock, 1000);
    updateClock();

    // Start with all windows closed except main terminal
    document.querySelectorAll('.window:not(.hero-window)').forEach(window => {
        closeWindow(window.id);
    });

    runBoot().then(() => {
        runHello();
        const target = deepLinkTarget();
        if (target) openUrl(target);
    });
});

// If the desktop ends up inside its own browser window, break out.
if (window.self !== window.top) {
    try { window.top.location.href = window.location.href; } catch (e) {}
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        const activeWindows = Array.from(document.querySelectorAll('.window.active'));
        if (activeWindows.length > 1) {
            const currentIndex = activeWindows.findIndex(w => w.id === activeWindow);
            const nextIndex = (currentIndex + 1) % activeWindows.length;
            bringToFront(activeWindows[nextIndex]);
        }
    }

    if (e.key === 'Escape' && activeWindow) {
        closeWindow(activeWindow);
    }
});
