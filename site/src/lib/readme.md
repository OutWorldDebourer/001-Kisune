# `site/src/lib/` — lógica pura, sin DOM

Módulos **sin dependencias** que se ejecutan en Node, en el navegador o en un
test sin entorno. Nada aquí toca el DOM ni lee `window`.

🔑 **Regla que este directorio hace posible: hay UNA sola lógica del pedido.**
Nombres, precios, totales, validación, serialización y mensaje viven aquí y en
ningún otro sitio. La versión anterior mantenía una segunda copia de las seis
cosas dentro de un `<script is:inline>` de ~500 líneas, y las dos divergieron
seis veces seguidas. Ahora el navegador importa estos mismos módulos
(`scripts/pedido.ts` los trae el bundler de Astro): lo que se prueba aquí es
exactamente lo que corre en la página.

---

## `data/menu.ts` — la carta, y solo la carta

Fuente única de lo comercial. Si aquí no está, no existe.

| Exporta | Qué es |
|---|---|
| `makis` | Los 8 rolls: nombre, tagline, ingredientes, `nuevo?` |
| `cortes` | La tabla **por bandeja**: 10→20 · 20→35 · 30→52 · 40→64 · 50→87 |
| `especiales` / `bebidas` | Plato con **precio unitario** y, si aplica, `opciones[]` |
| `OPCIONES_POR_PLATO` | Opciones indexadas por plato (hoy: la salsa del Burguermaki) |
| `PRECIO_MINIMO_BANDEJA` | El "Desde S/ …" de las tarjetas, derivado de `cortes` |
| `contacto`, `formatPrice` | Datos de contacto y el formato de precio |

⚠️ **Lo que falta se declara, no se inventa.** `Opcion.pendiente` marca las
opciones cuya obligatoriedad y cuyo precio nadie ha confirmado. La UI enseña ese
pendiente en vez de aplicar una regla inventada.

---

## `cart.ts` — el modelo del carrito

Regla comercial (confirmada por el cliente el 2026-09-28, extraída del PDF):

> La tabla es **por bandeja** y **aplica a cualquiera de los makis**.
> Un pedido son **varias bandejas sumadas**.

| Tipo de línea | Forma | Precio |
|---|---|---|
| `bandeja` | `{ roll, cortes∈{10,20,30,40,50}, cantidad }` | `PRECIO_BANDEJA[cortes] × cantidad` |
| `extra` | `{ producto, opcion?, cantidad }` | `PRECIO_EXTRA[producto] × cantidad` |

```text
TOTAL cortes = Σ (cortes × cantidad)   ← solo bandejas
TOTAL precio = Σ (subtotal)            ← bandeja + extra
```

### API

| Exporta | Qué hace |
|---|---|
| `PRECIO_BANDEJA` | La tabla del PDF, desde `menu.ts` |
| `PRECIO_EXTRA` | Precios unitarios reales |
| `MEJOR_VALOR` | `[40, 64]` — menor S/ por corte. Se **marca**, no se infiere |
| `clave(l)` | Identidad de la COMBINACIÓN. Es lo que decide si dos líneas se fusionan |
| `nombreLinea(l)` | Cómo se lee una línea, con su opción incluida |
| `sanearLineas(crudas)` | Normaliza y **descarta lo imposible** |
| `agrupar(lineas)` | Colapsa combinaciones idénticas, en el orden en que aparecen |
| `computeTotals(lineas)` | Totales por línea + total. **Lanza** si un tamaño no existe |
| `agregar` / `setCantidad` / `quitar` / `reemplazar` | Mutaciones **puras**: devuelven líneas nuevas |
| `toQuery` / `parseCarrito` / `urlDeclaraPedido` | Serialización v2 con lectura de v1 y v0 |
| `mensajeWa` / `excedeMensaje` / `longitudMensaje` | El texto del pedido y si cabe en el enlace |
| `VERSION_ESTADO`, `MAX_CANTIDAD`, `MAX_LINEAS`, `MAX_MENSAJE` | Topes **técnicos**, no comerciales |

