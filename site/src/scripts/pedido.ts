/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EL CONTROLADOR DEL PEDIDO — el único script que toca el estado.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Este archivo NO calcula nada. Importa `lib/cart.ts` y `lib/estado.ts` y solo
 *  mueve el DOM. Esa es la corrección de fondo del rediseño: antes había una
 *  segunda copia de nombres, precios, totales, validación, serialización y
 *  mensaje dentro de un `<script is:inline>` de ~500 líneas, y las dos copias
 *  divergieron seis veces seguidas. Ahora hay una sola, en TypeScript, con
 *  pruebas. Si la carta cambia de precio, cambia en `menu.ts` y punto.
 *
 *  ⚠️ CAMBIO DE INVARIANTE, deliberado: el proyecto mantenía «0 archivos JS
 *  externos». Eso era cierto y engañoso: el JS inline pesaba lo mismo, solo que
 *  sin caché, sin tipos y sin pruebas. Este archivo lo empaqueta el bundler de
 *  Astro en UN archivo con hash, que se cachea entre visitas. Mismo peso en
 *  bytes; otra capacidad para mantenerlo cierto.
 *
 *  ── Reglas que este script respeta (salen de la auditoría, no del gusto) ──
 *  · Todo nodo que este script gobierna EXISTE SIEMPRE en el DOM. Su
 *    visibilidad la decide `pintar()`, nunca el HTML de build. (Seis bugs
 *    seguidos salieron de lo contrario: nodos renderizados con `hidden` que
 *    nada volvía a mostrar.)
 *  · `pintar()` recrea las filas del pedido, así que el elemento enfocado
 *    desaparece. Se guarda QUÉ control era y se devuelve el foco a su
 *    equivalente; si ya no existe, a un control SUPERVIVIENTE; nunca al
 *    `body`, que es como se pierde el foco de verdad.
 *  · El estado y el precio cambian AL INSTANTE. La animación acompaña; no
 *    bloquea. No se anima el precio pasando por cifras falsas.
 *  · La opción de un extra viaja al pedido y al mensaje, pero NO cambia el
 *    precio: la carta no confirma recargo.
 */

import {
  MAX_CANTIDAD,
  MEJOR_VALOR,
  TAMANO_INICIAL,
  precioPorCorte,
  PRECIO_BANDEJA,
  PRECIO_EXTRA,
  agregar,
  clave,
  computeTotals,
  excedeMensaje,
  gruposDeOpciones,
  mensajeWa,
  nombreLinea,
  opcionesDe,
  opcionesDeLinea,
  reemplazar,
  setCantidad,
  type Linea,
} from '../lib/cart.ts';
import { CLAVE_ALMACEN, envolver, leerDestino, restaurar, serializar } from '../lib/estado.ts';
import { cortes as CORTES, formatPrice } from '../data/menu.ts';
import { visualFor } from '../data/visuals.ts';

const $ = <T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document) =>
  raiz.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document) =>
  [...raiz.querySelectorAll<T>(sel)];


// ─────────────────────────────────────────────────────────────────── estado
/** Las líneas del pedido. NUNCA se edita en sitio: siempre se reasigna. */
let lineas: Linea[] = [];

/** Producto abierto en el configurador (null = cerrado). */
let activo: { tipo: 'bandeja' | 'extra'; nombre: string } | null = null;
/** Clave de la línea que se está EDITANDO (null = se está agregando). */
let editando: string | null = null;
/** Tamaño marcado en el configurador. */
let cortesSel: number = TAMANO_INICIAL;   // se abre en la bandeja más pequeña (M05-C01)
/** Opción marcada en el configurador, si el producto tiene. */
/**
 * Opciones marcadas en el configurador, por producto y por grupo de elección.
 *
 * Antes era un único `opcionSel: string | null`, y eso no podía representar
 * «ebi con salsa de anguila», que es exactamente lo que ofrece la carta del
 * Burguermaki (M05-C05). Ahora hay una marca POR GRUPO: elegir el relleno no
 * desmarca la salsa.
 */
let opcionesSel: Record<string, string> = {};
/** Cantidad del configurador. */
let cantSel = 1;
/** Si el visitante llegó con un deep-link, para abrirlo al cargar. */
let destinoInicial: { tipo: 'bandeja' | 'extra'; nombre: string; cortes?: number } | null = null;
/**
 * `true` una vez que la persona ha tocado el pedido. A partir de ahí la URL
 * puede llevar fragmento. Antes de eso, NUNCA (invariante 21: escribir un
 * ancla en la carga inicial hace que el navegador salte, la página se
 * autodesplace y el observador de la escena ve salir al héroe y lo pausa).
 */
let tocado = false;

/**
 * Anuncio pendiente para la región viva.
 *
 * `pintar()` se llama tras CADA cambio y no sabe cuál fue. Sin esto, el texto
 * vivo describía el pedido entero y siempre empezaba por la primera línea, de
 * modo que agregar el té anunciaba California (hallazgo 25). Ahora cada
 * operación deja escrito lo que pasó y `pintar()` lo dice una sola vez.
 */
let pendienteAnuncio: string | null = null;

// ──────────────────────────────────────────────────────────────────── nodos
const panel = $<HTMLDialogElement>('[data-panel]');
const panelTitulo = $('[data-panel-titulo]');
const panelVacio = $('[data-panel-vacio]');
const panelLineas = $<HTMLUListElement>('[data-panel-lineas]');
const panelCortes = $('[data-panel-cortes]');
const panelTotal = $('[data-panel-total]');
const panelEnviar = $<HTMLAnchorElement>('[data-panel-enviar]');
const panelEnviarTexto = $('[data-panel-enviar-texto]');
const panelSeguir = $<HTMLButtonElement>('[data-panel-seguir]');
const panelNota = $('[data-panel-nota]');
const panelCopiar = $<HTMLButtonElement>('[data-panel-copiar]');
const panelAviso = $('[data-panel-aviso]');
const barra = $('[data-barra]');
const barraTexto = $('[data-barra-texto]');
const barraTotal = $('[data-barra-total]');
const contadores = $$('[data-contador]');
const anuncio = $('[data-live]');

const config = $<HTMLDialogElement>('[data-config]');
const configTitulo = $('[data-config-titulo]');
const configDesc = $('[data-config-desc]');
const configTamanos = $('[data-config-tamanos]');
const configTamanosGrid = $('[data-config-tamanos-grid]');
const configOpciones = $('[data-config-opciones]');
const configOpcionesGrid = $('[data-config-opciones-grid]');
const configPrecio = $('[data-config-precio]');
const configUnidad = $('[data-config-unidad]');
const configArte = $('[data-config-arte]');
const configGuardar = $<HTMLButtonElement>('[data-config-guardar]');
const configCant = $<HTMLInputElement>('[data-config-cant]');

