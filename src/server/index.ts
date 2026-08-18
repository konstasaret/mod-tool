import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { Hono } from 'hono';
import { api } from './routes/api.js';
import { external } from './routes/external.js';
import { menu } from './routes/menu.js';
import { triggers } from './routes/triggers.js';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);
app.route('/api', api);
app.route('/internal', internal);
app.route('/external', external);

serve({ fetch: app.fetch, createServer, port: getServerPort() });
