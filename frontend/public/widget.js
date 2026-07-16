(function () {
  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }

  var siteId = script && (script.dataset.nibgateSite || script.getAttribute("data-nibgate-site"));
  var token = script && (script.dataset.nibgateToken || script.getAttribute("data-nibgate-token"));
  var apiBase = script && (script.dataset.nibgateApi || script.getAttribute("data-nibgate-api"));

  if (!siteId || !token) return;

  function scriptOrigin() {
    try {
      return new URL(script.src).origin;
    } catch (_error) {
      return "https://nibgate.xyz";
    }
  }

  var endpoint = (apiBase || scriptOrigin()).replace(/\/$/, "") + "/api/hub/evt";
  var queue = [];
  var pageStartedAt = Date.now();
  var maxScrollDepth = 0;
  var sentTimeSpent = false;

  function id(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function storedId(storage, key, prefix) {
    try {
      var value = storage.getItem(key);
      if (!value) {
        value = id(prefix);
        storage.setItem(key, value);
      }
      return value;
    } catch (_error) {
      return id(prefix);
    }
  }

  var visitorId = storedId(window.localStorage, "nibgate:visitor", "vis");
  var sessionId = storedId(window.sessionStorage, "nibgate:session", "ses");

  function meta(name) {
    var selector = 'meta[name="' + name + '"], meta[property="' + name + '"]';
    var node = document.querySelector(selector);
    return node ? node.getAttribute("content") : "";
  }

  function normalizeType(value) {
    var type = String(value || "").toLowerCase().trim();
    if (["music", "video", "article", "image"].indexOf(type) !== -1) return type;
    if (["audio", "song", "track", "album", "playlist"].indexOf(type) !== -1) return "music";
    if (["photo", "picture", "illustration", "art"].indexOf(type) !== -1) return "image";
    if (["movie", "clip"].indexOf(type) !== -1) return "video";
    return "article";
  }

  function detectResource() {
    var node = document.querySelector("[data-nibgate-resource]");
    if (node) {
      return {
        id: node.getAttribute("data-nibgate-id") || node.id || "",
        title: node.getAttribute("data-nibgate-title") || document.title || "",
        type: normalizeType(node.getAttribute("data-nibgate-type")),
        price: node.getAttribute("data-nibgate-price") || "",
        path: node.getAttribute("data-nibgate-path") || window.location.pathname,
        imageUrl: node.getAttribute("data-nibgate-image") || ""
      };
    }

    var resourceId = meta("nibgate:resource-id");
    if (!resourceId) return null;

    return {
      id: resourceId,
      title: meta("nibgate:title") || document.title || "",
      type: normalizeType(meta("nibgate:type")),
      price: meta("nibgate:price") || "",
      path: meta("nibgate:path") || window.location.pathname,
      imageUrl: meta("nibgate:image") || meta("og:image") || ""
    };
  }

  function send(eventName, payload) {
    var body = Object.assign({}, payload || {}, {
      siteId: siteId,
      token: token,
      event: eventName,
      visitorId: visitorId,
      sessionId: sessionId,
      url: window.location.href,
      path: window.location.pathname,
      title: document.title || "",
      referrer: document.referrer || "",
      scrollDepth: maxScrollDepth
    });

    var serialized = JSON.stringify(body);

    if (navigator.sendBeacon) {
      var blob = new Blob([serialized], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
      keepalive: true,
      credentials: "omit"
    }).catch(function () {
      queue.push({ eventName: eventName, payload: payload });
    });
  }

  window.nibgateHub = window.nibgateHub || {};
  window.nibgateHub.track = function (eventName, payload) {
    send(eventName || "custom", payload || {});
  };
  window.nibgateHub.registerContent = function (resource) {
    send("content_registered", { resource: resource || detectResource() || {} });
  };
  window.nibgateHub.content = window.nibgateHub.registerContent;
  window.nibgateHub.unlockStarted = function (resource) {
    send("unlock_started", { resource: resource || detectResource() || {} });
  };
  window.nibgateHub.unlockCompleted = function (resource, payment) {
    send("unlock_completed", Object.assign({ resource: resource || detectResource() || {} }, payment || {}));
  };
  window.nibgateHub.paymentCompleted = function (resource, payment) {
    send("payment_completed", Object.assign({ resource: resource || detectResource() || {} }, payment || {}));
  };

  if (Array.isArray(window.__nibgateClientQueue)) {
    window.__nibgateClientQueue.splice(0).forEach(function (entry) {
      send(entry.eventName || "custom", entry.payload || {});
    });
  }

  window.addEventListener("nibgate:track", function (event) {
    var detail = event.detail || {};
    send(detail.event || detail.type || "custom", detail);
  });

  function trackInitialPage() {
    send("page_view", {});
    var resource = detectResource();
    if (resource) send("resource_view", { resource: resource });
  }

  function updateScrollDepth() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
    var height = Math.max(body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight, body.clientHeight, doc.clientHeight);
    var viewport = window.innerHeight || doc.clientHeight || 1;
    var depth = height <= viewport ? 100 : Math.min(100, Math.round(((scrollTop + viewport) / height) * 100));
    if (depth > maxScrollDepth) maxScrollDepth = depth;
  }

  function sendTimeSpent() {
    if (sentTimeSpent) return;
    sentTimeSpent = true;
    updateScrollDepth();
    send("time_spent", {
      durationMs: Math.max(0, Date.now() - pageStartedAt),
      scrollDepth: maxScrollDepth,
      resource: detectResource() || undefined
    });
  }

  window.addEventListener("scroll", updateScrollDepth, { passive: true });
  window.addEventListener("pagehide", sendTimeSpent);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendTimeSpent();
  });
  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest && event.target.closest("[data-nibgate-track], [data-nibgate-unlock]");
    if (!target) return;
    var eventName = target.getAttribute("data-nibgate-event") || (target.hasAttribute("data-nibgate-unlock") ? "unlock_started" : "engagement");
    send(eventName, {
      label: target.getAttribute("data-nibgate-label") || target.textContent || "",
      resource: detectResource() || undefined
    });
  });

  function startMutationObserver() {
    var target = document.body || document.documentElement;
    if (!target) return;
    var observer = new MutationObserver(function (mutations) {
      var seen = {};
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        if (!added || !added.length) continue;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          var resourceEl = node.hasAttribute && node.hasAttribute("data-nibgate-resource")
            ? node : node.querySelector && node.querySelector("[data-nibgate-resource]");
          if (!resourceEl) continue;
          var id = resourceEl.getAttribute("data-nibgate-id") || resourceEl.id || "";
          if (seen[id]) continue;
          seen[id] = true;
          send("resource_view", {
            resource: {
              id: id,
              title: resourceEl.getAttribute("data-nibgate-title") || document.title || "",
              type: normalizeType(resourceEl.getAttribute("data-nibgate-type")),
              price: resourceEl.getAttribute("data-nibgate-price") || "",
              path: resourceEl.getAttribute("data-nibgate-path") || window.location.pathname,
              imageUrl: resourceEl.getAttribute("data-nibgate-image") || ""
            },
            source: "mutation"
          });
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      trackInitialPage();
      startMutationObserver();
    }, { once: true });
  } else {
    trackInitialPage();
    startMutationObserver();
  }
})();
