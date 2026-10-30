import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pagesDir = path.join(root, 'src/pages');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function strip(src) {
  return src
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/\{[\s\S]*?\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, ' and ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function blurb(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

const areas = JSON.parse(read('src/data/areas.json'));
const communities = JSON.parse(read('src/data/temecula-communities.json'));
const events = JSON.parse(read('src/data/temecula-events.json'));
const site = JSON.parse(read('src/data/site.json'));
const posts = JSON.parse(read('src/data/blog.json'));

const staticPages = [
  ['src/pages/index.astro', '/', 'Home'],
  ['src/pages/sell.astro', '/sell/', 'Sell your home'],
  ['src/pages/buy.astro', '/buy/', 'Buy a home'],
  ['src/pages/home-affordability.astro', '/home-affordability/', 'Home affordability calculator'],
  ['src/pages/areas/index.astro', '/areas/', 'Areas served'],
  ['src/pages/areas/temecula-communities.astro', '/areas/temecula-communities/', 'Top Temecula communities'],
  ['src/pages/1031-exchange.astro', '/1031-exchange/', '1031 exchange'],
  ['src/pages/temecula-seasonal-events.astro', '/temecula-seasonal-events/', 'Temecula seasonal events'],
  ['src/pages/about.astro', '/about/', 'About'],
  ['src/pages/blog/index.astro', '/blog/', 'Blog'],
  ['src/pages/contact.astro', '/contact/', 'Contact'],
  ['src/pages/privacy.astro', '/privacy/', 'Privacy'],
  ['src/pages/terms.astro', '/terms/', 'Terms'],
];

const entries = [];

for (const [file, href, title] of staticPages) {
  let text = strip(read(file));
  if (href === '/') {
    text += ` ${site.nameWithCredentials} ${site.title} ${site.brokerage} ${site.dre} ${site.phone} ${site.email} ${site.markets.join(' ')} ${site.primaryTagline}`;
  }
  if (href === '/areas/temecula-communities/') {
    text += ` ${communities.map((c) => `${c.name} ${c.tag} ${c.kicker || ''} ${(c.body || []).join(' ')}`).join(' ')}`;
    text += ` ${events.map((e) => `${e.name} ${e.date} ${e.where} ${e.blurb}`).join(' ')}`;
  }
  if (href === '/temecula-seasonal-events/') {
    text += ` ${events.map((e) => `${e.name} ${e.date} ${e.where} ${e.blurb}`).join(' ')}`;
  }
  entries.push({ title, href, text, blurb: blurb(text) });
}

const areaTemplate = strip(read('src/pages/areas/[slug].astro'));
for (const area of areas) {
  const text = `${area.name} ${area.region} ${area.blurb} ${area.buyerAngle} ${area.sellerAngle} ${areaTemplate}`;
  entries.push({
    title: area.name,
    href: `/areas/${area.slug}/`,
    text,
    blurb: blurb(`${area.blurb} ${area.buyerAngle} ${area.sellerAngle}`),
  });
}

for (const community of communities) {
  const text = `${community.name} ${community.tag} ${community.kicker || ''} ${(community.body || []).join(' ')}`;
  entries.push({
    title: community.name,
    href: `/areas/temecula-communities/#${community.slug}`,
    text,
    blurb: blurb(text),
  });
}

for (const event of events) {
  const text = `${event.name} ${event.date || ''} ${event.where || ''} ${event.blurb || ''}`;
  entries.push({
    title: event.name,
    href: '/areas/temecula-communities/#upcoming-events',
    text,
    blurb: blurb(text),
  });
}

for (const post of posts) {
  let pageText = '';
  const slug = String(post.href || '').replace(/^\/blog\//, '').replace(/\/$/, '');
  const pagePath = slug ? path.join(root, 'src/pages/blog', `${slug}.astro`) : '';
  if (pagePath && fs.existsSync(pagePath)) pageText = strip(fs.readFileSync(pagePath, 'utf8'));
  const text = `${post.title || ''} ${post.summary || ''} ${post.keywords || ''} ${pageText}`;
  if (!post.href || !post.title) continue;
  entries.push({
    title: post.title,
    href: post.href,
    text,
    blurb: blurb(post.summary || post.title),
  });
}

const out = path.join(root, 'src/data/site-search.json');
fs.writeFileSync(out, JSON.stringify(entries, null, 2) + '\n');
console.log(`site-search entries ${entries.length}`);
