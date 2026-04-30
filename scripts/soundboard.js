// scripts/soundboard.js
Hooks.once("init", async () => {
  // Register favorites setting
  game.settings.register("foundry-soundboard", "favorites", {
    name: "Soundboard Favorites",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Register folder partial
  const partialPath = "modules/foundry-soundboard/templates/folderPartial.html";
  const [partial] = await loadTemplates([partialPath]);
  Handlebars.registerPartial("folderPartial", partial);

  // Simple helper to check if value is an object
  Handlebars.registerHelper("isObject", value => {
    return typeof value === "object" && !Array.isArray(value);
  });
});

class SoundboardApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "soundboard",
      title: "Soundboard",
      template: "modules/foundry-soundboard/templates/soundboard.html",
      width: 100,
      height: 300,
      resizable: true
    });
  }

  constructor(...args) {
    super(...args);
    this.activeSounds = new Map();
    this.masterVolume = 0.8;
    this.favorites = game.settings.get("foundry-soundboard", "favorites") || [];
  }

  async getData() {
    const moduleId = "foundry-soundboard";
    const jsonPath = `modules/${moduleId}/sounds/soundboard.json`;

    const response = await fetch(jsonPath);
    const data = await response.json();

    console.log("Loaded soundboard manifest:", data);

    return { 
      categories: data.root,
      favorites: this.favorites
    };
  }

  /** Fade-in helper */
  fadeIn(audio, targetVolume = 0.8, duration = 2000) {
    audio.volume = 0;
    const steps = 20;
    const stepTime = duration / steps;
    const stepSize = targetVolume / steps;
    const interval = setInterval(() => {
      audio.volume = Math.min(targetVolume, audio.volume + stepSize);
      if (audio.volume >= targetVolume) clearInterval(interval);
    }, stepTime);
  }

/** Fade-out helper */
fadeOut(audio, duration = 2000, onComplete) {
  const steps = 20;
  const stepTime = duration / steps;
  const stepSize = audio.volume / steps;
  let finished = false;

  if (!audio.paused) audio.pause();

  const interval = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - stepSize);
    if (audio.volume <= 0 && !finished) {
      finished = true;
      clearInterval(interval);
      audio.currentTime = 0;
      if (onComplete) onComplete();
      console.log("Fade complete, audio stopped:", audio.src);
    }
  }, stepTime);

  console.log("Fade-Out started");
}


  /** Debug helper: list all active sounds */
  logActiveSounds() {
    console.log("=== Active Sounds ===");
    for (const [path, audio] of this.activeSounds.entries()) {
      console.log("Path:", path,
                  "src:", audio.src,
                  "paused:", audio.paused,
                  "loop:", audio.loop,
                  "currentTime:", audio.currentTime.toFixed(2),
                  "volume:", audio.volume.toFixed(2));
    }
    console.log("=====================");
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Folder toggle
    html.find(".folder-header").on("click", ev => {
      const header = ev.currentTarget;
      const folder = header.dataset.folder;
      html.find(`.folder-content[data-folder="${folder}"]`).toggle();
      header.classList.toggle("open");
    });

    // Play once — click again to stop
    html.find(".track").on("click", ev => {
      const btn = ev.currentTarget;
      const relPath = btn.dataset.file;

      // Already playing — stop it
      if (this.activeSounds.has(relPath)) {
        const audio = this.activeSounds.get(relPath);
        audio.pause();
        audio.currentTime = 0;
        this.activeSounds.delete(relPath);
        btn.classList.remove("active");
        return;
      }

      const src = `modules/foundry-soundboard/sounds/${relPath}`;
      const audio = new Audio(src);
      this.activeSounds.set(relPath, audio);
      audio.loop = false;
      audio.volume = this.masterVolume ?? 0.8;
      audio.play();
      btn.classList.add("active");

      audio.addEventListener("ended", () => {
        this.activeSounds.delete(relPath);
        btn.classList.remove("active");
      });
    });

// Loop toggle
html.find(".loop-button").on("click", ev => {
  const btn = ev.currentTarget;
  const relPath = btn.dataset.file;
  const src = `modules/foundry-soundboard/sounds/${relPath}`;
  console.log("Loop toggle relPath:", relPath);

  if (this.activeSounds.has(relPath)) {
    // Stop existing audio
    const audio = this.activeSounds.get(relPath);
    audio.loop = false;

    if (!audio.paused) audio.pause();

    this.fadeOut(audio, 2000, () => {
      audio.currentTime = 0;
      this.activeSounds.delete(relPath);
      console.log("Stopped and deleted:", relPath);
      this.logActiveSounds();

			const $btns = html.find(`[data-file="${relPath}"]`);
      $btns.removeClass("active");
    });
  } else {
    let audio = this.activeSounds.get(relPath);
    if (!audio) {
      audio = new Audio(src);
      this.activeSounds.set(relPath, audio);
    }

    audio.loop = true;
    audio.volume = this.masterVolume ?? 0.8;
    audio.play();
    this.fadeIn(audio, audio.volume, 2000);

    btn.classList.add("active");
    console.log("Started loop:", src);
    this.logActiveSounds();
  }
});


    // Per-track volume
html.find(".track-volume").on("input", ev => {
  ev.stopPropagation();
  const relPath = ev.currentTarget.dataset.file;
  const vol = parseFloat(ev.currentTarget.value);
  if (this.activeSounds.has(relPath)) {
    const audio = this.activeSounds.get(relPath);
    audio._baseVolume = vol; // store raw slider value
    audio.volume = audio._baseVolume * (this.masterVolume ?? 1);
  }
});

    // Global volume
html.find("#global-volume").on("input", ev => {
  this.masterVolume = parseFloat(ev.currentTarget.value);
  for (const audio of this.activeSounds.values()) {
    audio.volume = audio._baseVolume * this.masterVolume;
  }
});

    // Save favorite
    html.find("#save-favorite").on("click", () => {
      new Dialog({
        title: "Save Favorite Scene",
        content: `
          <p>Enter a name for this favorite scene:</p>
          <input type="text" id="fav-name" style="width:100%" />
        `,
        buttons: {
          save: {
            icon: "<i class='fas fa-save'></i>",
            label: "Save",
            callback: html => {
              const name = html.find("#fav-name").val();
              if (!name) return;

              const favorite = {
                name,
                masterVolume: this.masterVolume,
                tracks: Array.from(this.activeSounds.entries()).map(([path, audio]) => ({
                  path,
                  volume: audio.volume,
                  loop: audio.loop
                }))
              };

              this.favorites.push(favorite);
              game.settings.set("foundry-soundboard", "favorites", this.favorites);
              this.renderFavorites(this.element);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel"
          }
        },
        default: "save"
      }).render(true);
    });
		
		// Bind Stop All button
		html.find("#stop-all").on("click", () => this.stopAll(html));

  }

// Stop all
stopAll(html) {
  for (const [relPath, audio] of this.activeSounds.entries()) {
    this.fadeOut(audio, 2000, () => {
      audio.pause();
      audio.currentTime = 0;
      this.activeSounds.delete(relPath);

      // Clear highlight for both loop and single-play
      const $btns = html.find(`[data-file="${relPath}"]`);
      $btns.removeClass("active");
    });
  }
}


  renderFavorites(html) {
    const list = html.find('.folder-content[data-folder="favorites"]');
    list.empty();
    this.favorites.forEach((fav, i) => {
      list.append(`
        <div class="favorite" data-index="${i}">
          ${fav.name}
          <button class="delete-fav" data-index="${i}">✖</button>
        </div>
      `);
    });

    // Delete favorite
    list.find(".delete-fav").on("click", ev => {
      const index = ev.currentTarget.dataset.index;
      this.favorites.splice(index, 1);
      game.settings.set("foundry-soundboard", "favorites", this.favorites);
      this.renderFavorites(html);
    });

    // Recall favorite
    list.find(".favorite").on("click", ev => {
      const index = ev.currentTarget.dataset.index;
      const fav = this.favorites[index];
      if (!fav) return;

      // Stop current sounds
      for (const [path, audio] of this.activeSounds.entries()) {
        audio.loop = false;
        this.fadeOut(audio, 1000);
      }
      this.activeSounds.clear();

      // Restore global volume
      this.masterVolume = fav.masterVolume;
      html.find("#global-volume").val(this.masterVolume);

      // Restore tracks
      fav.tracks.forEach(t => {
        const src = `modules/foundry-soundboard/sounds/${t.path}`;
        const audio = new Audio(src);
        audio.loop = t.loop;
        audio.volume = 0;
        audio.play();
        this.fadeIn(audio, t.volume, 1500);
        this.activeSounds.set(t.path, audio);
      });
    });
  }
}

