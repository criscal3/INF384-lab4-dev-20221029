# Respuestas · Laboratorio 4
Alumno: 20221029
Presupuesto: [ ] min  Métrica DORA: [ ]

## Parte 1 · Diagnóstico
### Defecto 1
- Job y etapa: smoke, etapa deploy (needs: build-push, al mismo nivel que deploy). Arrastra a e2e y load, que dependen de smoke.
- Problema que causa en el pipeline: smoke corre en paralelo con deploy, no después. Puede consultar Lambda antes de que se actualice y aprobar contra la versión anterior. El paso Smoke tampoco define EXPECTED_COMMIT, así que smoke.sh omite la verificación de /version y nunca comprueba que lo desplegado sea el commit del run. Como e2e y load cuelgan de smoke, también pueden probar código viejo. Los bucles de reintento de 5 a 10 s ocultan la carrera y gastan tiempo.
- Link al commit: https://github.com/criscal3/INF384-lab4-dev-20221029/commit/c37681e342e2a9377c72035b305d53e506870032
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): mover de etapa + ajustar configuración. Cambiar a needs: deploy en smoke y agregar EXPECTED_COMMIT: ${{ github.sha }} en el env del paso Smoke.
- Evidencia (dato observado, con link al run o fragmento de la salida local): Defecto en el run https://github.com/criscal3/INF384-lab4-dev-20221029/actions/runs/40957712520. El job smoke está en paralelo al job deploy. En el paso Smoke solo aparecen las líneas salud: y saldo:; falta la línea commit:, que smoke.sh imprime solo si EXPECTED_COMMIT está definida. La Lambda reportó el commit 49ba49ebee84f4c9f8b6943031595970311a3bb6, pero el script no lo comparó con el SHA del run.
### Defecto 2
- Job y etapa: e2e, post-deploy (needs: smoke). Archivo test/e2e/api.spec.ts.
- Problema que causa en el pipeline: 9 de los 10 tests usan page.request, es decir, llamadas HTTP a la API sin navegador. Repiten lo que ya cubren integration (lógica de negocio) y smoke (salud, versión, saldo). El único test con navegador hace page.goto a una respuesta JSON, que no valida ninguna interfaz. El job instala Chromium con --with-deps y ese tiempo se desperdicia. Además muta el estado compartido (transfiere elena→ana) mientras load corre en paralelo sobre los mismos usuarios.
- Link al commit: https://github.com/criscal3/INF384-lab4-dev-20221029/commit/33a5b7dca740af43b2c27f4e83e542057982df39
https://github.com/criscal3/INF384-lab4-dev-20221029/commit/45f276a9a4bbd9ad61453c90936ff4c24b9a9724
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests + eliminar + ajustar configuración. Usar el fixture request en vez de page, eliminar los tests duplicados y el de page.goto, y quitar el paso Navegador (npx playwright install).
- Evidencia (dato observado, con link al run o fragmento de la salida local): En el run https://github.com/criscal3/INF384-lab4-dev-20221029/actions/runs/40957712520, el job e2e duró 45 s en total. El paso Navegador (npx playwright install --with-deps chromium) tomó 21 s, es decir, el 47 % (21/45) del job, solo para instalar un navegador que casi no se usa. Con grep -c "page.request" test/e2e/api.spec.ts obtuve [9] y con grep -c "page.goto" test/e2e/api.spec.ts obtuve [1]. De 10 tests, 9 llaman a la API por HTTP sin navegador y el único que usa el navegador abre una respuesta JSON (/saldo/carla), no una interfaz.
### Defecto 3
- Job y etapa: build-push, etapa build. Arrastra a deploy, smoke, e2e y load.
- Problema que causa en el pipeline: el workflow se dispara con pull_request y build-push no tiene ninguna condición if. Cualquier PR cuyos jobs pre-build pasen sube una imagen a ECR y deploy actualiza la Lambda compartida monedero-andino con código sin revisar ni mergear. Dos PRs abiertos se pisan entre sí, y el despliegue de main queda reemplazado por el de una rama. Además cada PR ejecuta smoke, e2e y load (más de 12 minutos de k6) contra ese despliegue.
- Link al commit: https://github.com/criscal3/INF384-lab4-dev-20221029/commit/24d93b2f4f7dc7279e5a674119153795d3fdc3e2
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración. Como deploy no se modifica, la condición va en build-push:
- Evidencia (dato observado, con link al run o fragmento de la salida local): En el run https://github.com/criscal3/INF384-lab4-dev-20221029/actions/runs/40965825558, aparece el encabezado “Triggered via pull request” y build-push y deploy terminaron en verde.
### Defecto 4
- Job y etapa: integration, pre-build. Archivo test/integration/transferir.test.js.
- Problema que causa en el pipeline: los tests dependen del orden y del estado compartido de la base. Por ejemplo, el saldo de ana refleja el debito espera 900 solo porque el test anterior transfirió 100, y el historial espera exactamente 1 movimiento. Si un test se ejecuta solo, se reordena o la base /tmp/wallet.db ya tiene datos de una corrida previa, fallan sin que haya un bug en la aplicación. Esto genera falsos rojos y hace que el diagnóstico de un fallo real sea más lento.
- Link al commit: https://github.com/criscal3/INF384-lab4-dev-20221029/commit/666de4dedbdd837082d34b9a60fc0ec55eb97c6a
- https://github.com/criscal3/INF384-lab4-dev-20221029/commit/d8db1bf531ae8c0a4f3d031bb445e853d078a876
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests. Cada test debe preparar su propio estado, por ejemplo con un DB_PATH temporal por test o un before que reinicie la base semilla, y verificar el saldo en el mismo test que hace la transferencia.
- Evidencia (dato observado, con link al run o fragmento de la salida local): Run https://github.com/criscal3/INF384-lab4-dev-20221029/actions/runs/40966972050. Con DB_PATH apuntando a una base limpia, npm run test:integration pasa completo (12 tests). Al ejecutar solo el saldo de beto refleja el credito con --test-name-pattern, el test falla: esperaba 600 y obtuvo 500, sin ningún cambio en src/. Al correr la suite una segunda vez sobre la misma base, fallan 6 tests, por ejemplo ana con expected: 900, actual: 800. Los tests dependen del orden y del estado que dejó el test anterior, no de su propio arreglo.
### Defecto 5
- Job y etapa:
- Problema que causa en el pipeline:
- Link al commit:
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests):
- Evidencia (dato observado, con link al run o fragmento de la salida local):

## Parte 2 · Implementación
- Link al run en verde en main:
- Link al pull request:
- Defecto de la aplicación introducido (archivo y descripción):
- Job que debería detenerlo:
- Link al run fallido: 

## Parte 3 · Decisión bajo restricción
Link al run medido:

| Job | Duración (min:seg) |
|---|---|
| unit | |
| integration | |
| sast | |
| sca | |
| build-push | |
| deploy | |
| smoke | |
| e2e | |
| load | |
| **Total** | |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | |
| p95 | |
| Máximo | |
| Tasa de error | |
| Requests por segundo | |

Conclusión sobre el comportamiento bajo carga:

SLO propuesto (percentil, valor, ventana) y justificación:

SLA propuesto y diferencia con el SLO:

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|

Total resultante: [ ] min
Link al run en main con los cambios:

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada):

Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón:

## Declaración de uso de IA
Herramientas usadas y para qué:
