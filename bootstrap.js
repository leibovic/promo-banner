/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "Home", "resource://gre/modules/Home.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyGetter(this, "gEncoder", function() { return new gChromeWin.TextEncoder(); });
XPCOMUtils.defineLazyGetter(this, "gDecoder", function() { return new gChromeWin.TextDecoder(); });

// URL to fetch snippets, in the urlFormatter service format.
const UPDATE_URL = "https://snippets.mozilla.com/%SNIPPETS_VERSION%/%NAME%/%VERSION%/%APPBUILDID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/";

// Should be bumped up if the snippets content format changes.
const SNIPPETS_VERSION = 1;

// How frequently we update snippets from the server (1 day).
const SNIPPETS_UPDATE_INTERVAL_MS = 86400000;

XPCOMUtils.defineLazyGetter(this, "gSnippetsURL", function() {
  let updateURL = UPDATE_URL.replace("%SNIPPETS_VERSION%", SNIPPETS_VERSION);
  let snippetsURL = Services.urlFormatter.formatURL(updateURL)
  LOG("snippetsURL: " + snippetsURL);
  return "http://snippets-server.paas.allizom.org/";
});

// Hold a reference the chrome window.
var gChromeWin;

// Keep track of the message ids so that we can remove them on uninstall.
var gMessageIds = [];

function LOG(text) {
  Services.console.logStringMessage("*** Promo Banner: " + text);
}

/**
 * Loads snippets from snippets server and caches the response.
 */
function updateSnippets() {
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
  try {
    xhr.open("GET", gSnippetsURL, true);
  } catch (e) {
    LOG("Exception initalizing request to " + gSnippetsURL + ": " + e);
    return;
  }
  xhr.onerror = function onerror(event) {
    LOG("Error handing request to " + gSnippetsURL);
  }
  xhr.onload = function onload(event) {
    if (xhr.status !== 200) {
      LOG("Request to " + gSnippetsURL + " returned status " + xhr.status);
      return;
    }
    addSnippets(xhr.responseText);
    cacheResponse(xhr.responseText);
  }
  xhr.send(null);
}

/**
 * Caches snippets server response text to snippets.json file in profile directory.
 */
function cacheResponse(response) {
  let path = OS.Path.join(OS.Constants.Path.profileDir, "snippets.json");
  let data = gEncoder.encode(response);
  let promise = OS.File.writeAtomic(path, data, { tmpPath: path + ".tmp"});
  promise.then(
    function onSuccess() {},
    function onError(e) {
      LOG("Error caching snippets: " + e);
    }
  );
}

/**
 * Loads snippets from cached snippets.json file.
 */
function loadSnippetsFromCache() {
  let path = OS.Path.join(OS.Constants.Path.profileDir, "snippets.json");
  let promise = OS.File.read(path);
  promise.then(
    function onSuccess(array) {
      let response = gDecoder.decode(array);
      addSnippets(response);
    },
    function onError(e) {
      LOG("Error reading cached snippets: " + e);
    }
  );
}

/**
 * Adds snippets to the home banner message rotation.
 *
 * @param response JSON array of message data JSON objects.
 *        Each object should have the following properties:
 *          - text (string): Text to show as banner message.
 *          - url (string): URL to open when banner is clicked.
 *          - icon (data URI): Icon to appear in banner.
 */
function addSnippets(response) {
  let messages = JSON.parse(response);

  messages.forEach(function(message) {
    let id = Home.banner.add({
      text: message.text,
      icon: message.icon,
      onclick: function() {
        gChromeWin.BrowserApp.addTab(message.url);
      },
      onshow: function() {
        // 10% of the time, let the metrics server know which message was shown
      }
    });
    gMessageIds.push(id);
  });
}

function loadIntoWindow(window) {
  gChromeWin = window;

  try {
    // Once every 24 hours, request snippets from the snippets service
    let lastUpdate = Services.prefs.getIntPref("snippets.lastUpdate");
    if (Date.now() - lastUpdate > SNIPPETS_UPDATE_INTERVAL_MS) {
      updateSnippets();

      // Even if fetching should fail we don't want to spam the server, thus
      // set the last update time regardless its results. Will retry tomorrow.
      Services.prefs.setIntPref("snippets.lastUpdate", Date.now());
      return;
    }
  } catch (e) {}

  // Default to loading snippets from the cache.
  loadSnippetsFromCache();
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
