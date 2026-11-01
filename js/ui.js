/* ui.js: DOM panels, controls, narration. */
(function (global) {
  'use strict';

  var Sim = global.Sim, City = global.City, M = global.ToyModel;

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var activeDistrict = null;
  var pinnedDistrict = null;      // set when the user clicks a district
  var lastPaint = 0;
  var flyTo = null;
  var sheetOpen = false;          // mobile bottom sheet

  var STAGE_LABEL = {
    tokenize: '分词', embed: '嵌入', position: '位置编码',
    norm1: '归一化', attn: '注意力', res1: '残差',
    norm2: '归一化', ffn: '前馈', res2: '残差',
    layer: '下一层', finalnorm: '最终归一化', logits: 'logits',
    sample: '采样', emit: '输出', feedback: '自回归', done: '完成'
  };

  /* 状态机内部值保持英文（被逻辑比较），只在这里换成中文显示。 */
  var MODE_LABEL = { prefill: '预填充', decode: '解码' };

  function districtForStage(stage) {
    if (!stage) return null;
    if (stage === 'done') return null;
    return City.stageToDistrict[stage] || stage;
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    [
      'stage-chip', 'stage-tag', 'stage-name', 'stage-short', 'stage-body',
      'vec', 'vec-label', 'attn-list', 'cand-list', 'cand-hint', 'tokens', 'ctx-count',
      'output', 'district-chips', 'hud-mode', 'hud-layer', 'hud-cache', 'hud-gen',
      'hud-note', 'inspector', 'prompt', 'btn-run', 'btn-play', 'play-glyph',
      'btn-step', 'btn-reset', 'speed', 'layers', 'temp', 'topp', 'v-speed',
      'v-layers', 'v-temp', 'v-topp', 'follow', 'labels', 'btn-about', 'about',
      'about-close', 'btn-panel', 'tooltip', 'dwell', 'dwell-bar', 'dwell-hint',
      'sheet-handle', 'btn-tune', 'dock', 'dock-tune'
    ].forEach(function (id) { el[id] = $(id); });

    buildVector();
    buildChips();
    wire();
    applyResponsiveLabels();

    Sim.on(function (name, payload) {
      if (name === 'stage') onStage(payload);
      if (name === 'reset') { pinnedDistrict = null; paint(true); }
    });
  }

  function buildVector() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < M.D; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = '<i></i>';
      frag.appendChild(cell);
    }
    el.vec.appendChild(frag);
  }

  function buildChips() {
    var seen = {};
    City.districts.forEach(function (d) {
      if (seen[d.id]) return;
      seen[d.id] = true;
      var b = document.createElement('button');
      b.textContent = d.name;
      b.dataset.id = d.id;
      b.addEventListener('click', function () {
        showDistrict(d, true);
        flyTo = { x: d.x, y: d.y };
      });
      el['district-chips'].appendChild(b);
    });
  }

  function wire() {
    el['btn-run'].addEventListener('click', run);
    el.prompt.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

    el['btn-play'].addEventListener('click', function () { Sim.toggle(); paint(true); });
    el['btn-step'].addEventListener('click', function () { Sim.step(); });
    /* Run keeps what you've already read; Reset starts the slow tour over. */
    el['btn-reset'].addEventListener('click', function () { Sim.replayTour(); run(); });

    bindRange('speed', 'v-speed', function (v) { Sim.state.speed = v; return v.toFixed(2) + '×'; });
    bindRange('layers', 'v-layers', function (v) {
      Sim.state.layers = v | 0;
      return (v | 0) + '';
    });
    bindRange('temp', 'v-temp', function (v) { Sim.state.temperature = v; return v.toFixed(2); });
    bindRange('topp', 'v-topp', function (v) { Sim.state.topP = v; return v.toFixed(2); });

    el.labels.addEventListener('change', function () {
      global.Renderer.setLabels(el.labels.checked);
    });

    el['btn-about'].addEventListener('click', function () { el.about.hidden = false; });
    el['about-close'].addEventListener('click', function () { el.about.hidden = true; });
    el.about.addEventListener('click', function (e) { if (e.target === el.about) el.about.hidden = true; });

    el['btn-panel'].addEventListener('click', function () {
      var hidden = el.inspector.classList.toggle('hidden');
      el['btn-panel'].setAttribute('aria-expanded', String(!hidden));
      applyResponsiveLabels();
    });
    window.addEventListener('resize', applyResponsiveLabels);

    /* mobile: the sheet expands to show the full write-up */
    el['sheet-handle'].addEventListener('click', function () { setSheet(!sheetOpen); });

    /* mobile: the sliders live behind the ⚙ button */
    el['btn-tune'].addEventListener('click', function () {
      var open = el.dock.classList.toggle('tune-open');
      el['btn-tune'].setAttribute('aria-expanded', String(open));
      el['btn-tune'].title = open ? '收起设置' : '显示设置';
    });
  }

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  /* The topbar cannot fit "About & accuracy" + "Hide panel" on a phone, but
     both actions still need to be reachable, landscape especially, where
     dismissing the sheet is the only way to get a usable canvas. */
  function applyResponsiveLabels() {
    var hidden = el.inspector.classList.contains('hidden');
    var narrow = isMobile();
    el['btn-panel'].textContent = narrow
      ? (hidden ? '面板' : '收起')
      : (hidden ? '显示面板' : '隐藏面板');
    el['btn-about'].textContent = narrow ? '关于' : '关于与真实性';
    /* name the actual key, but a phone has no Space bar, so point at the
       pause button there instead */
    el['dwell-hint'].innerHTML = narrow
      ? '阅读停留：点下面的 <b>❚❚</b> 停在这里'
      : '阅读停留：按 <kbd>空格</kbd> 停在这里';
  }

  function setSheet(open) {
    sheetOpen = open;
    el.inspector.classList.toggle('open', open);
    el['sheet-handle'].setAttribute('aria-expanded', String(open));
    if (open) el.inspector.scrollTop = 0;
  }

  function bindRange(id, out, fn) {
    var input = el[id];
    var apply = function () {
      el[out].textContent = fn(parseFloat(input.value));
    };
    input.addEventListener('input', apply);
    apply();
  }

  function run() {
    Sim.setPrompt(el.prompt.value || 'the city of tokens');
    pinnedDistrict = null;
    paint(true);
  }

  /* -------------------------------------------------------------- narration */

  function onStage(stage) {
    var id = districtForStage(stage);
    activeDistrict = id;
    if (!pinnedDistrict && id) {
      var d = City.districtById[id];
      if (d) writeStageCard(d, stage);
    }
    if (stage === 'done') writeDone();
    paint(true);
  }

  function writeStageCard(d, stage) {
    el['stage-chip'].textContent = STAGE_LABEL[stage] || d.id;
    el['stage-chip'].style.color = d.color;
    el['stage-chip'].style.background = hexA(d.color, 0.14);
    el['stage-chip'].style.borderColor = hexA(d.color, 0.3);
    el['stage-tag'].textContent = d.tag;
    el['stage-name'].textContent = d.name + suffixFor(stage);
    el['stage-short'].textContent = d.short;
    el['stage-body'].textContent = d.body;
  }

  function suffixFor(stage) {
    if (stage === 'norm1') return ' I';
    if (stage === 'norm2') return ' II';
    if (stage === 'res1') return ' I';
    if (stage === 'res2') return ' II';
    return '';
  }

  function writeDone() {
    el['stage-chip'].textContent = '完成';
    el['stage-tag'].textContent = '已生成 ' + Sim.state.tripCount + ' 个词元';
    el['stage-name'].textContent = '生成结束';
    el['stage-short'].textContent = '整座城市完整跑了 ' + Sim.state.tripCount + ' 遍，每个词元一遍。';
    el['stage-body'].textContent = '改一下提示词、温度或层数，再按「运行」，就能派下一支车队走一趟。';
  }

  function showDistrict(d, pin) {
    pinnedDistrict = pin ? d.id : null;
    writeStageCard(d, Sim.state.stage);
    if (pin) {
      el['stage-chip'].textContent = '已固定';
      el['stage-tag'].textContent = d.tag + ' · 点空白地面恢复讲解';
      /* tapping a district on a phone is a request to read it */
      if (isMobile()) setSheet(true);
    }
    updateChips();
  }

  function updateChips() {
    var kids = el['district-chips'].children;
    for (var i = 0; i < kids.length; i++) {
      var on = kids[i].dataset.id === (pinnedDistrict || activeDistrict);
      kids[i].classList.toggle('on', on);
    }
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ------------------------------------------------------------------ paint */

  function paint(force) {
    var now = performance.now();
    if (!force && now - lastPaint < 90) return;
    lastPaint = now;

    var s = Sim.state;

    /* transport glyph */
    el['play-glyph'].textContent = s.paused || s.finished ? '▶' : '❚❚';

    /* hud */
    el['hud-mode'].textContent = s.finished ? '空闲' : (MODE_LABEL[s.mode] || s.mode);
    el['hud-layer'].textContent = Math.min(s.layer + (s.stage === 'layer' ? 0 : 1), s.layers) + ' / ' + s.layers;
    el['hud-cache'].textContent = s.cacheSize + ' 个词元';
    el['hud-gen'].textContent = s.tripCount + ' / ' + s.maxNew;
    el['hud-note'].textContent = hudNote(s);

    /* reading-stop progress */
    var showing = s.reading && s.dwellTotal > 0 && s.dwellLeft > 0;
    el.dwell.hidden = !showing;
    if (showing) {
      /* by id, not firstChild: the markup is indented, so firstChild is a
         whitespace text node and has no .style */
      el['dwell-bar'].style.width = (s.dwellLeft / s.dwellTotal * 100).toFixed(1) + '%';
    }

    paintVector(s);
    paintAttention(s);
    paintCandidates(s);
    paintTokens(s);
    paintOutput(s);
    updateChips();
  }

  function hudNote(s) {
    if (s.finished) return '';
    if (s.reading) return '⏸ 停在这里，让你读完面板';
    if (s.fastForward) return '⏩ 快进剩下的层：同一条路，不同的权重';
    if (s.tourDone) return '⏩ 所有城区都讲过了，余下的按速度跑（把速度拖慢就能看清）';
    if (s.mode === 'prefill') return '预填充：提示词里的每个词元并行地一起穿过。';
    if (s.mode === 'decode') return '解码：车队里只有一个词元，过去的部分从 KV 缓存里取。';
    return '';
  }

  function paintVector(s) {
    var cells = el.vec.children;
    var v = s.h;
    el['vec-label'].textContent = v ? s.hLabel : '空闲';
    for (var i = 0; i < cells.length; i++) {
      var bar = cells[i].firstChild;
      var val = v ? v[i] : 0;
      var mag = Math.min(1, Math.abs(val) / 3);
      cells[i].classList.toggle('neg', val < 0);
      bar.style.height = (mag * 50) + '%';
      /* matches the diverging scale painted on the trucks */
      bar.style.background = val >= 0
        ? 'linear-gradient(to top, rgba(176,74,45,0.45), #b04a2d)'
        : 'linear-gradient(to bottom, rgba(50,88,138,0.45), #32588a)';
    }
  }

  function paintAttention(s) {
    if (!s.attn) return;
    var pairs = [];
    for (var i = 0; i < s.attn.length; i++) {
      pairs.push({ i: i, w: s.attn[i], tok: s.tokens[i] ? M.display(s.tokens[i].text) : '?' });
    }
    pairs.sort(function (a, b) { return b.w - a.w; });
    var top = pairs.slice(0, 7);
    var max = top.length ? top[0].w : 1;

    var html = top.map(function (p) {
      return '<div class="bar"><span class="lbl" title="position ' + p.i + '">' +
        escapeHtml(p.tok) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (p.w / max * 100).toFixed(1) +
        '%;background:linear-gradient(90deg,#a33c60,#8b5f96)"></span></span>' +
        '<span class="val">' + (p.w * 100).toFixed(1) + '%</span></div>';
    }).join('');
    if (pairs.length > top.length) {
      html += '<p class="fine">另有 ' + (pairs.length - top.length) +
        ' 个缓存词元权重更小，未列出。它们加起来始终是 100%。</p>';
    }
    el['attn-list'].innerHTML = html;
  }

  function paintCandidates(s) {
    if (!s.candidates) return;
    var keptSet = {};
    if (s.kept) s.kept.forEach(function (k) { keptSet[k.token] = true; });
    var list = s.candidates.slice(0, 8);
    var max = list.length ? Math.max.apply(null, list.map(function (c) { return c.p || 0; })) : 1;

    el['cand-hint'].textContent = s.kept
      ? 'top-p 保留 ' + s.kept.length + ' / ' + s.candidates.length
      : 'logits → softmax';

    el['cand-list'].innerHTML = list.map(function (c) {
      var chosen = s.chosen && s.chosen.token === c.token;
      var cut = s.kept && !keptSet[c.token];
      return '<div class="bar' + (cut ? ' cut' : '') + (chosen ? ' chosen' : '') + '">' +
        '<span class="lbl">' + escapeHtml(c.token) + (chosen ? ' ◄' : '') + '</span>' +
        '<span class="track"><span class="fill" style="width:' + ((c.p || 0) / max * 100).toFixed(1) +
        '%;background:' + (chosen ? '#55803f' : cut ? '#b4b0a4' : 'linear-gradient(90deg,#7d9c6a,#55803f)') +
        '"></span></span>' +
        '<span class="val">' + ((c.p || 0) * 100).toFixed(1) + '%</span></div>';
    }).join('');
  }

  function paintTokens(s) {
    el['ctx-count'].textContent = s.tokens.length + ' 个词元';
    el.tokens.innerHTML = s.tokens.map(function (tok, i) {
      var cls = 'tok' + (tok.kind === 'gen' ? ' gen' : '') + (i === s.focusIdx ? ' focus' : '');
      return '<span class="' + cls + '">' + escapeHtml(M.display(tok.text)) + '</span>';
    }).join('');
  }

  function paintOutput(s) {
    var prompt = s.tokens.filter(function (k) { return k.kind === 'prompt'; })
      .map(function (k) { return k.text; }).join('');
    if (!s.outputText) {
      el.output.innerHTML = '<span class="prompt-part">' + escapeHtml(prompt.trim()) + '</span>' +
        '<span class="caret">|</span>';
      return;
    }
    el.output.innerHTML = '<span class="prompt-part">' + escapeHtml(prompt.trim()) + '</span>' +
      escapeHtml(s.outputText) + (s.finished ? '' : '<span class="caret">|</span>');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------------- exports */

  global.UI = {
    init: init,
    paint: paint,
    run: run,
    resetAll: function () { Sim.replayTour(); run(); },
    showDistrict: showDistrict,
    unpin: function () { pinnedDistrict = null; updateChips(); },
    activeDistrict: function () { return pinnedDistrict || activeDistrict; },
    takeFlyTo: function () { var f = flyTo; flyTo = null; return f; },
    el: el
  };
})(window);
