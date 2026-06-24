# CLAUDE.md

> Este documento es la fuente de verdad del proyecto. Antes de escribir o modificar cualquier código, léelo completo. Si algo que estás a punto de programar contradice lo que dice aquí, detente y pregunta — no asumas ni improvises reglas de juego ni decisiones de arquitectura nuevas.

## 1. Qué estamos construyendo

"Papelitos Digital" es una página web — no una app que se instala — para jugar el juego tradicional de "Papelitos" (también conocido como Fishbowl / Salad Bowl) desde el celular, en tiempo real, entre varias personas conectadas desde distintos lugares.

Caso de uso real: una familia jugando junta desde sus teléfonos, posiblemente en distintas ciudades, sin instalar nada — solo abriendo un link en el navegador.

## 2. Reglas exactas del juego

Esto es la lógica central del proyecto. No se negocia ni se reinterpreta sin avisar primero.

**Equipos**
- Hay exactamente 2 equipos.
- Cada jugador elige a qué equipo unirse al entrar a la sala.
- *(Fase 2 / opcional — no construir en el MVP salvo que se indique explícitamente: botón de "equipos aleatorios" que reparte jugadores automáticamente.)*

**Etapa 0 — Registro de personajes**
- Antes de iniciar la partida, cada jugador escribe varios nombres de "personajes" (personas reales, de ficción, lo que sea) desde su propio teléfono.
- Cantidad por jugador: configurable por sala, **5 por defecto**. Esto es una suposición de diseño razonable, no la hardcodees como un número fijo en el código — debe poder ajustarse.
- Todos los personajes registrados por todos los jugadores van a un mazo único y compartido por ambos equipos.

**Las 3 rondas (orden estricto, no se pueden saltar ni reordenar)**
1. **Descripción libre** — el jugador en turno puede decir lo que quiera para describir al personaje, excepto el nombre exacto.
2. **Una sola palabra** — el jugador en turno solo puede decir UNA palabra como pista.
3. **Mímica** — el jugador en turno no puede hablar ni hacer sonidos, solo actuar.

**Mecánica de turno**
- Cada turno dura exactamente 60 segundos, con cronómetro visible para todos los jugadores conectados a esa sala (no solo para quien describe).
- El sistema saca automáticamente la siguiente carta del mazo mezclado — los jugadores nunca eligen qué personaje les toca.
- Si el equipo adivina antes de que se acabe el tiempo: se anota el punto, la carta sale del mazo de esa ronda, y el sistema entrega inmediatamente la siguiente carta al mismo jugador (sigue describiendo hasta que se le acabe su minuto).
- Si se acaba el tiempo con una carta sin adivinar: esa carta regresa al mazo (se reintegra y se vuelve a mezclar) para que la tome cualquier jugador en su próximo turno.
- El turno pasa siempre al equipo contrario después de cada turno de 60 segundos.
- Dentro de cada equipo, quién describe rota en orden (round-robin) cada vez que le toca a ese equipo — no se repite a la misma persona hasta que todos los demás del equipo hayan tenido su turno.

**Penalización en la ronda de "una sola palabra"**
- ⚠️ **Suposición de diseño pendiente de confirmar con el usuario antes de programar esta lógica:** si el jugador en turno dice más de una palabra (rompe la restricción), la carta actual se considera fallida — no se anota el punto, la carta regresa al mazo igual que si se hubiera acabado el tiempo, y se resta 1 punto al equipo que cometió la falta.
- Esto puede ajustarse (por ejemplo: sin resta de puntos, solo se pierde la carta) — confirmar con el usuario antes de implementar.

**Fin de ronda**
- Una ronda termina **únicamente** cuando el mazo se queda sin personajes — nunca por tiempo ni por número de turnos.
- Al terminar una ronda, todos los personajes originalmente registrados regresan al mazo completo (mezclado de nuevo) para iniciar la siguiente ronda.

**Fin del juego**
- El juego termina al completarse la ronda 3 (mímica).
- Gana el equipo con más puntos acumulados sumando las 3 rondas.

## 3. Arquitectura de sesiones (multijugador real)

