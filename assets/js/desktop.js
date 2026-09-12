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
                openWindow('projects-window');
                Files.go('/Trash');
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

// Files (Nautilus). A small virtual filesystem over PROJECTS and the
// Jekyll-rendered post list; single-click selects, double-click opens.
const ICON = (name) => '/assets/icons/yaru/' + name + '.png';
const GITHUB_MARK = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

const Files = {
    path: '/',
    history: ['/'],
    index: 0,
    selected: null,

    els() {
        return {
            win: document.getElementById('projects-window'),
            grid: document.getElementById('files-grid'),
            empty: document.getElementById('files-empty'),
            emptySub: document.getElementById('files-empty-sub'),
            status: document.getElementById('files-status'),
            pathBar: document.getElementById('files-path'),
            details: document.getElementById('files-details'),
            back: document.getElementById('files-back'),
            forward: document.getElementById('files-forward'),
            title: document.querySelector('#projects-window .window-title')
        };
    },

    projectItem(p) {
        return {
            type: 'project', name: p.name, subtitle: p.subtitle, project: p,
            icon: p.folder === 'papers' ? ICON('application-pdf') : ICON('folder'),
            emblem: !!p.repo,
            open: () => {
                const url = p.paper || p.repo || p.site;
                if (url) openUrl(url);
            }
        };
    },

    posts() {
        const tpl = document.getElementById('posts-data');
        if (!tpl) return [];
        return Array.from(tpl.content.querySelectorAll('.post-entry')).map(a => ({
            type: 'post', name: a.textContent.trim(), icon: ICON('text-markdown'),
            subtitle: a.dataset.date, tags: (a.dataset.tags || '').trim().split(/\s+/).filter(Boolean),
            url: a.getAttribute('href'),
            open: () => openUrl(location.origin + a.getAttribute('href'))
        }));
    },

    // Folder contents by path
    list(path) {
        const folder = (name, target, icon) => ({
            type: 'folder', name, icon: ICON(icon || 'folder'),
            subtitle: this.list(target).length + ' items', open: () => this.go(target)
        });
        switch (path) {
            case '/':
                return [
                    folder('Projects', '/Projects'),
                    folder('posts', '/posts', 'folder-documents'),
                    { type: 'file', name: 'about.md', icon: ICON('text-markdown'), subtitle: 'Markdown', open: () => openWindow('about-window') },
                    { type: 'file', name: 'contact.json', icon: ICON('application-json'), subtitle: 'JSON', open: () => openWindow('contact-window') },
                    { type: 'file', name: 'Resume.pdf', icon: ICON('application-pdf'), subtitle: 'PDF', open: () => openUrl(LINKS.resume) }
                ];
            case '/Projects':
                return PROJECT_FOLDERS.map(f => folder(f.id, '/Projects/' + f.id));
            case '/posts':
                return this.posts();
            case '/Trash':
                return [];
            default: {
                const m = path.match(/^\/Projects\/(\w+)$/);
                if (!m) return [];
                return PROJECTS.filter(p => p.folder === m[1]).map(p => this.projectItem(p));
            }
        }
    },

    crumbs(path) {
        const parts = path.split('/').filter(Boolean);
        const out = [{ name: 'Home', path: '/' }];
        let acc = '';
        for (const part of parts) {
            acc += '/' + part;
            out.push({ name: part, path: acc });
        }
        return out;
    },

    go(path) {
        if (path === this.path) return;
        this.history = this.history.slice(0, this.index + 1);
        this.history.push(path);
        this.index = this.history.length - 1;
        this.render(path);
    },

    back() {
        if (this.index <= 0) return;
        this.index -= 1;
        this.render(this.history[this.index]);
    },

    forward() {
        if (this.index >= this.history.length - 1) return;
        this.index += 1;
        this.render(this.history[this.index]);
    },

    render(path) {
        const el = this.els();
        if (!el.grid) return;
        this.path = path;
        this.select(null);

        const crumbs = this.crumbs(path);
        el.pathBar.innerHTML = '';
        crumbs.forEach((c, i) => {
            if (i > 0) {
                const sep = document.createElement('span');
                sep.className = 'crumb-sep';
                sep.textContent = '›';
                el.pathBar.appendChild(sep);
            }
            const b = document.createElement('button');
            b.className = 'crumb' + (i === crumbs.length - 1 ? ' current' : '');
            b.textContent = c.name;
            b.addEventListener('click', () => this.go(c.path));
            el.pathBar.appendChild(b);
        });
        if (el.title) el.title.textContent = crumbs[crumbs.length - 1].name;

        const items = this.list(path);
        el.grid.innerHTML = '';
        items.forEach(item => el.grid.appendChild(this.renderItem(item)));

        const isEmpty = items.length === 0;
        el.empty.hidden = !isEmpty;
        el.grid.hidden = isEmpty;
        if (isEmpty) {
            const tpl = document.getElementById('posts-data');
            const note = path === '/posts' && tpl && tpl.content.querySelector('.posts-empty');
            el.emptySub.textContent = note ? note.textContent : '';
        }
        el.status.textContent = items.length === 1 ? '1 item' : items.length + ' items';

        el.back.disabled = this.index <= 0;
        el.forward.disabled = this.index >= this.history.length - 1;

        document.querySelectorAll('.files-sidebar .sb-item[data-path]').forEach(sb => {
            sb.classList.toggle('current', sb.dataset.path === path);
        });
    },

    renderItem(item) {
        const div = document.createElement('div');
        div.className = 'fs-item fs-' + item.type;
        if (item.project) div.dataset.project = item.project.id;

        const iconWrap = document.createElement('div');
        iconWrap.className = 'fs-icon';
        const img = document.createElement('img');
        img.src = item.icon;
        img.alt = '';
        iconWrap.appendChild(img);
        if (item.emblem) {
            iconWrap.insertAdjacentHTML('beforeend',
                '<svg class="fs-emblem" viewBox="0 0 16 16"><path d="' + GITHUB_MARK + '"/></svg>');
        }

        const label = document.createElement('div');
        label.className = 'fs-label';
        label.textContent = item.name;

        div.append(iconWrap, label);
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.setAttribute('aria-label', item.name);
        if (item.type === 'folder') {
            const count = document.createElement('div');
            count.className = 'fs-count';
            count.textContent = item.subtitle;
            div.appendChild(count);
        }
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.select(item, div);
                item.open();
            } else if (e.key === ' ') {
                e.preventDefault();
                this.select(item, div);
            }
        });
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.select(item, div);
        });
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            item.open();
        });
        return div;
    },

    select(item, div) {
        const el = this.els();
        el.grid.querySelectorAll('.fs-item.selected').forEach(d => d.classList.remove('selected'));
        this.selected = item;
        if (!item) {
            el.details.hidden = true;
            el.details.innerHTML = '';
            return;
        }
        div.classList.add('selected');
        el.details.innerHTML = '';
        el.details.hidden = false;

        const head = document.createElement('div');
        head.className = 'dt-head';
        const img = document.createElement('img');
        img.src = item.icon;
        img.alt = '';
        const name = document.createElement('div');
        name.className = 'dt-name';
        name.textContent = item.name;
        const sub = document.createElement('div');
        sub.className = 'dt-sub';
        sub.textContent = item.subtitle || '';
        head.append(img, name, sub);
        el.details.appendChild(head);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'dt-close';
        closeBtn.title = 'Close';
        closeBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
        closeBtn.addEventListener('click', () => this.select(null));
        el.details.appendChild(closeBtn);

        const p = item.project;
        if (p) {
            const desc = document.createElement('p');
            desc.className = 'dt-desc';
            desc.textContent = p.description;
            el.details.appendChild(desc);
        }
        const tags = p ? p.tags : item.tags;
        if (tags && tags.length) {
            const wrap = document.createElement('div');
            wrap.className = 'dt-tags';
            tags.forEach(t => {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.textContent = t;
                wrap.appendChild(chip);
            });
            el.details.appendChild(wrap);
        }

        const actions = document.createElement('div');
        actions.className = 'dt-actions';
        const button = (label, fn, primary) => {
            const b = document.createElement('button');
            b.className = 'dt-btn' + (primary ? ' primary' : '');
            b.textContent = label;
            b.addEventListener('click', fn);
            actions.appendChild(b);
        };
        if (p) {
            if (p.paper) button('Open paper', () => openUrl(p.paper), true);
            if (p.repo) button('Open on GitHub', () => openUrl(p.repo), !p.paper);
            if (p.site) button('Open site', () => openUrl(p.site), false);
            if (!p.repo && !p.paper && !p.site) {
                const note = document.createElement('div');
                note.className = 'dt-note';
                note.textContent = 'Repository not public yet.';
                actions.appendChild(note);
            }
        } else if (item.type === 'folder') {
            button('Open', () => item.open(), true);
        } else {
            button('Open', () => item.open(), true);
        }
        el.details.appendChild(actions);
    },

    init() {
        const el = this.els();
        if (!el.grid) return;
        el.back.addEventListener('click', () => this.back());
        el.forward.addEventListener('click', () => this.forward());
        document.querySelectorAll('.files-sidebar .sb-item[data-path]').forEach(sb => {
            sb.addEventListener('click', () => this.go(sb.dataset.path));
        });
        el.grid.addEventListener('click', () => this.select(null));
        this.history = ['/Projects'];
        this.index = 0;
        this.render('/Projects');
    }
};

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

// Boot sequence + hello line
// Edit these arrays to change what plays on first visit.
// A line starting with "[  OK  ]" gets the green systemd treatment.
const BOOT_LINES = [
    ['[  OK  ] Started JORDAN-OS v3B (University of Waterloo build).', 350],
    ['[  OK  ] Found device Zynq UltraScale+ MPSoC. Fabric online.', 300],
    ['[  OK  ] Loaded kernel modules: research.ko ml.ko software.ko hardware.ko.', 400],
    ['[  OK  ] Mounted /home/jordan/hardware.', 200],
    ['[  OK  ] Mounted /home/jordan/papers.', 200],
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
    initializeContactLinks();
    initializeAppGrid();
    Browser.init();
    Files.init();
    renderWorkTree();

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
