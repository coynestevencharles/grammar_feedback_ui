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
npm test
npm run format:check
npm run lint
npm run build
```

Prettier is the repository formatter. Apply it with:

```bash
npm run format
```

## Tests

```bash
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e
```

Testing is done with Vitest, React Testing Library, and Playwright.

The Playwright test uses Chromium to verify the Slate contenteditable. To use this, install that browser once with `npx playwright install chromium`.
