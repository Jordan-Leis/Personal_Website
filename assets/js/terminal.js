const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HELLO_PREFIX = "Hi, I'm Jordan. ";
const HELLO_FINAL = 'I like to build.';
const HELLO_ROLES = ["I'm a research engineer.", "I'm a hardware engineer.", "I'm a software engineer.", "I'm an ML engineer."];
const BOOT_LINES = [
    '[  OK  ] Started JORDAN-OS v3B (University of Waterloo build).',
    '[  OK  ] Found device Zynq UltraScale+ MPSoC. Fabric online.',
    '[  OK  ] Loaded kernel modules: research.ko ml.ko software.ko hardware.ko.',
    '[  OK  ] Mounted /home/jordan/hardware.', '[  OK  ] Mounted /home/jordan/papers.',
    '[  OK  ] Mounted /home/jordan/software.', '[  OK  ] Mounted /home/jordan/posts.',
    '[  OK  ] Reached target Timing Closure. No phys_opt_design required.',
    '         Starting Display Manager…'
];
const Boot = {
    controller: null, crashing: false,
    delay(ms, signal) {
        return new Promise(resolve => {
            const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
            const timer = setTimeout(finish, Math.max(0, ms));
            if (signal?.aborted) finish(); else signal?.addEventListener('abort', finish, { once: true });
        });
    },
    async run() {
        this.controller?.abort(); const controller = this.controller = new AbortController();
        const screen = document.getElementById('boot-screen'), log = document.getElementById('boot-log');
        if (DesktopHost.depth || reducedMotion()) { screen.hidden = true; return; }
        screen.hidden = false; screen.classList.remove('off'); screen.classList.add('on'); screen.setAttribute('aria-hidden', 'false'); log.replaceChildren();
        const total = 6000 + Math.random() * 2000; this.duration = total;
        const started = performance.now();
        const skip = e => { e?.preventDefault(); e?.stopImmediatePropagation(); controller.abort(); };
        document.getElementById('boot-skip').onclick = skip;
        document.addEventListener('keydown', skip, true); screen.addEventListener('pointerdown', skip);
        try {
            for (let i = 0; i < BOOT_LINES.length; i++) {
                if (controller.signal.aborted) break;
                const line = document.createElement('div'); line.textContent = BOOT_LINES[i];
                if (line.textContent.startsWith('[  OK  ]')) {
                    const ok = document.createElement('span'); ok.className = 'boot-ok'; ok.textContent = '[  OK  ]'; line.replaceChildren(ok, BOOT_LINES[i].slice(8));
                }
                log.append(line);
                await this.delay(started + (total - 450) * (i + 1) / BOOT_LINES.length - performance.now(), controller.signal);
            }
            screen.classList.add('off');
            if (!controller.signal.aborted) await this.delay(450, controller.signal);
        } finally {
            document.removeEventListener('keydown', skip, true); screen.removeEventListener('pointerdown', skip);
            screen.hidden = true; screen.classList.remove('on', 'off'); screen.setAttribute('aria-hidden', 'true');
        }
    },
    async crash() {
        if (DesktopHost.depth || this.crashing) return;
        this.crashing = true; Session.discover('recursion'); this.controller?.abort(); Terminal.finish(); PointerDrag.stop(); Media.reset();
        const screen = document.getElementById('crash-screen'); screen.hidden = false;
        this.crashController = new AbortController();
        await this.delay(2000, this.crashController.signal);
        if (this.crashController.signal.aborted) return;
        Browser.reset();
        document.querySelectorAll('.window').forEach(win => {
            closeWindow(win.id); win.classList.remove('maximized'); win.removeAttribute('style');
        });
        document.getElementById('app-grid').classList.remove('open');
        document.getElementById('activities').classList.remove('open');
        document.getElementById('system-menu').hidden = true; document.getElementById('system-toggle').setAttribute('aria-expanded', 'false');
        Session.reset(); Terminal.reset(); Solitaire.reset(); Gallery.reset();
        deselectAllIcons();
        document.getElementById('notes-content').textContent = '';
        document.querySelector('#notes-window .window-title').textContent = 'Text Editor';
        document.querySelectorAll('.window-content').forEach(el => { el.scrollTop = 0; });
        openWindow('hero-window'); screen.hidden = true; this.crashing = false;
        await this.run(); Terminal.introduce();
    }
};

