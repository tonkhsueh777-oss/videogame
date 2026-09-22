(() => {
  'use strict';

  const CHOICE_REVEAL_SECONDS = 6.4;
  const STORY = {
    intro: {
      id: 'intro', src: './media/01_intro.mp4', ending: false,
      choices: [
        { id: 'fight', label: '拔剑迎战', next: 'fight' },
        { id: 'escape', label: '退入遗迹', next: 'escape' },
      ],
    },
    fight: {
      id: 'fight', src: './media/02A_fight.mp4', ending: false,
      choices: [
        { id: 'core', label: '刺向核心', next: 'core-ending' },
        { id: 'chain', label: '斩断石链', next: 'chain-ending' },
      ],
    },
    escape: {
      id: 'escape', src: './media/02B_escape.mp4', ending: false,
      choices: [
        { id: 'seal', label: '启动封印', next: 'seal-ending' },
        { id: 'bridge', label: '冲过吊桥', next: 'bridge-ending' },
      ],
    },
    'core-ending': { id: 'core-ending', src: './media/03A1_core.mp4', ending: true, title: '破魔', choices: [] },
    'chain-ending': { id: 'chain-ending', src: './media/03A2_chain.mp4', ending: true, title: '借势', choices: [] },
    'seal-ending': { id: 'seal-ending', src: './media/03B1_seal.mp4', ending: true, title: '封魔', choices: [] },
    'bridge-ending': { id: 'bridge-ending', src: './media/03B2_bridge.mp4', ending: true, title: '断桥', choices: [] },
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

  const preloaded = new Map();

  const setVisible = (element, visible) => {
    element.classList.toggle('overlay-visible', visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  const getNode = (id) => {
    const node = STORY[id];
    if (!node) throw new Error(`Unknown story node: ${id}`);
    return node;
  };

  const getNextNode = (node, choiceId) => {
    const choice = node.choices.find((item) => item.id === choiceId);
    if (!choice) throw new Error(`Unknown choice: ${choiceId}`);
    return getNode(choice.next);
  };

  const media = {
    setSource(src) {
      video.pause();
      video.src = src;
      video.currentTime = 0;
      video.load();
    },
    async play() {
      await video.play();
    },
    preload(src) {
      if (preloaded.has(src)) return;
      const cacheVideo = document.createElement('video');
      cacheVideo.preload = 'auto';
      cacheVideo.muted = true;
      cacheVideo.playsInline = true;
      cacheVideo.src = src;
      cacheVideo.load();
      preloaded.set(src, cacheVideo);
    },
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
    hideEnding() {
      setVisible(endingPanel, false);
    },
    showEnding(node) {
      endingTitle.textContent = node.title || '结局';
      setVisible(endingPanel, true);
    },
    clearError() {
      setVisible(errorPanel, false);
    },
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
      const next = getNextNode(current, choiceId);
      this.choiceLocked = true;
      render.flash();
      this.history.push(this.currentId);
      await this.activate(next.id);
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
        this.revealChoices(node);
      }
    }

    onEnded() {
      const node = getNode(this.currentId);
      if (node.ending) render.showEnding(node);
      else if (!this.choicesRevealed) this.revealChoices(node);
    }

    onMediaError() {
      render.showError('影片载入失败，请检查网络或重新载入。');
    }

    revealChoices(node) {
      this.choicesRevealed = true;
      render.showChoices(node.choices);
    }

    async activate(id) {
      const node = getNode(id);
      this.currentId = id;
      this.choicesRevealed = false;
      this.choiceLocked = false;
      render.hideChoices();
      render.hideEnding();
      render.clearError();
      media.setSource(node.src);
      for (const choice of node.choices) media.preload(getNode(choice.next).src);
      try {
        await media.play();
      } catch (error) {
        if (error?.name === 'NotAllowedError') {
          render.showError('浏览器阻止了自动播放，请点击“重新载入”继续。');
        } else {
          render.showError('影片无法播放，请重新载入。');
        }
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
  video.addEventListener('error', () => controller.onMediaError());

  // Load the first frame immediately while preserving the user-gesture gate for audio playback.
  video.src = STORY.intro.src;
  video.load();
  media.preload(STORY.fight.src);
  media.preload(STORY.escape.src);
})();
