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

## Start and test a round

1. Start the app with `npm run dev` and log in as the streamer/bot account at `http://localhost:3000`.
2. Start a round from a terminal:

   ```sh
   curl -X POST http://localhost:3000/api/round/start
   ```

3. From a second Twitch account, open the streamer's chat and send `!bingo`. The bot creates one card for that viewer and replies with its link. Open the link in another browser; its 5×5 board updates over WebSocket. To open it on a phone on the same Wi-Fi, set `PUBLIC_BASE_URL` in `.env` to the computer's LAN URL (for example `http://192.168.1.20:3000`) and restart the app before requesting a card.
4. To test visible stamps without waiting for stream events, hit the manual squares while the round is live:

   ```sh
   for square in rage-moment snack-break technical-pause big-play streamer-laughs game-change missed-shot unexpected-win loud-noise streamer-sings game-glitch water-break; do
     curl -sS -X POST "http://localhost:3000/api/squares/$square/hit"
   done
   ```

   Only manual squares can be hit through this endpoint. Follows, subscriptions, gift subs, raids, cheers, and chat bursts are detected automatically from EventSub while logged in. Chat burst squares count distinct viewers inside their configured time window.

5. End the round when finished:

   ```sh
   curl -X POST http://localhost:3000/api/round/end
   ```

The round, cards, marked squares, and winner order persist in `data/state.json`. Starting a new round resets its cards and hits. The viewer page is served from `/c/:id`; its dynamic text is rendered with `textContent`.
