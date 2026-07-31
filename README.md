# Grammar Feedback UI

A simple text editor interface with a feedback comment feature.

The system highlights spans of interest and produces feedback "cards" when users click the highlights.

The default back end logic can be handled by `https://github.com/coynestevencharles/grammar_feedback_api`

## Screenshot

![Image](src/assets/screenshot.png)

## Getting Started

Install [Node.js](https://nodejs.org/) and npm.

Install the locked dependencies:

```bash
npm ci
```

Configure `VITE_API_BASE_URL` in a local `.env` when the default
`http://localhost:8000` is not appropriate. Do not commit `.env`.

To launch for local development:

```bash
npm run dev
```

Then open your browser and navigate to `http://localhost:5173`

## Development checks

```bash
npm run format:check
npm run lint
npm run build
```

Prettier is the repository formatter. Apply it with:

```bash
npm run format
```
