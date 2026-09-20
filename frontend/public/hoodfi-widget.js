/*! @hoodfi/widget — embeddable HoodFi Names panel. https://www.hoodfi.name */
(function () {
  "use strict";

  // Trailing slash is required, not cosmetic: the site is a static export with
  // `trailingSlash: true`, and a path without it 404s on an IPFS gateway.
  var BASE_URL = "https://www.hoodfi.name/mint/";
  var FONTS_HREF =
    "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";

  // Site tokens, from frontend/app/globals.css.
  var INK = "#0b0e08";
  var PAPER = "#f1f1ea";
  var LIME = "#c6f702";

  /*───────────────────────── colour ─────────────────────────*/

  function hex(c) {
    if (typeof c !== "string") return null;
    c = c.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(c)) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    if (!/^[0-9a-f]{6}$/i.test(c)) return null;
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ];
  }

  function toHex(rgb) {
    return (
      "#" +
      rgb
        .map(function (v) {
          return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  /** WCAG relative luminance. */
  function lum(rgb) {
    var a = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /** Black or white, whichever is readable ON this colour. */
  function onColor(rgb) {
    return contrast(rgb, hex(INK)) >= contrast(rgb, [255, 255, 255]) ? INK : "#ffffff";
  }

  /**
   * An accent is chosen to look good as a FILL. Used as small TEXT on the card it often
   * fails contrast — lime on paper is the site's own example, which is why globals.css
   * keeps `--olive` as a stand-in. Rather than ask integrators to supply two colours,
   * walk the accent toward the readable direction until it passes 4.5:1.
   */
  function readableOn(accent, bg) {
    var target = hex(bg), c = accent.slice(), toward = lum(target) > 0.5 ? 0 : 255;
    for (var i = 0; i < 24 && contrast(c, target) < 4.5; i++) {
      c = c.map(function (v) { return v + (toward - v) * 0.08; });
    }
    return toHex(c);
  }

  /*───────────────────────── markup ─────────────────────────*/

  // U+2197 carries Emoji=Yes and lands as a blue emoji on iOS — the site draws it instead
  // (frontend/components/ArrowNE.tsx) and so does this. Square caps, matching the borders.
  var ARROW =
    '<svg viewBox="0 0 12 12" width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="square" aria-hidden="true">' +
    '<path d="M3.1 8.9 8.7 3.3"/><path d="M4.4 3.3h4.4v4.4"/></svg>';

  var SUN =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="square" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/>' +
    '<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1"/></svg>';

  var MOON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="square" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

  function css(o) {
    var dark = o.dark;
    var bg = dark ? INK : PAPER;
    var fg = dark ? PAPER : INK;
    var accent = o.accent;
    var accentFill = toHex(accent);
    var accentOn = onColor(accent);
    var accentText = readableOn(accent, bg);
    var line = dark ? "rgba(241,241,234,.28)" : "rgba(11,14,8,.22)";
    var mute = dark ? "rgba(241,241,234,.55)" : "rgba(11,14,8,.55)";

    return (
      (o.fonts ? '@import url("' + FONTS_HREF + '");' : "") +
      ":host{all:initial;display:block;container-type:inline-size}" +
      "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}" +
      ".card{background:" + bg + ";color:" + fg + ";padding:clamp(20px,5cqi,40px);" +
      "font-family:Archivo,system-ui,-apple-system,Helvetica,sans-serif;" +
      "border:1px solid " + (dark ? "transparent" : line) + ";max-width:100%}" +
      ".mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace}" +
      // header
      ".top{display:flex;align-items:center;justify-content:space-between;gap:12px;" +
      "margin-bottom:clamp(14px,3cqi,22px)}" +
      ".eyebrow{font-size:clamp(10px,2.1cqi,13px);letter-spacing:.22em;text-transform:uppercase;color:" + mute + "}" +
      ".topright{display:flex;align-items:center;gap:12px}" +
      ".live{display:flex;align-items:center;gap:7px;font-size:clamp(10px,2.1cqi,13px);" +
      "letter-spacing:.22em;text-transform:uppercase;color:" + accentText + "}" +
      ".dot{width:7px;height:7px;border-radius:50%;background:" + accentFill + "}" +
      ".themebtn{display:grid;place-items:center;width:26px;height:26px;cursor:pointer;" +
      "background:none;border:1px solid " + line + ";color:" + mute + ";font:inherit}" +
      ".themebtn:hover{color:" + fg + ";border-color:" + fg + "}" +
      // input
      ".field{display:flex;align-items:center;gap:10px;border:1px solid " + line + ";" +
      "padding:clamp(12px,3cqi,22px) clamp(12px,3cqi,20px)}" +
      ".field:focus-within{border-color:" + accentFill + "}" +
      "input{flex:1;min-width:0;background:none;border:0;outline:0;color:" + fg + ";" +
      "font-family:inherit;font-weight:700;font-size:clamp(20px,6.2cqi,34px);letter-spacing:-.01em}" +
      "input::placeholder{color:" + mute + ";opacity:1}" +
      ".suffix{font-size:clamp(13px,3.4cqi,22px);color:" + mute + ";white-space:nowrap}" +
      // helper
      ".help{display:flex;align-items:baseline;justify-content:space-between;gap:12px;" +
      "margin-top:clamp(8px,2cqi,14px);font-size:clamp(10px,2.4cqi,14px);color:" + mute + "}" +
      ".help .msg{color:" + mute + "}" +
      ".help .msg[data-bad]{color:" + (dark ? "#ff8c72" : "#b3301a") + "}" +
      ".help .msg[data-ok]{color:" + accentText + "}" +
      "hr{border:0;border-top:1px solid " + line + ";margin:clamp(16px,4cqi,30px) 0}" +
      // price
      ".pricerow{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}" +
      ".price{font-size:clamp(26px,7cqi,42px);font-weight:700;line-height:1;letter-spacing:-.02em}" +
      ".price[data-empty]{display:block;width:clamp(56px,14cqi,84px);height:5px;background:" + mute + "}" +
      ".terms{text-align:right;font-size:clamp(10px,2.4cqi,14px);color:" + mute + ";line-height:1.5;white-space:nowrap}" +
      // pay toggle
      ".pay{display:grid;margin-top:clamp(16px,4cqi,28px)}" +
      ".method{display:flex;align-items:center;justify-content:center;gap:9px;" +
      "text-align:center;padding:clamp(11px,2.8cqi,18px);border:1px solid " + line + ";" +
      "font-size:clamp(11px,2.5cqi,15px);letter-spacing:.14em;text-transform:uppercase;color:" + mute + "}" +
      ".method::before{content:\"\";width:8px;height:8px;background:" + accentFill + "}" +
      // cta
      ".cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;" +
      "margin-top:clamp(12px,3cqi,20px);padding:clamp(14px,3.6cqi,24px);cursor:pointer;" +
      "text-decoration:none;border:0;font-family:inherit;font-weight:700;" +
      "font-size:clamp(14px,3.4cqi,21px);background:" + accentFill + ";color:" + accentOn + ";" +
      "transition:filter .15s}" +
      ".cta:hover{filter:brightness(.93)}" +
      ".cta[aria-disabled=true]{opacity:.45;pointer-events:none}" +
      // footer
      ".foot{display:flex;align-items:center;gap:9px;margin-top:clamp(12px,3cqi,18px);" +
      "font-size:clamp(10px,2.2cqi,13px);letter-spacing:.18em;text-transform:uppercase;color:" + mute + "}" +
      ".sq{width:9px;height:9px;background:" + accentFill + "}"
    );
  }

  /*───────────────────────── behaviour ─────────────────────────*/

  var VALID = /^[a-z0-9-]+$/;

  function validate(label) {
    if (!label) return { ok: false, msg: "type a name to check" };
    if (!VALID.test(label)) return { ok: false, bad: true, msg: "a-z, 0-9 and hyphens only" };
    if (label.charAt(0) === "-" || label.charAt(label.length - 1) === "-")
      return { ok: false, bad: true, msg: "no leading or trailing hyphen" };
    // The partner router rejects 1-3 character names outright — they are reserved for the
    // donors funding hoodfi.eth. Say so here rather than let the transaction fail later.
    if (label.length < 4) return { ok: false, bad: true, msg: "4+ characters through a partner" };
    return { ok: true, msg: "looks good — continue to register" };
  }

  function buildUrl(o, label, pay) {
    var url = (o.url || BASE_URL).replace(/\/?$/, "/");
    var qs = "?partner=" + encodeURIComponent(o.partner);
    if (label) qs += "&label=" + encodeURIComponent(label);
    if (pay) qs += "&pay=" + pay;
    return url + qs;
  }

  function render(host, o) {
    var root = host.shadowRoot || host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = css(o);

    var wrap = document.createElement("div");
    wrap.className = "card";
    wrap.innerHTML =
      '<div class="top">' +
        '<span class="eyebrow mono">' + esc(o.eyebrow) + "</span>" +
        '<span class="topright">' +
          '<button class="themebtn" type="button" title="Toggle light or dark">' +
            (o.dark ? SUN : MOON) + "</button>" +
          '<span class="live mono"><span class="dot"></span>Live</span>' +
        "</span>" +
      "</div>" +
      '<label class="field">' +
        '<input type="text" spellcheck="false" autocapitalize="none" autocorrect="off" ' +
          'placeholder="yourname" aria-label="Name to register">' +
        '<span class="suffix mono">.hoodfi.eth</span>' +
      "</label>" +
      '<div class="help mono"><span class="msg">type a name to check</span>' +
        "<span>a-z, 0-9, hyphens</span></div>" +
      "<hr>" +
      '<div class="eyebrow mono" style="margin-bottom:14px">Price</div>' +
      '<div class="pricerow">' +
        '<span class="price"></span>' +
        '<span class="terms mono">one time<br>for life</span>' +
      "</div>" +
      // The homepage offers ETH or USDG. A partner sale cannot: HoodfiPartnerRouter settles
      // in USDG only, because a partner's price is stored in USDG and a wei price would
      // drift against it. Rendering a disabled ETH cell here would be a control that looks
      // live and cannot work, so the row states the one method instead of offering a choice.
      '<div class="pay mono" data-single>' +
        '<span class="method" aria-current="true">Pay in USDG</span>' +
      "</div>" +
      '<a class="cta" target="_blank" rel="noopener"><span></span>' + ARROW + "</a>" +
      '<div class="foot mono"><span class="sq"></span>Robinhood Chain</div>';

    root.replaceChildren(style, wrap);

    var input = wrap.querySelector("input");
    var msg = wrap.querySelector(".msg");
    var price = wrap.querySelector(".price");
    var cta = wrap.querySelector(".cta");
    var ctaText = cta.querySelector("span");
    var pay = o.pay;

    // The partner sets their own price, so it is passed in rather than read from chain —
    // a partner origin cannot reach the L2 RPC today (the chain's own endpoint sends a
    // duplicated CORS header that browsers reject, and the gateway proxy allowlists origins).
    /**
     * Show the price only when the typed name could actually be bought at it.
     *
     * An empty box is the headline case and keeps the price. A name the partner router
     * would refuse — under four characters, or an illegal label — blanks it: a confident
     * "$4.00" beside "4+ characters through a partner" reads as if the name were one
     * click from purchase.
     */
    function showPrice(valid) {
      if (o.price && valid) {
        price.textContent = o.price;
        price.removeAttribute("data-empty");
      } else {
        price.textContent = "";
        price.setAttribute("data-empty", "");
      }
    }

    function sync() {
      var label = input.value.trim().toLowerCase();
      var v = validate(label);
      msg.textContent = v.msg;
      if (v.bad) msg.setAttribute("data-bad", ""); else msg.removeAttribute("data-bad");
      if (v.ok) msg.setAttribute("data-ok", ""); else msg.removeAttribute("data-ok");
      cta.href = buildUrl(o, v.ok ? label : "", pay);
      ctaText.textContent = o.text || (v.ok ? "Register " + label + ".hoodfi.eth" : "Connect Wallet");
      cta.setAttribute("aria-disabled", label && !v.ok ? "true" : "false");
      showPrice(!label || v.ok);
    }

    input.addEventListener("input", sync);
    if (o.label) { input.value = o.label; }
    sync();

    wrap.querySelector(".themebtn").addEventListener("click", function () {
      o.dark = !o.dark;
      o.label = input.value;
      o.pay = pay;
      render(host, o);
    });

    return host;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /*───────────────────────── public API ─────────────────────────*/

  function makeButton(o) {
    var a = document.createElement("a");
    a.href = buildUrl(o, o.label, o.pay);
    a.target = "_blank";
    a.rel = "noopener";
    a.style.cssText =
      "display:inline-flex;align-items:center;gap:8px;padding:12px 22px;" +
      "font:700 15px/1 Archivo,system-ui,sans-serif;text-decoration:none;cursor:pointer;" +
      "background:" + toHex(o.accent) + ";color:" + onColor(o.accent) + ";";
    a.innerHTML = esc(o.text || "Get your .hoodfi.eth name") + ARROW;
    return a;
  }

  function makeFrame(o) {
    var f = document.createElement("iframe");
    f.src = buildUrl(o, o.label, o.pay);
    f.title = "HoodFi Names registration";
    f.loading = "lazy";
    f.style.cssText =
      "width:100%;max-width:" + (o.width || "680px") + ";height:" + (o.height || "780px") +
      ";border:0";
    return f;
  }

  function normalise(opts) {
    var o = opts || {};
    var accent = hex(o.accent) || hex(LIME);
    var dark = o.theme === "dark";
    if (!o.theme || o.theme === "auto") {
      dark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return {
      partner: o.partner,
      mode: o.mode || "card",
      dark: dark,
      accent: accent,
      price: o.price || "",
      label: o.label || "",
      text: o.text || "",
      eyebrow: o.eyebrow || "Check a name",
      pay: o.pay === "eth" ? "eth" : "usdg",
      url: o.url,
      width: o.width,
      height: o.height,
      fonts: o.fonts !== false && o.fonts !== "false",
    };
  }

  function mount(el, opts) {
    if (!el) throw new Error("HoodFiWidget: mount element not found");
    var o = normalise(opts);
    if (!/^0x[0-9a-fA-F]{40}$/.test(o.partner || ""))
      throw new Error("HoodFiWidget: a valid partner address (0x…) is required");

    if (o.mode === "button") { var b = makeButton(o); el.appendChild(b); return b; }
    if (o.mode === "inline") { var f = makeFrame(o); el.appendChild(f); return f; }

    var host = document.createElement("div");
    host.setAttribute("data-hoodfi-widget", "");
    el.appendChild(host);
    return render(host, o);
  }

  window.HoodFiWidget = { mount: mount, version: "0.2.2" };

  // auto-init: <script src="…" data-partner="0x…" data-accent="#ff6a00"></script>
  var script = document.currentScript;
  if (script && script.getAttribute("data-partner")) {
    var attr = function (n) { return script.getAttribute("data-" + n) || undefined; };
    var opts = {
      partner: attr("partner"), mode: attr("mode"), theme: attr("theme"),
      accent: attr("accent"), price: attr("price"), label: attr("label"),
      text: attr("text"), eyebrow: attr("eyebrow"), pay: attr("pay"),
      url: attr("url"), width: attr("width"), height: attr("height"), fonts: attr("fonts"),
    };
    var target = attr("target");
    var place = function () {
      try {
        mount((target && document.querySelector(target)) || script.parentNode, opts);
      } catch (e) { console.error(e); }
    };
    if (document.readyState === "loading" && target) {
      document.addEventListener("DOMContentLoaded", place);
    } else { place(); }
  }
})();
