(function () {
  "use strict";
  const C = window.KernelCore,
    $ = (id) => document.getElementById(id),
    KEY = "kernel-valley-v1";
  const colors = {
    ink: "#222222",
    blue: "#7199F1",
    blue2: "#83A3F1",
    lime: "#EFFE74",
    white: "#FFFFFF",
    paper: "#F4F5F7",
    field: "#D5E0F8",
    line: "#4F5B72",
    pale: "#E5ECFA",
    soil: "#5A657C",
    deep: "#2149A1",
  };
  let s,
    cv,
    ctx,
    terrain,
    active = false,
    paused = false,
    mode = null,
    path = [],
    pendingAction = null,
    last = 0,
    stepClock = 0,
    saveClock = 0,
    uiClock = 0,
    raf = 0,
    shownWin = false,
    sound = false,
    audio = null,
    held = null;
  const keys = new Set(),
    modal = $("modal");
  function beep(freq = 440) {
    if (!sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.025, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.09);
    } catch {}
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      $("save-status").textContent = "Сохранено на этом устройстве";
    } catch {
      $("save-status").textContent =
        "Хранилище недоступно: прогресс только до закрытия";
    }
  }
  function show(html) {
    keys.clear();
    held = null;
    path = [];
    pendingAction = null;
    $("modal-content").innerHTML = html;
    modal.showModal();
  }
  function close() {
    modal.close();
    last = performance.now();
    cv.focus({ preventScroll: true });
  }
  function title(text) {
    return '<h2 id="modal-title">' + text + "</h2>";
  }
  function button(label, id, primary = false) {
    return (
      '<button id="' +
      id +
      '"' +
      (primary ? ' class="primary"' : "") +
      ">" +
      label +
      "</button>"
    );
  }
  function help() {
    show(
      title("Первая смена андроида") +
        "<p>Верни деревню в сеть. Урожай превращается в патчи, патчи чинят узлы, а помощник берёт на себя ферму.</p><ol><li><b>Посади кукурузу.</b> Нажми на грядку слева. Через 12 секунд нажми снова: +2 кукурузы и +3 кредита.</li><li><b>Собери линию.</b> Выбери «Конвейер» и поставь 5 секций на стрелки справа от бункера. Завод — на клетку Z в конце ряда. Для разбора выбери «Разобрать». Повторное нажатие кнопки выключает строительство.</li><li><b>Защити три узла.</b> Нужен патч и верный ответ жителю. Узлы отмечены ! на карте.</li><li><b>Отбейся от багов.</b> Подойди вплотную и нажми пробел 3 раза. Они воруют созревший урожай.</li><li><b>Развивай деревню.</b> В сельпо найми помощника, дома купи улучшение. В мастерской нарисуй помощнику облик.</li></ol><p>Стрелки / WASD — идти, E — действие рядом, пробел — удар, Esc — пауза. На телефоне — кнопки под картой. При открытом окне и в скрытой вкладке мир стоит на паузе.</p>" +
        button("Начать смену", "help-done", true),
    );
    $("help-done").onclick = close;
  }
  function setMode(value) {
    mode = mode === value ? null : value;
    path = [];
    pendingAction = null;
    for (const t of ["belt", "factory", "erase"])
      $("build-" + t).setAttribute("aria-pressed", String(mode === t));
    s.log = mode
      ? "Режим строительства. Нажми на клетку площадки. Esc или повторное нажатие кнопки — выйти."
      : "Строительство выключено. Можно исследовать деревню.";
    update();
    draw();
  }
  function dialog(kind, q) {
    if (kind === "quiz") {
      const item = C.questions[q];
      show(
        title(item.title) +
          "<p><b>" +
          item.speaker +
          ":</b> " +
          item.text +
          '</p><p>Ремонт: 1 патч. За восстановление — 8 кредитов.</p><div class="options">' +
          item.answers.map((a, i) => button(a, "answer-" + i)).join("") +
          '</div><p id="feedback" role="status"></p>',
      );
      item.answers.forEach(
        (a, i) =>
          ($("answer-" + i).onclick = () => {
            const good = C.answer(s, q, i);
            $("feedback").className = "feedback";
            $("feedback").textContent = good
              ? "Узел восстановлен. " + item.why
              : "Небезопасный вариант. " + item.why;
            if (good) {
              document
                .querySelectorAll(".options button")
                .forEach((b) => (b.disabled = true));
              const done = document.createElement("button");
              done.textContent = "Вернуться в деревню";
              done.onclick = close;
              $("modal-content").append(done);
              beep(700);
              save();
            }
            update();
            draw();
          }),
      );
      return;
    }
    if (kind === "shop") {
      show(
        title("Сельпо «У Веры»") +
          '<p>«Кукурузу принимаю, странные звонки — нет. Нужны рабочие руки? Есть один надёжный робот».</p><p>Помощник каждые 3 секунды сажает или собирает одну грядку.</p><div class="options">' +
          button(
            s.helper ? "Помощник уже работает" : "Нанять помощника · 12 кр.",
            "hire",
          ) +
          button("Продать 2 кукурузы · +5 кр.", "sell") +
          '</div><p id="shop-status" role="status"></p>',
      );
      $("hire").disabled = s.helper;
      $("hire").onclick = () => {
        C.buy(s, "helper");
        $("hire").disabled = s.helper;
        $("shop-status").textContent = s.log;
        update();
        save();
      };
      $("sell").onclick = () => {
        C.buy(s, "sell");
        $("shop-status").textContent = s.log;
        update();
        save();
      };
      return;
    }
    if (kind === "home") {
      show(
        title("Дом андроида") +
          '<p>Здесь пахнет нагретой платой и свежим патчем. Ремонт бесплатный. Улучшение дома добавляет 2 единицы максимальной прочности.</p><div class="options">' +
          button("Восстановить прочность · бесплатно", "heal") +
          button(
            s.home ? "Дом уже улучшен" : "Улучшить дом · 10 кр.",
            "upgrade",
          ) +
          '</div><p id="home-status" role="status"></p>',
      );
      $("upgrade").disabled = !!s.home;
      for (const [id, type] of [
        ["heal", "heal"],
        ["upgrade", "home"],
      ])
        $(id).onclick = () => {
          C.buy(s, type);
          $("home-status").textContent = s.log;
          $("upgrade").disabled = !!s.home;
          update();
          save();
        };
      return;
    }
    if (kind === "art") art();
  }
  function art() {
    let paint = 1,
      drawing = s.drone.slice();
    const pal = [colors.white, colors.blue, colors.lime, colors.ink];
    show(
      title("Нарисуй помощника") +
        '<p>Каждая клетка — пиксель. Этот рисунок станет обликом нанятого робота на ферме.</p><div class="palette">' +
        ["Ластик", "Синий", "Лайм", "Тёмный"]
          .map(
            (label, i) =>
              '<button id="color-' +
              i +
              '" aria-pressed="' +
              (i === 1) +
              '">' +
              label +
              "</button>",
          )
          .join("") +
        '</div><div class="drawing" aria-label="Рисунок 8 на 8 пикселей">' +
        drawing
          .map(
            (v, i) =>
              '<button aria-label="Пиксель ' +
              (i + 1) +
              '" data-pixel="' +
              i +
              '" style="background:' +
              pal[v] +
              '"></button>',
          )
          .join("") +
        '</div><div class="dialog-actions">' +
        button("Сохранить облик", "art-save", true) +
        button("Очистить", "art-clear") +
        "</div>",
    );
    for (let i = 0; i < 4; i++)
      $("color-" + i).onclick = () => {
        paint = i;
        for (let j = 0; j < 4; j++)
          $("color-" + j).setAttribute("aria-pressed", String(i === j));
      };
    const cells = [...document.querySelectorAll("[data-pixel]")];
    function set(i) {
      drawing[i] = paint;
      cells[i].style.background = pal[paint];
    }
    cells.forEach((el, i) => {
      el.onclick = () => set(i);
      el.onpointerdown = (e) => {
        if (e.pointerType === "mouse") {
          e.preventDefault();
          set(i);
        }
      };
      el.onpointerenter = (e) => {
        if (e.buttons === 1 && e.pointerType === "mouse") set(i);
      };
    });
    $("art-clear").onclick = () => {
      drawing.fill(0);
      cells.forEach((el) => (el.style.background = pal[0]));
    };
    $("art-save").onclick = () => {
      if (!drawing.some(Boolean)) {
        s.log = "Пустой рисунок: помощник использует стандартный облик.";
      } else
        s.log =
          "Новый облик готов. Найми помощника в сельпо, чтобы увидеть его на поле.";
      s.drone = drawing;
      save();
      close();
      update();
    };
  }
  function act(x, y) {
    const result = C.interact(s, x, y);
    if (result.dialog) dialog(result.dialog, result.q);
    else beep(330);
    update();
    draw();
  }
  function interactNearby() {
    const p = s.player,
      front = { x: p.x + p.face[0], y: p.y + p.face[1] };
    const candidates = [
      front,
      { x: p.x, y: p.y },
      ...C.sites,
      ...s.plots,
      { x: 15, y: 9 },
    ];
    const target = candidates.find(
      (o) =>
        C.distance(p, o) <= 1 &&
        (C.sites.some((t) => t.x === o.x && t.y === o.y) ||
          s.plots.some((t) => t.x === o.x && t.y === o.y) ||
          (o.x === 15 && o.y === 9)),
    );
    if (target) act(target.x, target.y);
    else {
      s.log = "Рядом нет объекта. Подойди к грядке, дому или жителю.";
      update();
    }
  }
  function route(tx, ty) {
    const target = { x: tx, y: ty },
      interactable =
        !!C.sites.find((o) => o.x === tx && o.y === ty) ||
        s.plots.some((o) => o.x === tx && o.y === ty) ||
        (tx === 15 && ty === 9);
    const goal = (p) =>
      interactable ? C.distance(p, target) <= 1 : p.x === tx && p.y === ty;
    const start = { x: s.player.x, y: s.player.y, steps: [] },
      queue = [start],
      seen = new Set([start.x + "," + start.y]);
    let found = null;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (goal(p)) {
        found = p.steps;
        break;
      }
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const x = p.x + dx,
          y = p.y + dy,
          k = x + "," + y;
        if (!seen.has(k) && C.walkable(s, x, y)) {
          seen.add(k);
          queue.push({ x, y, steps: [...p.steps, [dx, dy]] });
        }
      }
    }
    if (found === null) {
      s.log = "Туда не пройти. Выбери свободную клетку.";
      update();
      return;
    }
    path = found;
    pendingAction = interactable ? [tx, ty] : null;
    if (!path.length && pendingAction) {
      pendingAction = null;
      act(tx, ty);
    }
  }
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function text(str, x, y, color = colors.ink, size = 10) {
    ctx.font = "bold " + size + "px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  }
  function makeTerrain() {
    terrain = document.createElement("canvas");
    terrain.width = 768;
    terrain.height = 576;
    const old = ctx;
    ctx = terrain.getContext("2d");
    rect(0, 0, 768, 576, colors.field);
    for (let y = 0; y < C.H; y++)
      for (let x = 0; x < C.W; x++) {
        const v = (x * 13 + y * 7 + s.seed) % 9;
        rect(x * 32, y * 32, 32, 32, v < 3 ? colors.pale : colors.field);
        if (x === 0 || y === 0 || x === 23 || y === 17) {
          rect(x * 32, y * 32, 32, 32, colors.deep);
          rect(x * 32 + 4, y * 32 + 12, 20, 2, colors.blue);
        } else if (v === 2) {
          rect(x * 32 + 4, y * 32 + 20, 2, 4, colors.blue2);
          rect(x * 32 + 8, y * 32 + 18, 2, 6, colors.blue2);
        }
      }
    // Paths tie the farm, workshop and three network nodes together.
    for (let y = 5; y <= 14; y++) {
      rect(9 * 32, y * 32, 64, 32, colors.paper);
      rect(18 * 32, y * 32, 32, 32, colors.paper);
    }
    for (const y of [5, 7, 12]) rect(3 * 32, y * 32, 18 * 32, 32, colors.paper);
    for (let x = 4; x <= 19; x++) rect(x * 32, 14 * 32, 32, 32, colors.paper);
    for (let y = 8; y <= 10; y++)
      for (let x = 16; x <= 21; x++) {
        rect(x * 32 + 1, y * 32 + 1, 30, 30, colors.white);
        rect(x * 32 + 1, y * 32 + 30, 30, 1, colors.blue2);
        text(
          y === 9 ? (x === 21 ? "Z" : "→") : "·",
          x * 32 + 16,
          y * 32 + 21,
          colors.line,
          14,
        );
      }
    text("КУКУРУЗА", 5 * 32 + 16, 8 * 32 - 12, colors.line);
    text("ПРОИЗВОДСТВО ПАТЧЕЙ", 18 * 32 + 16, 8 * 32 - 12, colors.line);
    // Fence posts and irrigation pipe.
    for (let x = 3; x <= 7; x++) {
      rect(x * 32, 11 * 32 + 15, 3, 14, colors.line);
      rect(x * 32, 11 * 32 + 18, 32, 3, colors.blue2);
    }
    for (const t of s.trees) {
      const x = t.x * 32,
        y = t.y * 32;
      rect(x + 13, y + 19, 6, 12, colors.line);
      rect(x + 4, y + 5, 24, 18, colors.blue2);
      rect(x + 9, y, 14, 25, colors.blue);
      rect(x + 9, y + 4, 5, 6, colors.pale);
    }
    ctx = old;
  }
  function building(o) {
    const x = o.x * 32 + 16,
      y = o.y * 32 + 16;
    rect(x - 23, y + 10, 48, 9, colors.line);
    rect(x - 22, y - 16, 44, 30, colors.white);
    rect(x - 27, y - 25, 54, 10, colors.deep);
    rect(x - 21, y - 34, 42, 10, colors.blue);
    rect(x - 14, y - 42, 28, 8, colors.blue2);
    rect(x - 4, y - 3, 9, 17, colors.line);
    rect(x - 17, y - 10, 8, 8, colors.blue);
    rect(x + 10, y - 10, 8, 8, colors.blue);
    if (o.type === "home" && s.home) {
      rect(x + 17, y - 45, 4, 14, colors.ink);
      rect(x + 21, y - 45, 12, 7, colors.lime);
    }
    text(
      o.type === "home" ? "ДОМ" : o.type === "shop" ? "СЕЛЬПО" : "МАСТЕРСКАЯ",
      x,
      y + 32,
      colors.ink,
      9,
    );
  }
  function terminal(o) {
    const x = o.x * 32 + 16,
      y = o.y * 32 + 16,
      ok = s.solved.includes(o.q);
    rect(x - 13, y + 9, 28, 7, colors.line);
    rect(x - 12, y - 13, 24, 24, colors.ink);
    rect(x - 8, y - 9, 16, 13, ok ? colors.lime : colors.white);
    text(ok ? "✓" : "!", x, y + 2, colors.ink, 12);
    rect(x - 3, y - 20, 5, 7, colors.blue);
    text(o.name, x, y + 29, colors.line, 9);
  }
  function robot(x, y, helper = false) {
    const px = x * 32 + 16,
      py = y * 32 + 16;
    rect(px - 11, py + 10, 24, 5, colors.soil);
    if (helper && s.drone.some(Boolean)) {
      const pal = [null, colors.blue, colors.lime, colors.ink];
      s.drone.forEach((v, i) => {
        if (v)
          rect(
            px - 12 + (i % 8) * 3,
            py - 15 + Math.floor(i / 8) * 3,
            3,
            3,
            pal[v],
          );
      });
      return;
    }
    rect(px - 8, py + 5, 6, 8, colors.ink);
    rect(px + 3, py + 5, 6, 8, colors.ink);
    rect(px - 10, py - 6, 20, 16, helper ? colors.lime : colors.blue);
    rect(px - 13, py - 2, 4, 10, colors.line);
    rect(px + 10, py - 2, 4, 10, colors.line);
    rect(px - 9, py - 19, 18, 14, colors.white);
    rect(px - 6, py - 15, 12, 6, colors.ink);
    rect(px - 4, py - 14, 3, 3, colors.blue);
    rect(px + 2, py - 14, 3, 3, colors.blue);
    rect(px - 1, py - 24, 2, 5, colors.ink);
    rect(px - 2, py - 25, 4, 3, colors.lime);
  }
  function draw() {
    if (!ctx || !s) return;
    ctx.drawImage(terrain, 0, 0);
    for (const p of s.plots) {
      const x = p.x * 32,
        y = p.y * 32;
      rect(x + 1, y + 1, 30, 30, colors.soil);
      for (let i = 0; i < 3; i++)
        rect(x + 4, y + 5 + i * 8, 24, 2, colors.line);
      if (p.age >= 0) {
        const h = 6 + Math.floor((p.age / C.GROW) * 17);
        rect(x + 15, y + 25 - h, 3, h, colors.blue);
        rect(x + 9, y + 18 - h / 2, 7, 3, colors.blue2);
        rect(x + 18, y + 12 - h / 3, 6, 3, colors.blue2);
        if (p.age >= C.GROW) {
          rect(x + 10, y + 5, 5, 10, colors.lime);
          rect(x + 19, y + 10, 5, 9, colors.lime);
        } else {
          rect(x + 4, y + 28, (24 * p.age) / C.GROW, 2, colors.lime);
        }
      }
    }
    for (const o of C.sites) o.type === "terminal" ? terminal(o) : building(o);
    const bx = 15 * 32,
      by = 9 * 32;
    rect(bx + 3, by + 4, 26, 26, colors.ink);
    rect(bx + 6, by + 7, 20, 12, colors.lime);
    text("Б", bx + 16, by + 18);
    text("Бункер", bx + 16, by + 46, colors.line, 9);
    for (const b of s.builds) {
      const x = b.x * 32,
        y = b.y * 32;
      if (b.type === "belt") {
        rect(x + 1, y + 6, 30, 21, colors.line);
        rect(x + 2, y + 9, 28, 15, colors.blue2);
        for (let i = 0; i < 3; i++) {
          const shift =
            active && !paused && !modal.open ? (s.time * 10) % 10 : 0;
          const t = (i * 10 + shift) % 28;
          rect(x + 2 + t, y + 10, 2, 13, colors.deep);
        }
        text("→", x + 16, y + 21, colors.ink, 15);
        if (C.connected(s) && s.corn > 0)
          rect(x + 5 + ((s.time * 12) % 20), y + 12, 5, 7, colors.lime);
      } else {
        rect(x, y + 3, 32, 27, colors.line);
        rect(x + 3, y + 7, 26, 19, colors.white);
        rect(x + 7, y + 11, 18, 9, colors.lime);
        rect(x + 23, y - 9, 6, 15, colors.ink);
        text("Z", x + 16, y + 20);
      }
    }
    if (s.helper) {
      const p = s.plots[Math.floor(s.time / 3) % 9];
      robot(p.x + 0.65, p.y, true);
    }
    for (const b of s.bugs) {
      if (b.hp <= 0) continue;
      const x = b.x * 32 + 16,
        y = b.y * 32 + 16;
      rect(x - 11, y - 9, 22, 18, colors.ink);
      rect(x - 15, y - 5, 5, 3, colors.deep);
      rect(x + 10, y - 5, 5, 3, colors.deep);
      rect(x - 15, y + 5, 5, 3, colors.deep);
      rect(x + 10, y + 5, 5, 3, colors.deep);
      rect(x - 6, y - 6, 4, 5, colors.lime);
      rect(x + 3, y - 6, 4, 5, colors.lime);
      rect(x - 7, y + 4, 14, 2, colors.blue);
      for (let i = 0; i < 3; i++)
        rect(
          x - 10 + i * 7,
          y - 17,
          5,
          3,
          i < b.hp ? colors.ink : colors.white,
        );
    }
    if (s.player.inv === 0 || Math.floor(s.time * 8) % 2 === 0)
      robot(s.player.x, s.player.y);
    const px = s.player.x * 32 + 16,
      py = s.player.y * 32 + 16;
    rect(px - 3, py - 30, 6, 3, colors.deep);
    if (s.attack > 0.17) {
      ctx.strokeStyle = colors.white;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (path.length) {
      let x = s.player.x,
        y = s.player.y;
      for (const [dx, dy] of path) {
        x += dx;
        y += dy;
        rect(x * 32 + 14, y * 32 + 14, 4, 4, colors.deep);
      }
    }
    if (mode) {
      ctx.strokeStyle = colors.deep;
      ctx.lineWidth = 2;
      ctx.strokeRect(16 * 32 + 1, 8 * 32 + 1, 6 * 32 - 2, 3 * 32 - 2);
    }
  }
  function update() {
    if (!s) return;
    $("health").textContent = s.player.hp + " / " + (s.home ? 8 : 6);
    for (const k of ["credits", "corn", "patches"]) $(k).textContent = s[k];
    $("log").textContent = s.log;
    const quests = [
      [
        "Собрать первый урожай",
        s.harvests > 0,
        "Грядки слева · рост 12 секунд",
      ],
      [
        "Запустить производство",
        s.produced >= 3,
        "Выпущено патчей: " + s.produced + " / 3",
      ],
      [
        "Вернуть связь с деревней",
        s.solved.length === 3,
        "Защищено узлов: " + s.solved.length + " / 3",
      ],
      [
        "Очистить поля от багов",
        s.kills >= 3,
        "Обезврежено: " + s.kills + " / 3",
      ],
      [
        "Обустроиться",
        s.helper && s.home,
        "Помощник: " +
          (s.helper ? "нанят" : "сельпо") +
          " · дом: " +
          (s.home ? "улучшен" : "нужен апгрейд"),
      ],
    ];
    $("quests").innerHTML = quests
      .map(
        ([name, done, hint]) =>
          '<li class="' +
          (done ? "done" : "") +
          '"><b>' +
          name +
          "</b><small>" +
          hint +
          "</small></li>",
      )
      .join("");
    $("location").textContent = mode
      ? "Строительство · " +
        {
          belt: "конвейер вправо",
          factory: "завод",
          erase: "разбор с возвратом стоимости",
        }[mode]
      : s.won
        ? "Деревня восстановлена · свободная игра"
        : "Кибердеревня · окраина сети";
  }
  function win() {
    shownWin = true;
    save();
    show(
      title("Деревня снова в сети!") +
        "<p>Кукуруза растёт, конвейер работает, три узла защищены. Даже Вера из сельпо больше не диктует коды незнакомцам.</p><p><b>Смена завершена за " +
        Math.floor(s.time / 60) +
        " мин " +
        Math.floor(s.time % 60) +
        " с.</b><br>Урожай собран " +
        s.harvests +
        " раз. Выпущено патчей: " +
        s.produced +
        ". Багов обезврежено: " +
        s.kills +
        ".</p><p>Это конец первой миссии. Можно остаться, нарисовать новый облик помощника и развивать хозяйство.</p>" +
        button("Остаться в деревне", "continue", true),
    );
    $("continue").onclick = close;
    beep(880);
  }
  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!paused && !modal.open && !document.hidden) {
      C.tick(s, dt);
      stepClock += dt;
      saveClock += dt;
      uiClock += dt;
      if (stepClock >= 0.14) {
        stepClock = 0;
        let d = held;
        for (const [key, dir] of [
          ["arrowup", [0, -1]],
          ["w", [0, -1]],
          ["ц", [0, -1]],
          ["arrowdown", [0, 1]],
          ["s", [0, 1]],
          ["ы", [0, 1]],
          ["arrowleft", [-1, 0]],
          ["a", [-1, 0]],
          ["ф", [-1, 0]],
          ["arrowright", [1, 0]],
          ["d", [1, 0]],
          ["в", [1, 0]],
        ])
          if (keys.has(key)) {
            d = dir;
            break;
          }
        if (d) {
          path = [];
          pendingAction = null;
          C.move(s, ...d);
        } else if (path.length) {
          if (!C.move(s, ...path.shift())) {
            path = [];
            pendingAction = null;
            s.log = "На пути баг. Обезвредь его пробелом или выбери обход.";
          }
          if (!path.length && pendingAction) {
            const a = pendingAction;
            pendingAction = null;
            act(...a);
          }
        }
      }
      if (saveClock >= 5) {
        saveClock = 0;
        save();
      }
      if (uiClock >= 0.15) {
        uiClock = 0;
        update();
      }
      if (s.won && !shownWin) win();
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    paused = !paused;
    keys.clear();
    held = null;
    $("pause-banner").hidden = !paused;
    $("pause").textContent = paused ? "Продолжить" : "Пауза";
    if (paused) save();
    last = performance.now();
  }
  function prepare() {
    cv = $("world");
    ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.imageSmoothingEnabled = false;
    let saved = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    s = saved ? C.restore(saved) : null;
    if (!s) {
      s = C.create(Math.floor(Math.random() * 0x7fffffff));
      if (saved)
        s.log = "Сохранение повреждено или устарело. Создана новая деревня.";
    }
    shownWin = s.won;
    makeTerrain();
    update();
    draw();
    $("help").onclick = help;
    $("pause").onclick = pause;
    $("interact").onclick = () => {
      if (!paused) interactNearby();
    };
    $("attack").onclick = () => {
      if (!paused) {
        C.attack(s);
        beep(160);
        draw();
      }
    };
    for (const t of ["belt", "factory", "erase"])
      $("build-" + t).onclick = () => {
        if (!paused) setMode(t);
      };
    $("sound").onclick = () => {
      sound = !sound;
      $("sound").setAttribute("aria-pressed", String(sound));
      $("sound").textContent = "Звук: " + (sound ? "вкл." : "выкл.");
      beep();
    };
    $("save").onclick = save;
    $("restart").onclick = () => {
      show(
        title("Начать новую деревню?") +
          '<p>Текущее сохранение на этом устройстве будет заменено. Облик помощника тоже сбросится.</p><div class="dialog-actions">' +
          button("Оставить текущую", "cancel-reset") +
          button("Начать заново", "confirm-reset", true) +
          "</div>",
      );
      $("cancel-reset").onclick = close;
      $("confirm-reset").onclick = () => {
        s = C.create(Math.floor(Math.random() * 0x7fffffff));
        shownWin = false;
        path = [];
        pendingAction = null;
        mode = null;
        for (const t of ["belt", "factory", "erase"])
          $("build-" + t).setAttribute("aria-pressed", "false");
        makeTerrain();
        save();
        update();
        close();
        draw();
      };
    };
    $("close-modal").onclick = close;
    modal.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    cv.addEventListener("click", (e) => {
      if (paused || modal.open) return;
      const r = cv.getBoundingClientRect(),
        x = Math.floor(((e.clientX - r.left) / r.width) * C.W),
        y = Math.floor(((e.clientY - r.top) / r.height) * C.H);
      if (mode) {
        C.build(s, x, y, mode);
        update();
        draw();
        beep(220);
      } else route(x, y);
      cv.focus({ preventScroll: true });
    });
    document.querySelectorAll("[data-dir]").forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        if (paused || modal.open) return;
        e.preventDefault();
        held = el.dataset.dir.split(",").map(Number);
        el.setPointerCapture(e.pointerId);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        el.addEventListener(event, () => (held = null));
    });
    window.addEventListener("keydown", (e) => {
      if (!active || modal.open) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        e.preventDefault();
        if (mode) setMode(mode);
        else pause();
        return;
      }
      if (paused) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
        e.preventDefault();
      if (e.target instanceof HTMLButtonElement && [" ", "enter"].includes(k))
        return;
      keys.add(k);
      if (!e.repeat) {
        const dir = {
          arrowup: [0, -1],
          w: [0, -1],
          ц: [0, -1],
          arrowdown: [0, 1],
          s: [0, 1],
          ы: [0, 1],
          arrowleft: [-1, 0],
          a: [-1, 0],
          ф: [-1, 0],
          arrowright: [1, 0],
          d: [1, 0],
          в: [1, 0],
        }[k];
        if (dir) {
          path = [];
          pendingAction = null;
          C.move(s, ...dir);
          stepClock = 0;
          draw();
        }
        if (k === "e" || k === "у") interactNearby();
        if (k === " ") {
          C.attack(s);
          beep(160);
        }
      }
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      keys.clear();
      held = null;
    });
    document.addEventListener("visibilitychange", () => {
      keys.clear();
      held = null;
      last = performance.now();
      if (document.hidden) save();
    });
    window.addEventListener("pagehide", save);
  }
  function start() {
    if (active) return;
    $("game").hidden = false;
    active = true;
    last = performance.now();
    cv.focus({ preventScroll: true });
    raf = requestAnimationFrame(frame);
    if (s.time === 0) help();
  }
  window.KernelGame = { prepare, start };
})();
