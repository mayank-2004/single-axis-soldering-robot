import SolderingHardware from './hardware/SolderingHardware'

export function setupRobotController({ ipcMain, getWebContents }) {
  const hardware = new SolderingHardware()
  const ipcListeners = []
  const hardwareListeners = []

  const getRenderer = (fallback) => {
    const webContents = fallback ?? getWebContents?.()
    if (!webContents || webContents.isDestroyed()) {
      return null
    }
    return webContents
  }

  const sendToRenderer = (channel, payload, target) => {
    const renderer = getRenderer(target)
    if (!renderer) {
      return
    }
    renderer.send(channel, payload)
  }

  const sendCalibrationUpdate = (payload, target) => {
    sendToRenderer('calibration:update', payload, target)
  }

  const sendFluxUpdate = (target, payload) => {
    sendToRenderer('flux:update', payload ?? hardware.getFluxState(), target)
  }

  const sendFanUpdate = (target, payload) => {
    sendToRenderer('fan:update', payload ?? hardware.getFanState(), target)
  }

  const sendTipStatus = (target, payload) => {
    sendToRenderer('tip:status', payload ?? hardware.getTipStatus(), target)
  }

  const sendWireFeedStatus = (target, payload) => {
    sendToRenderer('wire:feed:status', payload ?? hardware.getWireFeedStatus(), target)
  }

  const sendSequenceUpdate = (target, payload) => {
    sendToRenderer('sequence:update', payload ?? hardware.getSequenceState(), target)
  }

  const sendPositionUpdate = (target, payload) => {
    sendToRenderer('position:update', payload ?? hardware.getPosition(), target)
  }

  const broadcastInitialState = (target) => {
    const snapshot = hardware.getSnapshot()
    sendCalibrationUpdate(snapshot.calibration, target)
    sendFluxUpdate(target, snapshot.flux)
    sendFanUpdate(target, snapshot.fans)
    sendTipStatus(target, snapshot.tip)
    sendWireFeedStatus(target, snapshot.wireFeed)
    sendSequenceUpdate(target, snapshot.sequence)
    sendPositionUpdate(target, hardware.getPosition())
  }

  const registerHardwareListener = (event, handler) => {
    hardware.on(event, handler)
    hardwareListeners.push([event, handler])
  }

  registerHardwareListener('calibration', (payload) => {
    sendCalibrationUpdate(payload)
  })

  registerHardwareListener('flux', (payload) => {
    sendFluxUpdate(undefined, payload)
  })

  registerHardwareListener('fan', (payload) => {
    sendFanUpdate(undefined, payload)
  })

  registerHardwareListener('tip', (payload) => {
    sendTipStatus(undefined, payload)
  })

  registerHardwareListener('wireFeed', (payload) => {
    sendWireFeedStatus(undefined, payload)
  })

  registerHardwareListener('sequence', (payload) => {
    sendSequenceUpdate(undefined, payload)
  })

  registerHardwareListener('position:update', (payload) => {
    sendPositionUpdate(undefined, payload)
  })

  const registerIpcListener = (channel, handler) => {
    ipcMain.on(channel, handler)
    ipcListeners.push([channel, handler])
  }

  registerIpcListener('component:height:set', (event, payload = {}) => {
    const result = hardware.setComponentHeight(payload.height, payload.unit)
    event.sender.send('component:height:ack', result)
  })

  registerIpcListener('flux:state:request', (event) => {
    sendFluxUpdate(event.sender)
  })

  registerIpcListener('fan:state:request', (event) => {
    sendFanUpdate(event.sender)
  })

  registerIpcListener('fan:control', (event, payload = {}) => {
    hardware.setFanState(payload.fan, payload.state)
    sendFanUpdate(event.sender)
  })

  registerIpcListener('tip:status:request', (event) => {
    sendTipStatus(event.sender)
  })

  registerIpcListener('tip:target:set', (event, payload = {}) => {
    hardware.setTipTarget(payload.target)
    sendTipStatus(event.sender)
  })

  registerIpcListener('tip:heater:set', (event, payload = {}) => {
    hardware.setHeaterEnabled(payload.enabled)
    sendTipStatus(event.sender)
  })

  registerIpcListener('wire:feed:status:request', (event) => {
    sendWireFeedStatus(event.sender)
  })

  registerIpcListener('wire:feed:start', (event, payload = {}) => {
    hardware.startWireFeed(payload.length, payload.rate)
    sendWireFeedStatus(event.sender)
  })

  registerIpcListener('sequence:status:request', (event) => {
    sendSequenceUpdate(event.sender)
  })

  registerIpcListener('flux:request', () => {
    sendFluxUpdate()
  })

  registerIpcListener('wire:alert', (_event, payload = {}) => {
    hardware.handleWireAlert(payload)
  })

  registerIpcListener('position:request', (event) => {
    sendPositionUpdate(event.sender)
  })

  registerIpcListener('axis:jog', async (event, payload = {}) => {
    const { axis, direction, stepSize } = payload
    const result = await hardware.jog(axis, direction, stepSize)
    event.sender.send('axis:jog:ack', result)
    sendPositionUpdate(event.sender)
  })

  registerIpcListener('axis:home', async (event) => {
    const result = await hardware.home()
    event.sender.send('axis:home:ack', result)
    sendPositionUpdate(event.sender)
  })

  hardware.connect()

  return {
    broadcastInitialState,
    dispose: () => {
      ipcListeners.forEach(([channel, handler]) => {
        ipcMain.off(channel, handler)
      })
      hardwareListeners.forEach(([event, handler]) => {
        hardware.off(event, handler)
      })
      hardware.disconnect()
    },
  }
}

