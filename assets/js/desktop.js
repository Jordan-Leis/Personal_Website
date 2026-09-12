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

// Initialize window system
function initializeWindows() {
    const windows = document.querySelectorAll('.window');
    const taskbarItems = document.querySelectorAll('.taskbar-item');

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
            if (e.target.classList.contains('window-control')) return;
            
            startDrag(e, window);
            bringToFront(window);
        });

        // Click to focus
        window.addEventListener('mousedown', () => {
            bringToFront(window);
        });
    });

    // Taskbar item clicks
    taskbarItems.forEach(item => {
        item.addEventListener('click', () => {
            const windowId = item.getAttribute('data-window');
            toggleWindow(windowId);
            updateTaskbar();
        });
    });

    // Global mouse events for dragging
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);

    // Initial state
    bringToFront(document.getElementById('hero-window'));
    updateTaskbar();
}

// Window drag functions
function startDrag(e, window) {
    dragData.isDragging = true;
    dragData.element = window;
    dragData.startX = e.clientX;
    dragData.startY = e.clientY;
    
    const rect = window.getBoundingClientRect();
    dragData.startLeft = rect.left;
    dragData.startTop = rect.top;

    window.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
}

function handleDrag(e) {
    if (!dragData.isDragging || !dragData.element) return;

    const deltaX = e.clientX - dragData.startX;
    const deltaY = e.clientY - dragData.startY;

    let newLeft = dragData.startLeft + deltaX;
    let newTop = dragData.startTop + deltaY;

    // Boundary constraints
    const windowRect = dragData.element.getBoundingClientRect();
    const maxLeft = window.innerWidth - windowRect.width;
    const maxTop = window.innerHeight - windowRect.height - 60;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    dragData.element.style.left = newLeft + 'px';
    dragData.element.style.top = newTop + 'px';
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
    });

    window.style.zIndex = maxZ + 1;
    activeWindow = window.id;
    updateTaskbar();
}

function closeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active');
    window.classList.add('minimized');
    
    if (activeWindow === windowId) {
        const openWindows = document.querySelectorAll('.window.active');
        if (openWindows.length > 0) {
            bringToFront(openWindows[0]);
        } else {
            activeWindow = null;
        }
    }
    updateTaskbar();
}

function minimizeWindow(windowId) {
    const window = document.getElementById(windowId);
    window.classList.remove('active');
    window.classList.add('minimized');
    
    if (activeWindow === windowId) {
        activeWindow = null;
    }
    updateTaskbar();
}

function toggleMaximize(windowId) {
    const window = document.getElementById(windowId);
    
    if (window.classList.contains('maximized')) {
        window.classList.remove('maximized');
        window.style.width = '';
        window.style.height = '';
        window.style.top = '';
        window.style.left = '';
        window.style.transform = '';
    } else {
        window.classList.add('maximized');
        window.style.width = '95vw';
        window.style.height = 'calc(95vh - 60px)';
        window.style.top = '2.5vh';
        window.style.left = '2.5vw';
        window.style.transform = 'none';
    }
}

function toggleWindow(windowId) {
    const window = document.getElementById(windowId);
    
    if (window.classList.contains('active')) {
        minimizeWindow(windowId);
    } else {
        window.classList.remove('minimized');
        window.classList.add('active');
        bringToFront(window);
    }
}