/** Quién abrió el configurador, para devolverle el foco al cerrarlo. */
let configDisparador: HTMLElement | null = null;

// ──────────────────────────────────────────────────────────────── arranque
function arrancar() {
  // El pedido NO lo pone el sitio: arranca vacío salvo que haya un enlace o un
  // guardado válido. Un carrito con una línea puesta es una decisión del sitio
  // sobre el pedido de cada visitante.
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem(CLAVE_ALMACEN);
  } catch {
    guardado = null;                       // modo privado / cookies bloqueadas
  }

  lineas = restaurar({
    search: location.search,
    hash: location.hash,
    guardado,
    ahora: Date.now(),
  }).lineas;

  destinoInicial = leerDestino(location.search);

  enlazar();
  const hero = document.getElementById('inicio');
  if (barra && hero && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      barra.hidden = entry.isIntersecting;
    });
    observer.observe(hero);
  } else if (barra) {
    barra.hidden = false;
  }
  commit();
  abrirDestinoSiHay();

  // Un enlace con `?roll=…` abre la configuración de ese producto. La query se
  // limpia DESPUÉS de abrirlo, para que un recargo no reabra el diálogo, pero
  // SIN tocar `q`: el pedido del deep-link se conserva.
  if (destinoInicial) {
    const limpio = new URLSearchParams(location.search);
    limpio.delete('roll');
    limpio.delete('producto');
    limpio.delete('cortes');
    const q = limpio.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  }

  // `pageshow` cubre el back-forward cache de Safari/iOS: al volver, el DOM se
  // restaura pero el estado en memoria puede no coincidir con lo pintado.
  window.addEventListener('pageshow', () => pintar());
}

function guardarLocal() {
  try {
    // Se guarda SIEMPRE, incluso vacío: un pedido vacío también es
    // información válida (la persona lo vació a propósito) y evita que un
    // guardado viejo resucite al recargar.
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(envolver(serializar(lineas), Date.now())));
  } catch {
    /* sin almacenamiento: el pedido vive solo en la URL */
  }
}

function sincronizarUrl() {
  const s = serializar(lineas);
  const hash = tocado ? '#catalogo' : '';
  const next = (s ? `?${s}` : '') + hash;
  if (next === location.search + location.hash) return;
  history.replaceState(null, '', location.pathname + next);
}

// ══════════════════════════════════════════════════════ FOCO QUE NO SE PIERDE
/**
 * Describe QUÉ control tenía el foco con una cadena estable, para poder
 * devolvérselo después de que `pintar()` haya rehecho las filas.
 */
function marcaDeFoco(el: Element | null): string | null {
  if (!el || !(el instanceof HTMLElement)) return null;
  const fila = el.closest<HTMLElement>('[data-linea]');
  if (fila) {
    const accion = el.getAttribute('data-accion');
    return `${fila.dataset.linea ?? ''}|${accion ?? ''}`;
  }
  const card = el.closest<HTMLElement>('[data-configurar],[data-anadir]');
  if (card) return `card|${card.dataset.nombre ?? ''}`;
  return null;
}

/**
 * Devuelve el foco al control equivalente. Si la línea desapareció, va a un
 * control SUPERVIVIENTE; si no queda ninguno, al título del panel (que es
 * enfocable). Nunca al `body`: el `body` es exactamente el "focus loss" que
 * WAI-ARIA APG marca como error.
 */
function devolverFoco(marca: string | null) {
  if (!marca) return;
  const [k, accion] = marca.split('|');

  if (k === 'card') {
    const b = $$<HTMLElement>('[data-configurar],[data-anadir]').find(
      (x) => x.dataset.nombre === accion,
    );
    b?.focus();
    return;
  }

  const fila = panelLineas?.querySelector<HTMLElement>(`[data-linea="${CSS.escape(k)}"]`);
  if (fila) {
    const dest =
      accion === 'campo'
        ? fila.querySelector<HTMLElement>('[data-accion="campo"]')
        : fila.querySelector<HTMLElement>(`[data-accion="${CSS.escape(accion)}"]`);
    if (dest instanceof HTMLInputElement) {
      dest.focus();
      dest.select();
    } else {
      dest?.focus();
    }
    return;
  }

  // La línea ya no está (se quitó, o se fusionó al editar). Se busca otra.
  const superviviente = panelLineas?.querySelector<HTMLElement>('[data-accion="campo"]');
  superviviente?.focus();
  if (!superviviente) panelTitulo?.focus();
}

function commit() {
  const marca = marcaDeFoco(document.activeElement);
  guardarLocal();
  sincronizarUrl();
  pintar();
  devolverFoco(marca);
}

// ────────────────────────────────────────────────────────────── renderizar
function botonStepper(accion: 'menos' | 'mas', etiqueta: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stepper-btn';
  b.dataset.accion = accion;
  b.setAttribute(
    'aria-label',
    accion === 'mas' ? `Agregar una unidad de ${etiqueta}` : `Quitar una unidad de ${etiqueta}`,
  );
  b.innerHTML =
    accion === 'mas'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="size-4"><path d="M7.25 3h1.5v4.25H13v1.5H8.75V13h-1.5V8.75H3v-1.5h4.25z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="size-4"><path d="M3 7.25h10v1.5H3z" fill="currentColor"/></svg>';
  return b;
}

const ICONO_EDITAR =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="size-4"><path d="M11.7 2.3a1.4 1.4 0 0 1 2 2l-7.4 7.4-2.7.7.7-2.7z" fill="currentColor"/></svg>';
const ICONO_QUITAR =
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="size-3.5"><path d="M4.6 3.9 8 7.3l3.4-3.4.7.7L8.7 8l3.4 3.4-.7.7L8 8.7l-3.4 3.4-.7-.7L7.3 8 3.9 4.6z" fill="currentColor"/></svg>';

