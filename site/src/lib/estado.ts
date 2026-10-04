// Estado del pedido en el navegador — SIN DOM. Se puede probar en Node.
//
// ⚠️ POR QUÉ ESTE ARCHIVO EXISTE
// El sitio anterior guardaba el pedido en la URL y nada más. Añadir
// persistencia local es lo que pide el rediseño, y tiene tres trampas que
// este módulo cierra de forma explícita:
//
//  1. PRECEDENCIA. Si la URL trae un pedido (`?q=…`), ese enlace es el que la
//     persona decidió compartir o abrir: MANDA sobre lo que había en el
//     dispositivo. Si la URL no trae pedido, se usa lo guardado. Una URL con
//     `?q=` VACÍA también manda: significa "pedido vacío", no "no sé".
//  2. VERSIÓN. El formato de serialización tiene versión (`VERSION_ESTADO`).
//     Un guardado de otra versión se descarta en vez de malinterpretarse.
//  3. EXPIRACIÓN. Un pedido guardado caduca: la carta cambia de precio y una
//     bandeja de hace una semana ya no es una oferta. Pasada la ventana, se
//     empieza de cero.
//
// Y, sobre todo: NUNCA se guarda un precio. Se guardan identificadores
// (slug del roll, número de cortes, cantidad, id de opción) y los importes se
// recalculan contra `menu.ts` en cada lectura. Es lo que garantiza que un
// pedido restaurado nunca falsifique la carta.

import {
  VERSION_ESTADO,
  agrupar,
  parseCarrito,
  toQuery,
  urlDeclaraPedido,
  type Linea,
} from './cart.ts';

/** Clave de `localStorage`. Versionada: cambiar el formato cambia la clave. */
export const CLAVE_ALMACEN = `kitsune-pedido-v${VERSION_ESTADO}`;

/**
 * Ventana de validez del pedido guardado. 7 días.
 * No es una regla comercial: es la ventana en la que un pedido sigue
 * pareciéndose a lo que alguien quiso pedir. Pasada, se descarta.
 */
export const MAX_EDAD_MS = 7 * 24 * 60 * 60 * 1000;

/** Lo que se guarda: versión, marca de tiempo y el payload serializado. */
export interface Envoltura {
  v: number;
  t: number;
  q: string;
}

/** Serializa el pedido para la URL (`v=2&q=…`) y para el almacenamiento. */
export function serializar(lineas: readonly Linea[]): string {
  if (!lineas.length) return `v=${VERSION_ESTADO}&q=`;
  return `v=${VERSION_ESTADO}&q=${toQuery(lineas)}`;
}

/** Envuelve el payload con versión y fecha. */
export function envolver(q: string, ahora: number): Envoltura {
  return { v: VERSION_ESTADO, t: ahora, q };
}

/**
 * Lee un guardado crudo. Devuelve `[]` si no es válido, es de otra versión o ha
 * caducado. NUNCA lanza: un `localStorage` manipulado a mano no puede romper la
 * página (misma defensa que el `decodeURIComponent('%ZZ')` de `cart.ts`).
 */
export function leerGuardado(texto: string | null, ahora: number): Linea[] {
  if (!texto) return [];
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    return [];                                    // basura: se ignora
  }
  if (typeof o !== 'object' || o === null) return [];
  const e = o as Partial<Envoltura>;
  if (e.v !== VERSION_ESTADO) return [];           // (2) versión
  if (typeof e.t !== 'number' || !Number.isFinite(e.t)) return [];
  const edad = ahora - e.t;
  if (edad < 0) return [];                         // reloj atrás: no se fía
  if (edad > MAX_EDAD_MS) return [];               // (3) caducado
  if (typeof e.q !== 'string') return [];
  return agrupar(parseCarrito('?' + e.q));
}

