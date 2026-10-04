// Pruebas del estado restaurado — RED primero.
//   node --test --experimental-strip-types src/lib/estado.test.ts
//
// Cubren las tres cosas que hay que declarar al añadir persistencia local
// (precedencia de URL, versión y expiración) y el deep-link de «Configurar».

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeTotals, toQuery, type Linea } from './cart.ts';
import {
  CLAVE_ALMACEN,
  MAX_EDAD_MS,
  envolver,
  leerGuardado,
  leerDestino,
  restaurar,
  serializar,
} from './estado.ts';

const AHORA = 1_760_000_000_000;                 // fecha fija: los tests no miden el reloj

const pedido: Linea[] = [
  { tipo: 'bandeja', roll: 'Kitsune', cortes: 20, cantidad: 1 },
  { tipo: 'extra', producto: 'Té de Jazmín', cantidad: 1 },
];

// ── serialización ───────────────────────────────────────────────────────────
test('serializar declara versión y payload', () => {
  const s = serializar(pedido);
  assert.match(s, /^v=\d+&q=/);
  assert.equal(s, `v=2&q=${toQuery(pedido)}`);
  assert.equal(serializar([]), 'v=2&q=', 'un pedido vacío también declara versión');
});

test('el payload NO lleva precios: los importes salen del menú actual', () => {
  const s = serializar(pedido);
  assert.equal(s.includes('35'), false);
  assert.equal(s.includes('5.00'), false);
  const r = restaurar({ search: '?' + s, hash: '', guardado: null, ahora: AHORA });
  assert.equal(computeTotals(r.lineas).totalPrecio, 40, '35 + 5 recalculados');
});

test('la clave de almacenamiento está versionada', () => {
  assert.match(CLAVE_ALMACEN, /^kitsune-pedido-v\d+$/);
});

// ── (1) precedencia: la URL explícita manda ────────────────────────────────
test('PRECEDENCIA: si la URL trae pedido, manda sobre lo guardado', () => {
  const guardado = JSON.stringify(envolver(serializar([{ tipo: 'extra', producto: 'Karage', cantidad: 7 }]), AHORA));
  const r = restaurar({
    search: `?${serializar([{ tipo: 'bandeja', roll: 'Kitsune', cortes: 40, cantidad: 1 }])}`,
    hash: '',
    guardado,
    ahora: AHORA,
  });
  assert.equal(r.origen, 'url');
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].roll, 'Kitsune');
  assert.equal(r.lineas[0].cortes, 40);
});

test('PRECEDENCIA: una URL con q VACÍA significa pedido vacío, no "no sé"', () => {
  // El enlace `?v=2&q=` es un estado explícito: si alguien lo abre, el pedido
  // está vacío a propósito. No se ignora para…and ver lo que había en el móvil.
  const guardado = JSON.stringify(envolver(serializar([{ tipo: 'extra', producto: 'Karage', cantidad: 7 }]), AHORA));
  const r = restaurar({ search: '?v=2&q=', hash: '', guardado, ahora: AHORA });
  assert.equal(r.origen, 'url');
  assert.deepEqual(r.lineas, []);
});

test('PRECEDENCIA: sin q en la URL se usa el guardado válido', () => {
  const guardado = JSON.stringify(envolver(serializar(pedido), AHORA));
  const r = restaurar({ search: '?roll=Kitsune&cortes=20', hash: '', guardado, ahora: AHORA });
  assert.equal(r.origen, 'guardado');
  assert.equal(computeTotals(r.lineas).totalPrecio, 40);
});

test('PRECEDENCIA: sin nada, el pedido empieza vacío', () => {
  const r = restaurar({ search: '', hash: '', guardado: null, ahora: AHORA });
  assert.equal(r.origen, 'vacio');
  assert.deepEqual(r.lineas, []);
});

test('PRECEDENCIA: el deep-link de un fragmento (#q=) también manda', () => {
  const r = restaurar({
    search: '',
    hash: '#q=bandeja:kitsune:20:1',
    guardado: null,
    ahora: AHORA,
  });
  assert.equal(r.origen, 'url');
  assert.equal(r.lineas[0].roll, 'Kitsune');
});

// ── (2) versión ─────────────────────────────────────────────────────────────
test('VERSIÓN: un guardado de otra versión se descarta', () => {
  const viejo = JSON.stringify({ v: 1, t: AHORA, q: 'kitsune:20:1' });
  assert.deepEqual(leerGuardado(viejo, AHORA), []);
  // Y restaurar cae a vacío, sin intentar adivinar la gramática antigua.
  const r = restaurar({ search: '', hash: '', guardado: viejo, ahora: AHORA });
  assert.equal(r.origen, 'vacio');
});

