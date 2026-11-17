(function () {
  "use strict";
  const loader = createGameLoader(document.body);
  const files = ["game-core.js", "game.js"];
  let failed = false;
  const timeout = setTimeout(() => {
    failed = true;
    loader.fail(
      "Загрузка не завершилась. Проверь, что вся папка игры распакована рядом с index.html, и обнови страницу.",
    );
  }, 15000);
  function load(i) {
    if (failed) return;
    if (window.KernelGame) i = files.length;
    if (i === files.length) {
      try {
        window.KernelGame.prepare();
        clearTimeout(timeout);
        loader.ready(() => window.KernelGame.start());
      } catch (error) {
        clearTimeout(timeout);
        loader.fail("Ошибка подготовки игры. Обнови страницу.");
        console.error(error);
      }
      return;
    }
    loader.update(
      i / files.length,
      "Загружаем " + (i === 0 ? "мир и правила игры…" : "карту и интерфейс…"),
    );
    const script = document.createElement("script");
    script.src = files[i];
    script.onload = () => load(i + 1);
    script.onerror = () => {
      failed = true;
      clearTimeout(timeout);
      loader.fail(
        "Не найден " +
          files[i] +
          ". Распакуй всю папку игры и обнови страницу.",
      );
    };
    document.body.append(script);
  }
  // Allow the mandatory loading screen to paint; readiness has no artificial delay.
  requestAnimationFrame(() => requestAnimationFrame(() => load(0)));
})();
