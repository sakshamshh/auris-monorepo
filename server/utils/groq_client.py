"""
Groq LLM API Client Utility for Narration and Insight Generation.
"""

import os
import httpx
import logging

logger = logging.getLogger("AurisCloud.groq")


async def get_narrative(system_prompt: str, user_prompt: str) -> str:
    """
    POSTs to the Groq Chat Completions API using standard OpenAI schema.
    Uses llama-3.3-70b-versatile model.
    Returns response text, or "" on any error (never crashes the calling route).
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        logger.warning("GROQ_API_KEY not found in environment.")
        return ""

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "max_tokens": 200,
        "temperature": 0.3
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices")
                if choices and len(choices) > 0:
                    content = choices[0].get("message", {}).get("content", "")
                    return content.strip()
                else:
                    logger.warning("No choices returned from Groq completions.")
            else:
                logger.error(
                    "Groq API error status %d: %s",
                    response.status_code,
                    response.text
                )
    except Exception as e:
        logger.error("Failed to generate Groq narrative: %s", e, exc_info=True)

    return ""
