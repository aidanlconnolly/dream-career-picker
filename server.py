import os
import json
from flask import Flask, request, Response, send_from_directory
import anthropic

app = Flask(__name__, static_folder='.', static_url_path='')
client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])


def build_prompt(data):
    work_style_raw = data.get('workStyle', ['autonomous'])
    team_size_raw = data.get('teamSize', ['small team'])
    motivation_raw = data.get('motivation', ['impact'])

    work_style = ', '.join(work_style_raw) if isinstance(work_style_raw, list) else work_style_raw
    team_size = ', '.join(team_size_raw) if isinstance(team_size_raw, list) else team_size_raw
    motivation = ', '.join(motivation_raw) if isinstance(motivation_raw, list) else motivation_raw
    skills = data.get('skills', [])
    skills_text = data.get('skillsFreeText', '')
    location = data.get('locationPref', 'flexible')
    hours = data.get('hoursPerWeek', '45')
    travel = data.get('travelTolerance', 'minimal')
    risk = data.get('riskTolerance', 'medium')
    deal_breakers = data.get('dealBreakers', [])

    risk_labels = {
        'low': 'strongly prefers stable salary and job security',
        'medium-low': 'leans toward stability but open to some upside',
        'medium': 'balanced — values both stability and growth potential',
        'medium-high': 'leans toward high upside, comfortable with some uncertainty',
        'high': 'actively seeks high upside, comfortable with risk and variability',
    }
    risk_desc = risk_labels.get(risk, 'balanced')

    skills_list = ', '.join(skills) if skills else 'not specified'
    deal_breakers_list = ', '.join(deal_breakers) if deal_breakers else 'none specified'
    extra_skills = f' Additional context: {skills_text}' if skills_text.strip() else ''

    return f"""You are a sophisticated career advisor helping a Wharton MBA graduate find their ideal career path.

Based on the following profile, recommend exactly 5 career paths. For each, provide a structured analysis.

USER PROFILE:
- Work style: prefers {work_style} environment, {team_size} setting
- Primary motivation: {motivation}
- Skills and strengths: {skills_list}.{extra_skills}
- Lifestyle preferences: {location} work, approximately {hours} hours/week, {travel} travel
- Risk tolerance: {risk_desc}
- Deal breakers (must avoid): {deal_breakers_list}

For each of the 5 career paths, use EXACTLY this format — do not deviate:

## [Career Title]

**Why it fits your profile**
[2–3 sentences explaining the fit against their specific answers above]

**Day in the life**
[2–3 sentences describing a typical day, grounded and specific — not generic]

**Realistic salary range**
[Entry / Mid / Senior figures with context. Be specific — e.g. "$120k–$160k base + bonus at top firms"]

**What you'd love**
[2–3 specific things that align with their stated preferences and motivations]

**What would frustrate you**
[1–2 honest tensions or downsides given their specific profile — do not sugarcoat]

**How to get there from a Wharton MBA**
[Concrete 3–5 step path: recruiting cycles, certifications, first roles, timeline]

---

[repeat format for careers 2–5]

Write in a calm, sophisticated, direct tone. No buzzwords. No filler sentences. Be honest about trade-offs. Each career should feel meaningfully different from the others."""


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/careers', methods=['POST'])
def careers():
    data = request.get_json()
    prompt = build_prompt(data)

    def generate():
        with client.messages.stream(
            model='claude-sonnet-4-6',
            max_tokens=2500,
            messages=[{'role': 'user', 'content': prompt}]
        ) as stream:
            for text in stream.text_stream:
                yield f'data: {json.dumps(text)}\n\n'
        yield 'data: [DONE]\n\n'

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


if __name__ == '__main__':
    app.run(port=5050, debug=False)
