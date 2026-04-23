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
            :root { 
                --bg: #fdfcf8; /* Warm Cream */
                --sage: #4a5d4e; /* Earthy Sage */
                --text: #2c2c2c; /* Soft Charcoal */
                --muted: #8c8c8c; 
                --border: #e8e6df; 
            }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; display: flex; justify-content: center; min-height: 100vh; }
            .container { width: 100%; max-width: 440px; padding: 120px 24px; }
            
            h2 { font-size: 28px; font-weight: 500; letter-spacing: -0.01em; margin-bottom: 12px; }
            .desc { color: var(--muted); font-size: 15px; margin-bottom: 40px; line-height: 1.6; }

            input { 
                width: 100%; padding: 18px; background: transparent; border: 1.5px solid var(--border); 
                border-radius: 16px; color: var(--text); box-sizing: border-box; 
                font-size: 16px; outline: none; transition: border 0.3s ease;
            }
            input:focus { border-color: var(--sage); }

            button { 
                width: 100%; padding: 18px; background: var(--sage); color: #fff; 
                border: none; border-radius: 16px; font-weight: 500; cursor: pointer; 
                font-size: 16px; transition: opacity 0.3s ease; margin-top: 12px;
            }
            button:hover { opacity: 0.9; }

            .results { margin-top: 60px; }
            .row { padding: 20px 0; border-top: 1px solid var(--border); }
            .subj { font-weight: 500; font-size: 15.5px; display: block; margin-bottom: 4px; }
            .meta { font-size: 13px; color: var(--muted); }

            .back { display: inline-block; margin-top: 40px; color: var(--sage); text-decoration: none; font-size: 14px; font-weight: 500; }
        </style>
    </head>
    <body><div class="container">${content}</div></body>
    </html>
`;

app.get('/', (req, res) => res.send(uiWrapper(`
    <h2>Inbox Pulse</h2>
    <p class="desc">A quiet, focused way to find your correspondence. Search by subject line below.</p>
    <form action="/login" method="GET">
        <input type="text" name="q" placeholder="What are you looking for?" required autofocus>
        <button type="submit">Begin Search</button>
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
        if (!msgs.length) return res.send(uiWrapper('<h2>Empty.</h2><p class="desc">Nothing matched your keyword in the subject lines.</p><a href="/" class="back">← Try again</a>'));

        let results = `<h2>Results</h2><p class="desc">Found ${msgs.length} matches for "${req.query.state}"</p><div class="results">`;
        for (let m of msgs) {
            const { data } = await gmail.users.messages.get({ 
                userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] 
            });
            const h = data.payload.headers;
            const getH = (name) => h.find(x => x.name === name)?.value || 'N/A';
            let from = getH('From').split('<')[0].replace(/"/g, '').trim();
            
            results += `
                <div class="row">
                    <span class="subj">${getH('Subject')}</span>
                    <div class="meta">${from} • ${getH('Date').split(' ').slice(0,4).join(' ')}</div>
                </div>`;
        }
        res.send(uiWrapper(`${results}</div><a href="/" class="back">← New search</a>`));
    } catch (e) { res.status(500).send("Session expired."); }
});

app.listen(PORT);
