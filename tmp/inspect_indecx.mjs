import 'dotenv/config';

async function run() {
  const loginRes = await fetch('https://indecx.com/v2/login?lang=br&systemLanguage=br', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'presidenteprudente@microlins.com.br',
      password: process.env.INDECX_NPS_PASSWORD || 'Prudente@26'
    })
  });
  const { token, companyId } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}`, 'x-access-token': token };

  // Inspect the action
  const actionRes = await fetch(`https://indecx.com/v2/action/626420b42231bf2f2230fde7?companyId=${companyId}`, { headers });
  console.log('actionRes status:', actionRes.status);
  if (actionRes.ok) {
    const actionData = await actionRes.json();
    console.log('Action keys:', Object.keys(actionData));
    console.log('name:', actionData.name);
    console.log('channel:', actionData.channel);
    console.log('status:', actionData.status);
    console.log('surveyId:', actionData.surveyId);
    console.log('templateId:', actionData.templateId);
    console.log('emailTemplate:', actionData.emailTemplate ? Object.keys(actionData.emailTemplate) : null);
    if (actionData.emailTemplate?.body) {
      const body = actionData.emailTemplate.body;
      console.log('Email template body snippet:', body.slice(0, 300));
      const linkMatches = body.match(/href="([^"]+)"/g) || [];
      console.log('Links in email template:', linkMatches);
    }
  }

  // Also check if there is an action for Widget:
  const actionsListRes = await fetch(`https://indecx.com/v2/action/list?companyId=${companyId}`, { headers });
  if (actionsListRes.ok) {
    const actions = await actionsListRes.json();
    console.log('Total actions:', Array.isArray(actions) ? actions.length : typeof actions);
    if (Array.isArray(actions)) {
      for (const a of actions) {
        console.log(`Action: ${a._id} | ${a.name} | channel: ${a.channel}`);
      }
    }
  }
}

run();
