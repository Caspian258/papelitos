# Papelitos Digital

Versión digital del juego de fiesta "Papelitos" (también conocido como Fishbowl o Salad Bowl), pensada para jugar en tiempo real desde el celular, sin instalar nada.

## Cómo se juega

1. Cada jugador entra a la sala desde su teléfono y elige un equipo.
2. Antes de empezar, todos registran algunos personajes (nombres de personas reales o ficticias).
3. El juego se juega en 3 rondas, en este orden: descripción libre, una sola palabra, y mímica.
4. Cada turno dura 60 segundos. Gana el equipo con más puntos al final de las 3 rondas.

## Cómo correrlo en local

```bash
npm install
npm start
```

Luego abre `http://localhost:3000` en tu navegador (o desde el navegador de tu celular, conectado a la misma red Wi-Fi que tu computadora).

## Stack

- Backend: Node.js + Express + Socket.io
- Frontend: HTML, CSS y JavaScript, sin frameworks
