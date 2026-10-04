// RED primero: estas pruebas describen el modelo ANTES de que exista.
// Ejecutar con:  node --test --experimental-strip-types src/lib/cart.test.ts
// (runner nativo de Node: no se instala nada, no hay vitest/jest en el proyecto)
//
// La regla comercial que fijan (confirmada por el cliente el 2026-09-28):
// la tabla de la carta es POR BANDEJA y APLICA A CUALQUIERA de los makis.
// Un pedido son VARIAS BANDEJAS SUMADAS, no un mapa producto -> cantidad.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRECIO_BANDEJA,
  PRECIO_EXTRA,
  MEJOR_VALOR,
  MAX_LINEAS,
  MAX_CANTIDAD,
  MAX_MENSAJE,
  VERSION_ESTADO,
  computeTotals,
  parseCarrito,
  toQuery,
  mensajeWa,
  sanearLineas,
  agregar,
  setCantidad,
  quitar,
  reemplazar,
  agrupar,
  clave,
  etiquetaOpcion,
  gruposDeOpciones,
  excedeMensaje,
  urlDeclaraPedido,
  type Linea,
} from './cart.ts';

// ─────────────────────────────────────────────────── el caso de aceptación
test('el ejemplo del cliente: 20 + 40 + 10 = 70 cortes, S/ 119', () => {
  const lineas: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Acevichado', cortes: 10, cantidad: 1 },
  ];
  const t = computeTotals(lineas);
  assert.equal(t.totalCortes, 70);
  assert.equal(t.totalPrecio, 119);
  assert.equal(t.lineas.length, 3);
});

test('el total NO tiene que caer en un tamano de la tabla', () => {
  const t = computeTotals([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 },
  ]);
  assert.equal(t.totalCortes, 60, '60 cortes no existe en la tabla y es valido');
  assert.equal(t.totalPrecio, 99);
});

test('3 bandejas del mismo roll y tamano = una linea con cantidad 3', () => {
  const t = computeTotals([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 3 },
  ]);
  assert.equal(t.totalCortes, 60);
  assert.equal(t.totalPrecio, 105);
  assert.equal(t.lineas.length, 1, 'se agrupa en una sola linea');
  assert.equal(t.lineas[0].cantidad, 3);
});

test('el mismo roll en dos tamanos = dos lineas distintas', () => {
  const t = computeTotals([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 },
  ]);
  assert.equal(t.lineas.length, 2);
  assert.equal(t.totalPrecio, 99);
});

test('una linea EXTRA usa su precio unitario real, no la tabla de cortes', () => {
  const t = computeTotals([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'extra', producto: 'Katsukare', cantidad: 2 },
    { tipo: 'extra', producto: 'Matcha Latte', cantidad: 2 },
  ]);
  assert.equal(t.totalCortes, 20, 'los extras no aportan cortes');
  assert.equal(t.totalPrecio, 35 + 48 + 20);
});

test('carrito vacio = 0, sin NaN', () => {
  const t = computeTotals([]);
  assert.equal(t.totalCortes, 0);
  assert.equal(t.totalPrecio, 0);
  assert.equal(t.lineas.length, 0);
  assert.ok(Number.isFinite(t.totalPrecio), 'nunca NaN');
});

test('un roll desconocido NO se cobra con un precio inventado', () => {
  const lineas = sanearLineas([
    { tipo: 'bandeja', roll: 'Machalate', cortes: 20, cantidad: 1 },
  ]);
  assert.equal(lineas.length, 0, 'se descarta, no se inventa precio');
});

// ──────────────────────────────────────────────────────── la tabla de precios
test('la tabla de la tabla del PDF: 10->20, 20->35, 30->52, 40->64, 50->87', () => {
  assert.deepEqual(PRECIO_BANDEJA, { 10: 20, 20: 35, 30: 52, 40: 64, 50: 87 });
  // 30 cortes son S/ 52. NO es S/ 50. Ese numero circulo por un modelo
  // descartado y no debe volver.
  assert.notEqual(PRECIO_BANDEJA[30], 50);
});

test('un tamano que no existe en la carta LANZA, no cobra lo que sea', () => {
  assert.throws(
    () => computeTotals([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 8 as never, cantidad: 1 }]),
    /8|no existe|bandeja/i,
    'una bandeja de 8 cortes no existe: el modelo debe negarse',
  );
});

test('los precios de los especiales son los reales del PDF', () => {
  assert.equal(PRECIO_EXTRA['Katsukare'], 24);
  assert.equal(PRECIO_EXTRA['Karage'], 15);
  assert.equal(PRECIO_EXTRA['Ebi Furai'], 18);
  assert.equal(PRECIO_EXTRA['Burguermaki'], 20);
  assert.equal(PRECIO_EXTRA['Matcha Latte'], 10);
  assert.equal(PRECIO_EXTRA['Matcha Caramel Latte'], 12);
  assert.equal(PRECIO_EXTRA['Té de Jazmín'], 5);
});

test('un extra desconocido se descarta en vez de valer 0 en silencio', () => {
  const lineas = sanearLineas([{ tipo: 'extra', producto: 'Macha te', cantidad: 2 }]);
  assert.equal(lineas.length, 0);
});

