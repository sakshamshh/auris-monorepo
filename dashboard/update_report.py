import sys, re

filepath = r"C:\Users\SAKSHAM\Auris\src\report_generator.py"
with open(filepath, "r", encoding="windows-1252", errors="replace") as f:
    content = f.read()

new_func = """def generate_report(summary):
    client = Groq(api_key=GROQ_KEY)
    store_context = f\"\"\"
Store Profile:
- Name: {os.getenv('STORE_NAME', 'Unknown')}
- Type: {os.getenv('STORE_TYPE', 'retail')}
- Location: {os.getenv('STORE_AREA', 'India')}
- Staff count: {os.getenv('STORE_STAFF', '2-3')}
- Opening hours: {os.getenv('STORE_OPEN', '10:00')} to {os.getenv('STORE_CLOSE', '21:00')}
- Average basket size: {os.getenv('AVG_BASKET', 'unknown')}
- Weekly revenue target: {os.getenv('WEEKLY_TARGET', 'unknown')}
- Busy days: {os.getenv('BUSY_DAYS', 'weekends')}
- Slow days: {os.getenv('SLOW_DAYS', 'tuesday')}
- Competition nearby: {os.getenv('NEARBY_COMPETITION', 'unknown')}
- Owner notes: {os.getenv('STORE_NOTES', 'none')}
\"\"\"

    prompt = f\"\"\"You are Auris, an AI business advisor for Indian retail stores.

{store_context}

Today's analytics data:
{summary}

Analyze the data and provide actionable business advice specific to this store.
Write in simple English mixed with natural Hindi words. Be direct like a trusted advisor.

CRITICAL: You MUST output ONLY valid JSON. Do not include markdown code blocks or any other text.
The JSON must have this exact structure:
{{
  "sections": [
    {{ "title": "TODAY'S SUMMARY", "body": "2-3 sentences summarizing the day." }},
    {{ "title": "PEAK HOURS ANALYSIS", "body": "Specific advice during peak hours." }},
    {{ "title": "ZONE INSIGHTS", "body": "Product/display recommendations based on zone data." }},
    {{ "title": "WHAT TO WATCH", "body": "1-2 concerns based on today's data." }},
    {{ "title": "ACTION ITEMS FOR TOMORROW", "body": "1. First action\\n2. Second action\\n3. Third action" }}
  ]
}}
\"\"\"

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=800,
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"Report generation error: {e}")
        return {"raw": "Failed to generate report structure. Please try again."}
"""

content = re.sub(r"def generate_report\(summary\):.*", new_func, content, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated report_generator.py successfully.")
