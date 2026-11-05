const https = require('https');
const fs = require('fs');

function post(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Logging into portal...');
  const loginRes = await post('https://portaldoaluno.microlins.com.br/login/validarCadastroPerfil', {
    txtUsuario: 'a116882',
    txtSenha: 'Joao@2025',
    id_escola: '1875'
  });
  
  const setCookies = loginRes.headers['set-cookie'] || [];
  const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log('Logged in. Cookies:', cookieHeader);

  // 1. Fetch dashboard HTML
  const dashRes = await get('https://portaldoaluno.microlins.com.br/dashboard', { Cookie: cookieHeader });
  console.log('Dashboard status:', dashRes.statusCode, 'bytes:', dashRes.body.length);

  // Extract all JS files
  const scriptRegex = /<script[^>]*src=["']([^"']+)["']/gi;
  let match;
  const scripts = [];
  while ((match = scriptRegex.exec(dashRes.body)) !== null) {
    scripts.push(match[1]);
  }
  console.log('\n--- EXTERNAL SCRIPTS ---');
  console.log(scripts);

  // Extract inline script blocks
  const inlineScriptRegex = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  const inlineScripts = [];
  while ((match = inlineScriptRegex.exec(dashRes.body)) !== null) {
    inlineScripts.push(match[1]);
  }
  console.log('\n--- INLINE SCRIPTS COUNT ---', inlineScripts.length);
  
  // Search for endpoints in HTML and inline scripts
  const endpointRegex = /(?:url\s*:\s*|href\s*=\s*|action\s*=\s*|fetch\s*\(\s*|\$\.post\s*\(\s*|\$\.get\s*\(\s*)["']([^"'#][^"']*)["']/gi;
  const allEndpoints = new Set();
  let epMatch;
  while ((epMatch = endpointRegex.exec(dashRes.body)) !== null) {
    if (!epMatch[1].startsWith('http') && !epMatch[1].startsWith('//') && epMatch[1].includes('/')) {
      allEndpoints.add(epMatch[1]);
    }
  }
  console.log('\n--- ENDPOINTS IN DASHBOARD ---');
  console.log([...allEndpoints]);

  // Let's also download and inspect custom application JS files like menu.js, dashboard.js, etc.
  const appScripts = scripts.filter(s => s.includes('/views/') || s.includes('app') || s.includes('script'));
  console.log('\n--- APP SCRIPTS TO ANALYZE ---', appScripts);

  for (const s of appScripts) {
    const sUrl = s.startsWith('http') ? s : 'https://portaldoaluno.microlins.com.br' + (s.startsWith('/') ? '' : '/') + s;
    try {
      const jsRes = await get(sUrl, { Cookie: cookieHeader });
      console.log(`\n=== JS FILE: ${s} (${jsRes.body.length} bytes) ===`);
      // Find ajax / url / routes
      const jsEndpoints = new Set();
      const r = /["'](\/[a-zA-Z0-9_\-\/]+)["']/g;
      let jm;
      while ((jm = r.exec(jsRes.body)) !== null) {
        if (jm[1].length > 2 && !jm[1].endsWith('.js') && !jm[1].endsWith('.css') && !jm[1].endsWith('.png')) {
          jsEndpoints.add(jm[1]);
        }
      }
      console.log('Potential routes in', s, ':', [...jsEndpoints].slice(0, 30));
    } catch (e) {
      console.log('Error fetching script', s, e.message);
    }
  }
}

main().catch(console.error);
