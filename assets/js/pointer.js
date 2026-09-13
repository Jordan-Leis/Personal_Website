// One pointer lifecycle for windows, desktop items, Files, and cards.
const PointerDrag = {
    active: null,
    bind(element, options) {
        element.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary || options.ignore?.(event)) return;
            this.stop();
            this.active = { element, options, id: event.pointerId, x: event.clientX, y: event.clientY,
                moved: false, data: options.prepare?.(event) };
            try { element.setPointerCapture(event.pointerId); } catch { this.stop(); }
        });
        element.addEventListener('lostpointercapture', () => {
            if (this.active?.element === element) this.stop();
        });
    },
    move(event) {
        const a = this.active;
        if (!a || event.pointerId !== a.id) return;
        if (event.buttons === 0) { this.stop(); return; }
        const dx = event.clientX - a.x, dy = event.clientY - a.y;
        if (!a.moved && Math.hypot(dx, dy) < 7) return;
        if (!a.moved) {
            a.moved = true;
            document.body.classList.add('pointer-dragging');
            a.element.classList.add('drag-source');
            a.options.start?.(event, a.data);
        }
        event.preventDefault();
        a.options.move?.(event, a.data, dx, dy);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-trash-target]');
        document.querySelectorAll('.drop-ready').forEach(e => e.classList.remove('drop-ready'));
        if (target && a.options.itemId) target.classList.add('drop-ready');
    },
    stop(event) {
        const a = this.active;
        if (!a || (event?.pointerId !== undefined && event.pointerId !== a.id)) return;
        this.active = null;
        if (a.moved && event?.type === 'pointerup') {
            const target = document.elementFromPoint(event.clientX, event.clientY);
            if (a.options.itemId && target?.closest('[data-trash-target]')) Session.trash(a.options.itemId());
            else a.options.drop?.(event, a.data, target);
        }
        if (a.moved) a.element.dataset.suppressClick = String(performance.now() + 400);
        a.options.end?.();
        a.element.classList.remove('drag-source');
        document.body.classList.remove('pointer-dragging');
        document.querySelectorAll('.drop-ready').forEach(e => e.classList.remove('drop-ready'));
        try { if (a.element.hasPointerCapture(a.id)) a.element.releasePointerCapture(a.id); } catch {}
    },
    init() {
        document.addEventListener('pointermove', e => this.move(e), { passive: false });
        document.addEventListener('pointerup', e => this.stop(e));
        document.addEventListener('pointercancel', e => this.stop(e));
        window.addEventListener('blur', () => this.stop());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
        const suppress = e => {
            const source = e.target.closest('[data-suppress-click]');
            if (source && Number(source.dataset.suppressClick) > performance.now()) {
                e.preventDefault(); e.stopImmediatePropagation();
            }
        };
        document.addEventListener('click', suppress, true);
        document.addEventListener('dblclick', suppress, true);
    }
};
