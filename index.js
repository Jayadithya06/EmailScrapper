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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            :root { --border: #e5e7eb; --bg: #ffffff; --text: #111827; --muted: #6b7280; --accent: #2563eb; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; display: flex; justify-content: center; min-height: 100vh; }
            .container { width: 100%; max-width: 480px; padding: 100px 24px; }
            
            h2 { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; margin-bottom: 8px; color: var(--text); }
            .desc { color: var(--muted); font-size: 16px; margin-bottom: 48px; line-height: 1.5; }

            .input-group { position: relative; margin-bottom: 12px; }
            input { 
                width: 100%; padding: 16px 20px; background: #fff; border: 1.5px solid var(--border); 
                border-radius: 12px; color: var(--text); box-sizing: border-box; 
                font-size: 16px; outline: none; transition: all 0.2s ease;
            }
            input:focus { border-color: var(--text); }

            button { 
                width: 100%; padding: 16px; background: var(--text); color: #fff; 
                border: none; border-radius: 12px; font-weight: 500; cursor: pointer; 
                font-size: 16px; transition: background 0.2s ease; margin-top: 8px;
            }
            button:hover { background: #374151; }

            .result-container { margin-top: 40px; border-top: 1.5px solid var(--border); }
            .email-row { padding: 24px 0; border-bottom: 1px solid var(--border); transition: opacity 0.3s; }
            .subj { font-weight: 500; font-size: 16px; margin-bottom: 6px; display: block; color: var(--text); }
            .meta { font-size: 14px; color: var(--muted); }

            .back { display: inline-block; margin-top: 32px; color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500; }
            .back:hover { color: var(--text); text-decoration: underline; }
        </style>
    </head>
    <body><div class="container">${content}</div></body>
    </html>
`;

app.get('/', (req, res) => res.send(uiWrapper(`
    <h2>Search</h2>
    <p class="desc">Enter a keyword to filter your inbox by subject line.</p>
    <form action="/login" method="GET">
        <div class="input-group">
            <input type="text" name="q" placeholder="Keywords..." required autofocus>
        </div>
        <button type="submit">Continue with Google</button>
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
        if (!msgs.length) return res.send(uiWrapper('<h2>No results</h2><p class="desc">We couldn\'t find any emails with that subject.</p><a href="/" class="back">← Try another keyword</a>'));

        let results = `<h2>Results</h2><p class="desc">Showing top 5 matches for "${req.query.state}"</p><div class="result-container">`;
        for (let m of msgs) {
            const { data } = await gmail.users.messages.get({ 
                userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] 
            });
            const h = data.payload.headers;
            const getH = (name) => h.find(x => x.name === name)?.value || 'N/A';
            
            // Clean up 'From' field to look professional
            let from = getH('From').split('<')[0].replace(/"/g, '').trim();
            
            results += `
                <div class="email-row">
                    <span class="subj">${getH('Subject')}</span>
                    <div class="meta">${from} • ${getH('Date').split(' ').slice(0,4).join(' ')}</div>
                </div>`;
        }
        res.send(uiWrapper(`${results}</div><a href="/" class="back">← Search again</a>`));
    } catch (e) { res.status(500).send("Server Error"); }
});

app.listen(PORT);
