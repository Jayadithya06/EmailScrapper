const express = require('express');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

const getRedirectUri = (req) => {
    if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/auth/callback`;
    }
    return `${req.protocol}://${req.get('host')}/auth/callback`;
};

const getAuthClient = (req) => new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    getRedirectUri(req)
);

const uiWrapper = (content) => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root { --accent: #3b82f6; --bg: #0a0a0a; --text: #f5f5f5; --muted: #737373; }
            body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; display: flex; justify-content: center; min-height: 100vh; }
            .container { width: 100%; max-width: 420px; padding: 80px 24px; }
            
            .header { margin-bottom: 40px; text-align: left; }
            h2 { font-size: 24px; font-weight: 500; letter-spacing: -0.5px; margin: 0; }
            .tagline { color: var(--muted); font-size: 14px; margin-top: 4px; }

            input { 
                width: 100%; padding: 16px; background: #171717; border: 1px solid #262626; 
                border-radius: 12px; color: white; margin-bottom: 12px; box-sizing: border-box; 
                font-size: 15px; outline: none; transition: border 0.2s;
            }
            input:focus { border-color: var(--accent); }

            button { 
                width: 100%; padding: 16px; background: var(--text); color: black; 
                border: none; border-radius: 12px; font-weight: 600; cursor: pointer; 
                font-size: 15px; transition: opacity 0.2s;
            }
            button:hover { opacity: 0.9; }

            .result-item { 
                padding: 20px 0; border-bottom: 1px solid #171717; animation: fadeIn 0.5s ease forwards;
            }
            .subj { font-size: 15px; font-weight: 500; display: block; margin-bottom: 4px; line-height: 1.4; }
            .meta { font-size: 12px; color: var(--muted); }

            .back { display: block; margin-top: 40px; color: var(--muted); text-decoration: none; font-size: 13px; }
            .back:hover { color: var(--text); }

            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    </head>
    <body><div class="container">${content}</div></body>
    </html>
`;

app.get('/', (req, res) => res.send(uiWrapper(`
    <div class="header">
        <h2>Nexus</h2>
        <div class="tagline">Minimalist Email Intelligence</div>
    </div>
    <form action="/login" method="GET">
        <input type="text" name="q" placeholder="Keyword search..." required autofocus>
        <button type="submit">Scan Inbox</button>
    </form>
`)));

app.get('/login', (req, res) => {
    const url = getAuthClient(req).generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        state: req.query.q
    });
    res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
    try {
        const oauth2Client = getAuthClient(req);
        const { tokens } = await oauth2Client.getToken(req.query.code);
        oauth2Client.setCredentials(tokens);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const response = await gmail.users.messages.list({ 
            userId: 'me', q: `subject:(${req.query.state})`, maxResults: 5 
        });

        const msgs = response.data.messages || [];
        if (!msgs.length) return res.send(uiWrapper('<h2>No matches.</h2><a href="/" class="back">← Try again</a>'));

        let results = `<div class="header"><h2>Search: ${req.query.state}</h2></div>`;
        for (let m of msgs) {
            const { data } = await gmail.users.messages.get({ 
                userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] 
            });
            const h = data.payload.headers;
            const getH = (n) => h.find(x => x.name === n)?.value || 'N/A';
            results += `
                <div class="result-item">
                    <span class="subj">${getH('Subject')}</span>
                    <div class="meta">${getH('From').split('<')[0]} • ${getH('Date').split(' ').slice(0,3).join(' ')}</div>
                </div>`;
        }
        res.send(uiWrapper(`${results}<a href="/" class="back">← New search</a>`));
    } catch (e) { res.status(500).send("System Error"); }
});

app.listen(PORT);