function pintar() {
  const t = computeTotals(lineas);
  const vacio = lineas.length === 0;

  // ── filas del pedido ──
  if (panelLineas) {
    panelLineas.textContent = '';
    const frag = document.createDocumentFragment();
    for (const l of t.lineas) {
      const k = clave(l);
      const li = document.createElement('li');
      li.className = 'linea-pedido';
      li.dataset.linea = k;

      const nombre = l.tipo === 'bandeja' ? String(l.roll) : String(l.producto);

      const info = document.createElement('span');
      info.className = 'linea-pedido-info';
      const n1 = document.createElement('span');
      n1.className = 'linea-pedido-nombre';
      n1.textContent = nombre;
      const n2 = document.createElement('span');
      n2.className = 'linea-pedido-meta';
      const unidad = l.tipo === 'bandeja' ? PRECIO_BANDEJA[l.cortes as number] : PRECIO_EXTRA[l.producto as string];
      const partes: string[] = [];
      if (l.tipo === 'bandeja') partes.push(`${l.cortes} cortes`);
      /* Todas las variantes marcadas, no solo una. Con `opciones` en lista, leer
         solo `l.opcion` dejaba la línea del pedido en «1 × S/ 20.00»: el
         relleno y la salsa que se eligieron se veían en el mensaje de WhatsApp
         pero NO en el pedido, justo donde se revisa antes de enviarlo. */
      for (const id of opcionesDeLinea(l)) {
        const etiqueta = etiquetaDeOpcion(nombre, id);
        if (etiqueta) partes.push(etiqueta);
      }
      partes.push(`${l.cantidad} × ${formatPrice(unidad ?? 0)}`);
      n2.textContent = partes.join(' · ');
      info.append(n1, n2);

      const sub = document.createElement('span');
      sub.className = 'linea-pedido-subtotal';
      sub.textContent = formatPrice(l.subtotal);

      const controles = document.createElement('span');
      controles.className = 'stepper';
      controles.appendChild(botonStepper('menos', nombreLinea(l)));
      const inp = document.createElement('input');
      inp.className = 'stepper-input';
      inp.type = 'number';
      inp.inputMode = 'numeric';
      inp.min = '0';
      inp.max = String(MAX_CANTIDAD);
      inp.step = '1';
      inp.value = String(l.cantidad);
      inp.dataset.accion = 'campo';
      inp.setAttribute('aria-label', `${nombreLinea(l)}, cantidad`);
      controles.append(inp, botonStepper('mas', nombreLinea(l)));

      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'linea-pedido-btn';
      editar.dataset.accion = 'editar';
      editar.setAttribute('aria-label', `Editar ${nombreLinea(l)}`);
      editar.innerHTML = ICONO_EDITAR;

      const borrar = document.createElement('button');
      borrar.type = 'button';
      borrar.className = 'linea-pedido-btn';
      borrar.dataset.accion = 'quitar';
      borrar.setAttribute('aria-label', `Quitar ${nombreLinea(l)} del pedido`);
      borrar.innerHTML = ICONO_QUITAR;

      // Editar y quitar van en SU PROPIA fila, con celdas separadas. Antes
      // los dos botones compartían `grid-column: 2; grid-row: 2` y quedaban
      // uno encima del otro: medidos, 70×16 px y 14×14 px, y pulsar «quitar»
      // acababa editando (o al revés).
      const acciones = document.createElement('span');
      acciones.className = 'linea-pedido-acciones';
      acciones.append(editar, borrar);

      li.append(info, sub, controles, acciones);
      frag.appendChild(li);
    }
    panelLineas.appendChild(frag);
  }

  /* ── totales: siempre presentes, nunca truncados ──
   *
   * ⚠️ «Sin cortes» como único resumen era inútil (M05-C06): un pedido de solo
   * bebidas no tiene cortes, y decir eso no le dice a nadie qué ha pedido. Ahora
   * el resumen cuenta las dos cosas por separado: los cortes de los rolls y los
   * ARTÍCULOS (bandejas + unidades sueltas). Con cero cortes pero con bebidas,
   * el texto describe los artículos.
   */
  if (panelCortes) {
    const articulos = t.lineas.reduce((a, l) => a + l.cantidad, 0);
    const partes: string[] = [];
    if (t.totalCortes) partes.push(`${t.totalCortes} cortes`);
    if (articulos) partes.push(`${articulos} ${articulos === 1 ? 'artículo' : 'artículos'}`);
    panelCortes.textContent = partes.length ? partes.join(' · ') : 'Pedido vacío';
  }
  if (panelTotal) panelTotal.textContent = formatPrice(t.totalPrecio);
  if (panelVacio) panelVacio.hidden = !vacio;
  if (panelLineas) panelLineas.hidden = vacio;

  // ── envío: enlace, o copia cuando el mensaje no cabe ──
  const largo = !vacio && excedeMensaje(lineas);
  if (panelAviso) {
    panelAviso.hidden = !largo;
    if (largo) {
      panelAviso.textContent =
        `Tu pedido tiene ${mensajeWa(lineas).length} caracteres y no cabe cómodo en un enlace de ` +
        'WhatsApp. Cópialo y pégalo en el chat: el texto sale entero, sin recortes.';
    }
  }
  if (panelCopiar) panelCopiar.hidden = !largo;
  if (panelEnviar) {
    // El enlace cambia de PAPEL según el estado, no solo de texto:
    //   · con productos → envía el pedido escrito, con todos sus detalles;
    //   · vacío       → es una CONSULTA, y lo dice. Un botón que pone
    //                  «Enviar pedido» y abre un chat vacío es una mentira
    //                  que hace perder la confianza justo en el cierre.
    const wa = vacio
      ? 'https://wa.me/51988843683?text=' +
        encodeURIComponent(
          '¡Hola Kitsune Makis! Quiero información sobre las bandejas: tamaños, ingredientes y precios.',
        )
      : 'https://wa.me/51988843683?text=' + encodeURIComponent(mensajeWa(lineas));
    if (panelEnviar.getAttribute('href') !== wa) panelEnviar.setAttribute('href', wa);
    const etiqueta = vacio ? 'Consultar por WhatsApp' : 'Enviar pedido por WhatsApp';
    if (panelEnviarTexto && panelEnviarTexto.textContent !== etiqueta) {
      panelEnviarTexto.textContent = etiqueta;
    }
  }
  if (panelSeguir) panelSeguir.hidden = vacio;
  // La nota se ve CUANDO HAY ALGO QUE COORDINAR. Con el pedido vacío no hay
  // nada que coordinar y el texto sobraba: por eso llevaba `hidden` en el
  // build y nadie lo mostraba nunca.
  if (panelNota) panelNota.hidden = vacio;

  // ── barra inferior ──
  if (barra) barra.dataset.estado = vacio ? 'vacio' : 'lleno';
  if (barraTexto) barraTexto.textContent = vacio ? 'Explorar la carta' : 'Ver pedido';
  if (barraTotal) barraTotal.textContent = vacio ? '' : formatPrice(t.totalPrecio);

  // ── contador de la navegación: unidades, no filas ──
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0);
  for (const c of contadores) {
    c.textContent = unidades ? String(unidades) : '';
    c.hidden = !unidades;
    const padre = c.closest<HTMLElement>('[data-contador-wrap]');
    if (padre) padre.dataset.estado = unidades ? 'lleno' : 'vacio';
  }
  // El ACCESO al pedido anuncia el total (M01-C06). El texto del botón basta
  // para un ojo perezoso, pero quien no ve la insignia necesita que el nombre
  // accesible diga cuántas unidades hay — o que diga que está vacío.
  for (const b of $$<HTMLElement>('[data-abrir-pedido]')) {
    b.setAttribute(
      'aria-label',
      unidades
        ? `Abrir el pedido: ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}, ${formatPrice(computeTotals(lineas).totalPrecio)}`
        : 'Abrir el pedido, todavía vacío',
    );
  }

  if (anuncio) {
    // UNA sola región viva: nada más anuncia, porque dos = dos voces.
    //
    // ⚠️ Halla 25: antes decía SIEMPRE `lineas[0]`, así que al agregar el té
    // anunciaba «California · 20 cortes» — la primera línea, no la que había
    // cambiado. Ahora el texto nombra la operación que se acaba de hacer.
    const op = pendienteAnuncio;
    pendienteAnuncio = null;
    if (op) {
      anuncio.textContent = op;
    } else {
      anuncio.textContent = vacio
        ? ''
        : `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} en tu pedido · ${formatPrice(t.totalPrecio)}`;
    }
  }

  // Las tarjetas reflejan qué productos ya están en el pedido, y CUÁNTAS
  // unidades. Se cuenta por producto, no por línea: el mismo roll en dos
  // tamaños son dos líneas del pedido pero UN producto de la carta, y el
  // indicador tiene que sumar las dos sin borrar ninguna (M04-C07).
  const unidadesPor = new Map<string, number>();
  for (const l of lineas) {
    // `roll` y `producto` son discriminantes: solo uno existe según `tipo`, pero
    // el tipo no lo estrecha a TypeScript. Se normaliza a cadena una vez.
    const claveProducto = String(l.tipo === 'bandeja' ? l.roll : l.producto);
    unidadesPor.set(claveProducto, (unidadesPor.get(claveProducto) ?? 0) + l.cantidad);
  }
  for (const card of $$<HTMLElement>('[data-producto]')) {
    const n = card.dataset.nombre ?? '';
    const tipo = card.dataset.tipo;
    const unidades = unidadesPor.get(n) ?? 0;
    const pertenece = lineas.some(
      (l) => (tipo === 'bandeja' ? l.roll === n : l.producto === n),
    );
    card.dataset.enPedido = pertenece ? 'si' : 'no';
    card.dataset.unidades = String(unidades);
    const insignia = card.querySelector<HTMLElement>('[data-unidades]');
    if (insignia) {
      insignia.hidden = unidades === 0;
      const nodo = card.querySelector<HTMLElement>('[data-unidades-n]');
      if (nodo) nodo.textContent = String(unidades);
    }
  }
}

