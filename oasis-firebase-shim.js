/* LFS Oasis Zero-Rewrite Firebase Shim & Chat Bridge (oasis-firebase-shim.js — MP-03 & CHAT-06) */
(function (global) {
  "use strict";
  const CHAT_COLLECTION_PREFIXES = ["chat/", "messages/", "party_chat/", "lobby_chat/"];

  function resolvePartyChannel(gameId, roomId, collectionPath) {
    const cleanGame = String(gameId || "guilded-game").replace(/[^a-zA-Z0-9_.-]+/g, "-");
    const cleanRoom = String(roomId || "OASIS-ROOM").replace(/[^a-zA-Z0-9_.-]+/g, "-");
    return "#party:" + cleanGame + ":" + cleanRoom;
  }

  const FirebaseChatCollectionBridge = {
    supportedPrefixes: CHAT_COLLECTION_PREFIXES.slice(),
    isChatCollection: function (path) {
      const norm = String(path || "").replace(/^\/+/, "");
      return CHAT_COLLECTION_PREFIXES.some(function (prefix) {
        return norm === prefix.slice(0, -1) || norm.indexOf(prefix) === 0;
      });
    },
    mapToOasisChannel: function (path, gameId, roomId) {
      return {
        originalPath: String(path || ""),
        bridged: FirebaseChatCollectionBridge.isChatCollection(path),
        oasisChannel: resolvePartyChannel(gameId, roomId, path)
      };
    }
  };

  global.FirebaseChatCollectionBridge = FirebaseChatCollectionBridge;
  global.OasisFirebaseShim = {
    version: "cp12-v1",
    mode: "oasis-primary",
    FirebaseChatCollectionBridge: FirebaseChatCollectionBridge,
    initializeApp: function (cfg) {
      return { name: "[OASIS-SHIM]", options: Object.assign({}, cfg || {}, { apiKey: "SCRUBBED_BY_OASIS_GUILDER" }) };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
