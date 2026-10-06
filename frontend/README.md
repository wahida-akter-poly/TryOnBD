# TryOnBD frontend

React 18, Vite, existing CSS/Tailwind, MediaPipe Tasks Vision. All production products, categories, carts, orders and saved session metadata use the backend. Empty and unavailable APIs never generate local records.

See [production integration guide](../PRODUCTION.md) for exact startup commands, API/role behavior, test commands and limitations.

```powershell
npm ci
npm run setup:vision
npm run dev
```

`npm run build`, `npm test`, and `npm run test:production` validate the production flows. Camera permission and real photos are always chosen by the user. Known shirt, eyewear and necklace geometry is retained.
