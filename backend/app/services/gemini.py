from flask import current_app
from google import genai
from google.genai import types

REQUEST_TIMEOUT_MS = 35000


class GeminiError(Exception):
    pass


class GeminiNotConfigured(GeminiError):
    pass


def model_name():
    return current_app.config.get('GEMINI_MODEL') or 'gemini-2.5-flash'


def generate_text(system, prompt, *, temperature, max_output_tokens, response_schema=None,
                  timeout_ms=REQUEST_TIMEOUT_MS, thinking_budget=None):
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
    if thinking_budget is not None:
        config.thinking_config = types.ThinkingConfig(thinking_budget=thinking_budget)

    try:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))
        response = client.models.generate_content(model=model_name(), contents=prompt, config=config)
        text = response.text
    except Exception as e:
        raise GeminiError(str(e)) from e
    if not text:
        raise GeminiError('Gemini returned an empty response')
    return text
