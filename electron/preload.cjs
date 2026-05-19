const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osuwariLLM", {
  status: () => ipcRenderer.invoke("local-llm:status"),
  startDownload: () => ipcRenderer.invoke("local-llm:download-start"),
  cancelDownload: () => ipcRenderer.invoke("local-llm:download-cancel"),
  deleteModel: () => ipcRenderer.invoke("local-llm:delete"),
  modelAlias: () => ipcRenderer.invoke("local-llm:model-alias"),
  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("local-llm:download-progress", handler);
    return () => ipcRenderer.removeListener("local-llm:download-progress", handler);
  },
});
