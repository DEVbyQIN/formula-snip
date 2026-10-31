'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer is host-agnostic: it only needs a message bridge named
// `formulasnip` with a `postMessage(payload)` method.
const init = ipcRenderer.sendSync('formulasnip:init');

contextBridge.exposeInMainWorld('formulasnip', {
  postMessage: (payload) => ipcRenderer.send('formulasnip:message', payload)
});

contextBridge.exposeInMainWorld('__NATIVE_STATE__', init.state || {});
contextBridge.exposeInMainWorld('__SELFTEST__', !!init.selftest);
contextBridge.exposeInMainWorld('__PLATFORM__', init.platform);