function etiquetaDeOpcion(producto: string, opcion: string): string {
  const o = opcionesDe(producto).find((x) => x.id === opcion);
  return o ? o.label : opcion;
}

// ───────────────────────────────────────────────────────── abrir el pedido
/** En escritorio (≥1024px) el panel es una columna sticky, no un diálogo. */
const mqColumna = window.matchMedia('(min-width: 1024px)');
const panelEsColumna = () => mqColumna.matches;

/**
 * Quién abrió el panel, para devolverle el foco al cerrarlo.
 *
 * No se confía en el comportamiento implícito del navegador: `showModal()`
 * recuerda "el elemento que tenía el foco" solo si lo hubo, y si el panel se
 * abrió por un `.click()` programático o por un toque, lo que había queda en un
 * estado arbitrario y al cerrar el foco cae donde toque. Medido: tras abrir y
 * cerrar el panel móvil con Escape, el foco acababa en el botón «Configurar» de
 * una tarjeta del catálogo — a seis pantallas de donde se salió.
 */
let panelDisparador: HTMLElement | null = null;

function abrirPanel(disp?: HTMLElement | null) {
  if (!panel) return;
  // `data-abierto` se pone en BOTH ramas, y no solo en la de escritorio.
  //
  // BUG PROPIO (cazado mirando la captura de móvil, no por un test): en móvil
  // se llamaba a `showModal()` sin tocar `data-abierto`, así que el atributo
  // se quedaba en "no" y el CSS —que esconde el diálogo con
  // `dialog[data-abierto='no'] { display: none }`— lo dejaba invisible con la
  // misma mecánica de un modal abierto. Los tests que existían miraban el
  // TEXTO de la barra ("Ver pedido · S/ 124.00") y pasaban: la barra decía lo
  // correcto y el panel no existía.
  panel.dataset.abierto = 'si';
  panelDisparador =
    disp ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (panelEsColumna()) return;      // en escritorio es una columna, no un diálogo
  if (!panel.open) panel.showModal();
}

function cerrarPanel() {
  if (!panel) return;
  // En escritorio, seguir explorando conserva la columna del pedido.
  panel.dataset.abierto = panelEsColumna() ? 'si' : 'no';
  if (panel.open && !panelEsColumna()) panel.close();   // el evento `close` devuelve el foco
  else devolverFocoAlDisparador();
}

/** Escape cierra el panel: mismo camino que el botón de cerrar, foco incluido. */
function devolverFocoAlDisparador() {
  const d = panelDisparador;
  panelDisparador = null;
  if (d && d.isConnected) {
    d.focus({ preventScroll: true });
    return;
  }
  // Si no hay disparador (o ya no existe), el foco va al acceso al pedido de la
  // navegación, que siempre está. Nunca al `body`.
  $<HTMLElement>('[data-abrir-pedido]')?.focus({ preventScroll: true });
}
function alternarPanel(disp?: HTMLElement | null) {
  if (panelEsColumna()) {
    document.getElementById('catalogo')?.scrollIntoView({ block: 'start' });
    return;
  }
  if (panel?.open) cerrarPanel();
  else abrirPanel(disp);
}

// ──────────────────────────────────────────────────────── el configurador
/**
 * Abre la configuración de UN producto. Solo se pintan los cinco tamaños de
 * ESE producto: la rejilla de 8 rolls × 5 tamaños que había antes era la
 * duplicación que el rediseño elimina, y lo que hacía la página ilegible.
 */
