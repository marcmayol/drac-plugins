# agent-names

[English](README.md) · **Español**

Con varias sesiones abiertas no sabes a cuál pertenece cada subagente, porque se llaman como su tarea. Este mod hace que se llamen `Proyecto: tarea`: `LinkedIn: responder a Edwin`, `Faltis: revisar el login`.

## Instalar

```
/plugin marketplace add marcmayol/drac-plugins
/plugin install agent-names@drac
```

No hay nada más que hacer. Las sesiones nuevas ya lo llevan.

## Qué hace

Le explica la regla al modelo en la descripción de la herramienta `Agent`, así que suele acertar a la primera. Si no cumple el formato o pasa de 60 caracteres, rechaza la llamada y le dice cómo arreglarla; el modelo la repite con otro nombre.

Solo comprueba la forma. Que lo de antes de los dos puntos sea de verdad tu proyecto depende del modelo. Si el propio mod falla, el subagente arranca igual: un mod de nombres no debe parar el trabajo. No toca los agentes que lanza un plugin por su cuenta, solo los que pide el modelo.

## Velocidad

Corre dentro de Claude Code, sin binario ni nada más que instalar. La comprobación tarda unos 3 microsegundos; arrancar un binario de Rust para hacer lo mismo cuesta unos 8 ms en mi PC con Windows, por eso no lleva ninguno.

## Tests

```
claude plugin validate .
claude plugin test .
```

Licencia MIT.