// ──────────────────────────────────────────────────────────────── el saneado
test('cantidad 0 y negativa se eliminan de la linea', () => {
  assert.equal(sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 0 }]).length, 0);
  assert.equal(sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: -3 }]).length, 0);
});

test('una cantidad decimal se trunca (cantidad = numero entero de bandejas)', () => {
  const l = sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 2.9 }]);
  assert.equal(l[0].cantidad, 2);
});

test('NaN e Infinity se rechazan', () => {
  assert.equal(sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: NaN }]).length, 0);
  assert.equal(sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: Infinity }]).length, 0);
});

// ────────────────────────────────────────────────────── estado en la URL
test('ida y vuelta por la URL conserva el pedido', () => {
  const original: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 2 },
    { tipo: 'extra', producto: 'Katsukare', cantidad: 3 },
  ];
  // BUG PROPIO (corregido por este test): toQuery devuelve SOLO la carga util
  // ("kitsune:20:1,…"), pero parseCarrito espera la query completa "?q=…".
  // La prueba pasaba '?' + carga, que no casa con /[?#]q=/, y devolvia [].
  const vuelta = parseCarrito('?q=' + toQuery(original));
  assert.deepEqual(vuelta, original);
});

test('la URL se lee de un prefijo ?q= o de un fragmento #q=', () => {
  const q = toQuery([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }]);
  assert.deepEqual(parseCarrito('?q=' + q), [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }]);
  assert.deepEqual(parseCarrito('#q=' + q), [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }]);
});

test('basura en la URL no rompe nada y no inventa lineas', () => {
  for (const basura of ['', '?q=', '?q=;;;;', '?q=inventado:3', '?q=kitsune:abc',
                        '?q=kitsune:-1', '?q=kitsune:999999999999999999', '?q=%ZZ']) {
    const l = parseCarrito(basura);
    assert.ok(Array.isArray(l), `debe devolver un array para ${JSON.stringify(basura)}`);
    for (const x of l) assert.ok(Number.isFinite(x.cantidad) && x.cantidad > 0);
  }
});

test('un slug con acentos o espacios se normaliza (Katsukare, no Machalate)', () => {
  const l = parseCarrito('?q=katsukare:2');
  assert.equal(l.length, 1);
  assert.equal(l[0].producto ?? l[0].roll, 'Katsukare');
});

test('MEJOR_VALOR es un par de NUMEROS, no de cadenas', () => {
  // BUG PROPIO (cazado por este test): Object.entries devuelve claves string,
  // así que MEJOR_VALOR era ["40", 64] y el `as [number, number]` mentia.
  // En la fase 04, `cortes === MEJOR_VALOR[0]` habria sido `20 === "40"`:
  // siempre falso, y el badge "mejor valor" no aparecia nunca. Con `===`
  // estricto esto FALLA; con un assert laxo (deepEqual) pasaria, porque un
  // string y un number no son deep-equal, pero la comparacion de arriba si
  // distingue. Se comprueba el comportamiento real, no la forma.
  assert.equal(typeof MEJOR_VALOR[0], 'number');
  assert.equal(typeof MEJOR_VALOR[1], 'number');
  assert.equal(MEJOR_VALOR[0], 40);
  assert.equal(MEJOR_VALOR[1], 64);
  // la comparacion que hara la UI: debe ser VERDADERA
  assert.equal(40 === MEJOR_VALOR[0], true);
  // BUG PROPIO (cazado por tsc, no por un test): comparar contra el LITERAL
  // 20 hace que TS estreche el tipo y lo marque como "sin solapamiento"
  // (TS2367: types '20' and '40' have no overlap). Se pasa por una variable
  // para que la comparacion se resuelva en TIEMPO DE EJECUCION, que es lo que
  // importa: el badge se decide comparando el `cortes` de una linea con este
  // valor, y ese `cortes` es dinamico.
  const otro: number = 20;
  assert.equal(otro === MEJOR_VALOR[0], false);
  // Y el caso real que la UI va a comparar:
  const deUnaLinea = 40;
  assert.equal(deUnaLinea === MEJOR_VALOR[0], true);
});

test('MAX_LINEAS trunca, y eso DEBE ser visible para la UI', () => {
  // BUG PROPIO (documentado por referencia 2): sanearLineas corta en
  // MAX_LINEAS en SILENCIO. Es la misma clase de fallo que este proyecto lleva
  // cazando toda la sesion: el `truncate` que ocultaba el precio, el
  // `startsWith` sobre SVGAnimatedString, el `exit 0` de un pipe. Un pedido de
  // 31 lineas perderia una sin avisar y el total seria incorrecto.
  //
  // LaDecision: el limite es TECNICO (protege el mensaje de wa.me), NO
  // comercial — no existe tal regla en la carta. Por eso NO se puede
  // descartar una linea callando: la UI tiene que AVISAR. Este test fija el
  // comportamiento actual y deja la puerta escrita:
  //   - hoy: sanearLineas devuelve como mucho MAX_LINEAS (dato medido);
  //   - la UI (fase 04) DEBE avisar cuando el pedido alcanza ese tope.
  const muchas = Array.from({ length: MAX_LINEAS + 5 }, (_, i) =>
    i % 2
      ? { tipo: 'bandeja', roll: 'Kitsune', cortes: 10, cantidad: 1 }
      : { tipo: 'extra', producto: 'Karage', cantidad: 1 });
  const l = sanearLineas(muchas);
  assert.equal(l.length, MAX_LINEAS, 'el tope es real, medido');
  assert.ok(
    mensajeWa(l).length < 4000,
    'y el mensaje de wa.me sigue siendo manejable',
  );
  // Lo que la UI no puede hacer: truncar y ya esta.
  assert.ok(MAX_LINEAS > 0 && MAX_LINEAS < 1000, 'el tope debe ser una cota util');
});

