window.setTimeout(function () {
  var status = document.getElementById("boot-status");
  var app = document.getElementById("app");
  if (status && app && app.children.length === 0) {
    status.hidden = false;
  }
}, 1500);
