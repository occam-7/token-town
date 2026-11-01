/* city.js: routes, districts, buildings and props for the static world. */
(function (global) {
  'use strict';

  var Iso = global.Iso;

  /* ---- routes ------------------------------------------------------------ */

  function makeRoute(raw) {
    var pts = raw.map(function (p) { return { x: p[0], y: p[1], z: p[2] || 0 }; });
    var segs = [], total = 0, cum = [0];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
      segs.push({ a: a, b: b, len: len, cum: total });
      total += len;
      cum.push(total);
    }
    return {
      pts: pts, segs: segs, total: total, cum: cum,
      at: function (d) {
        if (d <= 0) {
          var s0 = segs[0];
          return { x: s0.a.x, y: s0.a.y, z: s0.a.z, dx: (s0.b.x - s0.a.x) / s0.len, dy: (s0.b.y - s0.a.y) / s0.len };
        }
        if (d >= total) {
          var sn = segs[segs.length - 1];
          return { x: sn.b.x, y: sn.b.y, z: sn.b.z, dx: (sn.b.x - sn.a.x) / sn.len, dy: (sn.b.y - sn.a.y) / sn.len };
        }
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (d <= s.cum + s.len) {
            var t = (d - s.cum) / s.len;
            return {
              x: s.a.x + (s.b.x - s.a.x) * t,
              y: s.a.y + (s.b.y - s.a.y) * t,
              z: s.a.z + (s.b.z - s.a.z) * t,
              dx: (s.b.x - s.a.x) / s.len,
              dy: (s.b.y - s.a.y) / s.len
            };
          }
        }
      }
    };
  }

  /* Waypoints. Indices marked below are used as station anchors. */
  var INTAKE = makeRoute([
    [-3, 5],        // 0 spawn, just off the plate. The prompt arrives from
                    //   outside the city, but the default view starts close on
                    //   the convoy, so a long run-in would open on empty ground
    [6, 5],         // 1 tokenizer docks
    [17, 5],        // 2 embedding foundry
    [28, 5],        // 3 positional beacon
    [38, 5],        // 4 corner
    [38, 11]        // 5 loop entry
  ]);

  var LOOP = makeRoute([
    [38, 11],       // 0 entry
    [34, 11],       // 1 pre-norm gate I
    [24, 11],       // 2 attention plaza
    [14, 11],       // 3 residual bridge I
    [9, 11],        // 4
    [7, 13],        // 5
    [7, 19],        // 6
    [9, 21],        // 7
    [14, 21],       // 8 pre-norm gate II
    [23, 21],       // 9 feed-forward mill
    [32, 21],       // 10 residual bridge II
    [37, 21],       // 11
    [39, 19],       // 12
    [39, 16],       // 13 layer counter arch
    [39, 13],       // 14
    [38, 11]        // 15 back to entry
  ]);

  var EXIT = makeRoute([
    [39, 16],       // 0 off the arch
    [43, 19],
    [43, 25],
    [41, 27],
    [36, 27],       // 4 final norm
    [27, 27],       // 5 vocabulary stadium
    [15, 27],       // 6 sampler
    [6, 27]         // 7 output plaza
  ]);

  var FEEDBACK = makeRoute([
    [6, 27, 0],
    [2.5, 27, 0.5],
    [2.5, 24, 3],
    [2.5, 10, 3],
    [2.5, 7, 1.4],
    [4.2, 5, 0.3],
    [6, 5, 0]
  ]);

  /* `dwell` is how long the convoy waits once you have already read this
     district's explanation. The much longer first-visit stop is derived from
     the length of that explanation; see readSeconds() below. */
  function station(route, idx, id, dwell) {
    return { dist: route.cum[idx], id: id, dwell: dwell == null ? 0.8 : dwell };
  }

  var STATIONS = {
    intake: [
      station(INTAKE, 1, 'tokenize', 1.6),
      station(INTAKE, 2, 'embed', 1.4),
      station(INTAKE, 3, 'position', 1.2)
    ],
    loop: [
      station(LOOP, 1, 'norm1', 0.6),
      station(LOOP, 2, 'attn', 2.6),
      station(LOOP, 3, 'res1', 0.5),
      station(LOOP, 8, 'norm2', 0.5),
      station(LOOP, 9, 'ffn', 1.6),
      station(LOOP, 10, 'res2', 0.5),
      station(LOOP, 13, 'layer', 0.7)
    ],
    exit: [
      station(EXIT, 4, 'finalnorm', 1.0),
      station(EXIT, 5, 'logits', 2.6),
      station(EXIT, 6, 'sample', 2.8),
      station(EXIT, 7, 'emit', 2.0)
    ],
    feedback: [
      station(FEEDBACK, 3, 'feedback', 1.2)
    ]
  };

  /* ---- palette ----------------------------------------------------------- */

  /* A printed-diagram palette: muted, low-chroma hues that stay legible on a
     pale ground and read as ink rather than light. */
  var C = {
    steel:  '#4a7a9b',
    violet: '#6f63a8',
    ochre:  '#c2913c',
    stone:  '#7d8b96',
    rose:   '#b05470',
    sage:   '#6d9068',
    teal:   '#3f8a86',
    orange: '#c07a3c',
    brick:  '#a85a44',
    moss:   '#5f8a52',
    plum:   '#8b5f96',
    ink:    '#4a4540',
    paper:  '#e5e1d5',
    road:   '#c9c4b6',
    roadTop:'#d8d3c6'
  };

  /* ---- districts (clickable, narrated) ----------------------------------- */

  var DISTRICTS = [
    {
      id: 'tokenize', name: '分词码头', x: 6, y: 5, r: 4.2, color: C.steel,
      tag: '文本 → 词元',
      short: '你的提示词在模型看到任何东西之前，先被切成词元。',
      body: '语言模型从来不看字母或单词。它看的是固定词表里的 ID，通常 5 万到 20 万个小片段。常见词就是一个词元；少见的词碎成多个片段，而词首的空格属于这个词元的一部分（这里显示为 ·）。你的提示词从公路上运进来，离开码头时已经是编了号的板条箱。'
    },
    {
      id: 'embed', name: '嵌入铸造厂', x: 17, y: 5, r: 4.2, color: C.violet,
      tag: '词元 → 向量',
      short: '每个词元 ID 变成一个向量：意义空间里的一个点。',
      body: '词元 ID 是那张巨大嵌入表的一行索引，那一行就是向量。拼写出了铸造厂就不存在了；从这里开始，模型只摆弄数字。这座城市每个词元只用 12 个数字，好让你看得见它们；GPT 一级的模型用 4000 到 16000 个。'
    },
    {
      id: 'position', name: '位置信标', x: 28, y: 5, r: 4.2, color: C.ochre,
      tag: '我在哪？',
      short: '顺序被盖到向量上，因为注意力本身不辨先后。',
      body: '注意力对排列是盲的：没有位置信号，「狗咬人」和「人咬狗」就是字面意义上同一个输入。信标会加上一段正弦位置编码（真实模型常常改用 RoPE，把向量旋转一下）。不同的频率让模型既能读出「紧挨着」，也能读出「隔得很远」。'
    },
    {
      id: 'norm', name: '前置归一化闸门', x: 34, y: 11, r: 3.2, color: C.stone,
      tag: 'LayerNorm',
      short: '每个子层之前，先把向量重新居中、重新缩放。',
      body: 'LayerNorm 减去均值、除以标准差（都在向量维度上算），再乘一个学出来的增益。它把激活值压在下一块能处理的范围里，防止它们穿过几十层之后爆炸。现代 Transformer 在每个子层之前归一化，而不是之后，所以叫「前置归一化」（pre-norm）。'
    },
    {
      id: 'attn', name: '注意力广场', x: 24, y: 11, r: 5, color: C.rose,
      tag: '词元互相打量',
      short: '当前词元向此前每个词元发问，然后把找到的东西混起来。',
      body: '三个变电站把向量投影成一个 Query、一个 Key 和一个 Value。查询去和缓存里每个词元的键打分；softmax 把这些分数变成和为一的权重；输出就是这些值的加权混合。仓库上方划过的光弧，就是此刻为这个词元算出来的真实权重。这里并行跑两个头；真实模型跑 32 个以上，每个头找的东西都不一样。'
    },
    {
      id: 'cache', name: 'KV 缓存仓库', x: 24, y: 16, r: 5, color: C.sage,
      tag: '对过去的记忆',
      short: '到目前为止每个词元的键和值都存着，永不重算。',
      body: '每个词元一座筒仓。没有它，生成第 500 个词就要把前面 499 个词元在所有层里重算一遍。有了它，每个新词元只算自己的键和值，其余直接读取。这也正是长上下文昂贵的原因：仓库随词元数和层数线性增长，而且住在显存里。'
    },
    {
      id: 'res', name: '残差桥', x: 14, y: 11, r: 3.2, color: C.teal,
      tag: '旁通车道',
      short: '子层把结果加到向量上，而不是替换它。',
      body: '每个子层的输出都会加回它自己的输入。这就留下一条不间断的路——残差流，从码头一直通到输出。每个块在这条流上写一次修正，而不是把整条流重建一遍，这正是 100 层网络还能训得动的原因。'
    },
    {
      id: 'ffn', name: '前馈磨坊', x: 23, y: 21, r: 4.6, color: C.orange,
      tag: '独自思考',
      short: '拓宽、过一个非线性、再收窄，词元之间互不混合。',
      body: '两个矩阵中间夹一个 GELU：这里是 12 → 24 → 12，真实模型通常是 4 倍。与注意力不同，这个阶段从不看别的词元，每个词元都被单独处理。Transformer 大约三分之二的参数住在这种磨坊里，模型「知道」的很多东西也存在这儿。'
    },
    {
      id: 'layer', name: '层计数器拱门', x: 39, y: 16, r: 3, color: C.brick,
      tag: '×N 个块',
      short: '整个环重复，每次权重都不同。',
      body: '这不是代码里的循环，而是一叠互不相同的块，每块都有自己的权重。小模型叠 12 层，大模型叠 80 层以上。大致上，靠前的层解析局部和句法结构，靠后的层承载更抽象、更接近任务的特征，残差流在它们之间把一切往前带。'
    },
    {
      id: 'finalnorm', name: '最终归一化', x: 36, y: 27, r: 3, color: C.stone,
      tag: '最后的整理',
      short: '向量被变成分数之前，再归一化一次。',
      body: '最后一个块之后，残差流还会过一次 LayerNorm，好让输出头看到一个尺度合适的向量。舞台不大，但跳过它整个分布就毁了。'
    },
    {
      id: 'logits', name: '词表体育场', x: 27, y: 27, r: 5, color: C.moss,
      tag: '每个词元一个分数',
      short: '向量与词表里的每一个词元逐一比较。',
      body: '最终向量乘以反嵌入矩阵，为词表里每个词元产出一个原始分数，即 logit。softmax 把整行变成一个概率分布。这里每座塔是一个候选，塔高就是它的概率。注意模型产出的是什么：不是答案，是一个分布。'
    },
    {
      id: 'sample', name: '采样器', x: 15, y: 27, r: 4.4, color: C.plum,
      tag: '温度与 top-p',
      short: '先把分布变形，然后掷骰子。',
      body: '温度在 softmax 之前除 logits：小于 1 让峰更尖、更偏向最稳的词元，大于 1 把峰压平、给冷门留机会。top-p（核采样）只留概率之和刚好到 p 的那条最短候选名单，把尾巴丢掉。然后从幸存者里随机抽一个词元，这就是同一个提示词能给出不同答案的原因。'
    },
    {
      id: 'emit', name: '输出广场', x: 6, y: 27, r: 4, color: C.steel,
      tag: '输出一个词元',
      short: '选中的词元被追加到文本后面，显示在大屏上。',
      body: '只有一个词元离开城市，常常只是半个词。你刚看完的一切——整座城市——只为产出这一小片而跑了一整遍。流式输出正是如此：词元一个一个地到达。'
    },
    {
      id: 'feedback', name: '反馈高速', x: 2.5, y: 16, r: 3.5, color: C.brick,
      tag: '自回归',
      short: '新词元开回码头，整座城市再跑一遍。',
      body: '输出被追加到输入之后，模型为了下一个词元从头再跑。这就是「自回归」的意思。它解释了生成为什么严格串行、速度为什么用每秒词元数来表示，也解释了为什么词元一旦离开广场，模型就再也改不了它。'
    }
  ];

  /* The pre-norm gate and the residual bridge each appear twice per block, so
     clone their pick/zone targets onto the second location. */
  [['norm', 14, 21], ['res', 32, 21]].forEach(function (c) {
    var src = DISTRICTS.filter(function (d) { return d.id === c[0]; })[0];
    var clone = Object.create(src);
    clone.x = c[1]; clone.y = c[2];
    DISTRICTS.push(clone);
  });

  var DISTRICT_BY_ID = {};
  DISTRICTS.forEach(function (d) { DISTRICT_BY_ID[d.id] = d; });

  /* stage ids that map onto a shared district */
  var STAGE_TO_DISTRICT = {
    norm1: 'norm', norm2: 'norm', res1: 'res', res2: 'res'
  };

  /* How long to hold the convoy the first time you reach a district, so the
     panel copy can actually be read. ~230 words per minute, plus a beat to
     take in the city before starting and a beat after finishing. */
  /* 中文版：阅读停留时长按字数估算。中文没有空格，split(/\s+/) 会把整段算成
     一个词，停留时间永远落到下限 9 秒；所以汉字按每秒 5 个（约 300 字/分钟），
     拉丁词按每秒 3.8 个（约 230 词/分钟）分别计。 */
  function readSeconds(stageId) {
    var d = DISTRICT_BY_ID[STAGE_TO_DISTRICT[stageId] || stageId];
    if (!d) return 9;
    var text = d.short + ' ' + d.body;
    var cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    var latin = text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
      .split(/\s+/).filter(Boolean).length;
    return Math.min(26, Math.max(9, latin / 3.8 + cjk / 5.0 + 3.5));
  }

  Object.keys(STATIONS).forEach(function (route) {
    STATIONS[route].forEach(function (st) { st.read = readSeconds(st.id); });
  });

  /* ---- geometry helpers -------------------------------------------------- */

  var ALL_ROUTES = [INTAKE, LOOP, EXIT, FEEDBACK];

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToRoutes(x, y) {
    var best = 1e9;
    for (var r = 0; r < ALL_ROUTES.length; r++) {
      var segs = ALL_ROUTES[r].segs;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var d = distToSegment(x, y, s.a.x, s.a.y, s.b.x, s.b.y);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function distToDistricts(x, y) {
    var best = 1e9;
    for (var i = 0; i < DISTRICTS.length; i++) {
      var d = DISTRICTS[i];
      var v = Math.hypot(x - d.x, y - d.y) - d.r;
      if (v < best) best = v;
    }
    return best;
  }

  /* ---- landmark buildings ------------------------------------------------ */

  var buildings = [];

  function put(o) { buildings.push(o); return o; }

  function landmark(cx, cy, opts) {
    put({
      x: cx - opts.w / 2, y: cy - opts.d / 2, z: opts.z || 0,
      w: opts.w, d: opts.d, h: opts.h,
      color: opts.color, kind: opts.kind || 'box',
      windows: opts.windows !== false ? { cols: opts.cols || 3, rows: opts.rows || Math.max(2, Math.round(opts.h * 1.3)), seed: (cx * 31 + cy * 17) | 0, color: opts.lit || '#ffe1a3' } : null,
      accent: opts.accent, tag: opts.tag, glow: opts.glow
    });
  }

  function buildLandmarks() {
    /* Tokenizer Docks */
    landmark(4.2, 3.0, { w: 3.4, d: 2.2, h: 2.6, color: '#b9c9d4', cols: 4, lit: C.steel });
    landmark(8.0, 3.2, { w: 2.2, d: 2.0, h: 4.2, color: '#aabecd', cols: 2, lit: C.steel });
    landmark(4.6, 7.6, { w: 4.6, d: 2.4, h: 1.6, color: '#c3d0d9', cols: 5, lit: C.steel });
    landmark(8.6, 7.4, { w: 2.0, d: 2.0, h: 2.2, color: '#b9c9d4', cols: 2, lit: C.steel });
    /* gantry crane over the road */
    put({ kind: 'crane', x: 6, y: 5, color: C.steel });

    /* Embedding Foundry */
    landmark(15.4, 2.8, { w: 3.0, d: 2.6, h: 3.4, color: '#c4bedb', cols: 3, lit: C.violet });
    landmark(19.2, 3.0, { w: 2.4, d: 2.4, h: 2.2, color: '#b6afd0', cols: 2, lit: C.violet });
    landmark(16.0, 7.6, { w: 3.6, d: 2.2, h: 2.0, color: '#cec9e0', cols: 4, lit: C.violet });
    put({ kind: 'foundry', x: 19.4, y: 7.2, color: C.violet });

    /* Positional Beacon */
    put({ kind: 'beacon', x: 28, y: 2.6, color: C.ochre });
    landmark(25.0, 7.6, { w: 2.6, d: 2.2, h: 1.8, color: '#ddc79a', cols: 3, lit: C.ochre });
    landmark(30.6, 7.4, { w: 2.4, d: 2.2, h: 2.6, color: '#ddc79a', cols: 3, lit: C.ochre });
    landmark(31.6, 2.8, { w: 2.2, d: 2.2, h: 3.0, color: '#d3bb8b', cols: 2, lit: C.ochre });

    /* Pre-norm gates (two, same design) */
    /* Structures the road runs through are registered one piece at a time, so
       each pillar sorts on its own depth. A single key for the whole gate puts
       the near pillar behind a vehicle that should be passing under it. */
    function straddleGate(gx, gy) {
      put({ kind: 'gatePost', x: gx, y: gy - 1.7, color: C.stone });
      put({ kind: 'gateBeam', x: gx, y: gy, color: C.stone });
      put({ kind: 'gatePost', x: gx, y: gy + 1.7, color: C.stone });
    }

    straddleGate(34, 11);
    straddleGate(14, 21);

    /* Attention Plaza: Q / K / V substations around a roundabout */
    put({ kind: 'plaza', x: 24, y: 11, color: C.rose });
    landmark(21.4, 8.4, { w: 1.8, d: 1.8, h: 3.2, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'Q' });
    landmark(24.0, 8.0, { w: 1.8, d: 1.8, h: 3.9, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'K' });
    landmark(26.6, 8.4, { w: 1.8, d: 1.8, h: 3.2, color: '#d6aebb', cols: 2, lit: C.rose, tag: 'V' });

    /* Residual bridges */
    put({ kind: 'bridge', x: 14, y: 11, color: C.teal });
    put({ kind: 'bridge', x: 32, y: 21, color: C.teal });

    /* Feed-forward mill */
    put({ kind: 'mill', x: 23, y: 21, color: C.orange });
    landmark(19.6, 23.6, { w: 2.4, d: 2.0, h: 2.4, color: '#dcc6a0', cols: 3, lit: C.ochre });
    landmark(26.6, 23.6, { w: 2.6, d: 2.0, h: 2.0, color: '#dcc6a0', cols: 3, lit: C.ochre });

    /* Layer counter arch */
    put({ kind: 'archPillar', x: 37.35, y: 16, color: C.brick });
    put({ kind: 'archBeam',   x: 39.00, y: 16, color: C.brick });
    put({ kind: 'archPillar', x: 40.65, y: 16, color: C.brick });

    /* Final norm */
    straddleGate(36, 27);

    /* Vocabulary stadium */
    put({ kind: 'stadium', x: 27, y: 27, color: C.moss });

    /* Sampler */
    put({ kind: 'sampler', x: 15, y: 27, color: C.plum });

    /* Output plaza jumbotron */
    put({ kind: 'jumbotron', x: 6, y: 27, color: C.steel });
  }

  /* ---- filler city ------------------------------------------------------- */

  var FILLER_BLOCKS = [
    { x0: 12, y0: 7.6, x1: 33, y1: 9.2, density: 0.5, hMin: 0.8, hMax: 2.2 },
    { x0: 41, y0: 3, x1: 45, y1: 12, density: 0.55, hMin: 1.0, hMax: 4.5 },
    { x0: 6, y0: 23.2, x1: 38, y1: 25.6, density: 0.5, hMin: 0.9, hMax: 2.6 },
    { x0: 10, y0: 12.6, x1: 37, y1: 14.4, density: 0.35, hMin: 0.6, hMax: 1.6 },
    { x0: 10, y0: 17.8, x1: 37, y1: 19.6, density: 0.35, hMin: 0.6, hMax: 1.6 },
    { x0: 32, y0: 29.4, x1: 44, y1: 33, density: 0.5, hMin: 0.8, hMax: 3.0 },
    { x0: 8, y0: 30.0, x1: 20, y1: 33, density: 0.42, hMin: 0.8, hMax: 2.4 },
    { x0: 0.5, y0: 8, x1: 5.0, y1: 24, density: 0.3, hMin: 0.6, hMax: 1.8 },
    { x0: 0.5, y0: 0.5, x1: 10, y1: 2.0, density: 0.4, hMin: 0.8, hMax: 2.6 }
  ];

  /* Facades and roof tiles in the register the game uses: cream render, brick,
     stucco and painted board, with terracotta or slate on top. */
  var FILLER_COLORS = [
    '#e3d8bd', '#d3bb98', '#c08a72', '#b0c2d2', '#cdd3bb', '#e0cfae', '#a9b8a2', '#d8c3b0'
  ];
  var ROOF_COLORS = ['#a05340', '#6d737b', '#8c4636', '#57616d', '#7d6350', '#94503f'];

  function buildFiller() {
    for (var b = 0; b < FILLER_BLOCKS.length; b++) {
      var blk = FILLER_BLOCKS[b];
      for (var x = blk.x0; x < blk.x1 - 1; x += 1.9) {
        for (var y = blk.y0; y < blk.y1 - 1; y += 1.9) {
          var n = Iso.hash2(x * 10, y * 10, b + 5);
          if (n > blk.density) continue;
          var jx = x + Iso.hash2(x * 3, y * 7, 1) * 0.35;
          var jy = y + Iso.hash2(x * 5, y * 11, 2) * 0.35;
          if (distToRoutes(jx + 0.6, jy + 0.6) < 2.1) continue;
          if (distToDistricts(jx + 0.6, jy + 0.6) < 0.6) continue;
          var h = blk.hMin + Iso.hash2(x * 13, y * 3, 4) * (blk.hMax - blk.hMin);
          var w = 0.9 + Iso.hash2(x, y, 8) * 0.5;
          var d = 0.9 + Iso.hash2(x, y, 9) * 0.5;
          /* Low blocks get a pitched roof; anything tall enough to read as a
             tower gets a flat roof with plant on it. */
          var pitched = h < 2.0;
          buildings.push({
            x: jx, y: jy, z: 0, w: w, d: d, h: h, filler: true,
            color: FILLER_COLORS[Math.floor(Iso.hash2(x, y, 12) * FILLER_COLORS.length)],
            roof: pitched ? ROOF_COLORS[Math.floor(Iso.hash2(x, y, 31) * ROOF_COLORS.length)] : null,
            roofH: 0.34 + Iso.hash2(x, y, 33) * 0.3,
            rooftop: !pitched,
            windows: { cols: 2, rows: Math.max(1, Math.round(h * 1.6)), seed: (jx * 71 + jy * 37) | 0 }
          });
        }
      }
    }
  }

  /* ---- props ------------------------------------------------------------- */

  var props = [];

  function buildProps() {
    /* street lamps along the main routes */
    ALL_ROUTES.forEach(function (route, ri) {
      var step = 5.4;
      for (var d = step; d < route.total; d += step) {
        var p = route.at(d);
        if (p.x < 0 || p.x > 46) continue;
        var nx = -p.dy, ny = p.dx;
        props.push({ kind: 'lamp', x: p.x + nx * 1.35, y: p.y + ny * 1.35, z: p.z, side: 1, route: ri });
        props.push({ kind: 'lamp', x: p.x - nx * 1.35, y: p.y - ny * 1.35, z: p.z, side: -1, route: ri });
      }
    });

    /* trees in the leftover interior of the ring */
    for (var x = 9; x < 38; x += 1.5) {
      for (var y = 12.4; y < 20; y += 1.5) {
        if (Math.abs(y - 16) < 1.6) continue;            // silo row
        if (distToRoutes(x, y) < 2.0) continue;
        var n = Iso.hash2(x * 9, y * 9, 21);
        if (n > 0.22) continue;
        props.push({ kind: 'tree', x: x, y: y, z: 0, s: 0.75 + n });
      }
    }
    /* a few parks elsewhere */
    for (x = 20; x < 34; x += 1.4) {
      for (y = 29.6; y < 33; y += 1.4) {
        if (Iso.hash2(x * 4, y * 4, 33) > 0.3) continue;
        props.push({ kind: 'tree', x: x, y: y, z: 0, s: 0.8 });
      }
    }
  }

  /* ---- dynamic anchors --------------------------------------------------- */

  /* The cache row sits inside the layer ring and wraps onto further rows as
     the context grows; 3 rows × 18 silos covers the longest prompt we tokenize. */
  var SILO_X0 = 10.8, SILO_STEP = 1.55, SILO_MAX = 18, SILO_Y = 15.2, SILO_ROW = 1.75;

  function siloPos(i) {
    var row = Math.floor(i / SILO_MAX);
    return { x: SILO_X0 + (i % SILO_MAX) * SILO_STEP, y: SILO_Y + row * SILO_ROW };
  }

  var TOWER_X0 = 20.4, TOWER_STEP = 1.95, TOWER_Y = 30.6;

  function towerPos(i) {
    return { x: TOWER_X0 + i * TOWER_STEP, y: TOWER_Y };
  }

  /* ---- build ------------------------------------------------------------- */

  var built = false;
  function build() {
    if (built) return;
    built = true;
    buildLandmarks();
    buildFiller();
    buildProps();
    buildings.sort(function (a, b) {
      return (a.x + a.y + (a.w || 0) * 0.5 + (a.d || 0) * 0.5) - (b.x + b.y + (b.w || 0) * 0.5 + (b.d || 0) * 0.5);
    });
  }

  global.City = {
    GW: 46, GH: 34,
    routes: { intake: INTAKE, loop: LOOP, exit: EXIT, feedback: FEEDBACK },
    stations: STATIONS,
    districts: DISTRICTS,
    districtById: DISTRICT_BY_ID,
    stageToDistrict: STAGE_TO_DISTRICT,
    buildings: buildings,
    props: props,
    palette: C,
    siloPos: siloPos, SILO_MAX: SILO_MAX,
    towerPos: towerPos,
    distToRoutes: distToRoutes,
    build: build
  };
})(window);
