from flask import current_app
from google import genai
from google.genai import types

REQUEST_TIMEOUT_MS = 35000  # two attempts plus scraping must fit gunicorn's 120 s limit


class GeminiError(Exception):
    pass


class GeminiNotConfigured(GeminiError):
    pass


def model_name():
    return current_app.config.get('GEMINI_MODEL') or 'gemini-2.5-flash'


def generate_text(system, prompt, *, temperature, max_output_tokens, response_schema=None):
    api_key = current_app.config.get('GEMINI_API_KEY')
    if not api_key:
        raise GeminiNotConfigured()

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    if response_schema:
        config.response_mime_type = 'application/json'
        config.response_schema = response_schema

    try:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS))
        response = client.models.generate_content(model=model_name(), contents=prompt, config=config)
        text = response.text
    except Exception as e:
        raise GeminiError(str(e)) from e
    if not text:
        raise GeminiError('Gemini returned an empty response')
    return text
