/**
 * CMS pages (About, Privacy, Terms, ...) — platform content pages
 * managed by the super admin, rendered publicly at /p/<slug>.
 */
const control = require('../../control/db');
const { requireFullAdmin } = require('./superAdminAuth');

const SEED_PAGES = [
  { slug: 'about',   title: 'About Us',           content: '<p>Welcome to NextEra Softlabs. Edit this page from the super admin -> CMS Pages.</p>' },
  { slug: 'privacy', title: 'Privacy Policy',     content: '<p>Your privacy matters to us. Edit this Privacy Policy from the super admin -> CMS Pages.</p>' },
  { slug: 'terms',   title: 'Terms & Conditions', content: '<p>These are the terms of service. Edit them from the super admin -> CMS Pages.</p>' }
];

async function ensure() {
  await control.query(`
    CREATE TABLE IF NOT EXISTS cms_pages (
      slug         TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '',
      is_published BOOLEAN NOT NULL DEFAULT true,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  for (const p of SEED_PAGES) {
    await control.query(
      `INSERT INTO cms_pages (slug, title, content) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.title, p.content]
    );
  }
}

function _slugify(v){
  return String(v||'').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}

async function api_saas_cms_list(token) {
  await requireFullAdmin(token);
  await ensure();
  const r = await control.query(`SELECT slug, title, content, is_published, updated_at FROM cms_pages ORDER BY title`);
  return r.rows;
}

async function api_saas_cms_get(token, slug) {
  await requireFullAdmin(token);
  await ensure();
  const r = await control.query(`SELECT slug, title, content, is_published, updated_at FROM cms_pages WHERE slug=$1`, [String(slug||'')]);
  return r.rows[0] || null;
}

async function api_saas_cms_save(token, payload) {
  const me = await requireFullAdmin(token);
  await ensure();
  const p = payload || {};
  const slug = _slugify(p.slug);
  if (!slug) throw new Error('slug is required');
  const title = (String(p.title||'').trim()) || slug;
  const content = String(p.content==null ? '' : p.content);
  const isPub = (p.is_published===false || p.is_published==='false' || p.is_published===0 || p.is_published==='0') ? false : true;
  await control.query(
    `INSERT INTO cms_pages (slug, title, content, is_published, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (slug) DO UPDATE SET title=$2, content=$3, is_published=$4, updated_at=NOW()`,
    [slug, title, content, isPub]
  );
  try {
    await control.insert('audit_log', {
      actor_type:'super_admin', actor_id: me.id, actor_email: me.email,
      event:'cms.saved', detail: JSON.stringify({ slug })
    });
  } catch (_) {}
  return { ok:true, slug };
}

async function api_saas_cms_delete(token, slug) {
  const me = await requireFullAdmin(token);
  await ensure();
  await control.query(`DELETE FROM cms_pages WHERE slug=$1`, [String(slug||'')]);
  return { ok:true };
}

// Plain helpers for server.js public routes (no token)
async function getPublishedPage(slug) {
  await ensure();
  const r = await control.query(`SELECT slug,title,content,is_published FROM cms_pages WHERE slug=$1`, [String(slug||'')]);
  const row = r.rows[0];
  if (!row || row.is_published===false) return null;
  return row;
}
async function listPublishedPages() {
  await ensure();
  const r = await control.query(`SELECT slug,title FROM cms_pages WHERE is_published=true ORDER BY title`);
  return r.rows;
}

module.exports = {
  api_saas_cms_list, api_saas_cms_get, api_saas_cms_save, api_saas_cms_delete,
  getPublishedPage, listPublishedPages, ensure
};
