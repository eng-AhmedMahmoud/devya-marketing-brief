// node --test social/render/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBannedHost, pageTextProblem, shotUrlProblem, ShotRefused, SHOT_REFUSED_EXIT } from './shot-guard.mjs';

test('vercel.app and now.sh hosts are banned, devya.dev hosts are not', () => {
  for (const h of ['urania.vercel.app', 'vercel.app', 'x-git-main-team.vercel.app', 'URANIA.VERCEL.APP', 'old.now.sh', 'urania.vercel.app.']) assert.equal(isBannedHost(h), true, h);
  for (const h of ['urania.devya.dev', 'www.devya.dev', 'og.devya.dev', 'vercel.app.example.com', 'notvercel.apps.dev']) assert.equal(isBannedHost(h), false, h);
});

test('shot URLs must be https and off Vercel', () => {
  assert.match(shotUrlProblem('https://urania.vercel.app'), /Vercel host/);
  assert.match(shotUrlProblem('https://urania.vercel.app/ar?x=1'), /Vercel host/);
  assert.match(shotUrlProblem('http://urania.devya.dev'), /https/);
  assert.match(shotUrlProblem('urania.devya.dev'), /valid URL/);
  assert.equal(shotUrlProblem('https://urania.devya.dev'), null);
  assert.equal(shotUrlProblem('https://www.devya.dev/converse'), null);
});

test('paused and error pages are refused', () => {
  const bad = [
    'This deployment is temporarily paused\nfra1::vr4wl-1795777309580-537a641f04f5',
    '402: PAYMENT_REQUIRED Code: DEPLOYMENT_PAUSED',
    '404: NOT_FOUND Code: DEPLOYMENT_NOT_FOUND ID: fra1::abc',
    'This site has been suspended. Contact the administrator for more details.',
    'Application error: a client-side exception has occurred (see the browser console for more information).',
    '502 Bad Gateway nginx/1.24.0 (Ubuntu) and some more text to pass length',
    'Web server is down Error code 521 Visit cloudflare.com for more information.',
    '404 This page could not be found.',
    '',
    'Loading…',
  ];
  for (const t of bad) assert.ok(pageTextProblem(t), JSON.stringify(t));
});

test('a real product page passes', () => {
  const urania = 'Urania Start Here Sky Events Timeline Quiz & Games Star Names Resources About العربية A complete bilingual guide The Constellations & Their Greek Myths Every stick-figure on a star chart is the skeleton of a story.';
  assert.equal(pageTextProblem(urania), null);
  assert.equal(pageTextProblem('Devya Converse AI chat that runs your business, around the clock. A conversational AI assistant trained on your own content.'), null);
});

test('ShotRefused carries the url and reason; the exit code is 4', () => {
  const e = new ShotRefused('https://urania.vercel.app', 'HTTP 402');
  assert.equal(e.url, 'https://urania.vercel.app');
  assert.equal(e.reason, 'HTTP 402');
  assert.match(e.message, /shot refused for https:\/\/urania\.vercel\.app: HTTP 402/);
  assert.equal(SHOT_REFUSED_EXIT, 4);
});
