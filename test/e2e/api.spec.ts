import { test, expect } from '@playwright/test';

// Sin navegador: Monedero Andino es una API JSON, asi que se usa el fixture
// `request`. Se conservan solo las pruebas que aportan algo sobre la URL
// publica (Function URL): enrutamiento, cuerpo JSON y content-type.
// salud, version y saldo ya los cubre smoke; la logica de negocio, integration.

test('una transferencia pasa por la URL publica y se refleja en el historial', async ({ request }) => {
  const r = await request.post('/transferir', {
    data: { origen: 'elena', destino: 'ana', monto: 0.01 },
  });
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('application/json');
  const cuerpo = await r.json();
  expect(cuerpo).toMatchObject({ origen: 'elena', destino: 'ana', monto: 0.01 });
  expect(typeof cuerpo.id).toBe('number');

  // load corre en paralelo sobre los mismos usuarios: no se asertan saldos exactos.
  const historial = await (await request.get('/historial/elena')).json();
  expect(historial.some((m: { id: number }) => m.id === cuerpo.id)).toBe(true);
});

test('transferir con monto negativo es 400 por la URL publica', async ({ request }) => {
  const r = await request.post('/transferir', {
    data: { origen: 'elena', destino: 'ana', monto: -10 },
  });
  expect(r.status()).toBe(400);
});

test('una ruta desconocida es 404', async ({ request }) => {
  const r = await request.get('/cuentas');
  expect(r.status()).toBe(404);
});
