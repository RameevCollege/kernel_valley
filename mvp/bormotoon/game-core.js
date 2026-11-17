/* Deterministic simulation; no DOM, networking, dependencies or real security tooling. */
(function (root) {
  "use strict";
  const W = 24,
    H = 18,
    GROW = 12;
  const sites = [
    { x: 8, y: 4, name: "Вера · сельпо", type: "shop" },
    { x: 4, y: 4, name: "Дом андроида", type: "home" },
    { x: 12, y: 4, name: "Мастерская", type: "art" },
    { x: 19, y: 4, name: "Узел связи", type: "terminal", q: 0 },
    { x: 19, y: 14, name: "Архив", type: "terminal", q: 1 },
    { x: 5, y: 14, name: "Насосная", type: "terminal", q: 2 },
  ];
  const questions = [
    {
      title: "Звонок в сельпо",
      speaker: "Вера",
      text: "«Это служба поддержки. Продиктуйте код входа, иначе отключим кассу». Что посоветуешь?",
      answers: [
        "Назвать код: касса важнее",
        "Завершить звонок и связаться с поддержкой по известному номеру",
        "Переслать код соседу для проверки",
      ],
      correct: 1,
      why: "Код входа нельзя передавать собеседнику. Проверяем запрос через независимый, заранее известный канал.",
    },
    {
      title: "Архив без запасной копии",
      speaker: "Архивариус",
      text: "Обновление сломало архив. Вчерашняя резервная копия есть. Как вернуть данные?",
      answers: [
        "Восстановить проверенную копию и проверить результат",
        "Удалить всё и отключить резервирование",
        "Скачать случайный «восстановитель» из рекламы",
      ],
      correct: 0,
      why: "Проверенная резервная копия помогает восстановить данные. После восстановления нужно проверить их целостность.",
    },
    {
      title: "Патч для насосной",
      speaker: "Агроном",
      text: "Для контроллера вышло исправление уязвимости. Как обновить его?",
      answers: [
        "Открыть вложение из письма неизвестного отправителя",
        "Оставить уязвимость: пока же работает",
        "Взять обновление у производителя, сохранить копию и проверить после установки",
      ],
      correct: 2,
      why: "Обновления берём из доверенного источника, предусматриваем восстановление и проверяем работу после установки.",
    },
  ];
  function random(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function create(seed = 12345) {
    const rng = random(seed),
      trees = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if ((y === 1 || y === 16 || x === 1 || x === 22) && rng() < 0.48)
          trees.push({ x, y });
    return {
      version: 1,
      seed,
      time: 0,
      player: { x: 10, y: 7, hp: 6, face: [0, 1], inv: 0 },
      credits: 24,
      corn: 0,
      patches: 0,
      harvests: 0,
      produced: 0,
      kills: 0,
      home: 0,
      helper: false,
      drone: Array(64).fill(0),
      plots: Array.from({ length: 9 }, (_, i) => ({
        x: 4 + (i % 3),
        y: 8 + Math.floor(i / 3),
        age: -1,
      })),
      builds: [],
      solved: [],
      trees,
      bugs: [
        { x: 12, y: 13, hp: 3, clock: 0 },
        { x: 15, y: 14, hp: 3, clock: 0 },
        { x: 10, y: 15, hp: 3, clock: 0 },
      ],
      factoryClock: 0,
      helperClock: 0,
      attack: 0,
      won: false,
      log: "Добро пожаловать. Посади кукурузу на грядках слева.",
    };
  }
  function siteAt(x, y) {
    return sites.find((o) => o.x === x && o.y === y);
  }
  function walkable(s, x, y) {
    return (
      x > 0 &&
      y > 0 &&
      x < W - 1 &&
      y < H - 1 &&
      !s.trees.some((o) => o.x === x && o.y === y) &&
      !siteAt(x, y) &&
      !(x === 15 && y === 9) &&
      !s.builds.some((o) => o.x === x && o.y === y && o.type === "factory")
    );
  }
  function move(s, dx, dy) {
    s.player.face = [dx, dy];
    const x = s.player.x + dx,
      y = s.player.y + dy;
    if (
      walkable(s, x, y) &&
      !s.bugs.some((b) => b.hp > 0 && b.x === x && b.y === y)
    ) {
      s.player.x = x;
      s.player.y = y;
      return true;
    }
    return false;
  }
  function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }
  function say(s, text) {
    s.log = text;
    return text;
  }
  function crop(s, p) {
    if (p.age < 0) {
      p.age = 0;
      return say(s, "Посадка готова. Кукуруза созреет за 12 игровых секунд.");
    }
    if (p.age < GROW)
      return say(s, "Ещё растёт — " + Math.ceil(GROW - p.age) + " с.");
    p.age = -1;
    s.corn += 2;
    s.harvests++;
    s.credits += 3;
    return say(s, "Урожай: +2 кукурузы, +3 кредита за поставку.");
  }
  function interact(s, x, y) {
    const target = { x, y };
    if (distance(s.player, target) > 1)
      return { message: say(s, "Подойди ближе к объекту.") };
    const p = s.plots.find((o) => o.x === x && o.y === y);
    if (p) return { message: crop(s, p) };
    if (x === 15 && y === 9)
      return {
        message: say(
          s,
          "Бункер получает урожай автоматически. Соедини его с заводом: 5 конвейеров вправо, затем завод.",
        ),
      };
    const o = siteAt(x, y);
    if (o) {
      if (o.type === "terminal") {
        if (s.solved.includes(o.q))
          return { message: say(s, "Узел уже защищён.") };
        if (s.patches < 1)
          return {
            message: say(
              s,
              "Для ремонта нужен 1 патч. Собери производственную линию.",
            ),
          };
        return { dialog: "quiz", q: o.q };
      }
      return { dialog: o.type };
    }
    return {
      message: say(
        s,
        "Здесь можно пройти. Грядки — слева, строительная площадка — справа.",
      ),
    };
  }
  function answer(s, q, index) {
    if (!Number.isInteger(q) || !questions[q] || s.solved.includes(q))
      return false;
    if (index !== questions[q].correct) {
      say(s, "Попробуй другой вариант. " + questions[q].why);
      return false;
    }
    if (s.patches < 1) return false;
    s.patches--;
    s.solved.push(q);
    s.credits += 8;
    say(s, "Узел восстановлен. +8 кредитов. " + questions[q].why);
    return true;
  }
  function build(s, x, y, type) {
    if (x < 16 || x > 21 || y < 8 || y > 10)
      return say(s, "Строим только на размеченной площадке справа от бункера.");
    if (!["belt", "factory", "erase"].includes(type)) return;
    const i = s.builds.findIndex((o) => o.x === x && o.y === y);
    if (type === "erase") {
      if (i >= 0) {
        s.credits += s.builds[i].type === "factory" ? 8 : 2;
        s.builds.splice(i, 1);
      }
      return say(s, "Детали разобраны, стоимость возвращена.");
    }
    if (i >= 0) return say(s, "Клетка занята. Сначала разбери объект.");
    if (s.player.x === x && s.player.y === y)
      return say(s, "Сначала отойди с этой клетки.");
    if (type === "factory" && s.builds.some((o) => o.type === "factory"))
      return say(s, "Для деревни пока достаточно одного завода.");
    const cost = type === "factory" ? 8 : 2;
    if (s.credits < cost)
      return say(s, "Не хватает кредитов. Собери ещё урожай.");
    s.credits -= cost;
    s.builds.push({ x, y, type });
    return say(
      s,
      type === "belt"
        ? "Конвейер установлен, направление — вправо."
        : "Завод установлен. На 1 патч нужно 2 кукурузы.",
    );
  }
  function connected(s) {
    for (let x = 16; x <= 20; x++)
      if (!s.builds.some((o) => o.x === x && o.y === 9 && o.type === "belt"))
        return false;
    return s.builds.some(
      (o) => o.x === 21 && o.y === 9 && o.type === "factory",
    );
  }
  function attack(s) {
    if (s.attack > 0) return false;
    s.attack = 0.4;
    let hit = false;
    for (const b of s.bugs) {
      if (b.hp > 0 && distance(s.player, b) <= 1) {
        b.hp--;
        hit = true;
        if (b.hp === 0) {
          s.kills++;
          s.credits += 5;
          say(s, "Баг обезврежен. +5 кредитов.");
        }
      }
    }
    return hit;
  }
  function buy(s, type) {
    const costs = { helper: 12, home: 10, heal: 0, sell: 0 };
    if (!(type in costs)) return false;
    if (type === "sell") {
      if (s.corn < 2) {
        say(s, "Для продажи нужно 2 кукурузы.");
        return false;
      }
      s.corn -= 2;
      s.credits += 5;
      say(s, "Сельпо: +5 кредитов за 2 кукурузы.");
      return true;
    }
    if ((type === "helper" && s.helper) || (type === "home" && s.home))
      return false;
    if (s.credits < costs[type]) {
      say(s, "Не хватает кредитов.");
      return false;
    }
    s.credits -= costs[type];
    if (type === "helper") {
      s.helper = true;
      say(s, "Помощник нанят: раз в 3 секунды сажает или собирает кукурузу.");
    }
    if (type === "home") {
      s.home = 1;
      s.player.hp = 8;
      say(s, "Дом улучшен: максимум прочности вырос до 8.");
    }
    if (type === "heal") {
      s.player.hp = s.home ? 8 : 6;
      say(s, "Прочность восстановлена.");
    }
    return true;
  }
  function tick(s, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.25);
    s.time += dt;
    s.attack = Math.max(0, s.attack - dt);
    s.player.inv = Math.max(0, s.player.inv - dt);
    s.plots.forEach((p) => {
      if (p.age >= 0) p.age = Math.min(GROW, p.age + dt);
    });
    if (s.helper) {
      s.helperClock += dt;
      if (s.helperClock >= 3) {
        s.helperClock = 0;
        const p =
          s.plots.find((p) => p.age >= GROW) || s.plots.find((p) => p.age < 0);
        if (p) crop(s, p);
      }
    }
    if (connected(s) && s.corn >= 2) {
      s.factoryClock += dt;
      if (s.factoryClock >= 3) {
        s.factoryClock = 0;
        s.corn -= 2;
        s.patches++;
        s.produced++;
        say(s, "Завод выпустил патч. Отнеси его к повреждённому узлу.");
      }
    } else s.factoryClock = 0;
    for (const b of s.bugs) {
      if (b.hp <= 0) continue;
      b.clock += dt;
      if (b.clock < 0.85) continue;
      b.clock = 0;
      const target =
        distance(b, s.player) <= 4
          ? s.player
          : s.plots.find((p) => p.age >= GROW) || { x: 9, y: 11 };
      if (distance(b, s.player) === 1 && s.player.inv === 0) {
        s.player.hp--;
        s.player.inv = 1.2;
        say(s, "Баг атакует! Пробел или «Удар» — защита.");
      } else {
        const moves = [
          [Math.sign(target.x - b.x), 0],
          [0, Math.sign(target.y - b.y)],
        ];
        for (const [dx, dy] of moves) {
          if (!(dx || dy)) continue;
          const x = b.x + dx,
            y = b.y + dy;
          if (
            walkable(s, x, y) &&
            !(x === s.player.x && y === s.player.y) &&
            !s.bugs.some((o) => o !== b && o.hp > 0 && o.x === x && o.y === y)
          ) {
            b.x = x;
            b.y = y;
            break;
          }
        }
      }
      const p = s.plots.find(
        (p) => p.x === b.x && p.y === b.y && p.age >= GROW,
      );
      if (p) {
        p.age = -1;
        say(s, "Баг украл кукурузу! Посади заново и защити поле.");
      }
    }
    if (s.player.hp <= 0) {
      s.player.x = 4;
      s.player.y = 5;
      s.player.hp = s.home ? 8 : 6;
      s.player.inv = 3;
      s.credits = Math.max(0, s.credits - 3);
      say(s, "Аварийный возврат домой. Ремонт обошёлся в 3 кредита.");
    }
    if (
      !s.won &&
      s.solved.length === 3 &&
      s.kills >= 3 &&
      s.helper &&
      s.home &&
      s.produced >= 3
    ) {
      s.won = true;
      say(
        s,
        "Деревня снова в сети! Миссия завершена. Можно продолжить хозяйство.",
      );
    }
  }
  // Validate every saved field before using it in simulation or rendering.
  function restore(raw) {
    try {
      const v = JSON.parse(raw);
      if (v.version !== 1 || !Number.isInteger(v.seed)) return null;
      const s = create(v.seed),
        num = (x, min, max) =>
          typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
      for (const k of [
        "time",
        "credits",
        "corn",
        "patches",
        "harvests",
        "produced",
        "kills",
        "factoryClock",
        "helperClock",
        "attack",
      ])
        if (!num(v[k], 0, 1e9)) return null;
      if (
        !v.player ||
        !Number.isInteger(v.player.x) ||
        !Number.isInteger(v.player.y) ||
        !num(v.player.hp, 1, 8) ||
        !num(v.player.inv, 0, 3)
      )
        return null;
      if (
        !Array.isArray(v.player.face) ||
        v.player.face.length !== 2 ||
        !v.player.face.every(Number.isInteger) ||
        Math.abs(v.player.face[0]) + Math.abs(v.player.face[1]) !== 1
      )
        return null;
      if (
        !Array.isArray(v.plots) ||
        v.plots.length !== 9 ||
        !v.plots.every(
          (p, i) =>
            p.x === s.plots[i].x &&
            p.y === s.plots[i].y &&
            num(p.age, -1, GROW),
        )
      )
        return null;
      if (
        !Array.isArray(v.builds) ||
        v.builds.length > 18 ||
        !v.builds.every(
          (b) =>
            Number.isInteger(b.x) &&
            Number.isInteger(b.y) &&
            num(b.x, 16, 21) &&
            num(b.y, 8, 10) &&
            ["belt", "factory"].includes(b.type),
        )
      )
        return null;
      if (
        new Set(v.builds.map((b) => b.x + "," + b.y)).size !==
          v.builds.length ||
        v.builds.filter((b) => b.type === "factory").length > 1
      )
        return null;
      if (
        !Array.isArray(v.solved) ||
        new Set(v.solved).size !== v.solved.length ||
        !v.solved.every((q) => [0, 1, 2].includes(q))
      )
        return null;
      if (
        !Array.isArray(v.drone) ||
        v.drone.length !== 64 ||
        !v.drone.every((c) => [0, 1, 2, 3].includes(c))
      )
        return null;
      if (
        !Array.isArray(v.bugs) ||
        v.bugs.length !== 3 ||
        !v.bugs.every(
          (b) =>
            Number.isInteger(b.x) &&
            Number.isInteger(b.y) &&
            num(b.x, 1, W - 2) &&
            num(b.y, 1, H - 2) &&
            Number.isInteger(b.hp) &&
            num(b.hp, 0, 3) &&
            num(b.clock, 0, 1),
        )
      )
        return null;
      if (
        ![0, 1].includes(v.home) ||
        typeof v.helper !== "boolean" ||
        typeof v.won !== "boolean"
      )
        return null;
      for (const k of Object.keys(s))
        if (!["trees", "log"].includes(k)) s[k] = v[k];
      if (!walkable(s, s.player.x, s.player.y)) return null;
      s.log = "Сохранение загружено. Добро пожаловать обратно.";
      return s;
    } catch {
      return null;
    }
  }
  const api = {
    W,
    H,
    GROW,
    sites,
    questions,
    create,
    walkable,
    move,
    distance,
    interact,
    answer,
    build,
    connected,
    attack,
    buy,
    tick,
    restore,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KernelCore = api;
})(typeof window === "undefined" ? globalThis : window);
