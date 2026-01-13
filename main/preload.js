import { contextBridge, ipcRenderer } from 'electron'

const handler = {
  send(channel, value) {
    ipcRenderer.send(channel, value)
  },
  on(channel, callback) {
    const subscription = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  once(channel, callback) {
    const subscription = (_event, ...args) => callback(...args)
    ipcRenderer.once(channel, subscription)
  },
  off(channel, callback) {
    ipcRenderer.removeListener(channel, callback)
  },
}

contextBridge.exposeInMainWorld('ipc', handler)
