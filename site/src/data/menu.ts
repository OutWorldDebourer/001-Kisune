// Contenido real de la carta — extraído de CARTA KITSUNE 2026.pdf
// Ver research/00-spec-brief.md (fuente de verdad).
//
// REGLA DE ESTE ARCHIVO: aquí vive SOLO lo que el restaurante confirmó.
// Si un dato falta, se declara como pendiente (`pendiente: true`) en vez de
// inventarlo. La UI muestra esos pendientes; no los rellena.

export interface Maki {
  name: string;
  tagline: string;
  description: string;
  nuevo?: boolean;
}

/**
 * Opción elegible de un especial (hoy: la salsa del Burguermaki).
 *
 * ⚠️ PENDIENTE DE CONFIRMAR CON EL RESTAURANTE, y NO se inventa aquí:
 * · `obligatorio` — la carta dice "Elige tu salsa favorita", lo que sugiere
 *   elección, pero no confirma que sea obligatoria. Se deja en `false`.
 * · impacto en precio — la carta lista Burguermaki a S/ 20 plano y no
 *   menciona recargo por salsa. Por eso `delta` NO existe: el modelo no puede
 *   aplicar un sobreprecio que nadie confirmó. Si el restaurante lo confirma,
 *   se añade `delta` y el carrito lo suma (la lógica ya está preparada).
 */
export interface Opcion {
  id: string;
  label: string;
  /** Etiqueta corta para contextos estrechos (la tarjeta del catálogo). */
  corta?: string;
  /**
   * Grupo de elección. Un producto puede tener VARIOS: el Burguermaki ofrece
   * relleno (3 opciones) y salsa (2 opciones), y son dos decisiones
   * independientes, no una lista de cinco. Sin este campo, el modelo no puede
   * saber si se puede elegir más de una cosa ni cuál va con cuál.
   */
  grupo?: 'relleno' | 'salsa' | string;
  obligatorio?: boolean;
  /** Only for restoring an old order, not an offered recipe. */
  soloLegado?: boolean;
  /** Marcado para mostrar "por confirmar" en la UI. No cambia el precio. */
  pendiente?: boolean;
}

export interface Plato {
  name: string;
  price: number;
  description: string;
  opciones?: Opcion[];
}

export const makis: Maki[] = [
  {
    name: 'California',
    tagline: 'El clásico que conquista a cualquiera.',
    description: 'Ebi furai y palta, cubiertos con ajonjolí tostado',
  },
  {
    name: 'Furai',
    tagline: 'Si te gusta lo crocante, este es para ti.',
    description:
      'Queso crema, palta y langostinos envueltos en un dorado empanizado.',
  },
  {
    name: 'Acevichado',
    tagline: 'El roll que todos vuelven a pedir.',
    description:
      'Ebi furai y palta por dentro, coronado con pescado fresco y nuestra cremosa salsa acevichada.',
  },
  {
    name: 'Garlic',
    tagline: 'Advertencia: crea adicción.',
    description:
      'Ebi furai y palta bañados en una intensa salsa garlic con un toque ahumado.',
  },
  {
    name: 'Kitsune',
    tagline: 'Solo para paladares valientes.',
    description:
      'Ebi furai, palta y pescado fresco, coronados con la salsa secreta de Kitsune.',
  },
  {
    name: 'Parmesano',
    tagline: 'Para los amantes del queso, sin excepción.',
    description:
      'Ebi furai y palta, coronados con pescado fresco y queso parmesano gratinado, realzados con un toque de limón.',
    nuevo: true,
  },
  {
    name: 'Parrillero',
    tagline: 'El favorito de los amantes del buen fuego.',
    description:
      'Ebi furai y palta, coronado con láminas de lomo y salsa parrillera.',
    nuevo: true,
  },
  {
    name: 'Yakiniku',
    tagline: 'El favorito de los amantes del buen fuego.',
    description:
      'Ebi furai y palta, coronado con láminas de lomo y salsa yakiniku.',
    nuevo: true,
  },
];

// Tabla de cortes (pág. 2 del PDF — confirmada por spans)
export const cortes = [
  { n: 10, price: 20 },
  { n: 20, price: 35 },
  { n: 30, price: 52 },
  { n: 40, price: 64 },
  { n: 50, price: 87 },
];

export const especiales: Plato[] = [
  {
    name: 'Karage',
    price: 15,
    description:
      'Pollo marinado y frito al estilo japonés, con una cobertura crujiente.',
  },
  {
    name: 'Ebi Furai',
    price: 18,
    description:
      '6 langostinos empanizados en panko, acompañados de salsa especial.',
  },
  {
    name: 'Katsukare',
    price: 24,
    description:
      'Pollo empanizado en panko, arroz y curry japonés.',
  },
  {
    name: 'Burguermaki',
    price: 20,
    description:
      'Arroz, nori y cobertura crujiente. Queso crema, ebi o pollo furai y palta, según la carta. Salsa acevichada o anguila.',
    // La carta es ambigua: se recoge una preferencia, sin confirmar una receta.
    opciones: [
      { id: 'relleno-queso', label: 'Queso crema (preferencia a confirmar)', grupo: 'relleno', pendiente: true, soloLegado: true },
      { id: 'relleno-ebi', label: 'Ebi furai (preferencia a confirmar)', corta: 'Ebi', grupo: 'relleno', pendiente: true },
      { id: 'relleno-pollo', label: 'Pollo furai (preferencia a confirmar)', corta: 'Pollo furai', grupo: 'relleno', pendiente: true },
      { id: 'acevichada', label: 'Salsa acevichada', corta: 'Acevichada', grupo: 'salsa', pendiente: true },
      { id: 'anguila', label: 'Salsa de anguila', corta: 'Anguila', grupo: 'salsa', pendiente: true },
    ],
  },
];

export const bebidas: Plato[] = [
  {
    name: 'Matcha Latte',
    price: 10,
    description:
      'Suave, vegetal y ligeramente dulce. Matcha japonés mezclado con leche acompañado con hielo.',
  },
  {
    name: 'Matcha Caramel Latte',
    price: 12,
    description:
      'Suave, dulce y delicioso matcha japonés, leche, acompañado con hielo y caramelo dulce en el fondo.',
  },
  {
    name: 'Té de Jazmín',
    price: 5,
    description:
      'Infusión de flores de jazmín, con un toque refrescante acompañado de naranja.',
  },
];

export const contacto = {
  whatsapp: '988 843 683',
  whatsappIntl: '51988843683',
  instagram: '@kitsunemakis',
};

export const formatPrice = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * Precio de la bandeja MÁS BARATA (10 cortes → S/ 20). Es un DATO de la
 * tabla, no una estimación: se deriva de `cortes` para que siga siendo verdad
 * si algún día cambian los precios. Es el "Desde S/ …" que se pone en las
 * tarjetas de maki, donde el precio real depende del tamaño que elija el
 * visitante. Nunca se usa para calcular un total.
 */
export const PRECIO_MINIMO_BANDEJA = Math.min(...cortes.map((c) => c.price));

/** Opciones declaradas por plato, indexadas por nombre real de la carta. */
export const OPCIONES_POR_PLATO: Readonly<Record<string, Opcion[]>> = Object.freeze(
  Object.fromEntries(
    [...especiales, ...bebidas]
      .filter((p) => p.opciones && p.opciones.length > 0)
      .map((p) => [p.name, p.opciones as Opcion[]]),
  ),
);