- Cada partida vive en una **sala** identificada por un código corto (4-5 caracteres alfanuméricos, fácil de decir en voz alta o compartir por link).
- Deben poder existir **múltiples salas simultáneas e independientes** sin que se mezclen entre ellas — distintas familias jugando su propio juego al mismo tiempo sin saberlo entre sí.
- Un jugador entra escribiendo su nombre + el código de sala, o directamente con un link que ya incluye el código.
- No existe una "pantalla central" obligatoria tipo TV — todo el juego ocurre sincronizado en el teléfono de cada jugador (turno actual, marcador, cronómetro, cuántos personajes quedan).
- El estado de cada sala vive en memoria del servidor mientras la sala esté activa. No se necesita base de datos — las partidas son efímeras, igual que el juego físico. Si el servidor se reinicia, se pierden las salas activas (aceptable para este caso de uso).

## 4. Stack técnico

Decisión: el más simple posible, evitando complejidad innecesaria.

- **Backend:** Node.js + Express + Socket.io. Un solo servidor mantiene el estado de cada sala (equipos, mazo, turno actual, cronómetro, puntuación) y lo transmite en tiempo real a todos los jugadores conectados a esa sala vía WebSockets.
- **Frontend:** HTML + CSS + JavaScript vanilla — sin React, sin frameworks, sin build tools. Esto da control total sobre el diseño visual (ver sección 5, que es crítica) y mantiene el proyecto simple de entender y mantener.
- **Un solo servicio:** el mismo servidor Express sirve los archivos estáticos del frontend Y la lógica de Socket.io. Un solo despliegue, no dos.
- **Hosting:** Render.com, plan gratuito. Se conecta directo al repositorio de GitHub y despliega automáticamente con cada push. Nota: el plan gratuito "duerme" el servicio tras inactividad y tarda unos 30-50 segundos en despertar en la primera conexión del día — aceptable para uso familiar ocasional, pero debe avisarse en la pantalla de carga inicial con un mensaje amigable (no un spinner genérico).

## 5. Dirección de diseño — sección crítica, léela completa antes de escribir una sola línea de CSS

El objetivo es que esto **no se vea como una plantilla genérica ni como algo hecho por una IA**. Nada de gradientes morado-a-azul, nada de "glassmorphism", nada de tarjetas perfectamente simétricas con sombra suave genérica, nada de Inter/Roboto/system-ui como única fuente, nada de iconos de Font Awesome o emojis como sustituto de ilustración real.

**El concepto visual es literal: el juego se llama "Papelitos". El diseño debe sentirse como papelitos reales — notas de papel arrancadas a mano, dobladas, con cinta adhesiva, escritas con marcador.**

Lineamientos concretos:
- **Textura:** fondo con textura sutil de papel kraft o reciclado (puede lograrse con un filtro de ruido SVG o una textura ligera en CSS), nunca un fondo de color plano ni un gradiente de moda.
- **Tipografía:** combinar una fuente con personalidad manuscrita o de marcador (para títulos y acentos) con una fuente humanista cálida y muy legible (para texto del juego, que debe leerse rápido en momentos de tensión). Ninguna debe ser una fuente default de sistema. Evitar combinaciones obvias de "startup tech".
- **Color:** paleta cálida y terrosa — terracota, mostaza, verde oliva, crema, con un acento oscuro tipo azul petróleo o vino para contraste. Evitar el azul corporativo típico y evitar morados/violetas de IA genérica.
- **Imperfección intencional:** elementos ligeramente rotados (no todos en la misma dirección ni el mismo ángulo, como notas reales tiradas sobre una mesa), sombras con variación, nada perfectamente alineado a una grilla invisible de forma robótica.
- **Iconografía:** ilustraciones con trazo de mano (line art simple tipo dibujado con marcador) en vez de librerías de iconos genéricas o emojis.
- **Microinteracciones temáticas:** la animación de "mezclar el mazo" debe verse como cartas de papel barajándose, no un spinner circular genérico. Los botones principales pueden simular el tacto de papel (ligera curva, sombra de "papel levantado").
- **Mobile-first de verdad:** los jugadores usan esto parados o sentados con el celular en una mano durante una reunión. Botones grandes, zona de pulgar (parte inferior de la pantalla) para las acciones principales, nada que dependa de hover.
- **Tono del texto visible al usuario:** español natural y cálido, como lo escribiría una persona organizando el juego en una reunión familiar — no un tono corporativo ni de app SaaS. Ejemplo: en vez de "Esperando jugadores...", algo como "Falta gente, avísale a los que no han entrado".

