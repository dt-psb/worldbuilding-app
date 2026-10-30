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
        status TEXT DEFAULT 'alive',
        status_custom TEXT DEFAULT '',
        color_palette TEXT DEFAULT '[]',
        extra_profiles TEXT DEFAULT '[]',
        custom_sections TEXT DEFAULT '[]',
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
        color TEXT DEFAULT '',
        type_b_to_a TEXT DEFAULT '',
        color_b_to_a TEXT DEFAULT '',
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
    if (!charCols.has('status'))      safeAlter(`ALTER TABLE characters ADD COLUMN status TEXT DEFAULT 'alive'`);
    if (!charCols.has('status_custom')) safeAlter(`ALTER TABLE characters ADD COLUMN status_custom TEXT DEFAULT ''`);
    if (!charCols.has('color_palette')) safeAlter(`ALTER TABLE characters ADD COLUMN color_palette TEXT DEFAULT '[]'`);
    if (!charCols.has('extra_profiles')) safeAlter(`ALTER TABLE characters ADD COLUMN extra_profiles TEXT DEFAULT '[]'`);
    if (!charCols.has('custom_sections')) safeAlter(`ALTER TABLE characters ADD COLUMN custom_sections TEXT DEFAULT '[]'`);

    // 기존 profile_secret 데이터가 있고 extra_profiles가 비어있으면 안전하게 '비밀 프로필' 항목으로 자동 이전
    try {
      const charsWithSecret = this.db.prepare(`SELECT id, profile_secret, extra_profiles FROM characters WHERE profile_secret IS NOT NULL AND TRIM(profile_secret) != ''`).all();
      for (const row of charsWithSecret) {
        const existingExtras = this._parseJSON(row.extra_profiles, []);
        if (existingExtras.length === 0) {
          existingExtras.push({ id: 'migrated_secret', title: '비밀 프로필 🔒', content: row.profile_secret });
          this.db.prepare(`UPDATE characters SET extra_profiles = ? WHERE id = ?`).run(JSON.stringify(existingExtras), row.id);
        }
      }
    } catch (e) {
      console.warn('[DB] Secret profile migration skipped:', e);
    }

    // relationships 컬럼 추가
    const relCols = new Set(this.db.prepare(`PRAGMA table_info(relationships)`).all().map(c => c.name));
    if (!relCols.has('narrative'))    safeAlter(`ALTER TABLE relationships ADD COLUMN narrative TEXT DEFAULT ''`);
    if (!relCols.has('color'))        safeAlter(`ALTER TABLE relationships ADD COLUMN color TEXT DEFAULT ''`);
    if (!relCols.has('type_b_to_a'))  safeAlter(`ALTER TABLE relationships ADD COLUMN type_b_to_a TEXT DEFAULT ''`);
    if (!relCols.has('color_b_to_a')) safeAlter(`ALTER TABLE relationships ADD COLUMN color_b_to_a TEXT DEFAULT ''`);

    // factions 컬럼 추가
    const facCols = new Set(this.db.prepare(`PRAGMA table_info(factions)`).all().map(c => c.name));
    if (!facCols.has('parent_id'))    safeAlter(`ALTER TABLE factions ADD COLUMN parent_id INTEGER`);

    console.log('[DB] Migration complete.');
  }

  // ── Characters ────────────────────────────────────────────────────

  getCharacters() {
    const characters = this.db.prepare(`
      SELECT c.*,
        GROUP_CONCAT(f.id || ':' || f.name || ':' || f.color, '||') AS factions_raw,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.character_id = c.id AND ec.role_type IN ('main', 'sub')) AS episode_count,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.character_id = c.id AND ec.role_type = 'main') AS main_count,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.character_id = c.id AND ec.role_type = 'sub') AS sub_count,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.character_id = c.id AND ec.role_type = 'mentioned') AS mentioned_count
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
      color_palette: this._parseJSON(c.color_palette, []),
      status: c.status || 'alive',
      status_custom: c.status_custom || '',
      extra_profiles: this._parseJSON(c.extra_profiles, []),
      custom_sections: this._parseJSON(c.custom_sections, []),
      factions: this._parseFactions(c.factions_raw),
      episode_count: Number(c.episode_count || 0),
      main_count: Number(c.main_count || 0),
      sub_count: Number(c.sub_count || 0)
    }));
  }

  getCharacter(id) {
    const c = this.db.prepare(`SELECT * FROM characters WHERE id = ?`).get(id);
    if (!c) return null;

    c.aliases = this._parseJSON(c.aliases, []);
    c.images = this._parseJSON(c.images, []);
    c.avatar_crop = this._parseJSON(c.avatar_crop, null);
    c.avatar_path = c.avatar_path || c.image_path || '';
    c.color_palette = this._parseJSON(c.color_palette, []);
    c.status = c.status || 'alive';
    c.status_custom = c.status_custom || '';
    c.extra_profiles = this._parseJSON(c.extra_profiles, []);
    c.custom_sections = this._parseJSON(c.custom_sections, []);

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

    c.episodes = this.db.prepare(`
      SELECT e.id, e.title, ec.role_type, e.created_at
      FROM episode_characters ec
      JOIN episodes e ON e.id = ec.episode_id
      WHERE ec.character_id = ?
      ORDER BY e.id DESC
    `).all(id);

    c.episode_count = c.episodes.filter(e => e.role_type !== 'mentioned').length;

    return c;
  }

  getSharedEpisodes(charAId, charBId) {
    return this.db.prepare(`
      SELECT e.id, e.title, e.summary, ec1.role_type AS char_a_role, ec2.role_type AS char_b_role
      FROM episodes e
      JOIN episode_characters ec1 ON ec1.episode_id = e.id AND ec1.character_id = ?
      JOIN episode_characters ec2 ON ec2.episode_id = e.id AND ec2.character_id = ?
      ORDER BY e.id DESC
    `).all(charAId, charBId);
  }

  createCharacter(data) {
    const { factions, aliases, images, avatar_crop, color_palette, extra_profiles, custom_sections, race, ...fields } = data;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    fields.aliases = JSON.stringify(aliases || []);
    fields.images = JSON.stringify(images || []);
    fields.avatar_crop = avatar_crop ? JSON.stringify(avatar_crop) : null;
    fields.color_palette = JSON.stringify(color_palette || []);
    fields.extra_profiles = JSON.stringify(extra_profiles || []);
    fields.custom_sections = JSON.stringify(custom_sections || []);
    fields.status = data.status || 'alive';
    fields.status_custom = data.status_custom || '';
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
    const { factions, aliases, images, avatar_crop, color_palette, extra_profiles, custom_sections, race, ...fields } = data;
    if (aliases !== undefined) fields.aliases = JSON.stringify(aliases);
    if (images !== undefined) fields.images = JSON.stringify(images);
    if (avatar_crop !== undefined) fields.avatar_crop = avatar_crop ? JSON.stringify(avatar_crop) : null;
    if (color_palette !== undefined) fields.color_palette = JSON.stringify(color_palette || []);
    if (extra_profiles !== undefined) fields.extra_profiles = JSON.stringify(extra_profiles || []);
    if (custom_sections !== undefined) fields.custom_sections = JSON.stringify(custom_sections || []);
    if (data.status !== undefined) fields.status = data.status || 'alive';
    if (data.status_custom !== undefined) fields.status_custom = data.status_custom || '';
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
    const a = Number(charAId);
    const b = Number(charBId);
    return this.db.prepare(`
      SELECT r.*,
        ca.name AS char_a_name,
        cb.name AS char_b_name
      FROM relationships r
      JOIN characters ca ON ca.id = r.char_a_id
      JOIN characters cb ON cb.id = r.char_b_id
      WHERE (r.char_a_id = ? AND r.char_b_id = ?)
         OR (r.char_a_id = ? AND r.char_b_id = ?)
    `).get(a, b, b, a);
  }

  createRelationship(data) {
    const aId = Number(data.char_a_id);
    const bId = Number(data.char_b_id);

    // 이미 두 캐릭터 사이에 관계가 존재하는지 확인
    const existing = this.db.prepare(
      `SELECT * FROM relationships WHERE (char_a_id = ? AND char_b_id = ?) OR (char_a_id = ? AND char_b_id = ?)`
    ).get(aId, bId, bId, aId);

    if (existing) {
      return this.updateRelationship(existing.id, data);
    }

    const stmt = this.db.prepare(`
      INSERT INTO relationships (char_a_id, char_b_id, type, color, type_b_to_a, color_b_to_a, description, narrative, is_mutual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      aId, bId,
      data.type || '',
      data.color || '',
      data.type_b_to_a || '',
      data.color_b_to_a || '',
      data.description || '',
      data.narrative || '',
      data.is_mutual != null ? (data.is_mutual ? 1 : 0) : 1
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
    const existing = this.db.prepare(`SELECT * FROM relationships WHERE id = ?`).get(id);
    if (!existing) return null;

    let type = data.type !== undefined ? (data.type || '') : existing.type;
    let color = data.color !== undefined ? (data.color || '') : existing.color;
    let typeBtoA = data.type_b_to_a !== undefined ? (data.type_b_to_a || '') : (existing.type_b_to_a || '');
    let colorBtoA = data.color_b_to_a !== undefined ? (data.color_b_to_a || '') : (existing.color_b_to_a || '');

    // 만약 data에서 char_a_id와 char_b_id가 제공되었는데 기존 행과 방향이 반대라면 스왑 매핑
    if (data.char_a_id && data.char_b_id) {
      const reqA = Number(data.char_a_id);
      const reqB = Number(data.char_b_id);
      if (reqA === existing.char_b_id && reqB === existing.char_a_id) {
        type = data.type_b_to_a !== undefined ? (data.type_b_to_a || '') : (data.type || '');
        color = data.color_b_to_a !== undefined ? (data.color_b_to_a || '') : (data.color || '');
        typeBtoA = data.type !== undefined ? (data.type || '') : (data.type_b_to_a || '');
        colorBtoA = data.color !== undefined ? (data.color || '') : (data.color_b_to_a || '');
      } else if (reqA === existing.char_a_id && reqB === existing.char_b_id) {
        type = data.type || '';
        color = data.color || '';
        typeBtoA = data.type_b_to_a || '';
        colorBtoA = data.color_b_to_a || '';
      }
    }

    this.db.prepare(`
      UPDATE relationships 
      SET type = ?, color = ?, type_b_to_a = ?, color_b_to_a = ?, description = ?, narrative = ?, is_mutual = ?
      WHERE id = ?
    `).run(
      type,
      color,
      typeBtoA,
      colorBtoA,
      data.description !== undefined ? data.description : existing.description,
      data.narrative !== undefined ? data.narrative : existing.narrative,
      data.is_mutual !== undefined ? (data.is_mutual ? 1 : 0) : existing.is_mutual,
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
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.episode_id = e.id AND ec.role_type IN ('main', 'sub')) AS char_count,
        (SELECT COUNT(*) FROM episode_characters ec WHERE ec.episode_id = e.id AND ec.role_type = 'mentioned') AS mentioned_count,
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