test('MAX_CANTIDAD es un tope TECNICO: 99 bandejas es un tope de la UI, no de la carta', () => {
  // Misma regla: nada en el PDF limita a 99. Si el restaurante quisiera otro
  // tope, es una decision comercial (B2) y se cambia en menu.ts, no aqui.
  const l = sanearLineas([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 10, cantidad: 5000 }]);
  assert.equal(l[0].cantidad, MAX_CANTIDAD, 'se recorta al tope tecnico');
  assert.equal(typeof MAX_CANTIDAD, 'number');
});

test('el tope de lineas NO descarta ninguna combinacion posible', () => {
  // Las 47 combinaciones reales (40 bandejas + 7 extras) deben caber SIN
  // truncar: un pedido no puede perder una línea en silencio.
  const todas: unknown[] = [];
  for (const roll of ['California', 'Furai', 'Acevichado', 'Garlic',
                      'Kitsune', 'Parmesano', 'Parrillero', 'Yakiniku']) {
    for (const n of [10, 20, 30, 40, 50]) {
      todas.push({ tipo: 'bandeja', roll, cortes: n, cantidad: 1 });
    }
  }
  for (const p of ['Karage', 'Ebi Furai', 'Katsukare', 'Burguermaki',
                   'Matcha Latte', 'Matcha Caramel Latte', 'Té de Jazmín']) {
    todas.push({ tipo: 'extra', producto: p, cantidad: 1 });
  }
  assert.equal(todas.length, 47, 'las 47 combinaciones posibles de la carta');
  const out = sanearLineas(todas);
  assert.equal(out.length, 47, 'NINGUNA se puede descartar: 47 entran, 47 salen');
  assert.ok(MAX_LINEAS >= 47, 'el tope técnico queda por encima de lo posible');

  // Y el mensaje de wa.me sigue siendo manejable con las 47.
  assert.ok(mensajeWa(out).length < 4000,
            'el mensaje no crece sin limite con el maximo posible');
});

// ─────────────────────────────────────────────────── el mensaje a WhatsApp
test('el mensaje enumera las lineas con su importe', () => {
  const m = mensajeWa([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Acevichado', cortes: 10, cantidad: 1 },
  ]);
  assert.match(m, /Kitsune/);
  assert.match(m, /Parrillero/);
  assert.match(m, /Acevichado/);
  assert.match(m, /119/, 'lleva el total estimado');
  assert.match(m, /70/, 'lleva los cortes totales');
});

test('sin lineas el mensaje NO ofrece un pedido vacio', () => {
  assert.equal(mensajeWa([]), '');
});

// ═══════════════════════════════════════════════════════════════════════════
// REDISEÑO — las correcciones funcionales obligatorias, como pruebas.
//
// Cada bloque de aquí responde a una corrección pedida de forma explícita.
// Son las que NO se ven a ojo en una captura: afectan al ESTADO.
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. «Té de Jazmín» con su nombre real y S/ 5.00 ───────────────────────────
test('CORRECCIÓN 1: Té de Jazmín se agrega con su nombre real y S/ 5.00', () => {
  // El fallo era un producto con precio 0 y/o un `null` en el pedido. Aquí se
  // ejercita el camino COMPLETO: agregar → totales → mensaje.
  const l = agregar([], { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 });
  assert.equal(l.length, 1);
  assert.equal(l[0].producto, 'Té de Jazmín', 'el nombre real, no un slug ni null');
  assert.ok(l[0].producto !== null && l[0].roll === undefined);

  const t = computeTotals(l);
  assert.equal(t.totalPrecio, 5, 'S/ 5.00 exactos');
  assert.equal(t.totalCortes, 0, 'una bebida no aporta cortes');
  assert.ok(t.totalPrecio > 0, 'jamás S/ 0.00 por un producto desconocido');

  assert.match(mensajeWa(l), /Té de Jazmín/);
  assert.match(mensajeWa(l), /S\/ 5\.00/);
});

