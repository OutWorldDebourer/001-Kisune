// Modelo del carrito de Kitsune Makis — SIN dependencias.
//
// REGLA COMERCIAL (confirmada por el cliente el 2026-09-28, no inferida):
// la tabla de la carta es POR BANDEJA y APLICA A CUALQUIERA de los makis.
// Un pedido son VARIAS BANDEJAS SUMADAS, cada una de un roll y un tamaño.
//
//   línea BANDEJA = { roll, cortes∈{10,20,30,40,50}, cantidad }
//     subtotal = PRECIO_BANDEJA[cortes] × cantidad
//     cortes   = cortes × cantidad
//   línea EXTRA   = { producto, opcion?, cantidad }
//     subtotal = PRECIO_EXTRA[producto] × cantidad
//   TOTAL = Σ subtotales      TOTAL cortes = Σ (solo bandejas)
//
// Consequences that are NOT negotiable:
// · No existe "tramo hacia arriba": cada línea ya está en un tamaño exacto.
// · 30 cortes cuestan S/ 52, NO S/ 50. Ese número viene de un modelo
//   descartado y no debe reaparecer.
// · Un tamaño fuera de la tabla LANZA. El modelo no puede inventar un precio.
// · Una opción NO cambia el precio. La carta lista Burguermaki a S/ 20 plano
//   y no confirma recargo por salsa: el modelo no puede inventar un sobreprecio.
//
// ⚠️ ESTE MÓDULO ES LA ÚNICA LÓGICA DEL PEDIDO.
// Antes existía una segunda copia de nombres, precios, totales, validación,
// serialización y mensaje dentro de un <script> inline de 500 líneas, y las
// dos se divergieron seis veces seguidas (ver git log y ARCHITECTURE.md). El
// script inline ya no calcula nada: llama a estas funciones. Lo que se prueba
// aquí es exactamente lo que corre en el navegador.

// ─────────────────────────────────────────────────────────────────────────
// LOS PRECIOS Y LOS NOMBRES VIENEN DE menu.ts — NO SE DUPLICAN AQUÍ.
// BUG PROPIO (corregido por referencia 1): cart.ts declaraba sus PROPIAS
// listas de rolls, extras y precios, paralelas a menu.ts. Dos fuentes de
// verdad significa que la carta y el carrito pueden divergir sin que nada lo
// note. Ahora menu.ts es la ÚNICA fuente y este módulo deriva de ella.
// `menu.ts` es TS puro, sin imports de Astro: se puede importar en Node.
import {
  makis,
  cortes as CORTES,
  especiales,
  bebidas,
  OPCIONES_POR_PLATO,
  type Opcion,
} from '../data/menu.ts';

/** Los 8 rolls de la carta. El slug se deriva de aquí, no del input. */
const ROLLS = makis.map((m) => m.name);

/** Especiales y bebidas: tienen precio UNITARIO real (pág. 1 y 2 del PDF). */
const EXTRAS = [...especiales, ...bebidas].map((p) => p.name);

/** Tabla por cajón de cortes: la del PDF (pág. 2), desde menu.ts. */
export const PRECIO_BANDEJA: Readonly<Record<number, number>> = Object.freeze(
  Object.fromEntries(CORTES.map((c) => [c.n, c.price])),
);

/** Precios unitarios reales de especiales y bebidas, desde menu.ts. */
export const PRECIO_EXTRA: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries([...especiales, ...bebidas].map((p) => [p.name, p.price])),
);

/** El tamaño con menor S/ por corte (40 → 1,60). Se marca, no se infiere. */
// BUG PROPIO (corregido): Object.entries devuelve claves STRING, así que el
// valor real era ["40", 64]. El `as [number, number]` de antes MENTÍA: el
// type-checker no lo corrió nunca (el runner de Node strippea tipos sin
// comprobarlos) y un string se imprime igual que un number, así que los tests
// pasaban. Consecuencia en la fase 04: `cortes === MEJOR_VALOR[0]` sería
// `20 === "40"` → siempre falso, y el badge "mejor valor" no aparecería nunca
// sin que nadie supiera por qué. Ahora la clave se convierte con Number().
const [mejorCortes, mejorPrecio] = Object.entries(PRECIO_BANDEJA).reduce(
  (a, b) => (Number(a[1]) / Number(a[0]) <= Number(b[1]) / Number(b[0]) ? a : b),
);
export const MEJOR_VALOR: readonly [number, number] = Object.freeze([
  Number(mejorCortes),
  Number(mejorPrecio),
]);

