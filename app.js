(() => {
  'use strict';

  const CHOICE_REVEAL_SECONDS = 6.4;
  const STORY = {
    intro: {
      id: 'intro', media: './media/01_intro.b64.txt', ending: false,
      choices: [
        { id: 'fight', label: '拔剑迎战', next: 'fight' },
        { id: 'escape', label: '退入遗迹', next: 'escape' },
      ],
    },
    fight: {
      id: 'fight', media: './media/02A_fight.b64.txt', ending: false,
      choices: [
        { id: 'core', label: '刺向核心', next: 'core-ending' },
        { id: 'chain', label: '斩断石链', next: 'chain-ending' },
      ],
    },
    escape: {
      id: 'escape', media: './media/02B_escape.b64.txt', ending: false,
      choices: [
        { id: 'seal', label: '启动封印', next: 'seal-ending' },
        { id: 'bridge', label: '冲过吊桥', next: 'bridge-ending' },
      ],
    },
    'core-ending': { id: 'core-ending', media: './media/03A1_core.b64.txt', ending: true, title: '破魔', choices: [] },
    'chain-ending': { id: 'chain-ending', media: './media/03A2_chain.b64.txt', ending: true, title: '借势', choices: [] },
    'seal-ending': { id: 'seal-ending', media: './media/03B1_seal.b64.txt', ending: true, title: '封魔', choices: [] },
    'bridge-ending': { id: 'bridge-ending', media: './media/03B2_bridge.b64.txt', ending: true, title: '断桥', choices: [] },
  };

  const video = document.getElementById('scene-video');
  const enterScreen = document.getElementById('enter-screen');
  const enterButton = document.getElementById('enter-button');
  const choicesEl = document.getElementById('choices');
  const choiceButtons = document.getElementById('choice-buttons');
  const endingPanel = document.getElementById('ending-panel');
  const endingTitle = document.getElementById('ending-title');
  const restartButton = document.getElementById('restart-button');
  const backButton = document.getElementById('back-button');
  const errorPanel = document.getElementById('error-panel');
  const errorMessage = document.getElementById('error-message');
  const errorRetry = document.getElementById('error-retry');
  const flash = document.getElementById('flash');

  const mediaCache = new Map();

  const setVisible = (element, visible) => {
    element.classList.toggle('overlay-visible', visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  const getNode = (id) => {
    const node = STORY[id];
    if (!node) throw new Error(`Unknown story node: ${id}`);
    return node;
  };

  const base64ToBlobUrl = async (path) => {
    if (mediaCache.has(path)) return mediaCache.get(path);
    const promise = fetch(path, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
        return response.text();
      })
      .then((base64) => {
        const clean = base64.trim();
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      });
    mediaCache.set(path, promise);
    return promise;
  };

  const preload = (path) => {
    base64ToBlobUrl(path).catch(() => mediaCache.delete(path));
  };

  const render = {
    hideChoices() {
      setVisible(choicesEl, false);
      choiceButtons.replaceChildren();
    },
    showChoices(choices) {
      choiceButtons.replaceChildren();
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice-button';
        button.textContent = choice.label;
        button.addEventListener('click', () => controller.choose(choice.id));
        choiceButtons.appendChild(button);
      }
      setVisible(choicesEl, true);
    },
    hideEnding() { setVisible(endingPanel, false); },
    showEnding(node) {
      endingTitle.textContent = node.title || '结局';
      setVisible(endingPanel, true);
    },
    clearError() { setVisible(errorPanel, false); },
    showError(message) {
      errorMessage.textContent = message;
      setVisible(errorPanel, true);
    },
    flash() {
      flash.classList.remove('flash-active');
      void flash.offsetWidth;
      flash.classList.add('flash-active');
    },
  };

  class InteractiveVideoController {
    constructor() {
      this.currentId = 'intro';
      this.history = [];
      this.choicesRevealed = false;
      this.choiceLocked = false;
    }

    async start() {
      this.history = [];
      await this.activate('intro');
    }

    async restart() {
      this.history = [];
      await this.activate('intro');
    }

    async choose(choiceId) {
      if (!this.choicesRevealed || this.choiceLocked) return false;
      const current = getNode(this.currentId);
      const choice = current.choices.find((item) => item.id === choiceId);
      if (!choice) return false;
      this.choiceLocked = true;
      render.flash();
      this.history.push(this.currentId);
      await this.activate(choice.next);
      return true;
    }

    async back() {
      if (!this.history.length) return false;
      const previous = this.history.pop();
      await this.activate(previous);
      return true;
    }

    onTimeUpdate(time) {
      const node = getNode(this.currentId);
      if (!node.ending && !this.choicesRevealed && time >= CHOICE_REVEAL_SECONDS) {
        this.choicesRevealed = true;
        render.showChoices(node.choices);
      }
    }

    onEnded() {
      const node = getNode(this.currentId);
      if (node.ending) render.showEnding(node);
      else if (!this.choicesRevealed) {
        this.choicesRevealed = true;
        render.showChoices(node.choices);
      }
    }

    async activate(id) {
      const node = getNode(id);
      this.currentId = id;
      this.choicesRevealed = false;
      this.choiceLocked = false;
      render.hideChoices();
      render.hideEnding();
      render.clearError();
      try {
        const src = await base64ToBlobUrl(node.media);
        video.pause();
        video.src = src;
        video.currentTime = 0;
        video.load();
        for (const choice of node.choices) preload(getNode(choice.next).media);
        await video.play();
      } catch (error) {
        console.error(error);
        render.showError('影片载入失败，请检查网络后重新尝试。');
      }
    }
  }

  const controller = new InteractiveVideoController();

  const begin = async () => {
    enterButton.disabled = true;
    video.muted = false;
    await controller.start();
    setVisible(enterScreen, false);
  };

  enterButton.addEventListener('click', begin, { once: true });
  restartButton.addEventListener('click', () => controller.restart());
  backButton.addEventListener('click', () => controller.back());
  errorRetry.addEventListener('click', () => controller.restart());
  video.addEventListener('timeupdate', () => controller.onTimeUpdate(video.currentTime));
  video.addEventListener('ended', () => controller.onEnded());
  video.addEventListener('error', () => render.showError('影片播放失败，请重新载入。'));

  preload(STORY.intro.media);
  preload(STORY.fight.media);
  preload(STORY.escape.media);
})();