/** Entradas de la restauración, tal y como llegan del entorno. */
export interface Entradas {
  search: string;
  hash: string;
  /** Texto crudo de `localStorage`, o `null` si no hay / no se puede leer. */
  guardado: string | null;
  /** `Date.now()`. */
  ahora: number;
}

/** De dónde salió el pedido restaurado. Se muestra en los registros. */
export type Origen = 'url' | 'guardado' | 'vacio';

/** El resultado de restaurar, con el origen para poder explicarlo. */
export interface Restaurado {
  lineas: Linea[];
  origen: Origen;
}

/**
 * Restaura el pedido aplicando la precedencia (1): URL explícita > guardado
 * válido > vacío. Devuelve SIEMPRE líneas saneas y agrupadas.
 */
export function restaurar(e: Entradas): Restaurado {
  if (urlDeclaraPedido(e.search, e.hash)) {
    return { lineas: agrupar(parseCarrito(e.search + e.hash)), origen: 'url' };
  }
  const guardadas = leerGuardado(e.guardado, e.ahora);
  if (guardadas.length) return { lineas: guardadas, origen: 'guardado' };
  return { lineas: [], origen: 'vacio' };
}

// ─────────────────────────────────────────── deep-link a un producto concreto
// Los enlaces «Configurar» de las tarjetas comparten `?roll=…&cortes=…`. Es un
// NAVEGAR, no un estado de pedido: por eso `urlDeclaraPedido` NO lo ve como `q`
// y el pedido guardado sobrevive al abrir la configuración de otro producto.

export interface Destino {
  tipo: 'bandeja' | 'extra';
  nombre: string;
  cortes?: number;
}

/**
 * Lee un deep-link de producto. Acepta el nombre tal cual venga (con acentos o
 * con el slug normalizado). `cortes` se devuelve solo si existe en la carta:
 * el modelo no valida el número aquí, lo valida `sanearLineas` al agregar.
 *
 * ⚠️ NUNCA DECODIFICA DOS VECES (hallazgo 35). `URLSearchParams.get()` YA
 * decodifica el valor: con `?roll=%25ZZ`, `get('roll')` devuelve la cadena
 * `%ZZ`, y el `decodeURIComponent` de este segundo pase lanzaba `URIError`.
 * Como `leerDestino` se llama desde `arrancar()`, antes de `enlazar()`, la
 * excepción tumba la página entera con la carta vacía y ningún control
 * operativo. Medido: `TypeError/URIError` en consola y 15 tarjetas sin montar.
 *
 * Solo queda tolerate la entrada que `URLSearchParams` no puede sanear por sí
 * misma (una `%` suelta sin pareja), que sí es legal en una URL.
 */
export function leerDestino(search: string): Destino | null {
  let bruto: string | null;
  try {
    const p = new URLSearchParams(search);
    bruto = p.get('roll') ?? p.get('producto');
    if (bruto === null) return null;
    // `get()` ya decodificó. Solo se acepta un nombre que sea realmente
    // decodificable, por si la query viene concatenada a mano.
    const nombre = seguroDecode(bruto);
    if (!nombre) return null;
    const cortes = p.get('cortes');
    if (cortes === null) return { tipo: 'extra', nombre };
    const n = Number(cortes);
    // La clave se OMITE, no se pone a `undefined`: `{a:1}` y `{a:1,b:undefined}`
    // no son el mismo objeto bajo deepStrictEqual, y una forma de objeto
    // distinta aquí se propaga a las comparaciones de la UI. Mismo cuidado que
    // el `Number()` de MEJOR_VALOR en cart.ts.
    if (!Number.isFinite(n)) return { tipo: 'bandeja', nombre };
    return { tipo: 'bandeja', nombre, cortes: Math.trunc(n) };
  } catch {
    // Una query manipulada no puede romper la página: se ignora y la carta
    // sigue funcionando.
    return null;
  }
}

/** `decodeURIComponent` que devuelve `null` en vez de lanzar. */
function seguroDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}