/**
 * Tamaño por el que se ABRE el configurador: el más pequeño, 10 cortes.
 *
 * ⚠️ Antes se abría en `MEJOR_VALOR[0]` (40 cortes, el de mejor precio por
 * corte). Es un buen dato, pero es el dato del restaurante, no el de quien
 * empieza: abrir el pedido en la bandeja más grande de la carta empuja a pedir
 * de más. M05-C01 admite las dos cosas si se declara el precio por corte; aquí
 * se hace lo primero —abrir en 10— y el mejor valor se MUESTRA como lo que es.
 */
export const TAMANO_INICIAL: number = Number(
  Object.keys(PRECIO_BANDEJA).map(Number).sort((a, b) => a - b)[0],
);

/** S/ por corte de un tamaño, redondeado a dos decimales. */
export function precioPorCorte(cortes: number): number {
  const p = PRECIO_BANDEJA[cortes];
  return p === undefined ? 0 : Math.round((p / cortes) * 100) / 100;
}

export const MAX_CANTIDAD = 99;

/**
 * ⚠️ CORREGIDO 2026-09-28. Medido: hay 8 rolls × 5 tamaños = 40 combinaciones
 * de bandeja, más 7 especiales/bebidas = **47 líneas posibles**. El tope
 * anterior de 30 las truncaba EN SILENCIO, y un pedido de 31 líneas perdía una
 * sin decirlo — la misma clase de fallo que el `truncate` que ocultaba el
 * precio. Ahora el tope está POR ENCIMA de todo lo posible: `sanearLineas` no
 * puede cortar nunca, y el límite real es la longitud del mensaje de WhatsApp,
 * que la UI bloquea con un aviso VISIBLE (ver MAX_MENSAJE).
 */
export const MAX_LINEAS = 48;

/**
 * Longitud máxima del mensaje para `wa.me`. No es una regla comercial.
 *
 * BUG PROPIO (corregido): se exportaba y se documentaba, y NADIE lo usaba.
 * Un pedido largo generaba un enlace de miles de caracteres que `wa.me` puede
 * recortar, y el visitante perdía su pedido sin aviso. Ahora la UI lo mide
 * (`excedeMensaje`) y, cuando se pasa, ofrece COPIAR el pedido en vez de
 * mandar un enlace que no llega entero.
 */
export const MAX_MENSAJE = 1800;

/** Versión del formato de serialización. Cambia solo si cambia la gramática. */
export const VERSION_ESTADO = 2;

export interface Linea {
  tipo: 'bandeja' | 'extra';
  /** Presente si tipo === 'bandeja' */
  roll?: string;
  /** Presente si tipo === 'bandeja'. Debe estar en la tabla o el modelo lanza. */
  cortes?: number;
  /** Presente si tipo === 'extra' */
  producto?: string;
  /**
   * Opciones elegidas de un extra. Es el `id` de `data/menu.ts`. NO cambia el
   * precio: la carta no confirma recargo.
   *
   * ⚠️ Un producto puede ofrecer VARIAS elecciones independientes —el
   * Burguermaki tiene relleno (3) y salsa (2)— así que esto es una LISTA, no
   * un string. Con un solo `opcion` no se podía pedir «ebi con salsa de
   * anguila», que es literalmente lo que ofrece la carta (M05-C05).
   * El campo `opcion` singular se conserva para no romper los enlaces y
   * guardados antiguos: se normaliza a `opciones` al sanear.
   */
  opciones?: string[];
  /** @deprecated Singular. Se migra a `opciones` en `sanearLineas`. */
  opcion?: string;
  cantidad: number;
}

export interface LineaTotal extends Linea {
  subtotal: number;
  cortesTotal: number;
}

export interface Totales {
  lineas: LineaTotal[];
  totalCortes: number;
  totalPrecio: number;
}