### Serialización con versión, y compatible hacia atrás

`toQuery` escribe la gramática **v2**, con prefijo de una letra:

```text
b:<slug>:<cortes>:<cantidad>          bandeja
e:<slug>:<cantidad>                   extra
e:<slug>:<opcion>:<cantidad>          extra con opción
```

`parseCarrito` deduce la versión **por el prefijo**, no por un flag, así que los
enlaces que la gente ya se ha compartido siguen valiendo sin tocar nada:

| Forma | Versión | Ejemplo |
|---|---|---|
| `b:` / `e:` | v2 | `?q=b:kitsune:20:1,e:burguermaki:anguila:1` |
| `bandeja:` / `extra:` | v1 | `?q=bandeja:kitsune:20:1` |
| sin prefijo | v0 | `?q=kitsune:20:1` · `?q=katsukare:2` |

NUNCA se serializa un precio: solo identificadores y cantidades. Por eso un
pedido guardado o compartido se **recalcula contra el menú actual**, aunque la
carta haya cambiado entre una visita y otra.

### Defensas deliberadas

Estas parecen bugs, y son lo contrario:

1. **`computeTotals` lanza ante un tamaño fuera de la tabla.** Una bandeja de 8
   cortes no existe, así que el modelo **no puede inventar un precio**.
2. **`sanearLineas` descarta lo desconocido.** Un roll o un producto que no está
   en la carta se ignora; no vale 0 en silencio, que sería un total engañoso.
   Una **opción** que el plato no declara también se descarta.
3. **`parseCarrito` nunca rompe la página.** Un `%` mal formado (`%ZZ`) se
   descarta en vez de lanzar `URIError`.
4. **`agregar` sanea antes de agregar.** Si el nombre no existe, la línea no
   entra. Ese era el camino que producía «S/ 0.00» y un `null` en el pedido.

### Invariantes que este módulo protege

- **30 cortes cuestan S/ 52, no S/ 50.** Viene de un modelo descartado.
- **La opción NO cambia el precio.** La carta lista Burguermaki a S/ 20 plano y
  no confirma recargo. El modelo no inventa un sobreprecio.
- **No existe `producto → cantidad`.** El estado es una **lista de líneas**.
- **El total de cortes no tiene que caer en 10/20/30/40/50.** 60 y 70 son
  válidos: son varias bandejas sumadas.
- **Se agrupa SOLO lo idéntico.** «Kitsune 20» y «Kitsune 40» son dos líneas.
- **`reemplazar` no reordena.** Editar una línea la cambia en su sitio. Se
  detectó en el navegador, no en los totales: el importe era el mismo.
- Los slugs se derivan de las **listas de la carta**, nunca del input.

---

## `estado.ts` — restaurar el pedido

Aplica las tres cosas que hay que declarar al añadir persistencia local.

| Exporta | Qué es |
|---|---|
| `restaurar({ search, hash, guardado, ahora })` | **Precedencia**: URL explícita > guardado válido > vacío. Devuelve `{ lineas, origen }` |
| `leerGuardado(texto, ahora)` | Valida **versión** y **expiración**. `[]` si no vale |
| `envolver(q, ahora)` | `{ v, t, q }` — versión, fecha y carga útil |
| `serializar(lineas)` | `v=2&q=…` |
| `CLAVE_ALMACEN`, `MAX_EDAD_MS` | Clave versionada y ventana de 7 días |
| `leerDestino(search)` | Deep-link de producto: `?roll=…&cortes=…` |

- **Precedencia.** Si la URL trae `q`, MANDA: es el enlace que alguien decidió
  abrir o compartir. Un `?q=` **vacío** también manda, y significa «pedido
  vacío», no «no sé». Sin `q` en la URL, se usa el guardado.
- **Versión.** Un guardado de otra versión se descarta en vez de malinterpretarse.
- **Expiración.** 7 días. Pasada la ventana se empieza de cero: la carta cambia
  de precio y una bandeja de hace una semana ya no es una oferta.
