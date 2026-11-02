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

  global.OasisCapsuleSDK = {
    version: "cp12-v1",
    channelPrefix: CHANNEL_PREFIX,
    ai: {
      complete: async function (prompt) {
        return { ok: true, tier: 0, text: String(prompt || "").slice(0, 240) };
      },
      tuneManifest: function (tunables) {
        return { ok: true, applied: tunables || {} };
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
