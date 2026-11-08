/* LFS Oasis Capsule & Simplified Multiplayer SDK (oasis-capsule-sdk.js — HOST-02 & CHAT-05) */
(function (global) {
  "use strict";
  const CHANNEL_PREFIX = "lfs-oasis-chat-overlay-v1";
  const stateStore = {
    roomCode: "OASIS-LOCAL",
    hostMode: "HOST_LOCAL_PC",
    overlayOpen: false,
    multiplayerConfig: null,
    chatChannel: "#party:default:OASIS-LOCAL"
  };

  class OasisMultiplayerBarElement extends (global.HTMLElement || Object) {
    connectedCallback() {
      if (this.attachShadow) {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML =
          '<div class="oasis-mp-bar" data-testid="oasis-multiplayer-bar">' +
          '<span class="oasis-room-pill">Room: ' + stateStore.roomCode + '</span>' +
          '<button type="button" data-action="host-local">HOST_LOCAL_PC</button>' +
          '<button type="button" data-action="host-u2">LAUNCH_U2_HOSTING_SERVICE</button>' +
          '<button type="button" data-action="toggle-overlay">Shift+Tab Overlay</button>' +
          '</div>';
      }
    }
  }

  if (global.customElements && !global.customElements.get("oasis-multiplayer-bar")) {
    global.customElements.define("oasis-multiplayer-bar", OasisMultiplayerBarElement);
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = String(el.tagName).toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
  }

  if (global.addEventListener) {
    global.addEventListener("keydown", function (ev) {
      if (ev.key === "Tab" && ev.shiftKey && (ev.ctrlKey || !isTypingTarget(global.document && global.document.activeElement))) {
        ev.preventDefault();
        stateStore.overlayOpen = !stateStore.overlayOpen;
        if (global.dispatchEvent && typeof global.CustomEvent === "function") {
          global.dispatchEvent(new global.CustomEvent("oasis:steam-overlay-toggle", { detail: { open: stateStore.overlayOpen } }));
        }
      }
    });
  }

  global.OasisSyncSDK = {
    version: "cp12-v1",
    enableSimplifiedMultiplayer: function (config) {
      stateStore.multiplayerConfig = Object.assign({ mode: "state-sync", tickHz: 30 }, config || {});
      return {
        status: "ENABLED",
        mode: stateStore.multiplayerConfig.mode,
        roomCode: stateStore.roomCode,
        hostMode: stateStore.hostMode
      };
    },
    spawnBot: function (spec) {
      return {
        botId: (spec && spec.botId) || "@willow",
        role: (spec && spec.role) || "co-op",
        skill: (spec && spec.skill) || "adaptive",
        reflexLoopHz: 20,
        tacticalLoopHz: 0.5
      };
    },
    getState: function () {
      return Object.assign({}, stateStore);
    }
  };

  function searchForgeAssets(query, opts) {
    const options = opts || {};
    const q = encodeURIComponent(String(query || "").trim());
    const baseUrl = String(options.baseUrl || "http://127.0.0.1:19447/v1/assets/search");
    const url = baseUrl.indexOf("?") !== -1 ? baseUrl + "&q=" + q : baseUrl + "?q=" + q;
    if (typeof fetch !== "function") {
      return Promise.resolve({ ok: true, status: "offline", results: [] });
    }
    return fetch(url, { method: "GET", headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r || !r.ok) return { ok: true, status: "offline", results: [] };
        return r.json().then(function (data) {
          const list = data && Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
          return { ok: true, status: "ok", results: list };
        });
      })
      .catch(function () {
        return { ok: true, status: "offline", results: [] };
      });
  }

  global.OasisCapsuleSDK = {
    version: "cp12-v1",
    channelPrefix: CHANNEL_PREFIX,
    ai: {
      complete: async function (prompt) {
        return { ok: true, tier: 0, text: String(prompt || "").slice(0, 240) };
      },
      infer: async function (prompt, opts) {
        const options = opts || {};
        const fallback = {
          ok: true,
          tier: 0,
          text: String(prompt || "").slice(0, 240),
          provider: "tier0-deterministic"
        };
        if (options.offlineOnly === true || typeof fetch !== "function") {
          return fallback;
        }
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timer = controller ? setTimeout(function () { controller.abort(); }, options.timeoutMs || 450) : null;
        try {
          const res = await fetch(options.endpoint || "http://127.0.0.1:19447/v1/neural/infer", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              prompt: String(prompt || ""),
              task_domain: options.taskDomain || "block_studio",
              capsule_id: "lfs-block-studio",
              model: options.model || "gemma4:e4b-it-q4_K_M"
            }),
            signal: controller ? controller.signal : undefined
          });
          if (timer) clearTimeout(timer);
          if (!res || !res.ok) return fallback;
          const data = await res.json();
          const text = String((data && (data.text || data.response || data.output)) || "").trim();
          if (!text) return fallback;
          return {
            ok: true,
            tier: typeof data.tier === "number" ? data.tier : 2,
            text: text,
            provider: String(data.provider || "sovereign-forge-19447")
          };
        } catch (_err) {
          if (timer) clearTimeout(timer);
          return fallback;
        }
      },
      searchAssets: searchForgeAssets,
      tuneManifest: function (tunables) {
        return { ok: true, applied: tunables || {} };
      }
    },
    assets: {
      search: searchForgeAssets
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
