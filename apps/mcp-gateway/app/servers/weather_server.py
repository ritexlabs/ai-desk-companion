from __future__ import annotations

import re
from typing import Any

import httpx

from app.servers.base import BaseMCPServer

_WMO_DESC: dict[int, str] = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'foggy', 48: 'icy fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow',
    80: 'rain showers', 81: 'showers', 82: 'heavy showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm',
}

_CITY_RE = re.compile(
    r'(?:weather|forecast|temperature|rain|humidity)\s+(?:in|for|at|of)\s+([A-Za-z\s,]+?)(?:\?|$|,)',
    re.I,
)


def _extract_city(text: str, default: str) -> str:
    m = _CITY_RE.search(text)
    if m:
        return m.group(1).strip()
    m = re.search(r'^([A-Za-z\s,]{3,30})\s+weather', text, re.I)
    if m:
        candidate = m.group(1).strip()
        if candidate.lower() not in ('what is the', 'how is the', 'current', 'todays', 'check'):
            return candidate
    return default or 'Bengaluru'


async def _open_meteo(city: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        geo = await client.get(
            'https://geocoding-api.open-meteo.com/v1/search',
            params={'name': city, 'count': 5, 'language': 'en', 'format': 'json'},
        )
        geo.raise_for_status()
        results = geo.json().get('results', [])
        if not results:
            return f"City '{city}' not found."
        loc  = next((r for r in results if r.get('country_code', '').upper() == 'IN'), results[0])
        lat, lon = loc['latitude'], loc['longitude']
        name = f"{loc['name']}, {loc.get('country', '')}"

        wx = await client.get(
            'https://api.open-meteo.com/v1/forecast',
            params={
                'latitude':  lat,
                'longitude': lon,
                'current':   'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
                'wind_speed_unit': 'kmh',
            },
        )
        wx.raise_for_status()
        cur      = wx.json()['current']
        temp     = round(cur['temperature_2m'])
        humidity = cur['relative_humidity_2m']
        wind_kph = round(cur['wind_speed_10m'])
        desc     = _WMO_DESC.get(cur['weather_code'], 'variable conditions')

    return f"In {name}: {desc}, {temp}°C. Humidity {humidity}%, wind {wind_kph} km/h."


async def _openweathermap(api_key: str, city: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={'q': city, 'appid': api_key, 'units': 'metric'},
        )
        r.raise_for_status()
        d        = r.json()
        temp     = round(d['main']['temp'])
        feels    = round(d['main']['feels_like'])
        desc     = d['weather'][0]['description']
        humidity = d['main']['humidity']
        wind_kph = round(d['wind']['speed'] * 3.6)
        name     = f"{d['name']}, {d['sys']['country']}"
    return f"In {name}: {desc}, {temp}°C, feels like {feels}°C. Humidity {humidity}%, wind {wind_kph} km/h."


async def _weatherapi(api_key: str, city: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            'https://api.weatherapi.com/v1/current.json',
            params={'key': api_key, 'q': city, 'aqi': 'no'},
        )
        r.raise_for_status()
        d        = r.json()
        loc      = d['location']
        cur      = d['current']
        temp     = round(cur['temp_c'])
        feels    = round(cur['feelslike_c'])
        desc     = cur['condition']['text']
        humidity = cur['humidity']
        wind_kph = round(cur['wind_kph'])
        name     = f"{loc['name']}, {loc['country']}"
    return f"In {name}: {desc}, {temp}°C, feels like {feels}°C. Humidity {humidity}%, wind {wind_kph} km/h."


class WeatherServer(BaseMCPServer):
    namespace = 'weather'

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def list_tools(self) -> list[dict]:
        return [
            {
                'name': 'get_current_weather',
                'description': (
                    'Get current weather conditions, temperature, humidity, and wind '
                    'for any city. Works without an API key using Open-Meteo.'
                ),
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'query': {
                            'type': 'string',
                            'description': 'Weather query, e.g. "weather in Mumbai" or "Delhi forecast tomorrow"',
                        },
                    },
                    'required': ['query'],
                },
            }
        ]

    async def call_tool(self, tool_name: str, arguments: dict, credentials: dict) -> Any:
        api_key      = credentials.get('weather_api_key', '').strip()
        provider     = credentials.get('weather_provider', 'open_meteo')
        default_city = credentials.get('weather_default_city', 'Bengaluru')

        query = arguments.get('query', '')
        city  = _extract_city(query, default_city)

        if not api_key:
            try:
                return await _open_meteo(city)
            except Exception as exc:
                return f'Could not fetch weather for {city}. {str(exc)[:60]}'

        try:
            if provider == 'weatherapi':
                return await _weatherapi(api_key, city)
            return await _openweathermap(api_key, city)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                return 'Invalid API key. Please update it in Settings → Agents → Weather.'
            if exc.response.status_code == 404:
                return f"City '{city}' not found. Try a different city name."
            return f'API error {exc.response.status_code}.'
        except Exception as exc:
            return f'Could not fetch weather for {city}. {str(exc)[:60]}'
