# Achieving-Star — 제어반 전장 배치 · 배선 설계

제어반(분전반/배전반) 설계를 위한 **2D 배치 · 배선 웹 도구**입니다.
EPLAN ESS처럼 정면도 기반으로 전장(마운팅 플레이트)에 덕트/채널을 깔고,
MCCB·MC·CP·SMPS·PLC 등의 부품을 배치합니다. 서버 없이 브라우저에서 동작하며
프로젝트를 `.json` 파일로 저장/불러올 수 있습니다.

> **현재 단계: MVP — 배치 코어**
> 전장 사이즈 설정 → 덕트/채널(DIN 레일) 배치 → 라이브러리 부품 배치 → 저장.
> 단자 연결선·라인 라벨·BOM 출력은 다음 단계입니다.

## 실행 방법

가장 간단: `index.html`을 더블클릭해서 브라우저로 엽니다.

자동저장(IndexedDB)까지 쓰려면 로컬 서버로 여는 것을 권장합니다:

```bash
# 저장소 폴더에서
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

또는 GitHub Pages로 배포해 URL로 사용할 수 있습니다
(Settings → Pages → Branch 지정).

## 사용법

- **전장 설정** (우측): 가로/세로(mm)와 격자(mm)를 입력 → 플레이트가 그려집니다.
- **덕트/레일 그리기** (상단 도구): `덕트 ─/│`, `레일 ─/│` 선택 후 캔버스를
  드래그하면 그려집니다. 덕트 폭은 상단에서 선택(40/60/80/100mm).
- **부품 배치**: 좌측 라이브러리에서 부품 클릭 → 캔버스 클릭으로 배치.
  가까운 가로 레일에 자동 스냅됩니다. `Shift+클릭`으로 연속 배치.
- **선택/이동**: `선택` 도구로 클릭 후 드래그(격자 스냅). `Shift+클릭` 다중 선택.
- **회전/삭제**: `R`(회전), `Del`(삭제).
- **실행취소/다시실행**: `Ctrl+Z` / `Ctrl+Shift+Z`.
- **화면 이동/줌**: 빈 공간 드래그 또는 `Space+드래그`, 마우스 휠 줌.

## 저장 (데이터 손실 방지)

- **JSON 저장/불러오기**: `💾 저장(JSON)` 으로 PC에 `*.panel.json` 파일로
  내려받고, `📂 불러오기` 로 다시 엽니다. **서버 없이도 데이터가 보존됩니다.**
- **자동저장**: `http(s)` 로 열었을 때(로컬 서버/GitHub Pages) 브라우저
  IndexedDB에 자동저장되어, 다시 열면 복원 여부를 묻습니다.
  (`file://` 더블클릭 환경에서는 자동저장이 꺼지므로 JSON 저장을 사용하세요.)

## 부품 라이브러리 / EDZ 가져오기

- 기본 제공: 자주 쓰는 LS ELECTRIC 부품 시드(MCCB/MC/CP/SMPS/PLC 등).
  치수는 대표값이며 EDZ 가져오기로 정확한 값으로 대체됩니다.
- **EDZ 가져오기**: `＋ EDZ 가져오기` 로 LS ELECTRIC EDZ(ZIP) 파일을 올리면
  내부 `part.xml`을 파싱해 부품(부품번호·치수)을 라이브러리에 추가합니다.
  - EDZ가 **7z 압축**인 경우 EPLAN/7-Zip에서 **ZIP으로 다시 저장** 후 올려주세요.
  - 실제 LS EDZ 샘플로 검증하면 태그 매핑을 정밀 보정할 수 있습니다.

## 구조

```
index.html              앱 셸 (Tailwind CDN + 레이아웃 폴백)
vendor/fflate.min.js    ZIP 해제(오프라인 동작용 로컬 포함)
src/
  store.js              상태 + undo/redo
  geom.js               격자 스냅 · 경계 · 레일 스냅
  viewport.js           SVG 팬/줌/격자/좌표변환 (1 단위 = 1mm)
  render.js             state → SVG 렌더
  interact.js           선택/이동/그리기/배치 + 키보드
  persistence.js        JSON 저장·불러오기 + IndexedDB 자동저장
  library/seed.js       기본 부품 시드
  library/edz.js        EDZ(zip) 해제 + part.xml 파싱
  library/palette.js    라이브러리 팔레트 UI
  ui/toolbar.js         툴바
  ui/inspector.js       선택 속성 패널
  main.js               부트스트랩
data/parts.json         참조용 시드 부품
```

## 다음 단계 (로드맵)

1. **단자 연결**: 부품 단자 좌표화 → 단자 간 연결선 그리기.
2. **라인 라벨**: 와이어별 라벨/번호 자동 부여.
3. **출력**: BOM/배선표, 도면 인쇄·PDF·이미지 내보내기.
4. (선택) Tauri로 감싼 데스크톱 `.exe` 배포.
