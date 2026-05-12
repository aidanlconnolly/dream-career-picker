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
  const industries = data.industries || [];
  const industriesText = data.industriesFreeText || '';
  const location = data.locationPref || 'flexible';
  const hours = data.hoursPerWeek || '45';
  const travel = data.travelTolerance || 'minimal';
  const risk = data.riskTolerance || 'medium';
  const dealBreakers = data.dealBreakers || [];

  // Background fields
  const undergradMajors = data.undergradMajor || [];
  const yearsOut = data.yearsOutUndergrad || 'not specified';
  const currentRole = data.currentRole || '';
  const currentIndustry = data.currentIndustry || '';
  const mbaStatus = data.mbaStatus || 'post-mba-recruiting';

  const riskLabels = {
    'low': 'strongly prefers stable salary and job security',
    'medium-low': 'leans toward stability but open to some upside',
    'medium': 'balanced — values both stability and growth potential',
    'medium-high': 'leans toward high upside, comfortable with some uncertainty',
    'high': 'actively seeks high upside, comfortable with risk and variability',
  };
  const riskDesc = riskLabels[risk] || 'balanced';

  const mbaLabels = {
    'post-mba-recruiting': 'currently in an MBA program recruiting for full-time post-MBA roles',
    'post-mba-grad': 'recent MBA graduate (within 2 years)',
    'mba-grad-established': 'MBA graduate with 2+ years of post-MBA experience',
    'pre-mba': 'pre-MBA professional exploring options',
  };
  const mbaDesc = mbaLabels[mbaStatus] || 'MBA candidate';

  const pathLabel = mbaStatus === 'pre-mba' ? 'How to get there' : 'How to get there from an MBA';

  const skillsList = skills.length ? skills.join(', ') : 'not specified';
  const dealBreakersList = dealBreakers.length ? dealBreakers.join(', ') : 'none specified';
  const extraSkills = skillsText.trim() ? ` Additional context: ${skillsText}` : '';
  const industriesList = industries.length ? industries.join(', ') : 'open to all industries';
  const extraIndustries = industriesText.trim() ? ` Additional context: ${industriesText}` : '';
  const majorsList = undergradMajors.length ? undergradMajors.join(', ') : 'not specified';
  const currentRoleDesc = currentRole || 'not specified';
  const currentIndustryDesc = currentIndustry || 'not specified';

  return `You are a sophisticated career advisor. Your client is ${mbaDesc}.

Based on the following profile, recommend exactly 5 career paths. Start directly with Career #1 — no introductory text, no preamble.

USER PROFILE:
- Undergrad major: ${majorsList}
- Years since undergrad: ${yearsOut}
- Current role: ${currentRoleDesc}
- Current industry: ${currentIndustryDesc}
- MBA status: ${mbaDesc}
- Work style: prefers ${workStyle} environment, ${teamSize} setting
- Primary motivation: ${motivation}
- Skills and strengths: ${skillsList}.${extraSkills}
- Industry preferences: ${industriesList}.${extraIndustries}
- Lifestyle preferences: ${location} work, approximately ${hours} hours/week, ${travel} travel
- Risk tolerance: ${riskDesc}
- Deal breakers (must avoid): ${dealBreakersList}

Use their current role, background, and MBA status to recommend career paths that are realistic and specific to where they actually are — not generic MBA advice. Reference their background where it creates a meaningful advantage or disadvantage.

For each of the 5 career paths, use EXACTLY this format — do not deviate:

## [Career Title]

**Why it fits your profile**
[2–3 sentences explaining the fit, referencing their specific background and current role where relevant]

**Day in the life**
[2–3 sentences describing a typical day, grounded and specific — not generic]

**Realistic salary range**
- [Early career: specific figure + context]
- [Mid-career: specific figure + context]
- [Senior/experienced: specific figure + context]

**What you'd love**
- [specific thing aligned with their preferences]
- [specific thing aligned with their preferences]
- [specific thing aligned with their preferences]

**What would frustrate you**
- [honest tension or downside given their profile — do not sugarcoat]
- [honest tension or downside given their profile]

**${pathLabel}**
- [Step 1: specific action, timeline]
- [Step 2: specific action, timeline]
- [Step 3: specific action, timeline]
- [Step 4: specific action, timeline]

**Example companies**
- [Company name] — [one line on what role/why it fits]
- [Company name] — [one line]
- [Company name] — [one line]
- [Company name] — [one line]
- [Company name] — [one line]

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
          max_tokens: 5000,
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