// ────────────────────────────────────────────────────────────── slug y mapa

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** slug -> nombre real. Construido desde las listas, nunca desde el input. */
const MAPA = new Map<string, string>();
for (const n of [...ROLLS, ...EXTRAS]) MAPA.set(sinAcentos(n), n);
const ROLL_SLUGS = new Set(ROLLS.map(sinAcentos));
const EXTRA_SLUGS = new Set(EXTRAS.map(sinAcentos));

/** slug de opción -> opción real, POR PLATO. Se valida contra la carta. */
const OPCIONES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(OPCIONES_POR_PLATO).map(([plato, ops]) => [
    sinAcentos(plato),
    new Set(ops.map((o) => sinAcentos(o.id))),
  ]),
);

/** Etiqueta legible de una opción, o `undefined` si la carta no la declara. */
export function etiquetaOpcion(producto: string, opcion: string): string | undefined {
  return (OPCIONES_POR_PLATO[producto] ?? []).find((o) => o.id === opcion)?.label;
}

/** Opciones declaradas para un extra (vacío si no tiene). */
export function opcionesDe(producto: string) {
  return OPCIONES_POR_PLATO[producto] ?? [];
}

/**
 * Opciones de un producto agrupadas por decisión, en el orden de la carta.
 * El Burguermaki devuelve `{ relleno: [...3], salsa: [...2] }`: son dos
 * elecciones independientes y la interfaz las presenta como dos grupos.
 */
export function gruposDeOpciones(producto: string): { grupo: string; etiqueta: string; opciones: readonly Opcion[] }[] {
  const ops = opcionesDe(producto);
  if (!ops.length) return [];
  const grupos: { grupo: string; etiqueta: string; opciones: Opcion[] }[] = [];
  for (const o of ops) {
    if (o.soloLegado) continue;
    const g = o.grupo ?? 'opcion';
    let fila = grupos.find((x) => x.grupo === g);
    if (!fila) {
      fila = { grupo: g, etiqueta: ETIQUETA_GRUPO[g] ?? 'Elige una opción', opciones: [] };
      grupos.push(fila);
    }
    fila.opciones.push(o);
  }
  return grupos;
}

/** Nombre legible de cada grupo de elección. */
const ETIQUETA_GRUPO: Readonly<Record<string, string>> = {
  relleno: 'Preferencia de relleno',
  salsa: 'Elige la salsa',
  opcion: 'Elige una opción',
};

// ───────────────────────────────────────────────────────── clave de agrupación

/**
 * Clave canónica de una línea: identifica la COMBINACIÓN, no el producto.
 *
 * Es lo que decide si dos cosas son "la misma línea" y por tanto si se
 * acumulan o si conviven. Regla que fija el pedido del cliente: se agrupa
 * ÚNICAMENTE lo idéntico.
 *
 *   "Kitsune 20"  ≠ "Kitsune 40"   → dos bandejas del mismo roll, tamaños
 *                                     distintos, son DOS líneas (requisito).
 *   "Burguermaki (anguila)" ≠ "Burguermaki (acevichada)" → dos líneas.
 *   "Burguermaki" = "Burguermaki"  → se acumula en la cantidad.
 */
export function clave(l: Linea): string {
  if (l.tipo === 'bandeja') return `bandeja:${sinAcentos(String(l.roll ?? ''))}:${l.cortes}`;
  const base = `extra:${sinAcentos(String(l.producto ?? ''))}`;
  // Las opciones van ORDENADAS por id: «ebi + anguila» y «anguila + ebi» son la
  // MISMA combinación y deben acumularse, no aparecer como dos líneas.
  const ops = opcionesDeLinea(l);
  return ops.length ? `${base}:${ops.map(sinAcentos).sort().join('+')}` : base;
}

/** Opciones de una línea, sin duplicados y en orden estable. */
export function opcionesDeLinea(l: Linea): string[] {
  const crudas = [...(l.opciones ?? []), ...(l.opcion ? [l.opcion] : [])];
  return [...new Set(crudas.filter((o): o is string => typeof o === 'string' && o.length > 0))].sort();
}

