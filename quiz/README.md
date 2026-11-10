# CELEHub Quiz: setup (about 20 minutes)

A separate project from CELEHub: its own GitHub folder/repo, Cloudflare Pages project, D1 database, Turnstile widget and Telegram bot.

## 1. Files
Put these in a NEW repo (or folder) for the quiz:

New files (from me): index.html, quiz.html, _headers, robots.txt, css/quiz.css, js/config.js, js/gate.js, js/home.js, js/quiz.js,
functions/_lib/quiz-core.js, functions/api/topics.js, questions.js, grade.js, tg.js

Copy UNCHANGED from CELEHub: css/style.css, js/checks.js, the whole vendor/ folder, functions/api/survey.js

## 2. Cloudflare
1. Workers & Pages > Create > Pages > connect the new repo. No build command; output folder: `/`.
2. D1: create a database (e.g. `celehub-quiz`). Pages project > Settings > Bindings > add D1, variable name `DB`.
3. Turnstile: create a NEW widget (domain = the quiz site). Put the SITE key in `js/config.js` (TURNSTILE_SITE_KEY). The SECRET key goes in step 4.
4. Settings > Variables and Secrets (Secret): `TURNSTILE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TG_WEBHOOK_SECRET` (any long random text), `SESSION_SECRET` (any long random text), `IP_SALT` (any random text).
   Text: `TELEGRAM_CHAT_ID` (your own chat id, same as CELEHub's if you like).
5. Redeploy.

## 3. Telegram bot
1. @BotFather > /newbot > copy the token (this is a NEW bot, not CELEHub's).
2. Open the bot, press Start. Your chat id is the same number you already use for CELEHub's bot.
3. Register the webhook (open once in a browser, replace the three parts):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-quiz-site>/api/tg&secret_token=<TG_WEBHOOK_SECRET>`
4. Send `/menu` to the bot, then `/help`.

## 4. Add questions (in the bot)
```
/mstc
1. What is the SI unit of force?
A. Joule
B. Newton
C. Pascal
D. Watt
Answer: B
Explanation: F = ma, so kg*m/s^2 = newton.

2. Next question ...
```
Many questions in one message are fine. A .txt file works too (caption: `/mstc`).
Fix keys: `/key 41 B 42 D`. Explanation: `/explain 41 text`. Replace: `/edit 41` + a full question. `/del 41` (Undo button), `/move 41 psad`, `/list`, `/find`, `/show`, `/count`.

## 5. Topics
Edit `TOPICS` in `js/config.js` (name, full name, icon, color) AND in `functions/_lib/quiz-core.js` (the id list). Same ids in both.

## Notes
- Answers are never sent to the browser until Submit. A determined, signed-in visitor could still call /api/grade by hand; that is normal for a free practice site.
- Visitors pass the same Cloudflare check and survey as CELEHub (no ad-blocker step).
