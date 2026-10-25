# LiveBingo

LiveBingo is a small Twitch-connected foundation for viewer-specific bingo cards.

## Setup

1. Create an application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Set its OAuth redirect URL to `http://localhost:3000/auth/callback` and its category to **Website Integration**.
2. Copy `.env.example` to `.env` and fill in `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Keep the redirect URI and public base URL at their localhost defaults for local testing.
3. Install dependencies and start the development server:

   ```sh
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and log in with the Twitch account that owns the channel. This same account is used as the bot.
5. In another Twitch account, open the logged-in account's channel and send `!bingo` in chat. The bot replies with that viewer's card link.

For a production build, run `npm run build` and then `npm start`. Tokens are saved in `data/tokens.json`; keep that file private.