/** Nombre real que se muestra y se manda por WhatsApp, con sus opciones. */
export function nombreLinea(l: Linea): string {
  if (l.tipo === 'bandeja') return `${l.roll} · ${l.cortes} cortes`;
  const ops = opcionesDeLinea(l)
    .map((o) => etiquetaOpcion(String(l.producto), o))
    .filter((x): x is string => !!x);
  return ops.length ? `${l.producto} (${ops.join(' · ')})` : String(l.producto);
}

// ─────────────────────────────────────────────────────────────────── saneado

function entero(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_CANTIDAD, Math.max(0, Math.trunc(n)));
}

/**
 * Normaliza líneas crudas (de la UI, de la URL o del almacenamiento local) y
 * descarta lo imposible.
 *
 * ⚠️ ESTA ES LA DEFENSA ÚNICA. La UI ya no valida por su cuenta: si algo llega
 * aquí, sale saneado o no sale. En particular NO se acepta un nombre
 * desconocido con precio 0 (el fallo que producía «Té de Jazmín · S/ 0.00» o
 * un «null» en el pedido): o se reconoce contra `menu.ts`, o se descarta.
 */
export function sanearLineas(crudas: readonly unknown[]): Linea[] {
  const salida: Linea[] = [];
  for (const cruda of crudas) {
    if (typeof cruda !== 'object' || cruda === null) continue;
    const o = cruda as Record<string, unknown>;
    const cantidad = entero(o.cantidad);
    if (cantidad <= 0) continue;

    if (o.tipo === 'extra') {
      const nombre = MAPA.get(sinAcentos(String(o.producto ?? '')));
      if (!nombre || !EXTRA_SLUGS.has(sinAcentos(nombre))) continue;
      const linea: Linea = { tipo: 'extra', producto: nombre, cantidad };
      /* Cada opción se valida por separado contra lo que declara ESE plato. Una
         inventada se descarta, pero el plato sobrevive sin ella: es preferible
         pedir «Burguermaki sin salsa» a no poder pedirlo. Y se aceptan VARIAS,
         porque la carta ofrece relleno y salsa por separado. */
      const declaradas = OPCIONES_POR_PLATO[nombre] ?? [];
      const crudas = [
        ...(Array.isArray(o.opciones) ? o.opciones : []),
        ...(typeof o.opciones === 'string' ? [o.opciones] : []),
        o.opcion,
      ];
      const validas: string[] = [];
      for (const c of crudas) {
        if (typeof c !== 'string' || !c) continue;
        const real = declaradas.find((x) => sinAcentos(x.id) === sinAcentos(c));
        if (real) validas.push(real.id);
      }
      if (validas.length) linea.opciones = [...new Set(validas)].sort();
      salida.push(linea);
    } else {
      const roll = MAPA.get(sinAcentos(String(o.roll ?? '')));
      if (!roll || !ROLL_SLUGS.has(sinAcentos(roll))) continue;
      const cortes = entero(o.cortes);
      if (!(cortes in PRECIO_BANDEJA)) continue;              // 8 cortes: no existe
      salida.push({ tipo: 'bandeja', roll, cortes, cantidad });
    }
    if (salida.length >= MAX_LINEAS) break;
  }
  return salida;
}

/**
 * Agrupa combinaciones idénticas que llegan separadas.
 * Un pedido restaurado de una URL antigua puede traer la misma combinación
 * repetida; la UI solo debe mostrar UNA fila con la cantidad sumada.
 */
export function agrupar(lineas: readonly Linea[]): Linea[] {
  const porClave = new Map<string, Linea>();
  for (const l of lineas) {
    const k = clave(l);
    const prev = porClave.get(k);
    if (prev) {
      prev.cantidad = Math.min(MAX_CANTIDAD, prev.cantidad + l.cantidad);
    } else {
      porClave.set(k, { ...l });
    }
  }
  return [...porClave.values()];
}

// ─────────────────────────────────────────────────────────────────── totales