function abrirConfigurador(nombre: string, cortes?: number) {
  if (!config || !activo) return;
  const esBandeja = activo.tipo === 'bandeja';
  const opciones = esBandeja ? [] : opcionesDe(nombre);

  if (configTitulo) configTitulo.textContent = nombre;
  if (configDesc) configDesc.textContent = descripcionDe(nombre);
  /* La unidad, explícita (M05-C03): un roll se vende en BANDEJAS de N cortes y
     un extra POR UNIDAD. Sin esto, «cantidad 3» no dice si son tres rollos
     enteros o tres platos sueltos. */
  if (configUnidad) {
    configUnidad.textContent = esBandeja
      ? 'Se vende en bandejas, por cortes.'
      : 'Precio por unidad.';
  }
  /* La identidad del producto, con el MISMO recurso que usa su tarjeta: la foto
     verificada si existe, y si no, la ilustración. Abría el configurador con el
     nombre y nada más, y con dos diálogos seguidos no había forma de saber si
     el segundo era el mismo plato. */
  if (configArte) {
    configArte.replaceChildren();
    delete configArte.dataset.tratamiento;
    const visual = visualFor(nombre);
    if (visual) {
      const img = document.createElement('img');
      img.src = visual.image.src;
      img.alt = '';
      img.decoding = 'async';
      configArte.appendChild(img);
      if (visual.generated) configArte.dataset.tratamiento = 'Ilustración IA';
    }
  }
  const cantidad = esBandeja ? 'bandejas' : 'unidades';
  $('[data-config-cantidad-texto]')!.textContent = `Cantidad de ${cantidad}`;
  $('#config-cantidad-etiqueta')!.textContent = `Número de ${cantidad}`;
  $('[data-config-menos]')?.setAttribute('aria-label', `Disminuir cantidad de ${cantidad}`);
  $('[data-config-mas]')?.setAttribute('aria-label', `Aumentar cantidad de ${cantidad}`);

  if (configTamanos) configTamanos.hidden = !esBandeja;
  // Se rellena la REJILLA interior, no el contenedor: antes se appendaban los
  // botones directamente sobre el contenedor y el `textContent = ''` se llevaba
  // por delante la rejilla de 5 columnas, con lo que los tamaños salían
  // apilados sin rejilla. Medido en la captura del móvil.
  if (configTamanosGrid) {
    configTamanosGrid.textContent = '';
    if (esBandeja) {
      for (const c of CORTES) {
        // Un <input type="radio"> NATIVO dentro del <fieldset> del template.
        //
        // Antes eran <button role="radio"> sueltos, sin contenedor de grupo, sin
        // nombre accesible y sin flechas: cuatro de los cinco ni siquiera eran
        // alcanzables con Tab. El patrón completo (grupo, selección única,
        // flechas) lo resuelve el navegador si se le da la casilla de verdad.
        const et = document.createElement('label');
        et.className = 'tamano';
        et.dataset.cortes = String(c.n);
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'config-cortes';
        inp.value = String(c.n);
        inp.dataset.cortes = String(c.n);
        inp.className = 'tamano-input';
        const n = document.createElement('span');
        n.className = 'tamano-n';
        n.textContent = `${c.n} cortes`;
        const p = document.createElement('span');
        p.className = 'tamano-p';
        p.textContent = formatPrice(c.price);
        const extra = document.createElement('span');
        extra.className = 'tamano-x';
        /* Precio POR CORTE: es lo que hace comparables dos bandejas de tamaños
           distintos (10 cortes son S/ 2,00/corte y 40 son S/ 1,60). Sin este
           número, «más grande» parece «más caro». */
        extra.textContent = `S/ ${precioPorCorte(c.n).toFixed(2)} / corte`;
        et.append(inp, n, p, extra);
        /* El tamaño con mejor precio por corte se marca como un dato, no como
           una recomendación: la elección es de quien pide (M05-C01). */
        if (c.n === MEJOR_VALOR[0]) {
          const aviso = document.createElement('span');
          aviso.className = 'tamano-mejor';
          aviso.textContent = 'Mejor valor';
          et.appendChild(aviso);
        }
        configTamanosGrid.appendChild(et);
      }
    }
  }

  if (configOpciones) configOpciones.hidden = opciones.length === 0;
  if (configOpcionesGrid) {
    configOpcionesGrid.textContent = '';
    /* Las opciones se pintan por GRUPO. El Burguermaki ofrece relleno y salsa:
       son dos decisiones independientes y en una lista plana de cinco no se
       entiende cuál va con cuál. Cada grupo es su propio `fieldset` con su
       `legend`, así que también se entiende con el lector de pantalla
       (M05-C05). */
    for (const grupo of gruposDeOpciones(nombre)) {
      const fs = document.createElement('fieldset');
      fs.className = 'config-grupo';
      const lg = document.createElement('legend');
      lg.className = 'config-grupo-titulo';
      lg.textContent = grupo.etiqueta;
      fs.appendChild(lg);
      const fila = document.createElement('div');
      fila.className = 'mt-1.5 flex flex-wrap gap-1.5';
      for (const o of grupo.opciones) {
        const et = document.createElement('label');
        et.className = 'opcion';
        et.dataset.opcion = o.id;
        et.dataset.grupo = grupo.grupo;
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = `config-${grupo.grupo}-${nombre.replace(/[^a-zA-Z0-9]+/g, '-')}`;
        inp.value = o.id;
        inp.dataset.opcion = o.id;
        inp.dataset.grupo = grupo.grupo;
        inp.className = 'opcion-input';
        const s = document.createElement('span');
        s.textContent = o.label;
        et.append(inp, s);
        fila.appendChild(et);
      }
      fs.appendChild(fila);
      configOpcionesGrid.appendChild(fs);
    }
    if (opciones.length) {
      const nota = document.createElement('p');
      nota.className = 'config-nota';
      nota.textContent = 'El relleno es una preferencia. Confirma la composición y el precio final con Kitsune por WhatsApp.';
      configOpcionesGrid.appendChild(nota);
    }
    marcarOpciones();
  }

  marcarTamanos(cortes ?? TAMANO_INICIAL);
  if (configCant) {
    cantSel = Math.max(1, Math.min(MAX_CANTIDAD, cantSel));
    configCant.value = String(cantSel);
  }
  if (configGuardar) {
    configGuardar.textContent = editando ? 'Guardar cambios' : 'Agregar al pedido';
  }
  actualizarPrecioConfig();

  if (!config.open) config.showModal();
  /* El foco entra en el diálogo por el control que DECIDE la configuración.
   *
   * ⚠️ BUG PROPIO (cazado por M08-C03): el selector era `.tamano.is-on`, y al
   * pasar los tamaños a radios nativos la clase `is-on` pasó a estar en la
   * ETIQUETA mediante `:has(:checked)` —o sea, ya no existe como atributo—.
   * El selector no encontraba nada, el diálogo abría SIN FOCO ADENTRO y las
   * flechas del teclado se perdían: con el foco en el documento, pulsar
   * flecha no cambiaba el tamaño. Ahora se enfoca el radio marcado y, si no
   * hay ninguno, el primero del grupo.
   */
  const primerFoco =
    config.querySelector<HTMLElement>('[data-config-tamanos] input[data-cortes]:checked')
    ?? config.querySelector<HTMLElement>('[data-config-tamanos] input[data-cortes]')
    ?? config.querySelector<HTMLElement>('[data-config-opciones] input[data-opcion]')
    ?? configCant
    ?? configGuardar;
  primerFoco?.focus();
}

function descripcionDe(nombre: string): string {
  const card = $$<HTMLElement>('[data-producto]').find((c) => c.dataset.nombre === nombre);
  return card?.dataset.descripcion ?? '';
}

