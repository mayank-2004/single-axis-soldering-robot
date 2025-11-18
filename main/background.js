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
    },
  })

  // Handle camera permission requests
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      // Allow camera and microphone permissions
      if (permission === 'camera' || permission === 'microphone') {
        callback(true) // Grant permission
      } else {
        callback(false) // Deny other permissions
      }
    }
  )

  // Handle permission check results
  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      // Allow camera and microphone permissions
      if (permission === 'camera' || permission === 'microphone') {
        return true
      }
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
