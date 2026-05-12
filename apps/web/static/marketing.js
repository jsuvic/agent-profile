// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

(() => {
  const copyButtons = document.querySelectorAll("[data-copy-command]");
  const heroStages = document.querySelectorAll("[data-hero-stage]");
  const stepButtons = document.querySelectorAll("[data-marketing-step]");
  const stepPanels = document.querySelectorAll("[data-marketing-step-panel]");

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const command = button.getAttribute("data-copy-command") ?? "";
      const copied = await copyText(command);
      const label =
        button.getAttribute("data-copy-label") ?? button.textContent ?? "copy";
      const shell = button.closest("[data-copy-shell]");

      button.setAttribute("data-copy-label", label);
      button.textContent = copied ? "Copied" : "Failed";
      button.classList.toggle("copied", copied);
      button.classList.toggle("copy-failed", !copied);
      shell?.classList.toggle("copied", copied);

      window.setTimeout(() => {
        button.textContent = label;
        button.classList.remove("copied", "copy-failed");
        shell?.classList.remove("copied");
      }, 1400);
    });
  });

  heroStages.forEach((stage) => {
    const id = stage.getAttribute("data-hero-stage");
    if (!id) return;

    const activate = () => setHeroStage(id);
    stage.addEventListener("pointerenter", activate);
    stage.addEventListener("focusin", activate);
    stage.addEventListener("click", activate);
    stage.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
  });

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-marketing-step");
      if (id) setStep(id);
    });
  });

  async function copyText(text) {
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.append(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  function setHeroStage(id) {
    heroStages.forEach((stage) => {
      const active = stage.getAttribute("data-hero-stage") === id;
      stage.classList.toggle("on", active);
      stage.setAttribute("aria-pressed", String(active));
    });
  }

  function setStep(id) {
    stepButtons.forEach((button) => {
      const active = button.getAttribute("data-marketing-step") === id;
      button.classList.toggle("on", active);
      button.setAttribute("aria-selected", String(active));
    });

    stepPanels.forEach((panel) => {
      const active = panel.getAttribute("data-marketing-step-panel") === id;
      panel.classList.toggle("on", active);
      panel.hidden = !active;
    });
  }
})();