function marcarTamanos(cortes: number) {
  cortesSel = cortes;
  // Se marca el RADIO, no la etiqueta: es el control real, y el estilo de la
  // etiqueta lo deriva de `:has(:checked)`. Marcar las dos cosas duplicaría el
  // estado en dos sitios, que es justo como se desincroniza.
  for (const inp of $$<HTMLInputElement>('[data-config-tamanos] input[data-cortes]')) {
    inp.checked = Number(inp.dataset.cortes) === cortes;
  }
}

function marcarOpciones() {
  for (const inp of $$<HTMLInputElement>('[data-config-opciones] input[data-opcion]')) {
    const grupo = inp.dataset.grupo ?? 'opcion';
    inp.checked = opcionesSel[grupo] === inp.dataset.opcion;
  }
}

/** Opciones marcadas, en el orden en que las declara la carta. */
function opcionesMarcadas(nombre: string): string[] {
  return gruposDeOpciones(nombre)
    .map((g) => opcionesSel[g.grupo])
    .filter((x): x is string => !!x);
}

function actualizarPrecioConfig() {
  if (!activo || !configPrecio) return;
  const unit = activo.tipo === 'bandeja' ? PRECIO_BANDEJA[cortesSel] : PRECIO_EXTRA[activo.nombre];
  if (unit === undefined) {
    configPrecio.textContent = '';
    return;
  }
  const base = activo.tipo === 'bandeja' ? 'por bandeja' : 'c/u';
  const total = cantSel > 1 ? ` · ${formatPrice(unit * cantSel)} en total` : '';
  configPrecio.textContent = `${formatPrice(unit)} ${base}${total}`;
  if (configGuardar) {
    configGuardar.textContent = `${editando ? 'Guardar cambios' : 'Agregar al pedido'} · ${formatPrice(unit * cantSel)}`;
  }
}

function guardarConfiguracion() {
  if (!activo) return;
  const unit = activo.tipo === 'bandeja' ? PRECIO_BANDEJA[cortesSel] : PRECIO_EXTRA[activo.nombre];
  if (unit === undefined) return;                     // el modelo no inventa un precio

  /* La línea que se está editando se captura ANTES de tocar nada.
   *
   * ⚠️ Se capturaba después, y ya no existía: `reemplazar` había sustituido la
   * línea, así que buscar por su clave antigua no encontraba nada. El anuncio
   * salía «: se guardaron los cambios.» — sin nombre de producto y sin decir
   * qué había cambiado. Para quien edita, un mensaje que no nombra la fila ni
   * el cambio no confirma nada (M07-C05).
   */
  const previo = editando ? lineas.find((l) => clave(l) === editando) : undefined;

  const nueva: Linea =
    activo.tipo === 'bandeja'
      ? { tipo: 'bandeja', roll: activo.nombre, cortes: cortesSel, cantidad: cantSel }
      : {
          tipo: 'extra',
          producto: activo.nombre,
          cantidad: cantSel,
          ...(opcionesMarcadas(activo.nombre).length
            ? { opciones: opcionesMarcadas(activo.nombre) }
            : {}),
        };

  // La clave se calcula UNA vez y la comparten las dos cosas que la necesitan:
  // detectar la fusión y devolver el foco a la línea editada.
  const nuevaClave = clave(nueva);

  if (editando) {
    // EDITAR: `reemplazar` sustituye ESA línea EN SU SITIO. Si el resultado
    // coincide con otra línea existente, se fusionan en la que ya ocupaba esa
    // combinación. El resto del pedido no se mueve ni de contenido ni de orden.
    lineas = reemplazar(lineas, editando, nueva);
  } else {
    // AGREGAR: si la combinación idéntica ya existe, ACUMULA. Un tamaño
    // distinto es una combinación distinta: dos bandejas del mismo roll
    // conviven y ninguna se modifica.
    lineas = agregar(lineas, nueva);
  }

  // Se capturan ANTES de cerrar: `cerrarConfigurador()` anula `editando` y
  // `activo`, y con ellos se decide a dónde vuelve el foco.
  const nombreProducto = activo.nombre;
  const veniaDeEdicion = editando !== null;
  const descripcionActual = nombreLinea(nueva);
  const cortesPrevio = previo && previo.tipo === 'bandeja' ? Number(previo.cortes) : 0;

  // El anuncio dice QUÉ CAMBIÓ, no solo que algo cambió (M01-C10).
  if (veniaDeEdicion) {
    const partes: string[] = [];
    if (activo.tipo === 'bandeja' && cortesPrevio && cortesPrevio !== cortesSel) {
      partes.push(`el tamaño pasó de ${cortesPrevio} a ${cortesSel} cortes`);
    }
    if (previo && previo.cantidad !== cantSel) {
      partes.push(`la cantidad pasó de ${previo.cantidad} a ${cantSel}`);
    }
    if (previo && opcionesDeLinea(previo).join('~') !== opcionesDeLinea(nueva).join('~')) {
      partes.push('se actualizaron las opciones');
    }
    if (!partes.length) partes.push('se guardaron los cambios');
    pendienteAnuncio = `${descripcionActual}: ${partes.join(' y ')}.`;
  } else {
    const extra = activo.tipo === 'bandeja' ? `, ${cortesSel} cortes` : '';
    const veces = cantSel > 1 ? ` × ${cantSel}` : '';
    pendienteAnuncio = `${nombreProducto}${extra}${veces} agregado a tu pedido.`;
  }

  cerrarConfigurador();
  tocado = true;
  commit();

  // Si la acción vino de una tarjeta, el foco vuelve a esa tarjeta; si vino de
  // editar una línea, a la línea recién editada. Nunca al `body`.
  if (veniaDeEdicion) {
    devolverFoco(`${nuevaClave}|campo`);
  } else {
    $$<HTMLElement>('[data-configurar],[data-anadir]')
      .find((x) => x.dataset.nombre === nombreProducto)
      ?.focus();
  }
}

function cerrarConfigurador() {
  if (config?.open) config.close();
  activo = null;
  editando = null;
  opcionesSel = {};
  configDisparador?.focus();
  configDisparador = null;
}

function abrirDestinoSiHay() {
  if (!destinoInicial) return;
  const d = destinoInicial;
  destinoInicial = null;
  if (d.tipo === 'bandeja') {
    // ⚠️ Un deep-link puede pedir un producto que NO está en la carta
    // (`?producto=No%20Existe&cortes=30`). Antes se abría igual el
    // configurador: un diálogo titulado con un roll inexistente, con cinco
    // tamaños y un precio, listo para «agregar» algo que no existe. La carta
    // manda: si el nombre no está, el enlace se ignora y la página sigue.
    const existe = $$<HTMLElement>('[data-configurar]').some(
      (b) => b.dataset.nombre === d.nombre,
    );
    if (!existe) return;
    activo = { tipo: 'bandeja', nombre: d.nombre };
    editando = null;
    cantSel = 1;
    abrirConfigurador(d.nombre, d.cortes);
  } else {
    $$<HTMLElement>('[data-anadir]')
      .find((b) => b.dataset.nombre === d.nombre)
      ?.click();
  }
}

