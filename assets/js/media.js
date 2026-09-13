const Gallery = {
    current: null,
    open(id) { this.current = id; this.render(); openWindow('photo-window'); },
    render() {
        const photos = Session.list('/Photos'), index = photos.findIndex(n => n.id === this.current), node = photos[index];
        if (!node) { this.reset(); return; }
        const img = document.getElementById('photo-image'); img.src = node.url; img.alt = node.name;
        document.getElementById('photo-name').textContent = node.name;
        document.getElementById('photo-prev').disabled = index <= 0;
        document.getElementById('photo-next').disabled = index >= photos.length - 1;
    },
    step(delta) {
        const photos = Session.list('/Photos'); const i = photos.findIndex(n => n.id === this.current);
        const n = photos[i + delta]; if (n) { this.current = n.id; this.render(); Session.opened(n); }
    },
    reset() { this.current = null; document.getElementById('photo-image').removeAttribute('src'); document.getElementById('photo-name').textContent = ''; }
};
const Media = {
    playlist: 'PLb4jn6--mjdM', rickroll: 'dQw4w9WgXcQ', records: {}, api: null, audio: null, workGeneration: 0,
    init() {
        document.getElementById('photo-prev').onclick = () => Gallery.step(-1);
        document.getElementById('photo-next').onclick = () => Gallery.step(1);
        document.addEventListener('keydown', e => {
            if (activeWindow === 'photo-window' && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); Gallery.step(e.key === 'ArrowLeft' ? -1 : 1); }
        });
        if (!DesktopHost.depth) {
            window.DesktopMedia = this; this.audio = new Audio('/assets/media/audio/work-work.m4a'); this.audio.preload = 'none';
        }
        for (const id of ['music', 'video']) this.prepare(id + '-window');
        document.addEventListener('click', e => {
            const start = e.target.closest('[data-media]'); if (start) this.start(start.dataset.media);
            const control = e.target.closest('[data-media-action]'); if (!control) return;
            const id = control.dataset.player, action = control.dataset.mediaAction, record = this.records[id];
            if (action === 'play') { if (record?.ready && record.player.getPlayerState() === 1) record.player.pauseVideo(); else this.start(id); }
            if (record?.ready && action === 'previous') record.player.previousVideo();
            if (record?.ready && action === 'next') record.player.nextVideo();
        });
        document.querySelectorAll('[data-media-seek]').forEach(input => input.addEventListener('input', () => {
            const r = this.records[input.dataset.mediaSeek]; if (r?.ready) r.player.seekTo(r.player.getDuration() * input.value / 100, true);
        }));
        const unsubscribe = Session.subscribe(kind => { if (kind === 'volume') this.volume(); if (kind === 'files' && Gallery.current && Session.unavailable(Gallery.current)) Gallery.reset(); });
        window.addEventListener('pagehide', () => { unsubscribe(); this.reset(); }, { once: true }); this.volume();
    },
    prepare(windowId) {
        const id = windowId.replace('-window', '');
        if (!['music', 'video'].includes(id)) return;
        document.getElementById(id + '-external').href = id === 'music' ? 'https://music.youtube.com/playlist?list=' + this.playlist : 'https://www.youtube.com/watch?v=' + this.rickroll;
        if (!this.records[id]) {
            this.records[id] = { generation: 0, ready: false, player: null, timer: null };
            this.controls(id, false);
        }
    },
    controls(id, ready) {
        document.querySelectorAll('[data-player="' + id + '"], [data-media-seek="' + id + '"]').forEach(e => {
            e.disabled = !ready && e.dataset.mediaAction !== 'play';
            if (id === 'video' && ['previous', 'next'].includes(e.dataset.mediaAction)) e.hidden = true;
        });
    },
    loadAPI() {
        if (window.YT?.Player) return Promise.resolve();
        if (this.api) return this.api;
        this.api = new Promise((resolve, reject) => {
            const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
            const cleanup = () => { clearTimeout(timer); script.onerror = null; this.apiCancel = null; delete window.onYouTubeIframeAPIReady; };
            const cancel = () => { cleanup(); script.remove(); this.api = null; reject(new Error('YouTube is unavailable')); };
            const timer = setTimeout(cancel, 12000);
            this.apiCancel = cancel;
            window.onYouTubeIframeAPIReady = () => { cleanup(); resolve(); };
            script.onerror = cancel;
            document.head.append(script);
        }); return this.api;
    },
    show(id, play = false) {
        if (DesktopHost.depth) { DesktopHost.root.DesktopMedia.show(id, play); return; }
        openWindow(id + '-window'); if (play) this.start(id);
    },
    async start(id) {
        if (DesktopHost.depth) { DesktopHost.root.DesktopMedia.show(id, true); return; }
        const r = this.records[id]; if (r.ready) { r.player.playVideo(); return; }
        const generation = ++r.generation;
        document.getElementById(id + '-message').textContent = 'Loading YouTube…';
        try {
            await this.loadAPI(); if (generation !== r.generation) return;
            r.player?.destroy();
            const stage = document.getElementById(id + '-player'); stage.replaceChildren();
            const embed = document.createElement('iframe'); embed.id = id + '-embed'; embed.title = id === 'music' ? 'YouTube music playlist' : 'YouTube video';
            const params = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', autoplay: '0' });
            if (id === 'music') { params.set('listType', 'playlist'); params.set('list', this.playlist); }
            embed.src = 'https://www.youtube.com/embed/' + (id === 'music' ? 'videoseries' : this.rickroll) + '?' + params;
            embed.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; embed.referrerPolicy = 'strict-origin-when-cross-origin'; stage.append(embed);
            r.timeout = setTimeout(() => { if (!r.ready && generation === r.generation) this.fail(id); }, 15000);
            r.player = new YT.Player(embed, { events: {
                onReady: () => {
                    if (generation !== r.generation) return;
                    clearTimeout(r.timeout); r.ready = true; this.controls(id, true); r.player.setVolume(Session.volume * 100); r.player.playVideo();
                    document.getElementById(id + '-message').textContent = 'Use Play if your browser pauses playback.';
                    r.timer = setInterval(() => this.update(id), 500);
                },
                onStateChange: e => {
                    if (e.data === 1 || e.data === 3) { clearTimeout(r.skipTimer); }
                    if (e.data === 1) { r.skips = 0; document.getElementById(id + '-message').textContent = 'Use Play if your browser pauses playback.'; }
                    if (r.ready) this.update(id);
                },
                onError: e => {
                    // 100/101/150: this track is missing or not embeddable. Skip it
                    // rather than declaring the whole playlist unavailable; if nothing
                    // starts after the skip, fall back to the external link.
                    const perTrack = [100, 101, 150].includes(e?.data);
                    const limit = r.player?.getPlaylist?.()?.length || 10;
                    if (id === 'music' && r.player && perTrack && (r.skips = (r.skips || 0) + 1) <= limit) {
                        document.getElementById(id + '-message').textContent = 'Skipping a track that can\'t be embedded.';
                        clearTimeout(r.skipTimer);
                        r.skipTimer = setTimeout(() => { if (generation === r.generation && r.player?.getPlayerState() !== 1) this.fail(id); }, 8000);
                        r.player.nextVideo(); return;
                    }
                    this.fail(id);
                },
                onAutoplayBlocked: () => { document.getElementById(id + '-message').textContent = 'Press Play to allow playback.'; }
            } });
        } catch { if (generation === r.generation) this.fail(id); }
    },
    update(id) {
        const r = this.records[id]; if (!r?.ready) return;
        const duration = r.player.getDuration() || 0, time = r.player.getCurrentTime() || 0;
        document.querySelector('[data-media-seek="' + id + '"]').value = duration ? time / duration * 100 : 0;
        document.getElementById(id + '-time').textContent = Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2, '0');
        const data = r.player.getVideoData(); if (data?.title) document.getElementById(id + '-info').textContent = data.title;
        document.querySelector('[data-player="' + id + '"][data-media-action="play"]').textContent = r.player.getPlayerState() === 1 ? 'Ⅱ' : '▶';
    },
    fail(id) {
        const r = this.records[id]; clearTimeout(r.timeout); clearTimeout(r.skipTimer); clearInterval(r.timer); r.ready = false;
        try { r.player?.stopVideo(); } catch {}
        this.controls(id, false);
        document.getElementById(id + '-message').textContent = 'Playback is unavailable here. Open on YouTube below. External playback has its own volume controls.';
    },
    volume() {
        if (this.audio) this.audio.volume = Session.volume;
        Object.values(this.records).forEach(r => { if (r.ready) r.player.setVolume(Session.volume * 100); });
    },
    work() {
        if (DesktopHost.depth) { DesktopHost.root.DesktopMedia.work(); return; }
        const generation = ++this.workGeneration;
        this.audio.pause(); this.audio.currentTime = 0; this.audio.volume = Session.volume;
        this.audio.play().catch(() => {
            if (generation !== this.workGeneration) return;
            const output = document.getElementById('terminal-output'); const line = document.createElement('p');
            line.textContent = 'Audio could not start. Try work work again after interacting with the page.'; output.append(line);
        });
    },
    close(windowId) {
        const id = windowId.replace('-window', ''), r = this.records[id]; if (!r) return;
        r.generation++; clearTimeout(r.timeout); clearTimeout(r.skipTimer); clearInterval(r.timer); r.player?.destroy(); r.player = null; r.ready = false; r.skips = 0;
        const stage = document.getElementById(id + '-player'); stage.replaceChildren();
        const b = document.createElement('button'); b.className = 'media-start'; b.dataset.media = id; b.textContent = id === 'music' ? 'Play playlist' : 'Play video'; stage.append(b);
        document.getElementById(id + '-message').textContent = 'Press Play to start.';
        document.getElementById(id + '-info').textContent = id === 'music' ? 'mem · YouTube playlist' : 'secret.mp4';
        document.querySelector('[data-media-seek="' + id + '"]').value = 0;
        document.querySelector('[data-player="' + id + '"][data-media-action="play"]').textContent = '▶';
        document.getElementById(id + '-time').textContent = '0:00'; this.controls(id, false);
    },
    reset() { this.workGeneration++; for (const id of Object.keys(this.records)) this.close(id + '-window'); this.apiCancel?.(); if (this.audio) { this.audio.pause(); this.audio.currentTime = 0; } }
};
