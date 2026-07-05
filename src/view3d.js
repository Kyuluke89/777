/* 3D 입체 보기 — Three.js(WebGL) 실시간 렌더 + OrbitControls.
   상용 3D(EPLAN Pro Panel 등)처럼 마우스로 자유 회전(좌드래그)/팬(우드래그)/줌(휠).
   좌표: 앱 x→X, 앱 y(아래+)→-Y, 깊이→+Z. 플레이트는 수직 벽처럼 서 있음. */
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});
  const V3 = (App.view3d = {});

  let modal, host, renderer, scene, camera, controls, rafId = null;
  let depthScale = 1;
  const texCache = {}; // dataURL → THREE.Texture

  function hasThree() { return typeof global.THREE !== 'undefined'; }

  function disposeScene() {
    if (!scene) return;
    scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
      }
    });
    while (scene.children.length) scene.remove(scene.children[0]);
  }

  function texture(dataURL) {
    if (texCache[dataURL]) return texCache[dataURL];
    const t = new THREE.TextureLoader().load(dataURL);
    t.colorSpace = THREE.SRGBColorSpace || undefined;
    texCache[dataURL] = t;
    return t;
  }

  // 박스 메쉬 — 앞면(+Z)에 이미지 텍스처 가능
  function box(w, h, d, color, img, edge) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const base = new THREE.MeshLambertMaterial({ color: color });
    let mat = base;
    if (img) {
      const front = new THREE.MeshLambertMaterial({ map: texture(img), color: 0xffffff });
      mat = [base, base, base, base, front, base]; // +x,-x,+y,-y,+z,-z
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    if (edge !== false) {
      const eg = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35 })
      );
      mesh.add(eg);
    }
    return mesh;
  }

  // 앱 좌표(x,y 좌상단 기준) 박스를 씬에 배치 — z0 = 플레이트 표면에서 시작
  function place(mesh, x, y, w, h, d, z0, rotDeg) {
    mesh.position.set(x + w / 2, -(y + h / 2), (z0 || 0) + d / 2);
    if (rotDeg) mesh.rotation.z = -rotDeg * Math.PI / 180;
    scene.add(mesh);
  }

  function build() {
    disposeScene();
    const s = App.store.get();
    const p = s.panel;
    const W = p.widthMM, H = p.heightMM;

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(W * 0.6, H * 0.5, Math.max(W, H));
    key.castShadow = true;
    const S0 = Math.max(W, H);
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -S0; key.shadow.camera.right = S0 * 1.4;
    key.shadow.camera.top = S0; key.shadow.camera.bottom = -S0 * 1.6;
    key.shadow.camera.near = 1; key.shadow.camera.far = S0 * 4;
    key.target.position.set(W / 2, -H / 2, 0);
    scene.add(key.target);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-W * 0.5, -H * 0.6, Math.max(W, H) * 0.6);
    scene.add(fill);

    // 바닥(그리드 + 그림자 받는 면)
    const S1 = Math.max(W, H);
    const grid = new THREE.GridHelper(S1 * 3, 30, 0xb6c2d1, 0xdde4ec);
    grid.position.set(W / 2, -H - 1, 0);
    scene.add(grid);
    const groundGeo = new THREE.PlaneGeometry(S1 * 4, S1 * 4);
    const ground = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, -H - 1.01, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // 플레이트(뒤판) + 외곽 프레임 느낌의 테두리
    const plate = box(W, H, 4, 0xd7dee8, null);
    place(plate, 0, 0, W, H, 4, -4);

    // 덕트 — 몸체 + 덮개(살짝 큰 캡)로 배선덕트 느낌
    (s.ducts || []).forEach(function (d) {
      const w = d.orient === 'h' ? d.lengthMM : d.widthMM;
      const h = d.orient === 'h' ? d.widthMM : d.lengthMM;
      const dep = 40 * depthScale;
      const body = box(w, h, dep, 0x8a95a6, null);
      place(body, d.x, d.y, w, h, dep, 0);
      const cap = box(w + 2, h + 2, 4, 0xa8b2bf, null);
      place(cap, d.x - 1, d.y - 1, w + 2, h + 2, 4, dep);
    });

    // DIN 레일 — 얇은 모자형(밑판+양날개)
    (s.rails || []).forEach(function (r) {
      const w = r.orient === 'h' ? r.lengthMM : (r.widthMM || 35);
      const h = r.orient === 'h' ? (r.widthMM || 35) : r.lengthMM;
      const dep = 7.5 * depthScale;
      const base = box(w, h, 2, 0xb0b8c4, null);
      place(base, r.x, r.y, w, h, 2, 0);
      if (r.orient === 'h') {
        const top = box(w, 5, dep, 0xc7ced8, null); place(top, r.x, r.y, w, 5, dep, 0);
        const bot = box(w, 5, dep, 0xc7ced8, null); place(bot, r.x, r.y + h - 5, w, 5, dep, 0);
      } else {
        const lft = box(5, h, dep, 0xc7ced8, null); place(lft, r.x, r.y, 5, h, dep, 0);
        const rgt = box(5, h, dep, 0xc7ced8, null); place(rgt, r.x + w - 5, r.y, 5, h, dep, 0);
      }
    });

    // 부품 — 타입색 몸체(+이미지 앞면), 회전 반영
    (s.components || []).forEach(function (c) {
      const dep = (c.d || 60) * depthScale;
      const col = new THREE.Color(App.typeColor(c.type)).lerp(new THREE.Color(0xffffff), 0.35);
      const m = box(c.widthMM, c.heightMM, dep, col, c.img || null);
      place(m, c.x, c.y, c.widthMM, c.heightMM, dep, 0, c.rotation || 0);
    });

    // 배선 — 단자에서 나와 위로 떠서 경유하는 둥근 튜브
    const wireZ = 14 * depthScale; // 배선이 떠 있는 높이
    (s.wires || []).forEach(function (w) {
      const pts = App.wires.route(s, w);
      if (!pts || pts.length < 2) return;
      const v = [];
      v.push(new THREE.Vector3(pts[0].x, -pts[0].y, 4));            // 시작 단자(표면)
      pts.forEach(function (q, i) {
        v.push(new THREE.Vector3(q.x, -q.y, wireZ));                 // 경로는 떠서
      });
      const last = pts[pts.length - 1];
      v.push(new THREE.Vector3(last.x, -last.y, 4));                 // 끝 단자(표면)
      const curve = new THREE.CatmullRomCurve3(v, false, 'catmullrom', 0.08);
      const geo = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 8), Math.max(0.7, (w.width || 1.2) * 0.7), 8, false);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(w.color || '#dc2626') });
      scene.add(new THREE.Mesh(geo, mat));
    });

    // 카메라 초기 위치(비스듬히 위-앞)
    const cx = W / 2, cy = -H / 2;
    controls.target.set(cx, cy, 0);
    camera.position.set(cx + W * 0.55, cy + H * 0.35, Math.max(W, H) * 1.15);
    camera.near = 1; camera.far = Math.max(W, H) * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    if (!renderer || !host) return;
    const r = host.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  function loop() {
    if (!V3.isOpen()) { rafId = null; return; }
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  }

  V3.render = function () { if (scene) build(); };

  V3.open = function () {
    if (!modal) return;
    if (!hasThree()) { alert('3D 라이브러리(three.js)를 불러오지 못했습니다.'); return; }
    modal.style.display = 'flex';
    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      } catch (e) { alert('이 기기에서 WebGL(3D)을 사용할 수 없습니다.'); modal.style.display = 'none'; return; }
      renderer.setPixelRatio(global.devicePixelRatio || 1);
      renderer.setClearColor(0xf1f5f9);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      global.addEventListener('resize', resize);
    }
    build();
    resize();
    if (!rafId) loop();
  };
  V3.close = function () {
    if (modal) modal.style.display = 'none';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  };
  V3.isOpen = function () { return modal && modal.style.display !== 'none'; };
  // 테스트/디버그용
  V3._debug = function () {
    let meshes = 0;
    if (scene) scene.traverse(function (o) { if (o.isMesh) meshes++; });
    return { meshes: meshes, cam: camera ? camera.position.toArray() : null };
  };

  V3.init = function () {
    modal = document.getElementById('view3d-modal');
    host = document.getElementById('view3d-host');
    if (!modal) return;
    const close = document.getElementById('v3-close');
    if (close) close.onclick = V3.close;
    modal.addEventListener('pointerdown', function (e) { if (e.target === modal) V3.close(); });
    const depth = document.getElementById('v3-depth');
    if (depth) depth.addEventListener('input', function () {
      depthScale = Math.max(0.2, parseFloat(this.value) || 1);
      build();
    });
    const reset = document.getElementById('v3-reset');
    if (reset) reset.onclick = function () { build(); };
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && V3.isOpen()) V3.close();
    });
  };
})(window);