test('CORRECCIÓN 1: un nombre desconocido NO entra como precio cero', () => {
  // Este es el mecanismo del bug: `nombre || null` + `precioDe() || 0`.
  // Ahora `agregar` sanea: lo desconocido no se agrega, y una línea suelta con
  // nombre inventado se descarta en vez de valer 0.
  const l = agregar([], { tipo: 'extra', producto: 'Té de Jazmin X', cantidad: 3 });
  assert.equal(l.length, 0, 'no se agrega una línea con precio 0');
  assert.equal(sanearLineas([{ tipo: 'extra', producto: 'Macha te', cantidad: 1 }]).length, 0);
});

// ── 2. Las cantidades de la UI son las del pedido (estado compartido) ───────
test('CORRECCIÓN 2: cada cantidad editable cambia el pedido de verdad', () => {
  // El fallo: el selector mostraba 0 con 1 en el carrito, y escribir 2 no
  // modificaba nada. Aquí se prueba que la línea del selector y la del carrito
  // son la MISMA línea, y que su cantidad manda sobre el total.
  const inicial: Linea[] = [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }];
  const trasEscribirDos = setCantidad(inicial, clave(inicial[0]), 2);
  assert.equal(trasEscribirDos[0].cantidad, 2, 'el 2 sí se guarda');
  assert.equal(computeTotals(trasEscribirDos).totalPrecio, 70, '2 × S/ 35 = S/ 70');
  assert.equal(computeTotals(trasEscribirDos).totalCortes, 40);

  // Y el paso inverso: bajar a 0 QUITA la línea (no deja un 0 fantasma).
  assert.equal(setCantidad(inicial, clave(inicial[0]), 0).length, 0);
  assert.equal(setCantidad(inicial, clave(inicial[0]), -2).length, 0);
});

test('CORRECCIÓN 2: una cantidad en la línea que no existe no inventa nada', () => {
  const l: Linea[] = [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }];
  assert.deepEqual(setCantidad(l, 'bandeja:kitsune:40', 5), l,
    'editar una combinación que no está no la crea ni altera otra');
});

// ── 3. «Configurar» apunta al producto correcto, y no vacía el pedido ──────
test('CORRECCIÓN 3: la URL conserva el producto y el tamaño correctos', () => {
  // El enlace de una tarjeta dice roll + tamaño. Al volver, el estado restaurado
  // tiene que ser ESE producto con ESE tamaño, y no el tamaño por defecto.
  const l = parseCarrito('?q=' + toQuery([{ tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 }]));
  assert.equal(l[0].roll, 'Parrillero');
  assert.equal(l[0].cortes, 40);
  assert.notEqual(l[0].cortes, 40 === 40 ? 20 : 0, 'no cae en el tamaño por defecto');
});

test('CORRECCIÓN 3: un enlace antiguo en forma corta sigue funcionando', () => {
  // v1 explícito y v1 corto, ambos compartidos antes de este rediseño.
  assert.deepEqual(parseCarrito('?q=bandeja:kitsune:20:1'),
    [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }]);
  assert.deepEqual(parseCarrito('?q=katsukare:2'),
    [{ tipo: 'extra', producto: 'Katsukare', cantidad: 2 }]);
  assert.deepEqual(parseCarrito('#q=bandeja:furai:30:2'),
    [{ tipo: 'bandeja', roll: 'Furai', cortes: 30, cantidad: 2 }]);
  // Con el flag de versión delante, que es como se escribe hoy.
  assert.deepEqual(parseCarrito('?v=2&q=' + toQuery([{ tipo: 'extra', producto: 'Karage', cantidad: 1 }])),
    [{ tipo: 'extra', producto: 'Karage', cantidad: 1 }]);
});

test('CORRECCIÓN 3: un enlace con pedido NO se vacía al navegar a Configurar', () => {
  // Precedencia: si la URL trae `q`, manda la URL. Un deep-link a configurar
  // otro producto no puede borrar lo que ya había (eso se resuelve con la
  // precedencia de estado, pero el serializado debe poder convivir).
  const pedido = '?q=' + toQuery([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }]);
  assert.equal(urlDeclaraPedido(pedido, ''), true, 'la URL declara un pedido');
  assert.equal(urlDeclaraPedido('?roll=Kitsune&cortes=20', ''), false,
    'un deep-link de producto NO es un pedido: se ignora el almacenamiento');
});

// ── 4. Cambiar el tamaño de una bandeja nueva no toca una ya agregada ───────
test('CORRECCIÓN 4: cambiar de tamaño al AGREGAR no altera la bandeja existente', () => {
  // El fallo: el selector de tamaños recorría las líneas y, si encontraba el
  // roll, le cambiaba el tamaño. Alguien con Kitsune 20 en el pedido marcaba
  // 40 para añadir otra bandeja y le convertía la de 20 en 40.
  const conKitsune20: Linea[] = [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }];
  // Elegir 40 en el selector es agregar una LÍNEA NUEVA, no editar la vieja.
  const trasElegir40 = agregar(conKitsune20, { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 });
  assert.equal(trasElegir40.length, 2, 'son dos bandejas distintas');
  assert.equal(trasElegir40[0].cortes, 20, 'la bandeja ya agregada sigue en 20');
  assert.equal(trasElegir40[1].cortes, 40);
  const t = computeTotals(trasElegir40);
  assert.equal(t.totalPrecio, 35 + 64, 'S/ 99: la de 20 no se movió');
  assert.equal(t.totalCortes, 60);
});

