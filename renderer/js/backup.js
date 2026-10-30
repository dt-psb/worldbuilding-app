/* ── backup.js: Obsidian Vault Export & Database Backup/Restore ── */
'use strict';

const Backup = (() => {
  let dbInfo = null;
  let snapshots = [];

  async function render() {
    await loadDbInfo();
    await loadSnapshots();
    restoreSavedObsidianDir();
  }

  function restoreSavedObsidianDir() {
    const saved = localStorage.getItem('wb_obsidian_dir');
    const input = document.getElementById('obsidian-target-dir');
    if (saved && input) {
      input.value = saved;
    }
  }

  async function loadDbInfo() {
    try {
      dbInfo = await window.api.getDbInfo();
      const pathEl = document.getElementById('lbl-db-path');
      const sizeEl = document.getElementById('lbl-db-size');
      if (pathEl) pathEl.textContent = dbInfo?.path || '알 수 없음';
      if (sizeEl) sizeEl.textContent = dbInfo?.sizeFormatted || '0 B';
    } catch (err) {
      console.error('Failed to load DB info:', err);
    }
  }

  async function loadSnapshots() {
    const container = document.getElementById('snapshot-list-container');
    if (!container) return;

    try {
      snapshots = await window.api.listSnapshots();
      if (!snapshots || snapshots.length === 0) {
        container.innerHTML = `
          <div class="text-muted" style="padding:18px 12px;text-align:center;font-size:12px;">
            아직 생성된 자동 백업 스냅샷이 없습니다.<br>
            위의 <strong>[⚡ 즉시 자동 스냅샷 생성]</strong> 버튼을 눌러 스냅샷을 만들어보세요.
          </div>
        `;
        return;
      }

      container.innerHTML = snapshots.map(s => {
        const dateStr = new Date(s.mtime).toLocaleString();
        return `
          <div class="snapshot-item">
            <div class="snapshot-item-info">
              <span class="snapshot-item-name" title="${escHtml(s.filename)}">${escHtml(s.filename)}</span>
              <span class="snapshot-item-meta">${dateStr} · ${s.sizeFormatted}</span>
            </div>
            <button type="button" class="btn-secondary btn-xs btn-restore-snap" data-path="${escHtml(s.path)}" data-name="${escHtml(s.filename)}">
              이 시점으로 복원
            </button>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-restore-snap').forEach(btn => {
        btn.addEventListener('click', async () => {
          const snapPath = btn.dataset.path;
          const snapName = btn.dataset.name;
          const confirmed = await App.confirm(`정말 [${snapName}] 시점으로 현재 데이터를 되돌리시겠습니까?\n복원 전 현재 데이터는 임시 보관됩니다.`);
          if (!confirmed) return;

          try {
            await window.api.restoreFromPath(snapPath);
            await App.loadAll();
            await render();
            App.showToast(`✅ [${snapName}] 시점으로 복원 완료되었습니다.`);
          } catch (err) {
            console.error('Restore error:', err);
            App.showToast('❌ 복원 실패: ' + err.message);
          }
        });
      });
    } catch (err) {
      console.error('Failed to list snapshots:', err);
      container.innerHTML = `<div class="text-muted" style="padding:10px;color:var(--danger);">스냅샷 목록 조회 실패</div>`;
    }
  }

  // ── 옵시디언 볼트 내보내기 ──
  async function selectObsidianDir() {
    try {
      const dir = await window.api.selectDirectory();
      if (!dir) return;
      document.getElementById('obsidian-target-dir').value = dir;
      localStorage.setItem('wb_obsidian_dir', dir);
    } catch (err) {
      console.error('Select dir error:', err);
    }
  }

  async function exportToObsidian() {
    const dir = document.getElementById('obsidian-target-dir')?.value.trim();
    if (!dir) {
      App.showToast('❗ 먼저 내보낼 옵시디언 볼트 폴더를 선택해주세요.');
      return;
    }

    try {
      App.showToast('⏳ 옵시디언 볼트 생성 중...');
      const result = await window.api.exportObsidianVault(dir);
      if (result && result.success) {
        App.showToast(`🎉 옵시디언 볼트 내보내기 완료!\n(인물 ${result.exportedChars}명, 관계 서사 ${result.exportedRels}개, 에피소드 ${result.exportedEps}화, 세력 ${result.exportedFacs}개)`);
      }
    } catch (err) {
      console.error('Export vault error:', err);
      App.showToast('❌ 볼트 내보내기 오류: ' + err.message);
    }
  }

  // ── 수동 백업 저장 ──
  async function backupToFile() {
    try {
      const targetPath = await window.api.saveBackupFile();
      if (!targetPath) return;

      await window.api.backupToFile(targetPath);
      App.showToast('💾 DB 백업 파일이 안전하게 저장되었습니다.');
    } catch (err) {
      console.error('Manual backup error:', err);
      App.showToast('❌ 백업 파일 저장 오류: ' + err.message);
    }
  }

  // ── 즉시 스냅샷 생성 ──
  async function createSnapshot() {
    try {
      const snap = await window.api.createSnapshot();
      await loadSnapshots();
      await loadDbInfo();
      App.showToast(`⚡ 안전 스냅샷 [${snap.filename}] 생성 완료!`);
    } catch (err) {
      console.error('Create snapshot error:', err);
      App.showToast('❌ 스냅샷 생성 오류: ' + err.message);
    }
  }

  // ── 백업 파일 열어서 복원 ──
  async function restoreFromFile() {
    try {
      const filePath = await window.api.openBackupFile();
      if (!filePath) return;

      const confirmed = await App.confirm('정말 선택한 백업 DB 파일로 현재 데이터를 덮어쓰시겠습니까?\n작업 전 현재 상태는 안전하게 임시 백업됩니다.');
      if (!confirmed) return;

      await window.api.restoreFromPath(filePath);
      await App.loadAll();
      await render();
      App.showToast('📥 데이터베이스가 성공적으로 복원되었습니다!');
    } catch (err) {
      console.error('Restore file error:', err);
      App.showToast('❌ 복원 오류: ' + err.message);
    }
  }

  // ── JSON 내보내기 / 가져오기 ──
  async function exportJSON() {
    try {
      const targetPath = await window.api.saveJsonFile();
      if (!targetPath) return;

      const res = await window.api.exportJSON(targetPath);
      App.showToast(`📤 JSON 데이터 내보내기 완료! (인물 ${res.characterCount}명, 관계 ${res.relationshipCount}개)`);
    } catch (err) {
      console.error('JSON export error:', err);
      App.showToast('❌ JSON 내보내기 실패: ' + err.message);
    }
  }

  async function importJSON() {
    try {
      const jsonPath = await window.api.openJsonFile();
      if (!jsonPath) return;

      const confirmed = await App.confirm('선택한 JSON 파일의 데이터를 현재 데이터베이스로 병합/가져오기 하시겠습니까?');
      if (!confirmed) return;

      await window.api.importJSON(jsonPath);
      await App.loadAll();
      await render();
      App.showToast('📥 JSON 데이터 가져오기 완료!');
    } catch (err) {
      console.error('JSON import error:', err);
      App.showToast('❌ JSON 가져오기 실패: ' + err.message);
    }
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function initEvents() {
    document.getElementById('btn-select-obsidian-dir')?.addEventListener('click', selectObsidianDir);
    document.getElementById('btn-export-obsidian')?.addEventListener('click', exportToObsidian);

    document.getElementById('btn-manual-backup')?.addEventListener('click', backupToFile);
    document.getElementById('btn-create-snapshot')?.addEventListener('click', createSnapshot);
    document.getElementById('btn-restore-backup')?.addEventListener('click', restoreFromFile);
    document.getElementById('btn-refresh-snapshots')?.addEventListener('click', loadSnapshots);

    document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
    document.getElementById('btn-import-json')?.addEventListener('click', importJSON);
  }

  document.addEventListener('DOMContentLoaded', initEvents);

  return { render };
})();

window.Backup = Backup;
