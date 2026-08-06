---
description: Obtener el clima actual de Almassora, Castellón, España
---

# Clima en Almassora

Obtené el clima actual de Almassora, Castellón, España usando WebFetch contra la API pública de Open-Meteo (sin API key).

## Coordenadas

Almassora está aproximadamente en:
- Latitud: 39.9500
- Longitud: -0.0500

## Endpoint

Usá WebFetch con esta URL:

```
https://api.open-meteo.com/v1/forecast?latitude=39.95&longitude=-0.05&current_weather=true&timezone=Europe%2FMadrid
```

## Qué hacer

1. Hacé el WebFetch con `prompt: "Extract the current_weather object as a JSON summary: temperature, windspeed, winddirection, weathercode"`
2. Respondé en español, en este formato:

```
Clima en Almassora, Castellón:
- Temperatura: X°C
- Viento: X km/h (dirección X°)
- Condición: <traducción del weathercode>

(Código WMO: X)
```

## Tabla de weathercodes WMO

- 0: Despejado
- 1, 2, 3: Parcialmente nublado
- 45, 48: Niebla
- 51, 53, 55: Llovizna
- 61, 63, 65: Lluvia
- 71, 73, 75: Nieve
- 80, 81, 82: Chubascos
- 95: Tormenta
