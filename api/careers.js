import Anthropic from '@anthropic-ai/sdk';

export const config = { runtime: 'edge' };

function buildPrompt(data) {
  const workStyleRaw = data.workStyle || ['autonomous'];
  const teamSizeRaw = data.teamSize || ['small team'];
  const motivationRaw = data.motivation || ['impact'];

  const workStyle = Array.isArray(workStyleRaw) ? workStyleRaw.join(', ') : workStyleRaw;
  const teamSize = Array.isArray(teamSizeRaw) ? teamSizeRaw.join(', ') : teamSizeRaw;
  const motivation = Array.isArray(motivationRaw) ? motivationRaw.join(', ') : motivationRaw;

  const skills = data.skills || [];
  const skillsText = data.skillsFreeText || '';
  const location = data.locationPref || 'flexible';
  const hours = data.hoursPerWeek || '45';
  const travel = data.travelTolerance || 'minimal';
  const risk = data.riskTolerance || 'medium';
  const dealBreakers = data.dealBreakers || [];

  const riskLabels = {
    'low': 'strongly prefers stable salary and job security',
    'medium-low': 'leans toward stability but open to some upside',
    'medium': 'balanced — values both stability and growth potential',
    'medium-high': 'leans toward high upside, comfortable with some uncertainty',
    'high': 'actively seeks high upside, comfortable with risk and variability',
  };
  const riskDesc = riskLabels[risk] || 'balanced';

  const skillsList = skills.length ? skills.join(', ') : 'not specified';
  const dealBreakersList = dealBreakers.length ? dealBreakers.join(', ') : 'none specified';
  const extraSkills = skillsText.trim() ? ` Additional context: ${skillsText}` : '';

  return `You are a sophisticated career advisor helping a Wharton MBA graduate find their ideal career path.

Based on the following profile, recommend exactly 5 career paths. For each, provide a structured analysis.

USER PROFILE:
- Work style: prefers ${workStyle} environment, ${teamSize} setting
- Primary motivation: ${motivation}
- Skills and strengths: ${skillsList}.${extraSkills}
- Lifestyle preferences: ${location} work, approximately ${hours} hours/week, ${travel} travel
- Risk tolerance: ${riskDesc}
- Deal breakers (must avoid): ${dealBreakersList}

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

Write in a calm, sophisticated, direct tone. No buzzwords. No filler sentences. Be honest about trade-offs. Each career should feel meaningfully different from the others.`;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const data = await req.json();
  const prompt = buildPrompt(data);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of msgStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.delta.text)}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify('[ERROR] ' + err.message)}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
