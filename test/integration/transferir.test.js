const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Cada llamada crea una base propia y un handler recien cargado,
// asi ningun test depende del estado que dejo otro.
function entorno() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'));
  process.env.DB_PATH = path.join(dir, 'wallet.db');
  const srcDir = path.join(__dirname, '..', '..', 'src') + path.sep;
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(srcDir)) delete require.cache[k];
  }
  const { handler } = require('../../src/handler');

  async function llamar(metodo, ruta, cuerpo) {
    const r = await handler({
      rawPath: ruta,
      requestContext: { http: { method: metodo } },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { status: r.statusCode, cuerpo: JSON.parse(r.body) };
  }
  return llamar;
}

test('ana transfiere 100 a beto y ambos saldos e historial lo reflejan', async () => {
  const llamar = entorno();
  const r = await llamar('POST', '/transferir', { origen: 'ana', destino: 'beto', monto: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.saldoOrigen, 900);
  assert.deepEqual((await llamar('GET', '/saldo/ana')).cuerpo, { usuario: 'ana', saldo: 900 });
  assert.deepEqual((await llamar('GET', '/saldo/beto')).cuerpo, { usuario: 'beto', saldo: 600 });
  const h = await llamar('GET', '/historial/ana');
  assert.equal(h.status, 200);
  assert.equal(h.cuerpo.length, 1);
  assert.equal(h.cuerpo[0].destino, 'beto');
  assert.equal(h.cuerpo[0].monto, 100);
});

test('ana no puede transferir 950 y los saldos no cambian', async () => {
  const llamar = entorno();
  const r = await llamar('POST', '/transferir', { origen: 'ana', destino: 'carla', monto: 950 });
  assert.equal(r.status, 400);
  assert.equal(r.cuerpo.error, 'saldo insuficiente');
  assert.equal((await llamar('GET', '/saldo/ana')).cuerpo.saldo, 1000);
  assert.equal((await llamar('GET', '/saldo/carla')).cuerpo.saldo, 750);
});

test('diego transfiere todo su saldo a elena y despues no puede transferir', async () => {
  const llamar = entorno();
  const r = await llamar('POST', '/transferir', { origen: 'diego', destino: 'elena', monto: 300 });
  assert.equal(r.status, 200);
  assert.equal((await llamar('GET', '/saldo/elena')).cuerpo.saldo, 1500);
  const sin = await llamar('POST', '/transferir', { origen: 'diego', destino: 'ana', monto: 0.01 });
  assert.equal(sin.status, 400);
  const h = await llamar('GET', '/historial/elena');
  assert.equal(h.cuerpo.length, 1);
  assert.equal(h.cuerpo[0].origen, 'diego');
});

test('transferir al mismo usuario es 422', async () => {
  const llamar = entorno();
  const r = await llamar('POST', '/transferir', { origen: 'beto', destino: 'beto', monto: 1 });
  assert.equal(r.status, 422);
});

test('transferir a un usuario inexistente es 400', async () => {
  const llamar = entorno();
  const r = await llamar('POST', '/transferir', { origen: 'beto', destino: 'zoe', monto: 1 });
  assert.equal(r.status, 400);
});

test('un cuerpo que no es JSON es 400', async () => {
  const llamar = entorno();
  const { handler } = require('../../src/handler');
  const r = await handler({
    rawPath: '/transferir',
    requestContext: { http: { method: 'POST' } },
    body: 'monto=1',
  });
  assert.equal(r.statusCode, 400);
});
