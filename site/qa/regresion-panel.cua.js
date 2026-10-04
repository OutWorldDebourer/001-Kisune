// Ejecutar en cua_repl, después de inicializarlo y leer su documentación.
// Prueba el cierre del pedido y la transición móvil → escritorio con UI real.
{
  const browser = await cua.getBrowser({ url: 'http://127.0.0.1:4321/' });
  const viewport = await browser.capabilities.get('viewport');
  const tab = await cua.createBrowserTab('iab', 'http://127.0.0.1:4321/?v=2&q=b:parmesano:10:1,b:parrillero:10:1#catalogo', { visible: false });
  const read = () => tab.playwright.locator('[data-panel]').evaluate(el => ({
    visible: el.getBoundingClientRect().width > 0,
    modal: el.matches(':modal'),
    state: el.dataset.abierto,
    lines: el.querySelector('[data-panel-lineas]').children.length,
    total: el.querySelector('[data-panel-total]').textContent.trim(),
  }));
  const check = (result, visible, modal) => {
    if (result.visible !== visible || result.modal !== modal || result.lines !== 2 || result.total !== 'S/ 40.00') {
      throw new Error(`Regresión del panel: ${JSON.stringify(result)}`);
    }
  };
  try {
    await viewport.set({ width: 1920, height: 1080 });
    await tab.getAXState({ emit: false });
    await tab.playwright.getByRole('button', { name: 'Seguir explorando', exact: true }).click();
    await tab.getAXState({ emit: false });
    check(await read(), true, false);
    await tab.playwright.locator('nav [data-abrir-pedido]').click();
    await tab.getAXState({ emit: false });
    check(await read(), true, false);
    await viewport.set({ width: 390, height: 844 });
    await tab.playwright.locator('nav [data-abrir-pedido]').click();
    await tab.getAXState({ emit: false });
    check(await read(), true, true);
    await tab.playwright.getByRole('button', { name: 'Seguir explorando', exact: true }).click();
    await tab.getAXState({ emit: false });
    check(await read(), false, false);
    await tab.playwright.locator('nav [data-abrir-pedido]').click();
    await tab.getAXState({ emit: false });
    await viewport.set({ width: 1920, height: 1080 });
    await tab.getAXState({ emit: false });
    check(await read(), true, false);
    nodeRepl.write('PASS: escritorio persistente, cierre móvil y transición sin pérdida del pedido.');
  } finally {
    await viewport.reset();
    await tab.close();
  }
}