test('CORRECCIÓN 4: editar desde el carrito toca SOLO la línea elegida', () => {
  const tres: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 2 },
  ];
  const editada = setCantidad(tres, 'bandeja:kitsune:40', 3);
  assert.equal(editada[0].cantidad, 1, 'la otra bandeja del mismo roll no se mueve');
  assert.equal(editada[1].cantidad, 3, 'la elegida sí');
  assert.equal(editada[2].cantidad, 2, 'el extra no se mueve');
  assert.equal(computeTotals(editada).totalPrecio, 35 + 64 * 3 + 15 * 2);
  assert.equal(computeTotals(editada).totalCortes, 20 + 40 * 3);
});

test('CORRECCIÓN 4: editar NO reordena el pedido', () => {
  // BUG PROPIO (cazado por la puerta de navegador, NO por los totales): editar
  // quitaba la línea y la volvía a añadir al final, así que al cambiar
  // Parrillero 40 ×1 a ×3 la bandeja quedaba Kitsune 20 · Karage · Parrillero.
  // El total era idéntico, de modo que NINGÚN test de importes lo detectaba:
  // el fallo era de orden, y el orden es del cliente, no del sitio.
  const antes: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 1 },
  ];
  const despues = reemplazar(antes, 'bandeja:parrillero:40', {
    tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 3,
  });
  assert.deepEqual(despues.map(clave), antes.map(clave), 'el orden no cambia');
  assert.equal(despues[1].cantidad, 3, 'y la editada es la que cambia');
  assert.equal(despues[0].cantidad, 1);
  assert.equal(despues[2].cantidad, 1);
});

test('CORRECCIÓN 4: editar a una combinación que ya existe FUSIONA, no duplica', () => {
  const antes: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 2 },
  ];
  // Edito la de 40 para que pase a 20: ahora hay dos Kitsune 20.
  const despues = reemplazar(antes, 'bandeja:kitsune:40', {
    tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 2,
  });
  assert.equal(despues.length, 1, 'no puede haber dos filas de la misma combinación');
  assert.equal(despues[0].cantidad, 3, '1 + 2 fusionadas');
  assert.equal(computeTotals(despues).totalPrecio, 35 * 3);
});

test('CORRECCIÓN 4: editar una línea que ya no existe no rompe nada', () => {
  const antes: Linea[] = [{ tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 }];
  const despues = reemplazar(antes, 'bandeja:furai:30:1', {
    tipo: 'bandeja', roll: 'Furai', cortes: 30, cantidad: 1,
  });
  assert.equal(despues.length, 2, 'cae al caso "agregar" en vez de perder la línea');
  assert.equal(computeTotals(despues).totalPrecio, 35 + 52);
  // Y una línea inválida en la edición se ignora: el pedido queda como estaba.
  assert.deepEqual(reemplazar(antes, 'bandeja:kitsune:20', {
    tipo: 'extra', producto: 'Machalate', cantidad: 1,
  }), antes);
});

// ── 5. Acumulación: solo se agrupa lo IDÉNTICO ─────────────────────────────
test('CORRECCIÓN 5: la misma combinación acumula; distinta, se separa', () => {
  let l: Linea[] = [];
  l = agregar(l, { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 });
  l = agregar(l, { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 });
  l = agregar(l, { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 });
  assert.equal(l.length, 1, 'tres veces lo mismo = una línea con 3');
  assert.equal(l[0].cantidad, 3);
  l = agregar(l, { tipo: 'bandeja', roll: 'Kitsune', cortes: 30, cantidad: 1 });
  assert.equal(l.length, 2, 'otro tamaño = otra línea');
  assert.equal(computeTotals(l).totalPrecio, 35 * 3 + 52);

  // Extras: dos del mismo producto acumulan; producto distinto, no.
  let e: Linea[] = [];
  e = agregar(e, { tipo: 'extra', producto: 'Matcha Latte', cantidad: 1 });
  e = agregar(e, { tipo: 'extra', producto: 'Matcha Latte', cantidad: 2 });
  assert.equal(e.length, 1);
  assert.equal(e[0].cantidad, 3);
  e = agregar(e, { tipo: 'extra', producto: 'Karage', cantidad: 1 });
  assert.equal(e.length, 2);
});

test('CORRECCIÓN 5: dos opciones del mismo plato son dos líneas', () => {
  let l: Linea[] = [];
  l = agregar(l, { tipo: 'extra', producto: 'Burguermaki', opcion: 'anguila', cantidad: 1 });
  l = agregar(l, { tipo: 'extra', producto: 'Burguermaki', opcion: 'acevichada', cantidad: 1 });
  assert.equal(l.length, 2, 'salsa distinta = combinación distinta');
  l = agregar(l, { tipo: 'extra', producto: 'Burguermaki', opcion: 'anguila', cantidad: 1 });
  assert.equal(l.length, 2);
  assert.equal(l[0].cantidad, 2, 'la misma salsa sí acumula');
  // Y el precio NO cambia por la salsa: la carta no confirma recargo.
  assert.equal(computeTotals(l).totalPrecio, 20 * 3, 'S/ 60, sin sobreprecio inventado');
});

