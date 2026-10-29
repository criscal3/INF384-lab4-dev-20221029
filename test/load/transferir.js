import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || '').replace(/\/$/, '');
const SLO_P95 = Number(__ENV.SLO_P95 || 500);
const USUARIOS = ['ana', 'beto', 'carla', 'diego', 'elena'];

// Fracción de transferencias que terminaron en 200.
const transferenciaOk = new Rate('transferencia_ok');

// 400 no cuenta como fallo HTTP; el filtro fino (solo "saldo insuficiente")
// se aplica en el check y en la métrica transferencia_ok.
http.setResponseCallback(http.expectedStatuses(200, 400));

export const options = {
  stages: [
    { duration: '1m', target: 30 },
    { duration: '10m', target: 30 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    transferencia_ok: ['rate>0.9'],
  },
};

function par() {
  const i = Math.floor(Math.random() * USUARIOS.length);
  const j = (i + 1 + Math.floor(Math.random() * (USUARIOS.length - 1))) % USUARIOS.length;
  return [USUARIOS[i], USUARIOS[j]];
}

function errorDe(res) {
  try {
    return res.json('error');
  } catch (_) {
    return undefined;
  }
}

export default function () {
  const [origen, destino] = par();

  const t = http.post(
    `${BASE}/transferir`,
    JSON.stringify({ origen, destino,