test('VERSIÓN: sin campo v, o con v de otro tipo, se descarta', () => {
  for (const guardado of [
    JSON.stringify({ t: AHORA, q: 'e:karage:1' }),
    JSON.stringify({ v: '2', t: AHORA, q: 'e:karage:1' }),
    JSON.stringify({ v: 2, q: 'e:karage:1' }),
    JSON.stringify({ v: 2, t: 'ayer', q: 'e:karage:1' }),
  ]) {
    assert.deepEqual(leerGuardado(guardado, AHORA), [], `debe descartar ${guardado}`);
  }
});

// ── (3) expiración ──────────────────────────────────────────────────────────
test('EXPIRACIÓN: un guardado viejo se descarta', () => {
  const guardado = JSON.stringify(envolver(serializar(pedido), AHORA));
  assert.equal(leerGuardado(guardado, AHORA + MAX_EDAD_MS - 1000).length, 2, 'aún dentro');
  assert.deepEqual(leerGuardado(guardado, AHORA + MAX_EDAD_MS + 1000), [], 'fuera, caduca');
});

test('EXPIRACIÓN: un reloj que va hacia atrás no se fía', () => {
  const guardado = JSON.stringify(envolver(serializar(pedido), AHORA));
  assert.deepEqual(leerGuardado(guardado, AHORA - 60_000), [], 'una fecha futura se descarta');
});

test('EXPIRACIÓN: MAX_EDAD_MS son 7 días', () => {
  assert.equal(MAX_EDAD_MS, 7 * 24 * 60 * 60 * 1000);
});

// ── basura: nunca rompe la página ───────────────────────────────────────────
test('un almacenamiento manipulado a mano no rompe nada', () => {
  for (const basura of ['', 'null', '[]', '{}', 'no-json', '{"v":2,"t":null,"q":1}',
                        '{"v":2,"t":1e999,"q":"e:karage:1"}', '{"v":2,"t":' + AHORA + ',"q":"?q=%ZZ"}']) {
    const l = leerGuardado(basura, AHORA);
    assert.ok(Array.isArray(l), `debe devolver un array para ${JSON.stringify(basura)}`);
    for (const x of l) assert.ok(computeTotals([x]).totalPrecio > 0, 'nunca un precio 0');
  }
});

test('lo restaurado viene SANEADO y AGRUPADO aunque la entrada lo repita', () => {
  const guardado = JSON.stringify(envolver(`v=2&q=${'b:kitsune:20:1,b:kitsune:20:2,e:garbage:1'}`, AHORA));
  const l = leerGuardado(guardado, AHORA);
  assert.equal(l.length, 1, 'las dos Kitsune 20 colapsan; la basura se descarta');
  assert.equal(l[0].cantidad, 3);
});

// ── deep-link «Configurar» ─────────────────────────────────────────────────
test('deep-link: lee producto y tamaño', () => {
  assert.deepEqual(leerDestino('?roll=Kitsune&cortes=40'),
    { tipo: 'bandeja', nombre: 'Kitsune', cortes: 40 });
  assert.deepEqual(leerDestino('?roll=Matcha%20Latte'),
    { tipo: 'extra', nombre: 'Matcha Latte' });
  assert.deepEqual(leerDestino('?producto=Karage'), { tipo: 'extra', nombre: 'Karage' });
});

test('deep-link: sin destino no hay nada que abrir', () => {
  assert.equal(leerDestino(''), null);
  assert.equal(leerDestino('?cortes=20'), null);
  assert.equal(leerDestino(`?q=${toQuery(pedido)}`), null, 'un q NO es un destino');
});

test('deep-link: un tamaño imposible no se pasa como válido', () => {
  // Se devuelve sin `cortes` para que sea la carta la que decida, no la URL.
  assert.deepEqual(leerDestino('?roll=Kitsune&cortes=abc'), { tipo: 'bandeja', nombre: 'Kitsune' });
});

test('deep-link: abrir la configuración NO borra el pedido guardado', () => {
  // El deep-link viaja en la query SIN tocar `q`, así que la precedencia sigue
  // resolviendo al pedido guardado. Este es el caso "Configurar abre el
  // producto correcto y el pedido no se vacía".
  const guardado = JSON.stringify(envolver(serializar(pedido), AHORA));
  const r = restaurar({ search: '?roll=Parrillero&cortes=40', hash: '', guardado, ahora: AHORA });
  assert.equal(r.origen, 'guardado');
  assert.equal(computeTotals(r.lineas).totalPrecio, 40, 'el pedido sigue ahí');
  assert.equal(leerDestino('?roll=Parrillero&cortes=40')?.nombre, 'Parrillero');
});