- **`leerDestino` no es estado.** Un deep-link a configurar otro producto viaja
  **sin tocar `q`**, así que abrir la configuración de un roll no vacía el
  pedido que ya había. Ese es el caso «Configurar abre el producto correcto y el
  pedido no se vacía».

---

## Pruebas — 65, runner nativo

```bash
cd site
node --test --experimental-strip-types src/lib/cart.test.ts src/lib/estado.test.ts
# 65 pass / 0 fail

./node_modules/.bin/tsc -p tsconfig.json --noEmit   # EXIT=0
```

No hay vitest ni jest, y no se añaden: el runner nativo de Node basta y el
proyecto no instala frameworks.

Cada bloque de `cart.test.ts` está rotulado con la corrección que fija
(`CORRECCIÓN 1` … `CORRECCIÓN 7`), y hay una regresión con el caso del cliente:

```text
Kitsune 20 + Parrillero 40 + Acevichado 10 = 70 cortes, S/ 119.00
+ Té de Jazmín                               = S/ 124.00
```

Los bugs que cazaron estas comprobaciones, y **no** una revisión visual:

| Bug | Lo cazó |
|---|---|
| `toQuery`/`parseCarrito` no eran ida y vuelta | test |
| `decodeURIComponent('%ZZ')` rompía la página | test |
| `MEJOR_VALOR` era `["40", 64]` (string) y el badge nunca aparecía | test + `tsc` |
| `sanearLineas` truncaba en silencio por encima de `MAX_LINEAS` | test |
| `MAX_MENSAJE` se exportaba y **nadie lo usaba** | test |
| Editar una línea **reordenaba** el pedido entero | puerta de navegador |

---

## `qa/` — la puerta, en navegador real

`site/qa/` no es decoración: es donde se cazaron tres bugs que ninguna prueba de
unidad podía ver, porque no eran de importes sino de pantalla.

| Archivo | Qué hace |
|---|---|
| `puerta.mjs` | Chrome por CDP + servidor estático. **83 comprobaciones** sobre la versión construida, con 5 anchos reales, teclado, foco, `reduced-motion` y sin JavaScript. `--shots` deja capturas en `qa/capturas/` |
| `medir.mjs` | Lee geometría real y busca desbordes horizontales |
| `rendimiento.mjs` | LCP / CLS / INP / TBT con red 1,6 Mbit/s y CPU 4× |

```bash
cd site && npm run build
node qa/puerta.mjs            # pruebas
node qa/puerta.mjs --shots    # pruebas + capturas
node qa/medir.mjs 320 640     # geometría a un ancho
node qa/rendimiento.mjs       # métricas
```

No instala Playwright ni Puppeteer: conduce Chrome por CDP con el `WebSocket`
global de Node 22. Una puerta de calidad que exige 300 MB de dependencias para
hacer clic en un botón no es una puerta.

### Bugs que solo aparecieron mirando la pantalla

| Bug | Síntoma | Por qué no lo cazó un test |
|---|---|---|
| El panel móvil no se veía | La barra decía «Ver pedido · S/ 124.00» y el diálogo no aparecía | Los tests miraban el **texto** de la barra, no el `display` del panel |
| El selector de tamaños no se veía | El diálogo abría con el precio del 40 ya calculado y **sin opciones** | La clase `hidden` de Tailwind sobrevive a `hidden = false`; las cinco celdas **existían** |
| Sobraban 59 px a 320 px | Desbordamiento horizontal de 43 px | Ninguna prueba miraba `scrollWidth` |
| Las capturas «de 320» eran de 363 | La emulación de Chrome no bajaba de ~363 px | Nadie comprobó `innerWidth` |

**La lección, escrita para que no se repita:** comprobar que un nodo *existe* no
es comprobar que se *ve*. `display`, tamaño de caja y posición en pantalla son
medidas distintas, y las tres importan.
