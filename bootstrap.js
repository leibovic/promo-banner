const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// URL where we look for snippets data.
var SNIPPETS_URL = "https://people.mozilla.org/~mleibovic/snippets.json";

// Keep track of the message ids so that we can remove them on uninstall.
var gMessageIds = [];

/**
 * Adds snippets to the home banner message rotation.
 *
 * @param response JSON array of message data JSON objects.
 *        Each object should have the following properties:
 *          - text (string): Text to show as banner message.
 *          - url (string): URL to open when banner is clicked.
 *          - icon (data URI): Icon to appear in banner.
 */
function addSnippets(response, window) {
  let messages = JSON.parse(response);

  messages.forEach(function(message) {
    let id = Home.banner.add({
      text: message.text,
      icon: message.icon,
      onclick: function() {
        window.BrowserApp.addTab(message.url);
      }
    });
    gMessageIds.push(id);
  });
}

function loadIntoWindow(window) {
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
  try {
    xhr.open("GET", SNIPPETS_URL, true);
  } catch (e) {
    Cu.reportError("Exception initalizing request to " + SNIPPETS_URL + ": " + e);
    return;
  }

  xhr.onerror = function onerror(event) {
    Cu.reportError("Error handing request to " + SNIPPETS_URL);
  }
  xhr.onload = function onload(event) {
    if (xhr.status !== 200) {
      Cu.reportError("Request to " + SNIPPETS_URL + " returned status " + xhr.status);
      return;
    }
    addSnippets(xhr.responseText, window);
  }

  xhr.send(null);
}

function unloadFromWindow(window) {
  gMessageIds.forEach(function(id) {
    Home.banner.remove(id);
  });
}

/**
 * bootstrap.js API
 */
var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
  
  onCloseWindow: function(aWindow) {
  },
  
  onWindowTitleChange: function(aWindow, aTitle) {
  }
};

function startup(aData, aReason) {
  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

  // Load into any existing windows
  let windows = wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN)
    return;

  let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

  // Stop listening for new windows
  wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}
