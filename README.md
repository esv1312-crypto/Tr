# Трынька — Telegram Mini App

Node.js 20+ application. Original rules: https://sekastars.tilda.ws/trynkarules

## Local start
Run npm install, npm test, npm start and open http://localhost:3000. The local development mode permits demo login. Do not enable demo login in production.

## Telegram
Set TELEGRAM_BOT_TOKEN as a protected environment variable. The server validates Telegram Mini App initData. Configure the app's HTTPS URL in BotFather.

## Render
Use render.yaml as a Blueprint or connect this repository to a Node web service. Set TELEGRAM_BOT_TOKEN in the Render environment and check /health.

## Known limitation
Current sessions, balances and rooms are held in memory and reset when the process restarts. PostgreSQL and transactional state updates are required before stable public launch. Special cases for betting, dark play, svaра and redeals need further scenario testing against the original rules.
