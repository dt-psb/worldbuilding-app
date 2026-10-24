'use strict';

const BetterSqlite3 = require('better-sqlite3');

class Database {
  constructor(dbPath) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        aliases TEXT DEFAULT '[]',
        age INTEGER,
        birthdate TEXT,
        gender TEXT,
        origin TEXT,
        appearance TEXT,
        personality TEXT,
        profile_public TEXT,
        profile_secret TEXT,
        prompt TEXT DEFAULT '',
        avatar_path TEXT,
        avatar_crop TEXT,
        images TEXT DEFAULT '[]',
        height INTEGER,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS factions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#888888',
        parent_id INTEGER REFERENCES factions(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS character_factions (
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        faction_id INTEGER REFERENCES factions(id) ON DELETE CASCADE,
        role TEXT,
        PRIMARY KEY (character_id, faction_id)
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        char_a_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        char_b_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        type TEXT,
        description TEXT,
        narrative TEXT DEFAULT '',
        is_mutual INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        summary TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS episode_characters (
        episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
        character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
        role_type TEXT DEFAULT 'main',
        PRIMARY KEY (episode_id, character_id)
      );

      CREATE TABLE IF NOT EXISTS episode_extras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        gender TEXT DEFAULT ''
      );
    `);

    // ── Migrations: 컬럼별 개별 try-catch (하나 실패해도 나머지 진행) ──
    const safeAlter = (sql) => {
      try { this.db.prepare(sql).run(); } catch (e) { /* 이미 있거나 무관한 오류 무시 */ }
    };

    // characters 컬럼 추가
    const charCols = new Set(this.db.prepare(`PRAGMA table_info(characters)`).all().map(c => c.name));
    if (!charCols.has('prompt'))      safeAlter(`ALTER TABLE characters ADD COLUMN prompt TEXT DEFAULT ''`);
    if (!charCols.has('avatar_path')) safeAlter(`ALTER TABLE characters ADD COLUMN avatar_path TEXT`);
    if (!charCols.has('avatar_crop')) safeAlter(`ALTER TABLE characters ADD COLUMN avatar_crop TEXT`);
    if (!charCols.has('images'))      safeAlter(`ALTER TABLE characters ADD COLUMN images TEXT DEFAULT '[]'`);
    if (!charCols.has('height'))      safeAlter(`ALTER TABLE characters ADD COLUMN height INTEGER`);

    // relationships 컬럼 추가
    const relCols = new Set(this.db.prepare(`PRAGMA table_info(relationships)`).all().map(c => c.name));
    if (!relCols.has('narrative'))    safeAlter(`ALTER TABLE relationships ADD COLUMN narrative TEXT DEFAULT ''`);

    // factions 컬럼 추가
    const facCols = new Set(this.db.prepare(`PRAGMA table_info(factions)`).all().map(c => c.name));
    if (!facCols.has('parent_id'))    safeAlter(`ALTER TABLE factions ADD COLUMN parent_id INTEGER`);

    console.log('[DB] Migration complete.');
  }

  // ── Characters ────────────────────────────────────────────────────

  getCharacters() {
    const characters = this.db.prepare(`
      SELECT c.*,
        GROUP_CONCAT(f.id || ':' || f.name || ':' || f.color, '||') AS factions_raw
      FROM characters c
      LEFT JOIN character_factions cf ON cf.character_id = c.id
      LEFT JOIN factions f ON f.id = cf.faction_id
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE
    `).all();

    return characters.map(c => ({
      ...c,
      aliases: this._parseJSON(c.aliases, []),
      images: this._parseJSON(c.images, []),
      avatar_crop: this._parseJSON(c.avatar_crop, null),
      avatar_path: c.avatar_path || c.image_path || '',
      factions: this._parseFactions(c.factions_raw)
    }));
  }

  getCharacter(id) {
    const c = this.db.prepare(`SELECT * FROM characters WHERE id = ?`).get(id);
    if (!c) return null;

    c.aliases = this._parseJSON(c.aliases, []);
    c.images = this._parseJSON(c.images, []);
    c.avatar_crop = this._parseJSON(c.avatar_crop, null);
    c.avatar_path = c.avatar_path || c.image_path || '';

    c.factions = this.db.prepare(`
      SELECT f.id, f.name, f.color, cf.role
      FROM character_factions cf
      JOIN factions f ON f.id = cf.faction_id
      WHERE cf.character_id = ?
    `).all(id);

    c.relationships = this.db.prepare(`
      SELECT r.*,
        ca.name AS char_a_name,
        cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      WHERE r.char_a_id = ? OR r.char_b_id = ?
    `).all(id, id);

    return c;
  }

  createCharacter(data) {
    const { factions, aliases, images, avatar_crop, race, ...fields } = data;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    fields.aliases = JSON.stringify(aliases || []);
    fields.images = JSON.stringify(images || []);
    fields.avatar_crop = avatar_crop ? JSON.stringify(avatar_crop) : null;
    fields.created_at = now;
    fields.updated_at = now;

    const cols = Object.keys(fields);
    const placeholders = cols.map(() => '?').join(', ');
    const stmt = this.db.prepare(`
      INSERT INTO characters (${cols.join(', ')}) VALUES (${placeholders})
    `);

    const info = stmt.run(...Object.values(fields));
    const charId = info.lastInsertRowid;
    this._syncFactions(charId, factions || []);
    return this.getCharacter(charId);
  }

  updateCharacter(id, data) {
    const { factions, aliases, images, avatar_crop, race, ...fields } = data;
    if (aliases !== undefined) fields.aliases = JSON.stringify(aliases);
    if (images !== undefined) fields.images = JSON.stringify(images);
    if (avatar_crop !== undefined) fields.avatar_crop = avatar_crop ? JSON.stringify(avatar_crop) : null;
    fields.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE characters SET ${sets} WHERE id = ?`).run(...Object.values(fields), id);

