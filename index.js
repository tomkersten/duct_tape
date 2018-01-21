'use strict';

const ENV = process.env.NODE_ENV || "development";
const pkg = require('./package.json');

require('babel-core/register')({
  presets: ['es2015-node', 'stage-3'],
  plugins: [
    'babel-plugin-transform-es2015-parameters',
    'babel-plugin-transform-es2015-destructuring',
    'babel-plugin-transform-async-to-generator'
  ]
});



// overrides default Promise library...making all
// the 0s and 1s go faster!
global.Promise = require('bluebird');


import _ from 'lodash';
import fs from 'fs';
import path from 'path';

import AppConfig from './config/app_config';
import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import bunyan from 'bunyan';
import cors from 'koa-cors';
import helmet from 'koa-helmet';

import {GithubAutoDeploy} from './middleware/auto_deploy_github';

const config = AppConfig(ENV);

if(!config) {
  throw new Error(`No application config for "${ENV}" environment. Check "config/app_config.js".`);
}

const app = new Koa();
const router = Router();
const log = bunyan.createLogger({name: pkg.name});
const PORT_NUMBER = config.portNumber || 9000;

app.use(cors());
app.use(bodyParser());


// Throw a timer around all requests...for a goof
app.use(async (ctx, next) => {
  const start = new Date();
  await next();
  const ms = new Date() - start;
  log.info(`${ctx.method} ${ctx.url} - ${ms}ms`);
});


router.get('/', async (ctx, next) => {
  ctx.body = {info: `${pkg.name}, v${pkg.version}`};
});


router.post('/integrations/github',
  GithubAutoDeploy({
    logger: log,
    config: config.githubAutoSync
  })
);


// Sets up some security headers for us. Refer to 'helmet'
// library for details on options.
app.use(helmet({
  dnsPrefetchControl: false,
  frameguard: {action: 'deny'}
}));

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(PORT_NUMBER, () => {
  log.info(`${pkg.name} server (v${pkg.version}) listening on http://127.0.0.1:${PORT_NUMBER}`);
});