/* CAMBIO DE CONTRATO (M05-C05), 2026-10-03.
 *
 * Antes, una opción que la carta no declara eliminaba la LÍNEA ENTERA. Ahora
 * elimina solo la OPCIÓN y conserva el producto.
 *
 * Por qué: la carta del Burguermaki ofrece relleno (3) y salsa (2), así que un
 * enlace manipulado puede traer combinaciones que no existen. Descartar el
 * pedido entero castiga a quien solo se equivocó en un dato; descartar la
 * opción conserva lo que sí es verdad. Y la seguridad no baja: lo que no está
 * declarado NUNCA llega al pedido ni al mensaje, que es lo que importa.
 */
test('CORRECCIÓN 5: una opción inventada se descarta y el producto sobrevive', () => {
  const conInventada = sanearLineas([
    { tipo: 'extra', producto: 'Burguermaki', opcion: 'salsa-de-magia', cantidad: 1 },
  ]);
  assert.equal(conInventada.length, 1, 'el plato sigue siendo pedible');
  assert.deepEqual(conInventada[0].opciones ?? [], [], 'pero SIN la opción inventada');

  // Un plato que no tiene ninguna opción declarada, con opción: también se
  // descarta la opción (y aquí no queda nada que conservar).
  const sinOpciones = sanearLineas([
    { tipo: 'extra', producto: 'Karage', opcion: 'anguila', cantidad: 1 },
  ]);
  assert.equal(sinOpciones.length, 1);
  assert.deepEqual(sinOpciones[0].opciones ?? [], [], 'Karage no declara opciones');

  // Y lo que el contrato exige: NINGUNA opción inventada viaja al mensaje.
  const msg = mensajeWa(conInventada);
  assert.equal(msg.includes('magia'), false, 'la opción inventada no llega a WhatsApp');
  assert.ok(msg.includes('Burguermaki'), 'pero el plato sí');
});

test('CORRECCIÓN 5: agrupar colapsa solo lo idéntico', () => {
  const restauracion: unknown[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 2 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 1 },
  ];
  const l = agrupar(sanearLineas(restauracion));
  assert.equal(l.length, 3, '20+20 colapsan; 40 y Karage×2 se unen por separado');
  assert.equal(l[0].cantidad, 3);
  assert.equal(l[1].cortes, 40);
  assert.equal(l[2].cantidad, 2);
});

// ── 6. Restauración: válida, versionada y con datos inválidos rechazados ────
test('CORRECCIÓN 6: el estado serializado NO contiene precios', () => {
  // Si el pedido guardado no lleva precios, al restaurar se recalcula contra el
  // menú ACTUAL. Así una carta que cambia de precio no resurrecta un total viejo.
  const q = toQuery([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 },
  ]);
  assert.equal(q.includes('35'), false, 'ningún precio en la URL');
  assert.equal(q.includes('5'), false);
  assert.equal(/[0-9]{2}\.[0-9]{2}/.test(q), false, 'ni importes con decimales');
  assert.ok(VERSION_ESTADO >= 2, 'la serialización declara versión');
  // Y al recalcular contra el menú, el precio es el de HOY.
  assert.equal(computeTotals(parseCarrito('?q=' + q)).totalPrecio, 40);
});

test('CORRECCIÓN 6: un estado guardado corrupto o de otra versión se rechaza', () => {
  for (const basura of [
    '?q=%7B%22tipo%22%3A%22extra%22%7D',          // un objeto JSON, no la gramática
    '?q=b:kitsune:20',                              // fewer campos
    '?q=b:machalate:20:1',                          // roll que no está en la carta
    '?q=b:kitsune:8:1',                             // tamaño que no existe
    '?q=e:karage:0',                                // cantidad 0
    '?q=e:burguermaki:salsamagia:1',                // opción no declarada
    '?q=e:tedejazmin:1:1',                          // gramática v2 con opción de más
  ]) {
    const l = parseCarrito(basura);
    assert.ok(Array.isArray(l));
    // O bien se rechaza entero, o sale una línea SANEADA (nunca un precio 0).
    for (const x of l) {
      const t = computeTotals([x]);
      assert.ok(t.totalPrecio > 0, `${basura} no puede producir S/ 0.00`);
    }
  }
  /* Ver el cambio de contrato de la opción inventada, más arriba: la opción se
     descarta y el plato sobrevive. Lo que NO puede pasar es que lo inventado
     llegue al pedido o al mensaje. */
  const conOpcionInventada = parseCarrito('?q=e:burguermaki:salsamagia:1');
  assert.equal(conOpcionInventada.length, 1);
  assert.deepEqual(conOpcionInventada[0].opciones ?? [], [], 'la opción no declarada no entra');
  assert.equal(
    mensajeWa(conOpcionInventada).includes('magia'),
    false,
    'y tampoco llega al mensaje de WhatsApp',
  );
});

