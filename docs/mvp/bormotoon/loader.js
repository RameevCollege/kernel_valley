/* No dependencies, works over file:// and static HTTP. */
(function () {
  "use strict";
  window.createGameLoader = function (host) {
    const root = document.createElement("section");
    root.className = "loading-screen";
    root.setAttribute("aria-label", "Загрузка игры");
    root.innerHTML =
      '<header><div><h1>Готовим игру</h1><p>Пока идёт загрузка, можно сыграть в светоциклы.</p></div><button type="button" disabled>Загрузка…</button></header><progress max="1" value="0" aria-label="Готовность игры"></progress><p class="loading-status" role="status">Подготовка файлов…</p><iframe title="Светоциклы на экране загрузки"></iframe>';
    host.append(root);
    const frame = root.querySelector("iframe");
    const button = root.querySelector("button");
    const bar = root.querySelector("progress");
    const status = root.querySelector("[role=status]");
    let progress = 0,
      disposed = false,
      ready = false,
      enter = null;
    const origin = location.protocol === "file:" ? "*" : location.origin;
    function send() {
      frame.contentWindow?.postMessage(
        { type: "game-loading-progress", value: progress },
        origin,
      );
    }
    function receive(event) {
      if (event.source !== frame.contentWindow || disposed) return;
      if (origin !== "*" && event.origin !== origin) return;
      if (event.data?.type === "tron-loader-ready") send();
    }
    window.addEventListener("message", receive);
    frame.addEventListener("load", send);
    if (window.TRON_LOADER_HTML) frame.srcdoc = window.TRON_LOADER_HTML;
    else frame.src = "vendor/tron-loader.html";
    function destroy() {
      disposed = true;
      window.removeEventListener("message", receive);
      root.remove(); // destroys iframe document and all its animation loops
    }
    button.addEventListener("click", () => {
      if (!ready || disposed) return;
      try {
        enter();
        destroy();
      } catch (error) {
        fail("Не удалось открыть игру. Перезагрузите страницу.");
        console.error(error);
      }
    });
    function fail(message) {
      if (disposed) return;
      ready = false;
      button.disabled = true;
      button.textContent = "Не удалось загрузить";
      status.textContent = message;
      status.setAttribute("role", "alert");
    }
    return {
      update(value, message) {
        if (disposed || ready || !Number.isFinite(value)) return;
        progress = Math.max(progress, Math.min(0.99, Math.max(0, value)));
        bar.value = progress;
        if (message) status.textContent = message;
        send();
      },
      ready(onEnter) {
        if (disposed) return;
        if (typeof onEnter !== "function")
          throw new TypeError("onEnter must be a function");
        enter = onEnter;
        ready = true;
        progress = 1;
        bar.value = 1;
        button.disabled = false;
        button.textContent = "Перейти в игру";
        status.textContent =
          "Всё готово. Можно перейти в игру или закончить заезд.";
        send();
      },
      fail,
      destroy,
    };
  };
})();
