// The site learns it runs inside the Windows app. Nothing else crosses this line.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("roznomaDesktop", { platform: "windows" });
