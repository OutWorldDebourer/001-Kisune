import type { EscenaApi } from './escena3d';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const fino = window.matchMedia('(hover: hover) and (pointer: fine)');
const ORBITA_MAX = 5;

function initEscena3D() {
  const root = document.querySelector<HTMLElement>('[data-escena]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-escena-canvas]');
  const view = root?.querySelector<HTMLButtonElement>('[data-escena-vista]');
  const pause = root?.querySelector<HTMLButtonElement>('[data-escena-pausa]');
  if (!root || !canvas || !view || !pause || reduce.matches) return;
  view.hidden = false;
  let api: EscenaApi | null = null;
  let visible = true;
  let active = false;
  let paused = false;
  let pending = 0;
  const pointer = { x: 0, y: 0 };
  const sync = () => api?.setLoop(active && visible && !paused && !reduce.matches && document.visibilityState === 'visible');
  const update = () => {
    pending = 0;
    if (!active || paused || reduce.matches) return;
    const scroll = Math.min(1, Math.max(0, -root.getBoundingClientRect().top / innerHeight)) * 2.5;
    api?.mirar(pointer.x * ORBITA_MAX, -pointer.y * ORBITA_MAX + scroll);
  };
  const request = () => { if (!pending) pending = requestAnimationFrame(update); };
  view.addEventListener('click', async () => {
    if (!api) {
      view.disabled = true;
      view.textContent = 'Preparando vista…';
      try {
        const module = await import('./escena3d');
        api = module.montarEscena(canvas, { cheap: (navigator.hardwareConcurrency ?? 8) <= 4 });
      } catch { api = null; }
      view.disabled = false;
      if (!api) {
        view.textContent = 'Vista ilustrada';
        view.disabled = true;
        return;
      }
      api.progreso(1);
    }
    active = !active;
    root.dataset.estado = active ? 'viva' : 'poster';
    view.textContent = active ? 'Ver ilustración' : 'Explorar en 3D';
    view.setAttribute('aria-pressed', String(active));
    pause.hidden = !active;
    sync();
    if (active) request();
  });
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Activar movimiento' : 'Pausar movimiento';
    sync();
    if (!paused) request();
  });
  if (fino.matches) {
    root.addEventListener('pointermove', event => {
      const rect = root.getBoundingClientRect();
      pointer.x = MathUtilsClamp((event.clientX - rect.left) / rect.width * 2 - 1);
      pointer.y = MathUtilsClamp((event.clientY - rect.top) / rect.height * 2 - 1);
      request();
    }, { passive: true });
    root.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; request(); });
  }
  addEventListener('scroll', request, { passive: true });
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(root);
  }
  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      active = false;
      root.dataset.estado = 'reposo';
      view.setAttribute('aria-pressed', 'false');
      view.textContent = 'Explorar en 3D';
      pause.hidden = true;
    }
    view.hidden = reduce.matches;
    sync();
  });
  canvas.addEventListener('webglcontextlost', () => {
    active = false;
    root.dataset.estado = 'poster';
    pause.hidden = true;
    view.textContent = 'Vista ilustrada';
    view.disabled = true;
    sync();
  });
}
const MathUtilsClamp = (value: number) => Math.max(-1, Math.min(1, value));

function initInclinacion() {
  if (!fino.matches) return;
  const tarjetas = [...document.querySelectorAll<HTMLElement>('.tarjeta-visual')];
  if (!tarjetas.length) return;
  const MAX = 4.5;                     // dentro del 3–5° pedido (M07-C01)

  for (const t of tarjetas) {
    let vivo = false;
    let pendiente = 0;
    let x = 0;
    let y = 0;
    const pintar = () => {
      pendiente = 0;
      t.style.setProperty('--tilt-x', `${(x * MAX).toFixed(2)}deg`);
      t.style.setProperty('--tilt-y', `${(y * MAX).toFixed(2)}deg`);
    };
    t.addEventListener(
      'pointermove',
      (ev) => {
        if (reduce.matches) return;
        if (!vivo) {
          vivo = true;
          t.dataset.inclinando = 'si';
        }
        const r = t.getBoundingClientRect();
        // [-1, 1] en cada eje: se normaliza al CENTRO, no a la esquina, para
        // que el máximo de inclinación caiga en el centro de la tarjeta.
        x = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
        y = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height) * 2 - 1));
        // Un update por fotograma y por tarjeta (M07-C06).
        if (!pendiente) pendiente = requestAnimationFrame(pintar);
      },
      { passive: true },
    );
    const soltar = () => {
      vivo = false;
      t.dataset.inclinando = 'no';
      x = 0;
      y = 0;
      if (pendiente) cancelAnimationFrame(pendiente);
      pendiente = 0;
      t.style.setProperty('--tilt-x', '0deg');
      t.style.setProperty('--tilt-y', '0deg');
    };
    t.addEventListener('pointerleave', soltar);
    t.addEventListener('blur', soltar, true);
  }
}

// ═══════════════════════════════════════════════ categoría activa en la navegación
function initCategoriaActiva() {
  const enlaces = [...document.querySelectorAll<HTMLAnchorElement>('[data-categoria]')];
  if (!enlaces.length || !('IntersectionObserver' in window)) return;
  const secciones = enlaces
    .map((a) => document.getElementById(a.dataset.categoria ?? ''))
    .filter((s): s is HTMLElement => !!s);
  if (!secciones.length) return;

  // `aria-current` es lo que anuncia el lector de pantalla; la clase solo
  // pinta el color. Marcar la categoría activa es parte de «navegación
  // compacta con categorías», no un adorno.
  const marcar = (id: string) => {
    for (const a of enlaces) {
      const on = a.dataset.categoria === id;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };

  const visibles = new Set<string>();
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visibles.add(e.target.id);
        else visibles.delete(e.target.id);
      }
      // Con dos secciones a la vez en pantalla (escritorio alto) gana la
      // primera en orden de documento: es la que la persona está leyendo.
      const primera = secciones.find((s) => visibles.has(s.id));
      if (primera) marcar(primera.id);
    },
    { rootMargin: '-25% 0px -60% 0px', threshold: 0 },
  );
  for (const s of secciones) io.observe(s);
  marcar(secciones[0].id);
}

function init() {
  initEscena3D();
  initInclinacion();
  initCategoriaActiva();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
