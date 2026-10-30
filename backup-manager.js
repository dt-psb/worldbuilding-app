/* ── backup-manager.js: Local SQLite Snapshot & JSON Backup ── */
'use strict';

const fs = require('fs');
const path = require('path');

class BackupManager {
  static getBackupsDir(userDataPath) {
    const dir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static getDbInfo(dbPath) {
    try {
      if (!fs.existsSync(dbPath)) return null;
      const stat = fs.statSync(dbPath);
      return {
        path: dbPath,
        size: stat.size,
        sizeFormatted: this.formatBytes(stat.size),
        mtime: stat.mtime
      };
    } catch (err) {
      console.error('Failed to get DB info:', err);
      return null;
    }
  }

  static formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static createSnapshot(dbPath, userDataPath) {
    if (!fs.existsSync(dbPath)) throw new Error('현재 DB 파일이 존재하지 않습니다.');
    const backupsDir = this.getBackupsDir(userDataPath);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const targetName = `worldbuilding_snapshot_${timestamp}.db`;
    const targetPath = path.join(backupsDir, targetName);

    fs.copyFileSync(dbPath, targetPath);

    // 오래된 백업 파일 정리 (최근 15개만 유지)
    this.cleanOldSnapshots(backupsDir, 15);

    return {
      filename: targetName,
      path: targetPath,
      timestamp: now.toISOString()
    };
  }

  static listSnapshots(userDataPath) {
    const backupsDir = this.getBackupsDir(userDataPath);
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db'));

    const list = files.map(filename => {
      const filePath = path.join(backupsDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        path: filePath,
        size: stat.size,
        sizeFormatted: this.formatBytes(stat.size),
        mtime: stat.mtime
      };
    });

    // 최신순 정렬
    list.sort((a, b) => b.mtime - a.mtime);
    return list;
  }

  static cleanOldSnapshots(backupsDir, maxKeep = 15) {
    try {
      const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db'));
      if (files.length <= maxKeep) return;

      const fileStats = files.map(f => ({
        name: f,
        mtime: fs.statSync(path.join(backupsDir, f)).mtime
      }));

      fileStats.sort((a, b) => a.mtime - b.mtime); // 오래된 순

      const toDelete = fileStats.slice(0, files.length - maxKeep);
      for (const item of toDelete) {
        fs.unlinkSync(path.join(backupsDir, item.name));
      }
    } catch (err) {
      console.warn('Failed to clean old snapshots:', err);
    }
  }

  static backupToFile(dbPath, targetFilePath) {
    if (!fs.existsSync(dbPath)) throw new Error('현재 DB 파일이 존재하지 않습니다.');
    fs.copyFileSync(dbPath, targetFilePath);
    return true;
  }

  static restoreDatabase(currentDbInstance, dbPath, backupFilePath, DatabaseClass) {
    if (!fs.existsSync(backupFilePath)) {
      throw new Error('복원할 백업 파일이 존재하지 않습니다: ' + backupFilePath);
    }

    // 1. 기존 커넥션 안전 닫기
    if (currentDbInstance && currentDbInstance.db) {
      try {
        currentDbInstance.db.close();
      } catch (e) {
        console.warn('DB close error during restore:', e);
      }
    }

    // 2. 비상용 임시 복구 파일 생성
    const tempBackup = dbPath + '.pre_restore';
    try {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, tempBackup);
      }
    } catch (e) {}

    // 3. 파일 덮어쓰기
    try {
      fs.copyFileSync(backupFilePath, dbPath);
    } catch (err) {
      // 롤백 시도
      if (fs.existsSync(tempBackup)) {
        fs.copyFileSync(tempBackup, dbPath);
      }
      throw new Error('백업 파일 복사 실패: ' + err.message);
    }

    // 4. 새 DB 인스턴스 오픈
    const newDb = new DatabaseClass(dbPath);
    return newDb;
  }

  static exportJSON(db, targetFilePath) {
    const characters = db.getCharacters();
    const relationships = db.getRelationships();
    const episodes = db.getEpisodes();
    const factions = db.getFactions();

    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      characters,
      relationships,
      episodes,
      factions
    };

    fs.writeFileSync(targetFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return {
      characterCount: characters.length,
      relationshipCount: relationships.length,
      episodeCount: episodes.length,
      factionCount: factions.length
    };
  }

  static importJSON(db, jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) throw new Error('파일이 존재하지 않습니다.');
    const raw = fs.readFileSync(jsonFilePath, 'utf-8');
    const data = JSON.parse(raw);

    // 트랜잭션으로 가져오기
    const transaction = db.db.transaction(() => {
      // 기존 데이터 유지 또는 업데이트 (ID 매핑)
      if (Array.isArray(data.factions)) {
        for (const f of data.factions) {
          const exists = db.db.prepare('SELECT id FROM factions WHERE id = ?').get(f.id);
          if (!exists) {
            db.db.prepare(`
              INSERT INTO factions (id, name, description, color, parent_id)
              VALUES (?, ?, ?, ?, ?)
            `).run(f.id, f.name, f.description || '', f.color || '#888888', f.parent_id || null);
          }
        }
      }

      if (Array.isArray(data.characters)) {
        for (const c of data.characters) {
          const exists = db.db.prepare('SELECT id FROM characters WHERE id = ?').get(c.id);
          if (!exists) {
            db.db.prepare(`
              INSERT INTO characters (id, name, age, gender, appearance, personality, background, secret, prompt, image_path, avatar_path, avatar_crop, images, height)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              c.id, c.name, c.age, c.gender,
              c.appearance || '', c.personality || '', c.background || '', c.secret || '', c.prompt || '',
              c.image_path || null, c.avatar_path || null, c.avatar_crop || null,
              typeof c.images === 'string' ? c.images : JSON.stringify(c.images || []),
              c.height || null
            );

            // 세력 연결
            if (Array.isArray(c.factions)) {
              for (const fac of c.factions) {
                db.db.prepare(`
                  INSERT OR IGNORE INTO character_factions (character_id, faction_id)
                  VALUES (?, ?)
                `).run(c.id, fac.id);
              }
            }
          }
        }
      }

      if (Array.isArray(data.relationships)) {
        for (const r of data.relationships) {
          const exists = db.db.prepare('SELECT id FROM relationships WHERE id = ?').get(r.id);
          if (!exists) {
            db.db.prepare(`
              INSERT INTO relationships (id, char_a_id, char_b_id, type, color, type_b_to_a, color_b_to_a, description, narrative, is_mutual)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              r.id, r.char_a_id, r.char_b_id,
              r.type || '', r.color || '', r.type_b_to_a || '', r.color_b_to_a || '',
              r.description || '', r.narrative || '', r.is_mutual ?? 1
            );
          }
        }
      }

      if (Array.isArray(data.episodes)) {
        for (const e of data.episodes) {
          const exists = db.db.prepare('SELECT id FROM episodes WHERE id = ?').get(e.id);
          if (!exists) {
            db.db.prepare(`
              INSERT INTO episodes (id, title, summary, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(e.id, e.title, e.summary || '', e.created_at, e.updated_at);
          }
        }
      }
    });

    transaction();
    return true;
  }
}

module.exports = BackupManager;
