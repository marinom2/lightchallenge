/**
 * LightChallenge Embeddable Widget
 *
 * Usage:
 *   <script src="https://uat.lightchallenge.app/embed.js"
 *           data-competition="uuid"
 *           data-theme="dark"
 *           data-height="500"></script>
 */
(function () {
  var scripts = document.querySelectorAll("script[data-competition]");
  for (var i = 0; i < scripts.length; i++) {
    var script = scripts[i];
    var competitionId = script.getAttribute("data-competition");
    var theme = script.getAttribute("data-theme") || "dark";
    var height = script.getAttribute("data-height") || "500";
    if (!competitionId) continue;
    var baseUrl = script.src.replace(/\/embed\.js.*$/, "");
    var iframe = document.createElement("iframe");
    iframe.src = baseUrl + "/embed/" + competitionId + "?theme=" + theme;
    iframe.width = "100%";
    iframe.height = height + "px";
    iframe.frameBorder = "0";
    iframe.style.border = "1px solid #1f1f1f";
    iframe.style.borderRadius = "12px";
    iframe.style.overflow = "hidden";
    iframe.allow = "clipboard-write";
    window.addEventListener("message", function (e) {
      if (e.data && e.data.type === "lc-embed-resize" && e.data.competitionId === competitionId) {
        iframe.height = e.data.height + "px";
      }
    });
    script.parentNode.insertBefore(iframe, script.nextSibling);
  }
})();