    if (factions !== undefined) {
      this._syncFactions(id, factions);
    }

    return this.getCharacter(id);
  }

  deleteCharacter(id) {
    this.db.prepare(`DELETE FROM characters WHERE id = ?`).run(id);
    return { success: true };
  }

  // ── Factions ──────────────────────────────────────────────────────

  getFactions() {
    return this.db.prepare(`
      SELECT f.*, p.name AS parent_name, p.color AS parent_color
      FROM factions f
      LEFT JOIN factions p ON p.id = f.parent_id
      ORDER BY COALESCE(f.parent_id, f.id), f.parent_id IS NOT NULL, f.name COLLATE NOCASE
    `).all();
  }

  createFaction(data) {
    const stmt = this.db.prepare(`INSERT INTO factions (name, description, color, parent_id) VALUES (?, ?, ?, ?)`);
    const parentId = data.parent_id ? Number(data.parent_id) : null;
    const info = stmt.run(data.name, data.description || '', data.color || '#888888', parentId);
    return this.db.prepare(`SELECT * FROM factions WHERE id = ?`).get(info.lastInsertRowid);
  }

  updateFaction(id, data) {
    const parentId = data.parent_id ? Number(data.parent_id) : null;
    this.db.prepare(`UPDATE factions SET name = ?, description = ?, color = ?, parent_id = ? WHERE id = ?`)
      .run(data.name, data.description || '', data.color || '#888888', parentId, id);
    return this.db.prepare(`SELECT * FROM factions WHERE id = ?`).get(id);
  }

  deleteFaction(id) {
    this.db.prepare(`DELETE FROM factions WHERE id = ?`).run(id);
    return { success: true };
  }

  // ── Relationships ─────────────────────────────────────────────────

  getRelationships() {
    return this.db.prepare(`
      SELECT r.*,
        ca.name AS char_a_name,
        ca.avatar_crop AS char_a_avatar_crop,
        ca.avatar_path AS char_a_avatar_path,
        cb.name AS char_b_name,
        cb.avatar_crop AS char_b_avatar_crop,
        cb.avatar_path AS char_b_avatar_path
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      ORDER BY r.id DESC
    `).all();
  }

  getRelationshipBetween(charAId, charBId) {
    return this.db.prepare(`
      SELECT r.*,
        ca.name AS char_a_name,
        cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      WHERE (r.char_a_id = ? AND r.char_b_id = ?)
         OR (r.is_mutual = 1 AND r.char_a_id = ? AND r.char_b_id = ?)
    `).get(charAId, charBId, charBId, charAId);
  }

  createRelationship(data) {
    // 순서 정규화: 항상 작은 ID → 큰 ID 순으로 저장 (중복 방지)
    const aId = Math.min(Number(data.char_a_id), Number(data.char_b_id));
    const bId = Math.max(Number(data.char_a_id), Number(data.char_b_id));

    // 이미 있으면 업데이트
    const existing = this.db.prepare(
      `SELECT id FROM relationships WHERE char_a_id = ? AND char_b_id = ?`
    ).get(aId, bId);

    if (existing) {
      return this.updateRelationship(existing.id, { ...data, char_a_id: aId, char_b_id: bId });
    }

    const stmt = this.db.prepare(`
      INSERT INTO relationships (char_a_id, char_b_id, type, description, narrative, is_mutual)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      aId, bId,
      data.type || '',
      data.description || '',
      data.narrative || '',
      data.is_mutual ?? 1
    );
    return this.db.prepare(`
      SELECT r.*, ca.name AS char_a_name, cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      WHERE r.id = ?
    `).get(info.lastInsertRowid);
  }

  updateRelationship(id, data) {
    const aId = data.char_a_id ? Math.min(Number(data.char_a_id), Number(data.char_b_id)) : null;
    const bId = data.char_b_id ? Math.max(Number(data.char_a_id), Number(data.char_b_id)) : null;
    this.db.prepare(`
      UPDATE relationships SET char_a_id = ?, char_b_id = ?, type = ?, description = ?, narrative = ?, is_mutual = ?
      WHERE id = ?
    `).run(
      aId ?? data.char_a_id,
      bId ?? data.char_b_id,
      data.type || '',
      data.description || '',
      data.narrative || '',
      data.is_mutual ?? 1,
      id
    );
    return this.db.prepare(`
      SELECT r.*, ca.name AS char_a_name, cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      WHERE r.id = ?
    `).get(id);
  }

  deleteRelationship(id) {
    this.db.prepare(`DELETE FROM relationships WHERE id = ?`).run(id);
    return { success: true };
  }

  // ── Episodes ──────────────────────────────────────────────────────

  getEpisodes() {
    return this.db.prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.episode_id = e.id) AS char_count,
        (SELECT COUNT(*) FROM episode_extras ex WHERE ex.episode_id = e.id) AS extra_count
      FROM episodes e
      ORDER BY e.id ASC
    `).all();
  }

  getEpisode(id) {
    const ep = this.db.prepare(`SELECT * FROM episodes WHERE id = ?`).get(id);
    if (!ep) return null;

    ep.characters = this.db.prepare(`
      SELECT ec.role_type, c.id, c.name, c.gender, c.avatar_path, c.avatar_crop
      FROM episode_characters ec
      JOIN characters c ON c.id = ec.character_id
      WHERE ec.episode_id = ?
      ORDER BY ec.role_type ASC, c.name COLLATE NOCASE ASC
    `).all(id);

    ep.extras = this.db.prepare(`
      SELECT * FROM episode_extras WHERE episode_id = ? ORDER BY id ASC
    `).all(id);

    return ep;
  }

  createEpisode(data) {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const info = this.db.prepare(`
      INSERT INTO episodes (title, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(data.title, data.summary || '', now, now);
    const epId = info.lastInsertRowid;
    this._syncEpisodeChars(epId, data.characters || []);
    this._syncEpisodeExtras(epId, data.extras || []);
    return this.getEpisode(epId);
  }

  updateEpisode(id, data) {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    this.db.prepare(`
      UPDATE episodes SET title = ?, summary = ?, updated_at = ?
      WHERE id = ?
    `).run(data.title, data.summary || '', now, id);
    this._syncEpisodeChars(id, data.characters || []);
    this._syncEpisodeExtras(id, data.extras || []);
    return this.getEpisode(id);
  }

  deleteEpisode(id) {
    this.db.prepare(`DELETE FROM episodes WHERE id = ?`).run(id);
    return { success: true };
  }

  _syncEpisodeChars(epId, chars) {
    this.db.prepare(`DELETE FROM episode_characters WHERE episode_id = ?`).run(epId);
    const ins = this.db.prepare(`INSERT INTO episode_characters (episode_id, character_id, role_type) VALUES (?, ?, ?)`);
    for (const c of chars) {
      ins.run(epId, c.character_id, c.role_type || 'main');
    }
  }

  _syncEpisodeExtras(epId, extras) {
    this.db.prepare(`DELETE FROM episode_extras WHERE episode_id = ?`).run(epId);
    const ins = this.db.prepare(`INSERT INTO episode_extras (episode_id, name, description, gender) VALUES (?, ?, ?, ?)`);
    for (const ex of extras) {
      ins.run(epId, ex.name, ex.description || '', ex.gender || '');
    }
  }

  // ── Graph ──────────────────────────────────────────────────────────

  getGraphData() {
    const chars = this.db.prepare(`
      SELECT c.id, c.name,
        GROUP_CONCAT(f.id || ':' || f.name || ':' || f.color, '||') AS factions_raw
      FROM characters c
      LEFT JOIN character_factions cf ON cf.character_id = c.id
      LEFT JOIN factions f ON f.id = cf.faction_id
      GROUP BY c.id
    `).all();

    const nodes = chars.map(c => {
      const factions = this._parseFactions(c.factions_raw);
      return {
        id: c.id,
        name: c.name,
        factions,
        color: factions.length > 0 ? factions[0].color : '#888888'
      };
    });

    const edges = this.db.prepare(`
      SELECT r.*, ca.name AS char_a_name, cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
    `).all();

    return { nodes, edges };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  _parseJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  _parseFactions(raw) {
    if (!raw) return [];
    return raw.split('||').map(part => {
      const [id, name, color] = part.split(':');
      return { id: Number(id), name, color: color || '#888888' };
    });
  }

  _syncFactions(charId, factions) {
    this.db.prepare(`DELETE FROM character_factions WHERE character_id = ?`).run(charId);
    const insert = this.db.prepare(`INSERT INTO character_factions (character_id, faction_id, role) VALUES (?, ?, ?)`);
    for (const f of factions) {
      insert.run(charId, f.faction_id, f.role || '');
    }
  }
}

module.exports = Database;