Si tienes dudas sobre si algo se ve "genérico de IA", pregúntate: ¿esto podría ser la pantalla de cualquier otra app sin cambiar nada? Si la respuesta es sí, no sirve para este proyecto.

## 6. Higiene del repositorio — no negociable

- **Nunca** agregar a Claude, a ninguna IA, ni a "Claude Code" como co-autor en ningún commit de git. Nunca usar `Co-Authored-By: Claude` ni ninguna variante.
- **Nunca** incluir el footer automático tipo "🤖 Generated with Claude Code" (o cualquier mensaje similar) en los mensajes de commit. Configura los commits para que no lo incluyan.
- **Nunca** dejar ninguna referencia a inteligencia artificial, Claude, Anthropic, "AI-generated" o similar en: comentarios de código, README, package.json, LICENSE, nombres de archivos, mensajes de commit, o cualquier otro archivo del repositorio.
- Los mensajes de commit deben sonar como los escribiría una persona describiendo su propio trabajo: naturales y específicos (ej. "agrega lógica de turnos para la ronda de mímica"), no plantillas robóticas.

## 7. Bitacoras.md — protocolo de uso

- Este archivo documenta el progreso real del proyecto. Su propósito principal: **no repetir errores**. Cada vez que algo falle o se resuelva un problema, se anota qué pasó y cómo se arregló.
- **Nunca** agregues una entrada a Bitacoras.md por iniciativa propia.
- Solo se actualiza cuando el usuario lo pide explícitamente, con una frase como: *"Actualiza la bitácora con la fecha de hoy, la hora y el hito que se logró."*
- Cuando recibas esa instrucción: ejecuta `date` en la terminal para obtener la fecha y hora real del sistema. **Nunca inventes ni asumas una fecha.**
- Cada entrada debe incluir, como mínimo: fecha y hora reales, qué se logró, qué decisiones de diseño o arquitectura se tomaron, y qué errores se encontraron y cómo se resolvieron.
- Antes de empezar a trabajar en cualquier tarea nueva, lee Bitacoras.md completo para revisar si un problema parecido ya ocurrió antes.
- Las entradas siempre se agregan al final del archivo, en orden cronológico. Nunca se insertan entre entradas anteriores ni se reescribe o borra una entrada ya existente.

## 8. Estructura de carpetas propuesta

```
papelitos-digital/
├── server/
│   ├── index.js          # Punto de entrada: Express + Socket.io
│   ├── rooms.js           # Registro de salas activas en memoria
│   └── game/
│       ├── Room.js         # Lógica de una sala/partida individual
│       ├── Deck.js         # Manejo del mazo de personajes
│       └── rounds.js       # Lógica de las 3 rondas y transición entre ellas
├── public/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── client.js        # Conexión Socket.io del lado del cliente
│   │   └── ui.js            # Renderizado e interacciones de la interfaz
│   └── assets/
│       ├── fonts/
│       └── img/
├── CLAUDE.md
├── Bitacoras.md
├── README.md
├── .gitignore
└── package.json
```

## 9. Orden de trabajo esperado

1. Confirmar con el usuario la regla de penalización pendiente (sección 2) antes de programar esa lógica específica.
2. Inicializar la estructura de carpetas y `package.json`.
3. Construir primero el backend completo (salas, mazo, turnos, rondas, puntuación) y probarlo de forma aislada antes de tocar el diseño visual.
4. Construir el frontend siguiendo al pie de la letra la sección 5 de diseño.
5. Conectar frontend y backend vía Socket.io.
6. Probar con al menos 2 dispositivos físicos reales (no solo 2 pestañas del navegador en la misma laptop) antes de considerar una función "lista".
7. Desplegar a Render.
8. El usuario indicará explícitamente cuándo actualizar Bitacoras.md en cada hito relevante.
