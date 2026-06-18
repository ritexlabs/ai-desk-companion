from __future__ import annotations

import re

import httpx

from app.agents.base import AssistantAgent
from app.models.contracts import AgentHealth, AgentRequest, AgentResponse, AgentStatus


class WeatherAgent(AssistantAgent):
    id = 'weather'
    name = 'Weather'

    async def initialize(self) -> None:
        return None

    async def health(self) -> AgentHealth:
        return AgentHealth(name=self.name, status=AgentStatus.ONLINE)

    async def shutdown(self) -> None:
        return None

    def _extract_city(self, text: str, default: str) -> str:
        m = re.search(
            r'(?:weather|forecast|temperature|rain|humidity)\s+(?:in|for|at|of)\s+([A-Za-z\s,]+?)(?:\?|$|,)',
            text, re.I,
        )
        if m:
            return m.group(1).strip()
        m = re.search(r'^([A-Za-z\s,]{3,30})\s+weather', text, re.I)
        if m:
            candidate = m.group(1).strip()
            if candidate.lower() not in ('what is the', 'how is the', 'current', 'todays', 'check'):
                return candidate
        return default or 'Bengaluru'

    async def handle(self, request: AgentRequest) -> AgentResponse:
        cfg          = request.context.get('agent_config', {})
        api_key      = cfg.get('api_key', '').strip()
        provider     = cfg.get('provider', 'openweathermap')
        default_city = cfg.get('default_city', '').strip()

        if request.text.strip() == '__boot__':
            city = default_city or 'Bengaluru'
            try:
                full = await (self._openweathermap(api_key, city) if api_key else self._open_meteo(city))
                # Trim to first sentence only for boot confirmation
                brief = full.text.split('.')[0] + '.'
                return AgentResponse(agent=self.id, text=brief)
            except Exception:
                return AgentResponse(agent=self.id, text='Weather service connected.')

        city = self._extract_city(request.text, default_city)

        if not api_key:
            try:
                return await self._open_meteo(city or 'Bangalore')
            except Exception as e:
                return AgentResponse(agent=self.id, text=f'Could not fetch weather for {city}. {str(e)[:60]}')

        try:
            if provider == 'openweathermap':
                return await self._openweathermap(api_key, city)
            return await self._weatherapi(api_key, city)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return AgentResponse(agent=self.id, text='Invalid API key. Please update it in Settings → Agents → Weather.')
            if e.response.status_code == 404:
                return AgentResponse(agent=self.id, text=f"City '{city}' not found. Try a different city name.")
            return AgentResponse(agent=self.id, text=f'API error {e.response.status_code}.')
        except Exception as e:
            return AgentResponse(agent=self.id, text=f'Could not fetch weather for {city}. {str(e)[:60]}')

    async def _openweathermap(self, key: str, city: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                'https://api.openweathermap.org/data/2.5/weather',
                params={'q': city, 'appid': key, 'units': 'metric'},
            )
            r.raise_for_status()
            d        = r.json()
            temp     = round(d['main']['temp'])
            feels    = round(d['main']['feels_like'])
            desc     = d['weather'][0]['description']
            humidity = d['main']['humidity']
            wind_kph = round(d['wind']['speed'] * 3.6)
            name     = f"{d['name']}, {d['sys']['country']}"
        return AgentResponse(
            agent=self.id,
            text=f"In {name}: {desc}, {temp}°C, feels like {feels}°C. Humidity {humidity}%, wind {wind_kph} km/h.",
        )

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

    async def _open_meteo(self, city: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            geo_params: dict = {'name': city, 'count': 5, 'language': 'en', 'format': 'json'}
            geo = await client.get(
                'https://geocoding-api.open-meteo.com/v1/search',
                params=geo_params,
            )
            geo.raise_for_status()
            results = geo.json().get('results', [])
            if not results:
                return AgentResponse(agent=self.id, text=f"City '{city}' not found.")
            # prefer India when multiple results exist (e.g. "Bengaluru" vs "Bangalore Town, PK")
            loc = next((r for r in results if r.get('country_code', '').upper() == 'IN'), results[0])
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
            code     = cur['weather_code']
            desc     = self._WMO_DESC.get(code, 'variable conditions')

        return AgentResponse(
            agent=self.id,
            text=f"In {name}: {desc}, {temp}°C. Humidity {humidity}%, wind {wind_kph} km/h.",
        )

    async def _weatherapi(self, key: str, city: str) -> AgentResponse:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                'https://api.weatherapi.com/v1/current.json',
                params={'key': key, 'q': city, 'aqi': 'no'},
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
        return AgentResponse(
            agent=self.id,
            text=f"In {name}: {desc}, {temp}°C, feels like {feels}°C. Humidity {humidity}%, wind {wind_kph} km/h.",
        )
