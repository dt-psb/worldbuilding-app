/* ── obsidian-exporter.js: Export Database into an Obsidian Markdown Vault ── */
'use strict';

const fs = require('fs');
const path = require('path');

class ObsidianExporter {
  static sanitizeFilename(name) {
    if (!name) return 'Untitled';
    return String(name).replace(/[/\\?%*:|"<>]/g, '_').trim();
  }

  static exportVault(db, targetDir) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const charsDir = path.join(targetDir, 'Characters');
    const relsDir = path.join(targetDir, 'Relationships');
    const epsDir = path.join(targetDir, 'Episodes');
    const facsDir = path.join(targetDir, 'Factions');

    [charsDir, relsDir, epsDir, facsDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    const characters = db.getCharacters();
    const relationships = db.getRelationships();
    const episodes = db.getEpisodes();
    const factions = db.getFactions();

    let exportedChars = 0;
    let exportedRels = 0;
    let exportedEps = 0;
    let exportedFacs = 0;

    // ── 1. Characters ──
    for (const c of characters) {
      // 캐릭터 상세 정보(에피소드, 관계 포함)
      const detail = db.getCharacter(c.id);
      const filename = this.sanitizeFilename(c.name) + '.md';
      const filepath = path.join(charsDir, filename);

      const factionLinks = (c.factions || []).map(f => `  - "[[${this.sanitizeFilename(f.name)}]]"`).join('\n');
      const factionsText = (c.factions || []).map(f => `[[${this.sanitizeFilename(f.name)}]]`).join(', ') || '무소속';

      let statusLabel = '생존 / 활동 중';
      if (c.status === 'deceased') statusLabel = '사망 (스토리 시작 전)';
      else if (c.status === 'comatose') statusLabel = '의식불명';
      else if (c.status === 'missing') statusLabel = '행방불명';
      else if (c.status === 'custom') statusLabel = c.status_custom || '기타';

      const paletteList = Array.isArray(c.color_palette) ? c.color_palette : [];
      const paletteYaml = paletteList.map(p => `  - name: "${p.name || ''}"\n    hex: "${p.hex || ''}"`).join('\n');
      const paletteMd = paletteList.length > 0
        ? paletteList.map(p => `- \`${p.hex}\` ${p.name ? `**${p.name}**` : ''}`).join('\n')
        : '_등록된 팔레트가 없습니다._';

      const extraProfiles = Array.isArray(c.extra_profiles) ? c.extra_profiles : [];
      let extraProfilesMd = '';
      if (extraProfiles.length > 0) {
        extraProfilesMd = extraProfiles.map(ep => `
### 📜 ${ep.title || '추가 프로필'}
${ep.content || '_내용 없음_'}
`).join('\n');
      }

      const customSections = Array.isArray(c.custom_sections) ? c.custom_sections : [];
      let customSectionsMd = '';
      if (customSections.length > 0) {
        customSectionsMd = customSections.map(cs => `
### 📂 ${cs.title || '추가 항목'}
${cs.content || '_내용 없음_'}
`).join('\n');
      }

      let relsSection = '';
      if (detail && detail.relationships && detail.relationships.length > 0) {
        relsSection = detail.relationships.map(r => {
          const isA = (r.char_a_id === c.id);
          const otherName = isA ? r.char_b_name : r.char_a_name;
          const otherLink = `[[${this.sanitizeFilename(otherName)}]]`;

          if (r.is_mutual) {
            return `- ⟷ ${otherLink}: **${r.type || '관계'}** ${r.description ? `(${r.description})` : ''}`;
          } else {
            const myRel = isA ? r.type : r.type_b_to_a;
            const theirRel = isA ? r.type_b_to_a : r.type;
            const parts = [];
            if (myRel) parts.push(`➔ **${myRel}**`);
            if (theirRel) parts.push(`(상대방 ⬅ ${theirRel})`);
            return `- ${otherLink}: ${parts.join(' ')} ${r.description ? `— ${r.description}` : ''}`;
          }
        }).join('\n');
      } else {
        relsSection = '_등록된 관계가 없습니다._';
      }

      let epsSection = '';
      if (detail && detail.episodes && detail.episodes.length > 0) {
        epsSection = detail.episodes.map(e => {
          const epLink = `[[${this.sanitizeFilename(e.title)}]]`;
          const roleLabel = e.role_type === 'main' ? '주연' : '조연';
          return `- ${epLink} (${roleLabel})`;
        }).join('\n');
      } else {
        epsSection = '_출연한 에피소드가 없습니다._';
      }

      const content = `---
name: "${c.name}"
aliases:
  - "${c.name}"
type: character
status: "${statusLabel}"
age: ${c.age != null ? c.age : 'null'}
gender: "${c.gender || ''}"
height: ${c.height != null ? c.height : 'null'}
factions:
${factionLinks || '  - "무소속"'}
${c.avatar_path ? `avatar: "${c.avatar_path.replace(/\\/g, '/')}"` : ''}
${paletteYaml ? `color_palette:\n${paletteYaml}` : ''}
---

# ${c.name}

> [!INFO] 인물 정보
> - **상태**: ${statusLabel}
> - **신상**: ${c.age != null ? c.age + '세' : '나이 미상'} / ${c.gender || '성별 미상'} / ${c.height != null ? c.height + 'cm' : '키 미상'}
> - **소속 세력**: ${factionsText}

---

## 🎨 컬러 팔레트
${paletteMd}

## 📜 프로필
### 메인 프로필
${c.profile_public || '_등록된 메인 프로필 내용이 없습니다._'}
${extraProfilesMd}
${customSectionsMd ? `## 📂 그 외 정보\n${customSectionsMd}` : ''}

${c.prompt ? `
## 🎨 AI 이미지 프롬프트
\`\`\`text
${c.prompt}
\`\`\`
` : ''}

## 🔗 관계망
${relsSection}

## 🎬 출연 에피소드
${epsSection}
`;

      fs.writeFileSync(filepath, content.trim() + '\n', 'utf-8');
      exportedChars++;
    }

    // ── 2. Relationships ──
    for (const r of relationships) {
      const nameA = this.sanitizeFilename(r.char_a_name);
      const nameB = this.sanitizeFilename(r.char_b_name);
      const filename = `[${nameA}] - [${nameB}].md`;
      const filepath = path.join(relsDir, filename);

      const narrativeText = r.narrative || r.description || '_등록된 서사 내용이 없습니다._';

      const content = `---
char_a: "[[${nameA}]]"
char_b: "[[${nameB}]]"
type: "${r.type || '관계'}"
is_mutual: ${r.is_mutual ? true : false}
${r.type_b_to_a ? `type_b_to_a: "${r.type_b_to_a}"` : ''}
---

# [[${nameA}]] ⟷ [[${nameB}]] 관계 서사

> [!NOTE] 관계 개요
> - **방식**: ${r.is_mutual ? '⟷ 양방향 상호 관계' : '➔ 단방향 개별 관계'}
> - **관계 명칭**: ${r.is_mutual ? r.type : `${nameA}➔${nameB}: ${r.type || '(무관)'} / ${nameB}➔${nameA}: ${r.type_b_to_a || '(무관)'}`}
> ${r.description ? `- **한줄 메모**: ${r.description}` : ''}

---

## 📖 관계 서사 본문 (스토리)

${narrativeText}
`;

      fs.writeFileSync(filepath, content.trim() + '\n', 'utf-8');
      exportedRels++;
    }

    // ── 3. Episodes ──
    for (const ep of episodes) {
      const detail = db.getEpisode(ep.id);
      const filename = this.sanitizeFilename(ep.title) + '.md';
      const filepath = path.join(epsDir, filename);

      const mainChars = (detail?.characters || []).filter(c => c.role_type === 'main');
      const subChars  = (detail?.characters || []).filter(c => c.role_type === 'sub');
      const mentionedChars = (detail?.characters || []).filter(c => c.role_type === 'mentioned');
      const extras    = (detail?.extras || []);

      const mainLinks = mainChars.map(c => `- [[${this.sanitizeFilename(c.name)}]]`).join('\n') || '- 없음';
      const subLinks  = subChars.map(c => `- [[${this.sanitizeFilename(c.name)}]]`).join('\n') || '- 없음';
      const mentionedLinks = mentionedChars.map(c => `- [[${this.sanitizeFilename(c.name)}]]`).join('\n') || '- 없음';
      const extraList = extras.map(ex => `- **${ex.name}** ${ex.description ? `(${ex.description})` : ''}`).join('\n') || '- 없음';

      const content = `---
episode_id: ${ep.id}
title: "${ep.title}"
type: episode
created_at: "${ep.created_at}"
---

# ${ep.title}

## 📝 사건 요약 (줄거리)
${ep.summary || '_에피소드 요약 내용이 없습니다._'}

---

## 🎭 등장 인물
### 🌟 주연 (Main)
${mainLinks}

### 👥 조연 (Sub)
${subLinks}

### 💬 언급된 인물 (Mentioned)
${mentionedLinks}

### 🏷️ 엑스트라 / 단역 (Extra)
${extraList}
`;

      fs.writeFileSync(filepath, content.trim() + '\n', 'utf-8');
      exportedEps++;
    }

    // ── 4. Factions ──
    for (const f of factions) {
      const filename = this.sanitizeFilename(f.name) + '.md';
      const filepath = path.join(facsDir, filename);

      const members = characters.filter(c => c.factions && c.factions.some(fac => fac.id === f.id));
      const memberLinks = members.map(m => `- [[${this.sanitizeFilename(m.name)}]] (${m.age != null ? m.age + '세' : ''} ${m.gender || ''})`).join('\n') || '- 소속 인물 없음';

      const content = `---
name: "${f.name}"
color: "${f.color || '#888888'}"
type: faction
${f.parent_id ? `parent_id: ${f.parent_id}` : ''}
---

# ${f.name}

> [!INFO] 세력 정보
> - **대표 색상**: \`${f.color || '#888888'}\`
> - **소속 인원**: ${members.length}명

## 📜 세력 설명 & 설정
${f.description || '_세력 설명이 없습니다._'}

---

## 👥 소속 캐릭터 목록
${memberLinks}
`;

      fs.writeFileSync(filepath, content.trim() + '\n', 'utf-8');
      exportedFacs++;
    }

    // ── 5. Home Dashboard (_WorldBuilding_Home.md) ──
    const homeContent = `---
type: dashboard
updated: "${new Date().toISOString()}"
---

# 🌍 세계관 대시보드 (WorldBuilding Vault)

> **WorldBuilding App**에서 자동으로 내보낸 옵시디언 볼트입니다.  
> 옵시디언의 **Graph View (그래프 뷰)**를 열면 인물, 관계, 세력, 에피소드 간의 연결망을 시각적으로 확인하실 수 있습니다.

---

### 📂 볼트 구조 바로가기
- **인물 (Characters)**: 총 ${exportedChars}명
- **관계 서사 (Relationships)**: 총 ${exportedRels}개
- **에피소드 (Episodes)**: 총 ${exportedEps}화
- **세력 & 조직 (Factions)**: 총 ${exportedFacs}개

---

### 👥 주요 캐릭터 목록
${characters.slice(0, 30).map(c => `- [[${this.sanitizeFilename(c.name)}]]`).join('\n')}
${characters.length > 30 ? `\n_...외 ${characters.length - 30}명_` : ''}

### 🏰 세력 목록
${factions.map(f => `- [[${this.sanitizeFilename(f.name)}]]`).join('\n')}
`;

    fs.writeFileSync(path.join(targetDir, '_WorldBuilding_Home.md'), homeContent.trim() + '\n', 'utf-8');

    return {
      success: true,
      exportedChars,
      exportedRels,
      exportedEps,
      exportedFacs,
      targetDir
    };
  }
}

module.exports = ObsidianExporter;