// ── Singleton instance ───────────────────────────────────────
// Stored at module level so the sidebar button can always reopen it.
let _soundboardApp = null;

// ── Sidebar button injection ─────────────────────────────────
function _injectSoundboardButton(root) {
  // Normalise to HTMLElement whether Foundry passed a jQuery object (v10-v12)
  // or a plain HTMLElement (v13 ApplicationV2).
  const el = (root instanceof HTMLElement) ? root : (root?.[0] ?? null);
  if (!el) return;
  if (el.querySelector(".soundboard-sidebar-btn")) return; // already injected

  const btn = document.createElement("button");
  btn.type      = "button";
  btn.className = "soundboard-sidebar-btn";
  btn.title     = "Open Soundboard";
  btn.innerHTML = '<i class="fas fa-music"></i> Soundboard';
  btn.addEventListener("click", () => {
    if (_soundboardApp) _soundboardApp.render(true);
  });

  // Try containers in order — v13 uses <menu class="action-buttons">,
  // older versions use .action-buttons, .header-actions, or .directory-header.
  const target =
    el.querySelector("menu.action-buttons") ||
    el.querySelector(".action-buttons")     ||
    el.querySelector(".header-actions")     ||
    el.querySelector(".directory-header")   ||
    el;

  target.prepend(btn);
}

// GM-only auto-open
Hooks.on("ready", () => {
  if (!game.user.isGM) return;

  _soundboardApp = new SoundboardApp();
  _soundboardApp.render(true);

  // renderFavorites must run after every render, not just the first.
  Hooks.on("renderSoundboardApp", (app, html) => {
    app.renderFavorites(html);
  });

  // If the playlists sidebar was already rendered before "ready" fired, inject now.
  if (ui.playlists?.element) _injectSoundboardButton(ui.playlists.element);
});

// Inject button whenever the Playlists sidebar tab renders.
Hooks.on("renderPlaylistDirectory", (_app, html) => {
  if (!game.user.isGM) return;
  _injectSoundboardButton(html);
});

// Re-inject when the user switches to the Playlists tab.
Hooks.on("changeSidebarTab", (tab) => {
  if (!game.user.isGM) return;
  const root = tab?.element ?? tab?._element?.[0];
  if (!root) return;
  const el = root instanceof HTMLElement ? root : root[0];
  if (el?.id === "playlists" || el?.dataset?.tab === "playlists") {
    _injectSoundboardButton(el);
  }
});
