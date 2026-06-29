/* 기본 부품 시드.
 * (초기 개발용으로 임의 입력했던 대표값 부품들은 제거됨 —
 *  실제 부품은 EPLAN Data Portal 카탈로그에서 변환한 src/library/parts-ls.js 사용)
 * EDZ/DXF 가져오기 또는 변환기로 추가된 부품이 라이브러리를 채웁니다.
 */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  App.seedParts = [];
})(window);