test('CORRECCIÓN 6: un pedido normal cabe; uno enorme ofrece COPIAR', () => {
  /* MEDIDO de nuevo el 2026-10-03: el pie del mensaje pasó de «70 cortes · Total
     estimado» a «70 cortes · 3 artículos · Total estimado» (M05-C06: el resumen
     tiene que distinguir cortes de artículos), así que el mismo pedido mide
     ahora 217 caracteres en vez de 203. El umbral MAX_MENSAJE no se tocó: es
     técnico, de lo que `wa.me` recorta, no de lo que nos gusta el texto. */
  const tipico: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Acevichado', cortes: 10, cantidad: 1 },
  ];
  assert.equal(mensajeWa(tipico).length, 217, 'medido');
  assert.equal(excedeMensaje(tipico), false, 'el pedido normal va por enlace');
  assert.ok(mensajeWa(tipico).length <= MAX_MENSAJE);
  // Y el resumen dice las dos cosas, no solo una.
  assert.ok(mensajeWa(tipico).includes('70 cortes'));
  assert.ok(mensajeWa(tipico).includes('3 artículos'));

  const todas: Linea[] = [];
  for (const roll of ['California', 'Furai', 'Acevichado', 'Garlic',
                      'Kitsune', 'Parmesano', 'Parrillero', 'Yakiniku']) {
    for (const n of [10, 20, 30, 40, 50]) {
      todas.push({ tipo: 'bandeja', roll, cortes: n, cantidad: 1 });
    }
  }
  for (const p of ['Karage', 'Ebi Furai', 'Katsukare', 'Burguermaki',
                   'Matcha Latte', 'Matcha Caramel Latte', 'Té de Jazmín']) {
    todas.push({ tipo: 'extra', producto: p, cantidad: 1 });
  }
  assert.equal(todas.length, 47);
  assert.equal(mensajeWa(todas).length, 1833, 'medido: 33 por encima del umbral');
  assert.ok(excedeMensaje(todas), 'el tope absoluto cae en el aviso de copia');

  // Y el mensaje NUNCA se trunca: se entrega entero para poder copiarlo.
  const enorme = sanearLineas(todas.map((l) => ({ ...l, cantidad: 99 })));
  assert.equal(excedeMensaje(enorme), true);
  assert.equal(mensajeWa(enorme).split('\n').length, 47 + 2, 'las 47 líneas + cabecera + pie');
});

test('CORRECCIÓN 8: un enlace CODIFICADO restaura el mismo pedido', async () => {
  /* Regresión de M05-C09, 2026-10-03.
   *
   * El fallo era real y estaba en producción: `parseCarrito` cortaba el
   * payload por comas ANTES de decodificarlo. Un enlace codificado —la forma
   * que produce cualquier app al compartir la barra de direcciones, y la que
   * aparece en el enlace de WhatsApp— trae la coma como `%2C`, que no corta
   * nada: el payload entero se leía como una sola línea, no tenía 4 campos, y
   * se descartaba. Medido en el navegador: `?v=2&q=b%3Akitsune%3A30%3A1%2Ce
   * %3Akarage%3A2` arrancaba con el pedido VACÍO y la URL se reescribía a
   * `?v=2&q=`, perdiendo el enlace para siempre.
   *
   * Ahora se decodifica el payload entero y luego se corta. */
  const crudo = toQuery([
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 30, cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 2 },
  ]);
  const esperado = parseCarrito('?q=' + crudo);
  assert.equal(esperado.length, 2, 'la forma sin codificar sigue funcionando');

  // La forma codificada tiene que dar EXACTAMENTE lo mismo.
  for (const forma of [
    '?q=' + encodeURIComponent(crudo),
    '?v=2&q=' + encodeURIComponent(crudo),
    '?q=' + encodeURIComponent(crudo).replace('%3A', ':'),   // a medias
  ]) {
    assert.deepEqual(parseCarrito(forma), esperado, `no cambia con ${forma.slice(0, 30)}…`);
  }

  // Y con `restaurar`, que es el camino real: la URL gana al guardado.
  const { restaurar } = await import('./estado.ts');
  const r = restaurar({
    search: '?v=2&q=' + encodeURIComponent(crudo),
    hash: '',
    guardado: null,
    ahora: Date.now(),
  });
  assert.equal(r.origen, 'url');
  assert.equal(r.lineas.length, 2, 'un enlace compartido restaura el pedido entero');
  // 30 cortes = S/ 52 (no 35: ese es el de 20) y 2 Karage = S/ 30.
  assert.equal(computeTotals(r.lineas).totalPrecio, 52 + 15 * 2);

  // El `%ZZ` mal formado sigue sin romper nada: se ignora, no se lanza.
  assert.deepEqual(parseCarrito('?q=b%3Akitsune%3A30%3A1%2C%ZZ'), [], 'basura → vacío, sin excepción');

  /* Regresión 2, mismo día: el ANCLA. El sitio escribe el pedido en la query y
   * el ancla de sección en el hash a la vez, y `restaurar()` le pasa las dos
   * concatenated. Con el payload cortado en `[^&]*`, el «#catalogo» se pegaba
   * al último campo y la cantidad llegaba como «1#catalogo»: la línea se
   * descartaba y, tras recargar, el pedido salía vacío. */
  for (const forma of [
    '?v=2&q=b:kitsune:20:1#catalogo',
    '?v=2&q=' + encodeURIComponent('b:kitsune:20:1') + '#catalogo',
    '?q=b:kitsune:20:1&x=1#catalogo',
  ]) {
    const l = parseCarrito(forma);
    assert.equal(l.length, 1, `con hash: ${forma.slice(0, 40)}…`);
    assert.equal(l[0].cantidad, 1, 'la cantidad no arrastra el ancla');
  }
});

