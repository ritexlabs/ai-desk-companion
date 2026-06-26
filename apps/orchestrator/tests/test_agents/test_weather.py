from __future__ import annotations

import httpx
import pytest
import respx

from app.agents.weather import WeatherAgent
from app.models.contracts import AgentRequest

AGENT = WeatherAgent()


def _req(text: str, cfg: dict | None = None) -> AgentRequest:
    return AgentRequest(text=text, context={'agent_config': cfg or {}})


# ── _extract_city (pure, no I/O) ──────────────────────────────────────────────

class TestExtractCity:
    def test_weather_in_city(self):
        assert AGENT._extract_city("weather in Mumbai", "") == "Mumbai"

    def test_forecast_in_city(self):
        assert AGENT._extract_city("forecast in Delhi", "") == "Delhi"

    def test_temperature_in_city(self):
        assert AGENT._extract_city("temperature in Tokyo", "") == "Tokyo"

    def test_prefix_form(self):
        assert AGENT._extract_city("London weather", "") == "London"

    def test_uses_default_city_when_unmatched(self):
        assert AGENT._extract_city("what is the weather", "Tokyo") == "Tokyo"

    def test_hard_default_is_bengaluru(self):
        assert AGENT._extract_city("what is the weather", "") == "Bengaluru"

    def test_strips_trailing_whitespace(self):
        result = AGENT._extract_city("weather in Berlin", "")
        assert result == result.strip()


# ── handle() with mocked HTTP ─────────────────────────────────────────────────

OWM_RESPONSE = {
    'name': 'Mumbai',
    'sys':  {'country': 'IN'},
    'main': {'temp': 30.0, 'feels_like': 34.0, 'humidity': 85},
    'weather': [{'description': 'few clouds'}],
    'wind': {'speed': 5.5},
}

WAPI_RESPONSE = {
    'location': {'name': 'Delhi', 'country': 'India'},
    'current': {
        'temp_c': 38.2, 'feelslike_c': 42.0, 'humidity': 45,
        'wind_kph': 15.0, 'condition': {'text': 'Sunny'},
    },
}

GEO_RESPONSE = {
    'results': [
        {'name': 'London', 'country': 'United Kingdom',
         'latitude': 51.5, 'longitude': -0.1, 'country_code': 'GB'},
    ]
}

FORECAST_RESPONSE = {
    'current': {
        'temperature_2m': 15.3, 'relative_humidity_2m': 72,
        'wind_speed_10m': 18.5, 'weather_code': 1,
    }
}


@pytest.mark.asyncio
class TestOpenWeatherMap:
    async def test_success_response_includes_city(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(200, json=OWM_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in Mumbai", {
                'api_key': 'test-key', 'provider': 'openweathermap', 'default_city': 'Mumbai',
            }))
        assert 'Mumbai' in resp.text

    async def test_success_response_includes_temp(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(200, json=OWM_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in Mumbai", {
                'api_key': 'test-key', 'provider': 'openweathermap',
            }))
        assert '30°C' in resp.text

    async def test_success_response_includes_description(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(200, json=OWM_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in Mumbai", {
                'api_key': 'test-key', 'provider': 'openweathermap',
            }))
        assert 'few clouds' in resp.text

    async def test_401_returns_invalid_key_message(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(401, json={'message': 'Invalid API key'})
            )
            resp = await AGENT.handle(_req("weather in London", {
                'api_key': 'bad-key', 'provider': 'openweathermap',
            }))
        assert 'Invalid API key' in resp.text or 'Settings' in resp.text

    async def test_404_returns_city_not_found(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(404, json={'message': 'city not found'})
            )
            resp = await AGENT.handle(_req("weather in Xyzabc", {
                'api_key': 'test-key', 'provider': 'openweathermap',
            }))
        assert 'not found' in resp.text.lower() or 'Xyzabc' in resp.text

    async def test_boot_returns_single_sentence(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.openweathermap.org/data/2.5/weather").mock(
                return_value=httpx.Response(200, json=OWM_RESPONSE)
            )
            resp = await AGENT.handle(_req("__boot__", {
                'api_key': 'test-key', 'provider': 'openweathermap', 'default_city': 'Mumbai',
            }))
        # Boot strips to first sentence only
        assert '\n' not in resp.text
        assert resp.text.endswith('.')


@pytest.mark.asyncio
class TestWeatherAPI:
    async def test_success_response_includes_city(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.weatherapi.com/v1/current.json").mock(
                return_value=httpx.Response(200, json=WAPI_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in Delhi", {
                'api_key': 'test-key', 'provider': 'weatherapi', 'default_city': 'Delhi',
            }))
        assert 'Delhi' in resp.text

    async def test_success_response_includes_temp(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://api.weatherapi.com/v1/current.json").mock(
                return_value=httpx.Response(200, json=WAPI_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in Delhi", {
                'api_key': 'test-key', 'provider': 'weatherapi',
            }))
        assert '38°C' in resp.text


@pytest.mark.asyncio
class TestOpenMeteo:
    async def test_no_key_calls_open_meteo(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://geocoding-api.open-meteo.com/v1/search").mock(
                return_value=httpx.Response(200, json=GEO_RESPONSE)
            )
            m.get("https://api.open-meteo.com/v1/forecast").mock(
                return_value=httpx.Response(200, json=FORECAST_RESPONSE)
            )
            resp = await AGENT.handle(_req("weather in London"))
        assert 'London' in resp.text
        assert '15°C' in resp.text

    async def test_city_not_found_in_geocoding(self):
        with respx.mock(assert_all_called=False) as m:
            m.get("https://geocoding-api.open-meteo.com/v1/search").mock(
                return_value=httpx.Response(200, json={'results': []})
            )
            resp = await AGENT.handle(_req("weather in Xyzabc"))
        assert 'not found' in resp.text.lower() or 'Xyzabc' in resp.text