export function computeTotals(lineas: readonly Linea[]): Totales {
  const conTotal: LineaTotal[] = [];
  let totalCortes = 0;
  let totalPrecio = 0;

  for (const l of lineas) {
    if (l.tipo === 'bandeja') {
      const cortes = l.cortes as number;
      const unidad = PRECIO_BANDEJA[cortes];
      // LANZA a propósito: es la defensa que impide inventar un precio.
      if (unidad === undefined) {
        throw new Error(
          `${cortes} cortes: ese tamaño no existe en la carta de Kitsune Makis ` +
          `(${Object.keys(PRECIO_BANDEJA).join('/')})`,
        );
      }
      const subtotal = unidad * l.cantidad;
      const cortesTotal = cortes * l.cantidad;
      conTotal.push({ ...l, cortes, subtotal, cortesTotal });
      totalCortes += cortesTotal;
      totalPrecio += subtotal;
    } else {
      const unidad = PRECIO_EXTRA[l.producto as string];
      if (unidad === undefined) {
        throw new Error(`${l.producto}: no hay precio unitario para ese producto`);
      }
      // La opción NO altera el precio: la carta no confirma recargo y el modelo
      // no inventa uno. Si algún día se confirma, es aquí donde se suma.
      const subtotal = unidad * l.cantidad;
      conTotal.push({ ...l, subtotal, cortesTotal: 0 });
      totalPrecio += subtotal;
    }
  }
  return { lineas: conTotal, totalCortes, totalPrecio };
}

// ───────────────────────────────────────────────────── estado en la URL (?q=)

/**
 * Serializa a la gramática v2. Prefijos de una letra para no chocar con v1:
 *   b:<slug>:<cortes>:<cantidad>          bandeja
 *   e:<slug>:<cantidad>                   extra sin opción
 *   e:<slug>:<opcion>:<cantidad>          extra con opción
 *
 * NUNCA se guarda un precio: solo identificadores y cantidades. Por eso el
 * pedido guardado se recalcula SIEMPRE contra el menú actual, aunque la carta
 * haya cambiado de precio entre una visita y otra.
 */
export function toQuery(lineas: readonly Linea[]): string {
  return lineas
    .map((l) => {
      if (l.tipo === 'bandeja') {
        return `b:${sinAcentos(l.roll as string)}:${l.cortes}:${l.cantidad}`;
      }
      const prod = sinAcentos(l.producto as string);
      const options = opcionesDeLinea(l).map(sinAcentos).join('~');
      return options
        ? `e:${prod}:${options}:${l.cantidad}`
        : `e:${prod}:${l.cantidad}`;
    })
    .join(',');
}

/**
 * Acepta `?q=…` o `#q=…`, en v1 (enlaces ya compartidos) y en v2.
 *
 * v1 (la que escribía la versión anterior del sitio, sin versión):
 *   `bandeja:<slug>:<cortes>:<cantidad>` y `extra:<slug>:<cantidad>`
 * v2: la de arriba, con `b:`/`e:`.
 *
 * La precedencia NO depende de un flag: se deduce del prefijo. Un enlace
 * antiguo sin `?v=` sigue leyéndose bien, y uno nuevo tampoco necesita el flag
 * para interpretarse. `VERSION_ESTADO` se escribe en la URL solo como
 * información para quien la lea.
 */