// ── 7. Quitar, y el foco no se pierde porque el modelo no lo tiene ─────────
test('CORRECCIÓN 7: quitar una línea deja el resto intacto', () => {
  const l: Linea[] = [
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
    { tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 },
    { tipo: 'extra', producto: 'Karage', cantidad: 1 },
  ];
  const trasQuitar = quitar(l, 'bandeja:kitsune:20');
  assert.equal(trasQuitar.length, 2);
  assert.equal(computeTotals(trasQuitar).totalPrecio, 64 + 15);
  assert.equal(quitar(trasQuitar, 'bandeja:kitsune:20').length, 2, 'quitar dos veces no rompe');
  assert.equal(quitar(trasQuitar, 'no-existe').length, 2, 'quitar lo que no está no hace nada');
});

// ── El mensaje: completo y con las opciones elegidas ────────────────────────
test('el mensaje incluye la opción elegida, con su nombre real', () => {
  const m = mensajeWa([
    { tipo: 'extra', producto: 'Burguermaki', opcion: 'anguila', cantidad: 1 },
    { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 },
  ]);
  assert.match(m, /Burguermaki/);
  assert.match(m, /Salsa de anguila/, 'la opción viaja con su etiqueta, no su id');
  assert.match(m, /Té de Jazmín/);
  assert.match(m, /S\/ 25\.00/);
  assert.equal(etiquetaOpcion('Burguermaki', 'anguila'), 'Salsa de anguila');
  assert.equal(etiquetaOpcion('Karage', 'anguila'), undefined);
});

// ═══════════════════════════════════════════════ REGRESIÓN OBLIGATORIA
test('REGRESIÓN: 20 + 40 + 10 = 70 cortes y S/ 119.00; con Jazmín, S/ 124.00', () => {
  let l: Linea[] = [];
  l = agregar(l, { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 });
  l = agregar(l, { tipo: 'bandeja', roll: 'Parrillero', cortes: 40, cantidad: 1 });
  l = agregar(l, { tipo: 'bandeja', roll: 'Acevichado', cortes: 10, cantidad: 1 });
  let t = computeTotals(l);
  assert.equal(t.totalCortes, 70);
  assert.equal(t.totalPrecio, 119);
  assert.match(mensajeWa(l), /Total estimado: S\/ 119\.00/);

  l = agregar(l, { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 });
  t = computeTotals(l);
  assert.equal(t.totalPrecio, 124, '119 + 5');
  assert.equal(t.totalCortes, 70, 'una bebida no suma cortes');
  assert.match(mensajeWa(l), /Total estimado: S\/ 124\.00/);

  // El pedido completo sobrevive a la URL (compartir sin perder nada).
  const restaurado = parseCarrito('?q=' + toQuery(l));
  assert.equal(computeTotals(restaurado).totalPrecio, 124);
  assert.equal(computeTotals(restaurado).totalCortes, 70);
});

test('Burguermaki conserva ambas preferencias al compartir y editar, sin perder las otras líneas', () => {
  const burger: Linea = { tipo: 'extra', producto: 'Burguermaki', cantidad: 1, opciones: ['relleno-ebi', 'anguila'] };
  const tea: Linea = { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 };
  const restored = parseCarrito('?q=' + toQuery([burger, tea]));
  assert.deepEqual(restored[0].opciones, [...burger.opciones!].sort());
  assert.match(mensajeWa(restored), /Ebi furai \(preferencia a confirmar\)/);
  assert.match(mensajeWa(restored), /Salsa de anguila/);
  const edited = reemplazar(restored, clave(burger), { ...burger, opciones: ['relleno-pollo', 'acevichada'], cantidad: 2 });
  assert.equal(computeTotals(edited).totalPrecio, 45);
  assert.ok(edited.some(line => line.tipo === 'extra' && line.producto === 'Té de Jazmín'));
});

test('queso no se ofrece como receta exclusiva; pedidos antiguos conservan su preferencia', () => {
  const fillings = gruposDeOpciones('Burguermaki').find(group => group.grupo === 'relleno');
  assert.deepEqual(fillings?.opciones.map(option => option.id), ['relleno-ebi', 'relleno-pollo']);
  const legacy = sanearLineas([{ tipo: 'extra', producto: 'Burguermaki', cantidad: 1, opciones: ['relleno-queso'] }]);
  assert.deepEqual(legacy[0].opciones, ['relleno-queso']);
  assert.match(mensajeWa(legacy), /Queso crema \(preferencia a confirmar\)/);
});