const Terminal = {
    cwd: '/', history: [], historyIndex: 0, draft: '', frame: null, template: '', running: false, introduced: false,
    init() {
        this.template = document.getElementById('terminal-intro').innerHTML;
        document.getElementById('terminal-form').onsubmit = e => {
            e.preventDefault(); this.finish(); const input = document.getElementById('terminal-input');
            const line = input.value; input.value = ''; this.execute(line);
        };
        document.getElementById('intro-skip').onclick = () => this.finish();
        document.getElementById('terminal-input').addEventListener('focus', () => this.finish());
        document.getElementById('terminal-input').addEventListener('keydown', e => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault(); if (this.historyIndex === this.history.length) this.draft = e.target.value;
                this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
                e.target.value = this.history[this.historyIndex] ?? this.draft;
            }
        });
        document.addEventListener('keydown', e => {
            if (Boot.crashing) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        window.addEventListener('pagehide', () => { cancelAnimationFrame(this.frame); Boot.controller?.abort(); Boot.crashController?.abort(); });
        if (!DesktopHost.depth) window.addEventListener('message', e => {
            if (e.origin === location.origin && Session.views.get(e.source) === 2 && e.data?.type === 'desktop:recursion') Boot.crash();
        });
    },
    reset() {
        this.finish(); this.cwd = '/'; this.history = []; this.historyIndex = 0; this.draft = ''; this.introduced = false;
        document.getElementById('terminal-output').replaceChildren(); document.getElementById('terminal-input').value = '';
        document.getElementById('terminal-intro').hidden = false; this.prompt();
    },
    prompt() { document.getElementById('terminal-path').textContent = this.cwd === '/' ? '~' : '~' + this.cwd; },
    finish() {
        if (!this.template) return;
        cancelAnimationFrame(this.frame); this.frame = null; this.running = false;
        document.getElementById('terminal-intro').innerHTML = this.template;
        document.getElementById('intro-skip').hidden = true;
        const text = document.getElementById('hello-text'); if (text) text.textContent = HELLO_PREFIX + HELLO_FINAL;
        document.getElementById('hello-cursor')?.classList.add('done');
    },
    introduce() {
        if (this.introduced) return; this.introduced = true;
        if (DesktopHost.depth || reducedMotion() || document.activeElement === document.getElementById('terminal-input')) { this.finish(); return; }
        this.running = true; const container = document.getElementById('terminal-intro');
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT); const texts = []; let node;
        while ((node = walker.nextNode())) if (node.textContent.trim()) texts.push({ node, text: node.textContent });
        const length = texts.reduce((n, t) => n + t.text.length, 0); texts.forEach(t => { t.node.textContent = ''; });
        document.getElementById('intro-skip').hidden = false;
        const duration = 12000 + Math.random() * 3000; this.duration = duration; const start = performance.now();
        const tick = now => {
            let remaining = Math.floor(length * Math.min(1, (now - start) / duration));
            texts.forEach(t => { t.node.textContent = t.text.slice(0, remaining); remaining = Math.max(0, remaining - t.text.length); });
            if (now - start < duration) this.frame = requestAnimationFrame(tick);
            else this.cycle();
        };
        this.frame = requestAnimationFrame(tick);
    },
    cycle() {
        const text = document.getElementById('hello-text'), cursor = document.getElementById('hello-cursor');
        cursor.classList.remove('done'); let index = 0, holding = 0, last = 0;
        const targets = [...HELLO_ROLES, HELLO_FINAL].map(t => HELLO_PREFIX + t);
        const tick = now => {
            if (!this.running) return;
            if (now - last >= 25 && now >= holding) {
                last = now; const target = targets[index];
                if (text.textContent === target) {
                    if (index === targets.length - 1) { this.finish(); return; }
                    holding = now + 650; index++;
                } else if (!target.startsWith(text.textContent)) text.textContent = text.textContent.slice(0, -1);
                else text.textContent = target.slice(0, text.textContent.length + 1);
            }
            this.frame = requestAnimationFrame(tick);
        }; this.frame = requestAnimationFrame(tick);
    },
    tokenize(line) {
        const tokens = []; let token = '', quote = '', started = false;
        for (const c of line) {
            if (quote) { if (c === quote) quote = ''; else token += c; }
            else if (c === '"' || c === "'") { quote = c; started = true; }
            else if (/\s/.test(c)) { if (started) { tokens.push(token); token = ''; started = false; } }
            else { token += c; started = true; }
        }
        if (quote) throw new Error('Unclosed quote'); if (started) tokens.push(token); return tokens;
    },
    execute(line) {
        if (!line.trim()) return;
        this.history.push(line); this.historyIndex = this.history.length; this.draft = '';
        const output = document.getElementById('terminal-output');
        const echo = document.createElement('div'); echo.className = 'terminal-echo'; echo.textContent = 'jordan@waterloo:' + (this.cwd === '/' ? '~' : '~' + this.cwd) + '$ ' + line; output.append(echo);
        let result = '';
        try {
            const args = this.tokenize(line), cmd = args.shift();
            const secret = [cmd, ...args].join(' ');
            if (secret === 'work work') { Session.discover('work'); Media.work(); result = 'Work, work.'; }
            else if (secret === '1 million bit register') { Session.discover('register'); result = 'the compiler will just optimize it away'; }
            else switch (cmd) {
                case 'help': result = 'help — supported commands\nls [-a] [path] — list files\npwd — current directory\ncd [path] — change directory\nclear — clear the screen\nwhoami — about Jordan\ndate — current date\ncat <file> — read text\necho <text> — print text\ntree — project tree\n./hello.sh — introduction\nUse Up/Down for command history. Files supports Show hidden files.'; break;
                case 'pwd': result = '/home/jordan' + (this.cwd === '/' ? '' : this.cwd); break;
                case 'whoami': result = lines(document.getElementById('identity-text').textContent); break;
                case 'date': result = new Date().toString(); break;
                case 'echo': result = args.join(' '); break;
                case 'clear': output.replaceChildren(); document.getElementById('terminal-intro').hidden = true; break;
                case './hello.sh': result = HELLO_PREFIX + HELLO_FINAL; break;
                case 'tree': result = document.getElementById('work-tree').textContent; break;
                case 'cd': {
                    const n = Session.resolve(args[0] ?? '~', this.cwd);
                    if (!n) throw new Error('cd: ' + (args[0] || '~') + ': No such file or directory');
                    if (n.type !== 'folder') throw new Error('cd: ' + args[0] + ': Not a directory');
                    this.cwd = n.id; this.prompt(); break;
                }
                case 'ls': {
                    const hidden = args.includes('-a'); const path = args.filter(a => a !== '-a')[0] || '.';
                    const n = Session.resolve(path, this.cwd); if (!n) throw new Error('ls: ' + path + ': No such file or directory');
                    result = n.type === 'folder' ? Session.list(n.id, hidden).map(n => n.name + (n.type === 'folder' ? '/' : '')).join('  ') : n.name; break;
                }
                case 'cat': {
                    const firstLine = args.join(' ') === 'looking_for.txt | head -1';
                    if (!args.length) throw new Error('cat: missing file operand');
                    result = (firstLine ? [args[0]] : args).map(path => {
                        const n = Session.resolve(path, this.cwd); if (!n) throw new Error('cat: ' + path + ': No such file or directory');
                        const text = Session.read(n); Session.opened(n); return text;
                    }).join('\n');
                    if (firstLine) result = result.split('\n')[0]; break;
                }
                default: result = cmd + ': command not found';
            }
        } catch (error) { result = error.message; }
        if (result) { const pre = document.createElement('pre'); pre.className = 'terminal-response'; pre.textContent = result; output.append(pre); }
        const scroller = document.querySelector('#hero-window .window-content'); scroller.scrollTop = scroller.scrollHeight;
    }
};
