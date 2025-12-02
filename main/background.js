import path from 'path'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { setupRobotController } from './robotController'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let robotController

;(async () => {
  await app.whenReady()

  const mainWindow = createWindow('main', {
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Enable media access for camera
      enableBlinkFeatures: 'MediaDevices',
    },
  })

  // Handle camera permission requests - MUST be set before window loads
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      console.log('[Camera] Permission requested:', permission, details)
      // Allow camera, microphone, and media permissions
      // Note: Electron uses 'media' permission for getUserMedia API
      if (permission === 'camera' || permission === 'microphone' || permission === 'media') {
        console.log('[Camera] Granting permission:', permission)
        callback(true) // Grant permission
      } else {
        console.log('[Camera] Denying permission:', permission)
        callback(false) // Deny other permissions
      }
    }
  )

  // Handle permission check results - MUST be set before window loads
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      // Allow camera, microphone, and media permissions
      // Note: Electron uses 'media' permission for getUserMedia API
      if (permission === 'camera' || permission === 'microphone' || permission === 'media') {
        console.log('[Camera] Permission check passed:', permission)
        return true
      }
      console.log('[Camera] Permission check denied:', permission)
      return false
    }
  )

  robotController = setupRobotController({
    ipcMain,
    getWebContents: () => mainWindow?.webContents,
  })

  mainWindow.webContents.on('did-finish-load', () => {
    robotController?.broadcastInitialState()
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})

app.on('before-quit', () => {
  // Ensure all handlers are cleaned up before the app fully exits.
  if (typeof robotController?.dispose === 'function') {
    robotController.dispose()
  }
})
