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
            body { background: #0f172a; color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; display: flex; justify-content: center; min-height: 100vh; }
            .container { width: 100%; max-width: 500px; padding: 40px 20px; }
            .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 35px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
            h2 { font-size: 2rem; margin-bottom: 10px; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; margin-bottom: 30px; font-size: 0.95rem; }
            input { width: 100%; padding: 15px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; color: white; margin-bottom: 20px; box-sizing: border-box; font-size: 1rem; outline: none; }
            input:focus { border-color: #38bdf8; }
            button { width: 100%; padding: 15px; background: #38bdf8; color: #0f172a; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 1rem; }
            button:hover { background: #7dd3fc; transform: translateY(-2px); }
            .email-card { background: rgba(15, 23, 42, 0.5); padding: 18px; border-radius: 15px; margin-bottom: 15px; border-left: 5px solid #818cf8; text-align: left; transition: 0.2s; }
            .email-card:hover { background: rgba(15, 23, 42, 0.8); }
            .email-subject { font-weight: 600; color: #f1f5f9; display: block; margin-bottom: 5px; }
            .email-meta { font-size: 0.8rem; color: #64748b; }
            .back-btn { display: inline-block; margin-top: 20px; color: #38bdf8; text-decoration: none; font-weight: 500; }
        </style>
    </head>
    <body><div class="container">${content}</div></body>
    </html>
`;

app.get('/', (req, res) => res.send(uiWrapper(`
    <div class="glass-card">
        <h2>Inbox Pulse</h2>
        <p>Advanced keyword email discovery</p>
        <form action="/login" method="GET">
            <input type="text" name="q" placeholder="Search keywords..." required>
            <button type="submit">Authenticate & Search</button>
        </form>
    </div>
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
        const response = await gmail.users.messages.list({ userId: 'me', q: req.query.state, maxResults: 5 });

        const msgs = response.data.messages || [];
        if (!msgs.length) return res.send(uiWrapper('<div class="glass-card"><h2>No Data</h2><p>No emails matched your criteria.</p><a href="/" class="back-btn">Try again</a></div>'));

        let results = `<h2>Results: ${req.query.state}</h2><div style="margin-top:20px;">`;
        for (let m of msgs) {
            const { data } = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
            const h = data.payload.headers;
            const getH = (n) => h.find(x => x.name === n)?.value || 'Unknown';
            results += `
                <div class="email-card">
                    <span class="email-subject">${getH('Subject')}</span>
                    <div class="email-meta">From: ${getH('From')}<br>${getH('Date')}</div>
                </div>`;
        }
        res.send(uiWrapper(`<div class="glass-card">${results}</div><a href="/" class="back-btn">← New Search</a></div>`));
    } catch (e) { res.status(500).send("Error"); }
});

app.listen(PORT);