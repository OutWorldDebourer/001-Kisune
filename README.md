# Kitsune Makis

Carta digital en español con selección de bandejas, rellenos y salsas, pedido persistente, imágenes ilustrativas generadas con IA y una escena 3D interactiva opcional.

## Desarrollo

Requiere Node.js 22.23 o posterior compatible con Astro 7.

```sh
cd site
npm ci
npm run dev
```

## Verificación y construcción

```sh
cd site
node node_modules/astro/bin/astro.mjs sync
node --test src/lib/cart.test.ts src/lib/estado.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Las 68 pruebas del modelo verifican cantidades, precios, variantes, serialización y recuperación del pedido. La regresión del panel de compra se puede comprobar con `site/qa/regresion-panel.cua.js` en el navegador de Codex.

## GitHub Pages

El flujo `.github/workflows/pages.yml` verifica, construye y publica la aplicación al actualizar `main`, o al ejecutarlo manualmente. En **Settings → Pages**, la fuente debe ser **GitHub Actions**.

El flujo obtiene de Pages el dominio y el subdirectorio y los proporciona mediante `SITE_URL` y `BASE_PATH`. Las rutas de imágenes, scripts, fuentes y favicon respetan ese subdirectorio. Para comprobar una construcción en un subdirectorio, define esas dos variables antes de ejecutar `npm run build`.

En desarrollo local, la ruta base es `/`. La carpeta `site/dist/` se genera durante el despliegue y no se versiona.

## Experiencia de compra

- Catálogo con imágenes ilustrativas identificadas como IA.
- Configuración de bandejas, cantidades, rellenos y salsas.
- Pedido a la derecha en escritorio y panel modal en móvil.
- «Seguir explorando» mantiene visible la columna de escritorio y cierra el panel móvil.
- Persistencia local y enlaces para recuperar pedidos.
- Preparación del pedido para WhatsApp; el usuario confirma su envío.
- Escena 3D opcional con carga diferida, animaciones y adaptación a movimiento reducido.

Las ilustraciones y la escena 3D representan el producto de forma orientativa. El precio final, la disponibilidad y la entrega se confirman con el restaurante.
