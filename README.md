# Achieving-Star — 제어반 전장 배치 · 배선 설계

제어반(분전반/배전반) 설계를 위한 **2D 배치 · 배선 웹 도구**입니다.
EPLAN ESS처럼 정면도 기반으로 전장(마운팅 플레이트)에 덕트/채널을 깔고,
MCCB·MC·CP·SMPS·PLC 등의 부품을 배치합니다. 서버 없이 브라우저에서 동작하며
프로젝트를 `.json` 파일로 저장/불러올 수 있습니다.

> **구현 완료**
> 전장 사이즈 설정 → 덕트/채널(DIN 레일) 배치 → 라이브러리 부품 배치 →
> **단자 연결(배선)** → **라인 라벨** → 저장 → **BOM·배선표·PNG·인쇄 출력**.

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
- **배선(단자 연결)**: `⚯ 배선` 도구 → 부품의 단자(작은 점) 클릭 → 다른 단자
  클릭하면 와이어가 직각(Manhattan)으로 연결됩니다. 와이어는 부품을 옮기면
  자동으로 따라옵니다. 라인번호(W1, W2…)가 자동 부여됩니다.
- **라인 라벨**: 와이어 선택 후 우측 속성에서 라인번호·색상을 편집합니다.
- **선택/이동**: `선택` 도구로 클릭 후 드래그(격자 스냅). `Shift+클릭` 다중 선택.
- **회전/삭제**: `R`(회전), `Del`(삭제). 부품 삭제 시 연결된 와이어도 함께 제거.
- **실행취소/다시실행**: `Ctrl+Z` / `Ctrl+Shift+Z`.
- **화면 이동/줌**: 빈 공간 드래그 또는 `Space+드래그`, 마우스 휠 줌.

## 출력

- **BOM**: 부품번호 기준 수량 집계 CSV.
- **배선표**: 라인번호·시작/끝 부품·단자 목록 CSV.
- **PNG**: 현재 도면을 이미지로 내보내기.
- **인쇄**: 브라우저 인쇄 → PDF로 저장(캔버스만 출력되는 인쇄 스타일 적용).
- CSV는 Excel 한글 깨짐 방지를 위해 UTF-8 BOM 을 포함합니다.

## 저장 (데이터 손실 방지)

- **JSON 저장/불러오기**: `💾 저장(JSON)` 으로 PC에 `*.panel.json` 파일로
  내려받고, `📂 불러오기` 로 다시 엽니다. **서버 없이도 데이터가 보존됩니다.**
- **자동저장**: `http(s)` 로 열었을 때(로컬 서버/GitHub Pages) 브라우저
  IndexedDB에 자동저장되어, 다시 열면 복원 여부를 묻습니다.
  (`file://` 더블클릭 환경에서는 자동저장이 꺼지므로 JSON 저장을 사용하세요.)

## 부품 라이브러리 / EDZ 가져오기

- 기본 제공: 자주 쓰는 LS ELECTRIC 부품 시드(MCCB/MC/CP/SMPS/PLC 등).
  치수는 대표값이며 EDZ 가져오기로 정확한 값으로 대체됩니다.
- **실데이터 탑재**: EPLAN Data Portal에서 받은 LS 미니 차단기 20종
  (MCCB `ABS32Fb`, ELCB `EBS32Fb`/`EBE32Fb`)이 **DXF 실측 치수(50×96mm)**로
  기본 포함되어 있습니다(`src/library/parts-ls.js`).

### EPLAN Data Portal 다운로드 → 라이브러리 변환 (DXF + CSV)

EPLAN Data Portal에서 EDZ 대신 **DXF + commercialdata.csv** 로 받은 경우,
변환기로 부품 라이브러리를 자동 생성할 수 있습니다.

```bash
# 받은 폴더(dxf/, commercialdata.csv)를 edz-source/ 에 두고:
node tools/edz-portal-to-parts.js              # 기본 경로 edz-source
node tools/edz-portal-to-parts.js 다른폴더경로   # 경로 지정도 가능
```

- `commercialdata.csv` 에서 부품번호·타입·설명을 읽고,
  `dxf/<매크로>/Panel layout/*.dxf` 의 `$EXTMIN/$EXTMAX` 로 정확한
  풋프린트(가로×세로 mm)를 계산합니다.
- 출력: `src/library/parts-ls.js`(앱 자동 로드) + `data/ls-parts.json`(참조).
- **EDZ 가져오기**: `＋ EDZ 가져오기` 로 LS ELECTRIC EDZ(ZIP) 파일을 올리면
  내부 `part.xml`을 파싱해 부품(부품번호·치수)을 라이브러리에 추가합니다.
  - EDZ가 **7z 압축**인 경우 EPLAN/7-Zip에서 **ZIP으로 다시 저장** 후 올려주세요.
  - 실제 LS EDZ 샘플로 검증하면 태그 매핑을 정밀 보정할 수 있습니다.

## 구조

```
index.html              앱 셸 (Tailwind CDN + 레이아웃/인쇄 폴백 CSS)
vendor/fflate.min.js    ZIP 해제(오프라인 동작용 로컬 포함)
src/
  store.js              상태 + undo/redo
  terminals.js          부품 단자 좌표(로컬/회전 월드) 계산
  wires.js              와이어 경로(Manhattan) · 자동 번호
  geom.js               격자 스냅 · 경계 · 레일/단자 스냅
  viewport.js           SVG 팬/줌/격자/좌표변환 (1 단위 = 1mm)
  render.js             state → SVG 렌더(부품·단자·와이어·라벨)
  interact.js           선택/이동/그리기/배치/배선 + 키보드
  persistence.js        JSON 저장·불러오기 + IndexedDB 자동저장
  export.js             BOM/배선표 CSV · PNG · 인쇄
  library/seed.js       기본 부품 시드
  library/edz.js        EDZ(zip) 해제 + part.xml 파싱
  library/palette.js    라이브러리 팔레트 UI
  ui/toolbar.js         툴바
  ui/inspector.js       선택 속성 패널
  main.js               부트스트랩(반응형 렌더 구독)
data/parts.json         참조용 시드 부품
tests/                  헤드리스 브라우저 자동 테스트
```

## 테스트 (자동 검증)

[Playwright](https://playwright.dev) 기반 헤드리스 브라우저 테스트로 핵심 기능을
실제 클릭·드래그까지 검증합니다.

```bash
npm i playwright-core            # 1회 설치
# Chromium 실행 파일 경로를 PW_CHROME 으로 지정 (또는 시스템 크롬)
PW_CHROME=/path/to/chrome node tests/smoke.js        # 렌더·저장·EDZ 파싱
PW_CHROME=/path/to/chrome node tests/regression.js   # 배선·라벨·출력·undo 등
```

검증 항목: 부팅 무에러, 시드 라이브러리, 배치(덕트/레일/부품), **단자 배선·자동
라벨·부품 이동 추종·삭제 캐스케이드**, BOM/배선표 집계, PNG 내보내기, JSON
저장/복원, undo/redo, EDZ(zip) `part.xml` 파싱.

## 다음 단계 (로드맵)

- 단자별 명칭/번호(EDZ 단자 정보 연동), 와이어 색상/규격(SQ) 관리.
- 도면 다중 시트, 명판/표제란, 치수선.
- (선택) Tauri로 감싼 데스크톱 `.exe` 배포.
