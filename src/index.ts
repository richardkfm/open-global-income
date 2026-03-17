import { buildServer } from './api/server.js';

const port = parseInt(process.env.PORT ?? '3333', 10);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildServer();

app.listen({ port, host }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