// ────────────────────────────────────────────────────────────── eventos
function enlazar() {
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;

    // ── 1. Configurar un producto ──
    // Un roll (elijesize) y un extra con variantes (elige relleno y salsa)
    // pasan por aquí. Antes el tipo estaba fijado a «bandeja» aquí dentro, y un
    // Burguermaki —que sí tiene variantes— no tenía forma de abrirlos: su
    // botón era de agregar directo y las opciones nunca se preguntaban.
    const cfg = t.closest<HTMLElement>('[data-configurar]');
    if (cfg) {
      ev.preventDefault();
      const nombre = cfg.dataset.nombre;
      if (!nombre) return;
      const tipo = cfg.dataset.tipo === 'extra' ? 'extra' : 'bandeja';
      tocado = true;
      configDisparador = cfg;
      activo = { tipo, nombre };
      editando = null;
      opcionesSel = {};
      cantSel = 1;
      // El tamaño solo tiene sentido en un roll; en un extra se ignora.
      abrirConfigurador(nombre, tipo === 'bandeja' ? Number(cfg.dataset.cortes) || undefined : undefined);
      return;
    }

    // ── 2. Agregar un extra (con la opción que esté marcada, si tiene) ──
    const add = t.closest<HTMLElement>('[data-anadir]');
    if (add) {
      ev.preventDefault();
      const nombre = add.dataset.nombre;
      if (!nombre || PRECIO_EXTRA[nombre] === undefined) return;      // nunca S/ 0.00
      const card = add.closest<HTMLElement>('[data-producto]');
      /* TODAS las opciones marcadas de la tarjeta, no solo la primera: el
       * Burguermaki tiene dos grupos (relleno y salsa) y quien elige ambos
       * espera que los dos viajen. Con un solo `opcion` se perdía la salsa. */
      const ops = card
        ? $$<HTMLInputElement>('[data-opcion]:checked', card).map((i) => i.value)
        : [];
      const nueva: Linea = {
        tipo: 'extra',
        producto: nombre,
        cantidad: 1,
        ...(ops.length ? { opciones: ops } : {}),
      };
      const antes = lineas.length;
      touched();
      lineas = agregar(lineas, nueva);
      // El anuncio nombra lo que se acaba de hacer (hallazgo 25): el té que
      // entra, no la primera línea del pedido.
      const detalle = ops.length
        ? `, ${ops.map((o) => etiquetaDeOpcion(nombre, o)).filter(Boolean).join(' y ')}`
        : '';
      pendienteAnuncio =
        lineas.length > antes
          ? `${nombre}${detalle} agregado a tu pedido. ${lineas.length} ${lineas.length === 1 ? 'artículo' : 'artículos'}.`
          : `${nombre} ya estaba en el pedido: se sumó otra unidad.`;
      commit();
      if (lineas.length > antes) confirmar(clave(nueva));
      return;
    }

    // ── 3. Abrir / cerrar el pedido ──
    if (t.closest('[data-abrir-pedido]')) {
      ev.preventDefault();
      alternarPanel(t.closest<HTMLElement>('[data-abrir-pedido]'));
      return;
    }
    if (t.closest('[data-cerrar-pedido]') || t.closest('[data-panel-seguir]')) {
      ev.preventDefault();
      cerrarPanel();
      if (t.closest('[data-panel-seguir]')) {
        // «Seguir explorando» cierra Y devuelve a la carta: cerrar sin más
        // dejaría a la persona delante de una hoja que se acaba de ir.
        document.getElementById('catalogo')?.scrollIntoView({ block: 'start' });
      }
      return;
    }
    if (t.closest('[data-panel-explorar]')) {
      ev.preventDefault();
      cerrarPanel();
      document.getElementById('catalogo')?.scrollIntoView({ block: 'start' });
      return;
    }

    // ── 4. Acciones sobre una línea del pedido ──
    const boton = t.closest<HTMLElement>('[data-accion]');
    const fila = boton?.closest<HTMLElement>('[data-linea]');
    if (!boton || !fila) return;
    const k = fila.dataset.linea;
    if (!k) return;
    const actual = lineas.find((l) => clave(l) === k);
    if (!actual) return;
    const accion = boton.dataset.accion;
    const campo = fila.querySelector<HTMLInputElement>('[data-accion="campo"]');
    const n = Number(campo?.value ?? actual.cantidad) || 0;

    if (accion === 'mas' || accion === 'menos') {
      ev.preventDefault();
      touched();
      const nueva = accion === 'mas' ? n + 1 : n - 1;
      lineas = setCantidad(lineas, k, nueva);
      const n2 = lineas.find((l) => clave(l) === k);
      pendienteAnuncio = n2
        ? `${nombreLinea(n2)}: ${n2.cantidad} ${n2.cantidad === 1 ? 'unidad' : 'unidades'}.`
        : `${nombreLinea(actual)} se quitó del pedido.`;
      commit();
      return;
    }
    if (accion === 'campo') return;                          // se resuelve en `change`
    if (accion === 'editar') {
      ev.preventDefault();
      configDisparador = boton;
      editando = k;
      cantSel = actual.cantidad;
      // Al EDITAR se recupera la marca de CADA grupo que ya tenía la línea.
      opcionesSel = {};
      if (actual.tipo === 'extra') {
        for (const id of opcionesDeLinea(actual)) {
          const g = gruposDeOpciones(String(actual.producto))
            .find((x) => x.opciones.some((o) => o.id === id));
          if (g) opcionesSel[g.grupo] = id;
        }
      }
      activo =
        actual.tipo === 'bandeja'
          ? { tipo: 'bandeja', nombre: String(actual.roll) }
          : { tipo: 'extra', nombre: String(actual.producto) };
      abrirConfigurador(String(actual.tipo === 'bandeja' ? actual.roll : actual.producto), actual.cortes);
      return;
    }
    if (accion === 'quitar') {
      ev.preventDefault();
      touched();
      const nombre = nombreLinea(actual);
      lineas = lineas.filter((l) => clave(l) !== k);
      pendienteAnuncio = lineas.length
        ? `${nombre} se quitó del pedido. Quedan ${lineas.length} ${lineas.length === 1 ? 'artículo' : 'artículos'}.`
        : `${nombre} se quitó del pedido. El pedido está vacío.`;
      commit();
    }
  });

  // ── cambios de valor: cantidad del pedido ──
  document.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t.matches('[data-accion="campo"]')) return;
    const fila = t.closest<HTMLElement>('[data-linea]');
    const k = fila?.dataset.linea;
    if (!k) return;
    touched();
    // Normaliza AL SALIR, no mientras se teclea: el "21" no deseado ocurre
    // cuando el auto-update se dispara en cada pulsación.
    lineas = setCantidad(lineas, k, Number((t as HTMLInputElement).value));
    commit();
  });

  // ── configurador: los radios nativos se escuchan en `change`, no en `click`
  //    Un `input[type=radio]` dentro de una etiqueta YA marca solo y YA mueve
  //    el foco con las flechas. Lo único que hay que hacer es reflejarlo.
  config?.addEventListener('change', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.matches('input[data-cortes]')) {
      marcarTamanos(Number((t as HTMLInputElement).value));
      actualizarPrecioConfig();
      return;
    }
    if (t.matches('input[data-opcion]')) {
      // Un radio por grupo: marcar el relleno no desmarca la salsa.
      const inp = t as HTMLInputElement;
      opcionesSel = { ...opcionesSel, [inp.dataset.grupo ?? 'opcion']: inp.value };
      marcarOpciones();
      return;
    }
    if (t.matches('[data-config-cant]')) {
      const v = Number((t as HTMLInputElement).value);
      cantSel = Math.max(1, Math.min(MAX_CANTIDAD, Number.isFinite(v) ? Math.trunc(v) : 1));
      if ((t as HTMLInputElement).value !== String(cantSel)) {
        (t as HTMLInputElement).value = String(cantSel);
      }
      actualizarPrecioConfig();
    }
  });

  // Los botones −/+ de la cantidad. El campo sigue siendo un <input type=number>
  // nativo: escribirse a mano también tiene que funcionar.
  config?.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-config-mas]') || t.closest('[data-config-menos]')) {
      ev.preventDefault();
      const mas = !!t.closest('[data-config-mas]');
      cantSel = Math.max(1, Math.min(MAX_CANTIDAD, cantSel + (mas ? 1 : -1)));
      if (configCant) configCant.value = String(cantSel);
      actualizarPrecioConfig();
      return;
    }
    if (t.closest('[data-config-guardar]')) {
      ev.preventDefault();
      touched();
      guardarConfiguracion();
      return;
    }
    if (t.closest('[data-config-cerrar]')) {
      ev.preventDefault();
      cerrarConfigurador();
    }
  });

  // Escape en el configurador: cierra y devuelve el foco a quien lo abrió.
  config?.addEventListener('cancel', () => {
    activo = null;
    editando = null;
    opcionesSel = {};
    configDisparador?.focus();
    configDisparador = null;
  });

  // En escritorio el panel es una columna: Escape no lo cierra porque no es un
  // diálogo. En móvil, el `close` nativo ya devolvió el foco al disparador.
  panel?.addEventListener('cancel', (ev) => {
    if (panelEsColumna()) ev.preventDefault();
  });
  panel?.addEventListener('close', () => {
    // `close` también llega al abandonar el modal al pasar a escritorio.
    panel.dataset.abierto = panelEsColumna() ? 'si' : 'no';
    // Escape y `dialog.close()` llegan por aquí, no por `cerrarPanel()`: sin
    // esta llamada el foco se quedaría en el elemento que el navegador Pinedó
    // al abrir, que no es necesariamente el que la persona usó.
    devolverFocoAlDisparador();
  });

  // ── El foco NO puede salirse del panel abierto (M01-C08).
  //
  // `showModal()` pone el fondo inert y atrapa el foco en la mayoría de los
  // casos, pero el ciclo secuencial de Chrome pasa por el documento cuando el
  // panel tiene POCOS controles: medido, el tercer Tab caía en `body` y el
  // siguiente volvía a entrar. Con dos controles utilizables el efecto era
  // 4 fugas de 14.
  //
  // El trampa explícito recorre los controles ENFOCABLES del diálogo y al
  // llegar al último vuelve al primero, en las dos direcciones. Es el patrón
  // de WAI-ARIA APG para diálogos modales.
  const FOCOABLES =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Controles ENFOCABLES y realmente pintados de un contenedor. */
  const enfocablesDe = (c: HTMLElement): HTMLElement[] =>
    [...c.querySelectorAll<HTMLElement>(FOCOABLES)].filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
    );

  panel?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || !panel.open || panelEsColumna()) return;
    const focoables = enfocablesDe(panel);
    if (!focoables.length) return;
    const primero = focoables[0];
    const ultimo = focoables[focoables.length - 1];
    const activo = document.activeElement;
    if (ev.shiftKey && (activo === primero || !panel.contains(activo))) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && activo === ultimo) {
      ev.preventDefault();
      primero.focus();
    }
  });

  // El configurador es un diálogo modal sobre el panel, así que lleva el mismo
  // trampa: si no, el Tab se sale por el borde y el fondo inert se nota.
  config?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab' || !config?.open) return;
    const focoables = enfocablesDe(config);
    if (!focoables.length) return;
    const primero = focoables[0];
    const ultimo = focoables[focoables.length - 1];
    const activo = document.activeElement;
    if (ev.shiftKey && (activo === primero || !config.contains(activo))) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && activo === ultimo) {
      ev.preventDefault();
      primero.focus();
    }
  });

  panelCopiar?.addEventListener('click', async () => {
    const ok = await copiar(mensajeWa(lineas));
    const b = panelCopiar;
    b.textContent = ok ? '¡Copiado!' : 'No se pudo copiar';
    setTimeout(() => { b.textContent = 'Copiar el pedido'; }, 2200);
  });

  // Enter nunca debe hacer GET: perdería el estado.
  document.addEventListener('submit', (ev) => ev.preventDefault());

  mqColumna.addEventListener('change', fijarModoPanel);
  fijarModoPanel();
}

function fijarModoPanel() {
  if (!panel) return;
  if (mqColumna.matches) {
    // En escritorio el panel es una COLUMNA del grid, no un diálogo. Si venía
    // abierto como modal desde el móvil y no se cierra aquí, el `dialog` sigue
    // en el top layer con fondo inerte: el catálogo queda dead y la única salida
    // es recargar. Medido: al cruzar a 1440 px con el panel abierto, `:modal`
    // seguía en `true` y ningún control del catálogo respondía.
    if (panel.open) panel.close();
    panel.dataset.abierto = 'si';
  } else if (!panel.open) {
    panel.dataset.abierto = 'no';
  }
}

function touched() {
  tocado = true;
}

/** Confirmación visual de 180–260 ms. No bloquea nada. */
function confirmar(k: string) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fila = panelLineas?.querySelector<HTMLElement>(`[data-linea="${CSS.escape(k)}"]`);
  if (!fila) return;
  fila.classList.add('recien');
  setTimeout(() => fila.classList.remove('recien'), 260);
}

async function copiar(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* se intenta el plan B */
  }
  try {
    // Plan B para navegadores sin API de portapapeles, o sin permiso.
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

arrancar();
