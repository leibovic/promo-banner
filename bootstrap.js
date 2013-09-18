const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Home.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/JNI.jsm");
//Services.scriptloader.loadSubScript("chrome://browser/content/AccountsHelper.js", this);

// Keep track of the message ids so that we can remove them.
var messageIds = [];

function loadIntoWindow(window) {
  let syncAccountsExist = false; // AccountsHelper.syncAccountsExist()
  if (syncAccountsExist)
    return;

  let id = Home.banner.add({
    text: "Set up Firefox Sync to access bookmarks, history and tabs from your other devices",
    icon: "chrome://homedemo/skin/sync.png",
    onclick: function() {
      window.NativeWindow.toast.show("We should open the sync settings page now", "short");
    }
  });

  messageIds.push(id);
}

function unloadFromWindow(window) {
  messageIds.forEach(function(id) {
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
