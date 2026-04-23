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
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&display=swap" rel="stylesheet">
        <style>
            :root { 
                --bg: #f7f3f0; /* Soft Clay/Sand */
                --primary: #3d3d3d; /* Soft Charcoal */
                --accent: #5e503f; /* Deep Earthy Brown */
                --muted: #a39b92; 
                --border: #e6e0d9; 
            }
            body { background: var(--bg); color: var(--primary); font-family: 'Outfit', sans-serif; margin: 0; display: flex; justify-content: center; min-height: 100vh; }
            .container { width: 100%; max-width: 420px; padding: 120px 24px; }
            
            h2 { font-size: 32px; font-weight: 400; letter-spacing: -0.03em; margin-bottom: 12px; color: var(--accent); }
            .desc { color: var(--muted); font-size: 15px; margin-bottom: 48px; line-height: 1.6; font-weight: 300; }

            input { 
                width: 100%; padding: 20px; background: rgba(255,255,255,0.4); border: 1px solid var(--border); 
                border-radius: 12px; color: var(--primary); box-sizing: border-box; 
                font-size: 16px; outline: none; transition: all 0.3s ease;
            }
            input:focus { background: #fff; border-color: var(--accent); }

            button { 
                width: 100%; padding: 18px; background: var(--accent); color: #f7f3f0; 
                border: none; border-radius: 12px; font-weight: 500; cursor: pointer; 
                font-size: 16px; transition: transform 0.2s ease, opacity 0.2s; margin-top: 16px;
            }
            button:hover { opacity: 0.95; transform: translateY(-1px); }

            .results-list { margin-top: 50px; }
            .email-row { padding: 24px 0; border-top: 1px solid var(--border); }
            .subj { font-weight: 500; font-size: 16px; display: block; margin-bottom: 6px; color: var(--accent); }
            .meta { font-size: 13px; color: var(--muted); letter-spacing: 0.02em; }

            .back { display: inline-block; margin-top: 48px; color: var(--muted); text-decoration: none; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; }
            .back:hover { color: var(--accent); }
        </style>
    </head>
    <body><div class="container">${content}</div></body>
    </html>
`;

app.get('/', (req, res) => res.send(uiWrapper(`
    <h2>Correspondence</h2>
    <p class="desc">A refined way to explore your inbox. Please enter a keyword to begin the subject-only scan.</p>
    <form action="/login" method="GET">
        <input type="text" name="q" placeholder="Enter keyword..." required autofocus>
        <button type="submit">Verify with Google</button>
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
        if (!msgs.length) return res.send(uiWrapper('<h2>Empty</h2><p class="desc">No matches found for "${req.query.state}" within your subject lines.</p><a href="/" class="back">← Back</a>'));

        let results = `<h2>Results</h2><p class="desc">Top 5 matches for "${req.query.state}"</p><div class="results-list">`;
        for (let m of msgs) {
            const { data } = await gmail.users.messages.get({ 
                userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] 
            });
            const h = data.payload.headers;
            const getH = (name) => h.find(x => x.name === name)?.value || 'N/A';
            let from = getH('From').split('<')[0].replace(/"/g, '').trim();
            
            results += `
                <div class="email-row">
                    <span class="subj">${getH('Subject')}</span>
                    <div class="meta">${from} • ${getH('Date').split(' ').slice(0,4).join(' ')}</div>
                </div>`;
        }
        res.send(uiWrapper(`${results}</div><a href="/" class="back">← New Inquiry</a>`));
    } catch (e) { res.status(500).send("Unauthorized Access."); }
});

app.listen(PORT);