export function parseCarrito(q: string): Linea[] {
  /* ⚠️ El payload termina en `&`, `#` o fin de cadena — NUNCA más allá.
   *
   * La URL del sitio lleva el pedido en la query y el ancla de sección en el
   * hash a la vez (`?v=2&q=b:kitsune:20:1#catalogo`), y `restaurar()` le pasa
   * las dos juntas. Con `[^&]*` el `#catalogo` se pegaba al último campo: la
   * cantidad llegaba como «1#catalogo», que no es un número, y la línea se
   * descartaba entera. Medido: añadir un roll, recargar y encontrarse el
   * pedido vacío — la persistencia rota solo en recargas, que es donde se
   * nota. */
  const m = /[?#](?:v=\d+&)?q=([^&#]*)/.exec(q);
  if (!m || !m[1]) return [];

  /* ⚠️ SE DECODIFICA EL PAYLOAD COMPLETO ANTES DE CORTAR POR COMAS (M05-C09).
   *
   * Antes se dividía `m[1]` por `,` y LUEGO se decodificaba cada trozo. Con un
   * enlace codificado —`?q=b%3Akitsune%3A30%3A1%2Ce%3Akarage%3A2`, que es
   * justo lo que produce cualquier cosa que codifique la barra de direcciones
   * al compartirla— la coma llega como `%2C` y no corta nada: el resultado era
   * UNA parte, y al no tener 4 campos, se descartaba entera. Medido: un enlace
   * de pedido compartido no restauraba NADA y la página arrancaba vacía.
   *
   * Decodificar primero acepta las dos formas —con y sin codificar— y no cambia
   * el resultado de ninguna, porque `decodeURIComponent` de una cadena sin `%`
   * es la identidad.
   */
  let payload: string;
  try {
    // `decodeURIComponent('%ZZ')` lanza URIError: un enlace escrito a mano con
    // un % mal formado no puede romper la página, se ignora.
    payload = decodeURIComponent(m[1]);
  } catch {
    payload = m[1];
  }

  const crudas: Record<string, unknown>[] = [];
  for (const dec of payload.split(',')) {
    const b = dec.split(':');
    if (b[0] === 'b' && b.length === 4) {
      crudas.push({ tipo: 'bandeja', roll: b[1], cortes: b[2], cantidad: b[3] });
    } else if (b[0] === 'e' && b.length === 4) {
      crudas.push({ tipo: 'extra', producto: b[1], opciones: b[2].split('~'), cantidad: b[3] });
    } else if (b[0] === 'e' && b.length === 3) {
      crudas.push({ tipo: 'extra', producto: b[1], cantidad: b[2] });
    } else if (b[0] === 'bandeja' && b.length === 4) {
      // v1: el prefijo es la palabra entera, no una letra.
      crudas.push({ tipo: 'bandeja', roll: b[1], cortes: b[2], cantidad: b[3] });
    } else if (b[0] === 'extra' && b.length === 3) {
      crudas.push({ tipo: 'extra', producto: b[1], cantidad: b[2] });
    } else if (b.length === 3) {
      // v1 EN FORMA CORTA (la que el sitio anterior entendía): sin prefijo,
      // 3 campos = bandeja. "kitsune:20:1".
      crudas.push({ tipo: 'bandeja', roll: b[0], cortes: b[1], cantidad: b[2] });
    } else if (b.length === 2) {
      // v1 EN FORMA CORTA: sin prefijo, 2 campos = extra. "katsukare:2".
      // Son enlaces que la gente ya se ha compartido: se siguen leyendo.
      crudas.push({ tipo: 'extra', producto: b[0], cantidad: b[1] });
    }
  }
  // sanearLineas vuelve a los nombres reales desde el mapa de la carta:
  // "katsukare" → "Katsukare", y descarta lo que no exista.
  return sanearLineas(crudas);
}

/** `true` si la URL trae un `q` explícito (aunque venga vacío). */
export function urlDeclaraPedido(search: string, hash: string): boolean {
  return /[?#](?:v=\d+&)?q=/.test(search + hash);
}

// ─────────────────────────────────────────────────────── mutaciones puras
// Funciones PURAS: reciben líneas y devuelven líneas nuevas. La UI guarda el
// resultado y vuelve a pintar. Ninguna toca el DOM, así que se prueban sin
// navegador — que es como se comprueba que "editar" no toca otra línea.

/** Agrega una combinación; si ya existe IDÉNTICA, acumula en vez de duplicar. */
export function agregar(lineas: readonly Linea[], nueva: Linea): Linea[] {
  const saneada = sanearLineas([nueva]);
  if (!saneada.length) return [...lineas];     // nombre desconocido: no se toca nada
  const l = saneada[0];
  const k = clave(l);
  const i = lineas.findIndex((x) => clave(x) === k);
  if (i < 0) return [...lineas, l];
  const copia = [...lineas];
  copia[i] = { ...copia[i], cantidad: Math.min(MAX_CANTIDAD, copia[i].cantidad + l.cantidad) };
  return copia;
}

/** Fija la cantidad de UNA línea. 0 o menos la quita. */
export function setCantidad(lineas: readonly Linea[], k: string, valor: number): Linea[] {
  const n = entero(valor);
  const i = lineas.findIndex((x) => clave(x) === k);
  if (i < 0) return [...lineas];
  if (n <= 0) return lineas.filter((_, j) => j !== i);
  const copia = [...lineas];
  copia[i] = { ...copia[i], cantidad: n };
  return copia;
}

/** Quita UNA línea por su clave. */
export function quitar(lineas: readonly Linea[], k: string): Linea[] {
  return lineas.filter((x) => clave(x) !== k);
}

/**
 * Sustituye la línea `k` por `nueva`, EN SU MISMO SITIO.
 *
 * Por qué no se borra y se añade al final: al editar el pedido se reordenaba
 * entero. Si tenías Kitsune 20, Parrillero 40 y Karage, y editabas Parrillero,
 * la bandeja te quedaba Kitsune 20 · Karage · Parrillero. El total era el
 * mismo, así que ningún test de totales lo detectó — lo detectó la puerta de
 * navegador, mirando las filas. El pedido de alguien se lee en orden y ese
 * orden no es del sitio.
 *
 * Si la línea editada pasa a coincidir con otra que ya existe, se FUSIONAN en
 * la que ya ocupaba esa combinación y se retira la editada: dos filas del mismo
 * roll y tamaño no pueden coexistir.
 */
export function reemplazar(lineas: readonly Linea[], k: string, nueva: Linea): Linea[] {
  const s = sanearLineas([nueva]);
  if (!s.length) return [...lineas];
  const l = s[0];
  const i = lineas.findIndex((x) => clave(x) === k);
  if (i < 0) return agregar(lineas, l);            // la línea ya no está: es un alta

  const destino = lineas.findIndex((x, j) => j !== i && clave(x) === clave(l));
  if (destino >= 0) {
    const copia = [...lineas];
    copia[destino] = {
      ...copia[destino],
      cantidad: Math.min(MAX_CANTIDAD, copia[destino].cantidad + l.cantidad),
    };
    copia.splice(i, 1);
    return copia;
  }
  return lineas.map((x, j) => (j === i ? l : x));
}

// ─────────────────────────────────────────────────────────── mensaje de wa.me

/** Una línea, tal y como se lee en el mensaje. La opción viaja con ella. */
function textoLinea(l: LineaTotal): string {
  const unit =
    l.tipo === 'bandeja'
      ? `${l.roll} · ${l.cortes} cortes × ${l.cantidad}`
      : nombreLinea(l) + ` × ${l.cantidad}`;
  return `• ${unit} — S/ ${l.subtotal.toFixed(2)}`;
}

export function mensajeWa(lineas: readonly Linea[]): string {
  if (lineas.length === 0) return '';
  const t = computeTotals(lineas);
  /* El cierre resume las dos cosas por separado. Un pedido de solo bebidas no
     tiene cortes, y escribir «0 cortes» no le dice a nadie qué pidió (M05-C06). */
  const articulos = t.lineas.reduce((a, l) => a + l.cantidad, 0);
  const resumen: string[] = [];
  if (t.totalCortes) resumen.push(`${t.totalCortes} cortes`);
  if (articulos) resumen.push(`${articulos} ${articulos === 1 ? 'artículo' : 'artículos'}`);
  return [
    '¡Hola Kitsune Makis! Quiero armar este pedido:',
    ...t.lineas.map(textoLinea),
    `— ${resumen.join(' · ')} · Total estimado: S/ ${t.totalPrecio.toFixed(2)}`,
  ].join('\n');
}

/** Longitud del mensaje tal y como irá en el enlace. */
export function longitudMensaje(lineas: readonly Linea[]): number {
  return mensajeWa(lineas).length;
}

/**
 * `true` si el enlace de WhatsApp se pasa del umbral técnico.
 *
 * En ese caso la UI NO manda un enlace que `wa.me` puede recortar: ofrece
 * copiar el pedido. Un pedido de 47 líneas sí cabe en MAX_MENSAJE; uno con
 * nombres largos y muchas opciones, no. El umbral es técnico, no comercial.
 */
export function excedeMensaje(lineas: readonly Linea[]): boolean {
  return longitudMensaje(lineas) > MAX_MENSAJE;
}