function updateTaskbar() {
    const taskbarItems = document.querySelectorAll('.taskbar-item');
    
    taskbarItems.forEach(item => {
        const windowId = item.getAttribute('data-window');
        const window = document.getElementById(windowId);
        
        item.classList.remove('active', 'minimized');
        
        if (window.classList.contains('active')) {
            if (activeWindow === windowId) {
                item.classList.add('active');
            }
        } else if (window.classList.contains('minimized')) {
            item.classList.add('minimized');
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

function openIconTarget(icon) {
    const windowId = icon.getAttribute('data-window');
    const action = icon.getAttribute('data-action');

    if (windowId) {
        const window = document.getElementById(windowId);
        window.classList.remove('minimized');
        window.classList.add('active');
        bringToFront(window);
        updateTaskbar();
    } else if (action) {
        switch(action) {
            case 'resume':
                window.open('https://drive.google.com/file/d/1jHbSPjZX3hLAVGLmC30Kj_MwDdtXkR9Z/view?usp=sharing', '_blank');
                break;
            case 'github':
                window.open('https://github.com/Jordan-Leis', '_blank');
                break;
            case 'linkedin':
                window.open('https://www.linkedin.com/in/jordan-leis/', '_blank');
                break;
            case 'terminal':
                toggleWindow('hero-window');
                updateTaskbar();
                break;
        }
    }

    // Opening animation
    icon.style.transform = 'scale(1.2)';
    setTimeout(() => {
        icon.style.transform = '';
    }, 200);
}

function startIconDrag(e, icon) {
    iconDragData.isDragging = true;
    iconDragData.element = icon;
    iconDragData.startX = e.clientX;
    iconDragData.startY = e.clientY;
    
    const rect = icon.getBoundingClientRect();
    iconDragData.startLeft = rect.left;
    iconDragData.startTop = rect.top;

    icon.style.cursor = 'grabbing';
    icon.style.zIndex = '1000';
    document.body.style.userSelect = 'none';
}

function handleIconDrag(e) {
    if (!iconDragData.isDragging || !iconDragData.element) return;

    const deltaX = e.clientX - iconDragData.startX;
    const deltaY = e.clientY - iconDragData.startY;

    let newLeft = iconDragData.startLeft + deltaX;
    let newTop = iconDragData.startTop + deltaY;

    // Boundary constraints
    const desktop = document.getElementById('desktop');
    const desktopRect = desktop.getBoundingClientRect();
    const iconRect = iconDragData.element.getBoundingClientRect();

    newLeft = Math.max(0, Math.min(newLeft, desktopRect.width - iconRect.width));
    newTop = Math.max(0, Math.min(newTop, desktopRect.height - iconRect.height - 60));

    // Grid snapping
    const gridSize = 100;
    const snappedLeft = Math.round(newLeft / gridSize) * gridSize;
    const snappedTop = Math.round(newTop / gridSize) * gridSize;

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
                window.open(url, '_blank');
            }
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
                    window.open(url, '_blank');
                }
            }
        });
    });
}

// Desktop Clock
function updateClock() {
    const now = new Date();
    const timeElement = document.querySelector('.desktop-clock .time');
    const dateElement = document.querySelector('.desktop-clock .date');
    
    if (timeElement && dateElement) {
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const dateString = now.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        timeElement.textContent = timeString;
        dateElement.textContent = dateString;
    }
}

// Window effects
function addWindowEffects() {
    const windows = document.querySelectorAll('.window');
    
    windows.forEach(window => {
        const closeBtn = window.querySelector('.window-control.close');
        closeBtn.addEventListener('mouseenter', () => {
            window.querySelector('.window-header').style.animation =
    'windowShake 0.5s ease-in-out';
        });
        
        closeBtn.addEventListener('mouseleave', () => {
            window.querySelector('.window-header').style.animation = '';

        });
    });
}

// Boot sequence + hello line
// Edit these arrays to change what plays on first visit.
const BOOT_LINES = [
    ['JORDAN-OS v3B  —  University of Waterloo build', 350],
    ['POST ..................................... OK', 300],
    ['Detecting hardware ........... Zynq UltraScale+ (fabric online)', 400],
    ['Loading modules ..... research.ko  ml.ko  software.ko  hardware.ko', 450],
    ['Mounting ~/hardware ~/research ~/software ~/posts ....... OK', 300],
    ['Checking timing .................... closed, no phys_opt_design', 350],
    ['Starting desktop ...', 400]
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
            log.textContent += text + '\n';
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
    addWindowEffects();

    // Start clock
    setInterval(updateClock, 1000);
    updateClock();

    // Start with all windows closed except main terminal
    document.querySelectorAll('.window:not(.hero-window)').forEach(window => {
        closeWindow(window.id);
    });

    runBoot().then(runHello);
});

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
