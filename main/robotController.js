import SolderingHardware from './hardware/SolderingHardware'

export function setupRobotController({ ipcMain, getWebContents, options = {} }) {
  // Initialize hardware - use hardware mode so serial manager exists,
  // but will run in simulation until a serial connection is established
  const serialConfig = options.serialConfig || {
    baudRate: 115200,
    protocol: 'gcode',
  }

  const hardware = new SolderingHardware({
    mode: 'hardware', // Always use hardware mode so serial manager exists
    serialConfig,
  })
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

  const sendFumeExtractorUpdate = (target, payload) => {
    sendToRenderer('fumeExtractor:update', payload ?? hardware.getFumeExtractorState(), target)
  }

  const sendFluxMistUpdate = (target, payload) => {
    sendToRenderer('fluxMist:update', payload ?? hardware.getFluxMistState(), target)
  }

  const sendAirBreezeUpdate = (target, payload) => {
    sendToRenderer('airBreeze:update', payload ?? hardware.getAirBreezeState(), target)
  }

  const sendAirJetPressureUpdate = (target, payload) => {
    sendToRenderer('airJetPressure:update', payload ?? hardware.getAirJetPressureState(), target)
  }

  const sendTipStatus = (target, payload) => {
    sendToRenderer('tip:status', payload ?? hardware.getTipStatus(), target)
  }

  const sendWireFeedStatus = (target, payload) => {
    sendToRenderer('wire:feed:status', payload ?? hardware.getWireFeedStatus(), target)
  }

  const sendSpoolState = (target, payload) => {
    sendToRenderer('spool:update', payload ?? hardware.getSpoolState(), target)
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
    sendSpoolState(target, snapshot.spool)
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

  registerHardwareListener('wireBreak', (payload) => {
    sendToRenderer('wire:break', payload)
  })

  registerHardwareListener('fumeExtractor', (payload) => {
    sendFumeExtractorUpdate(undefined, payload)
  })

  registerHardwareListener('fluxMist', (payload) => {
    sendFluxMistUpdate(undefined, payload)
  })

  registerHardwareListener('airBreeze', (payload) => {
    sendAirBreezeUpdate(undefined, payload)
  })

  registerHardwareListener('airJetPressure', (payload) => {
    sendAirJetPressureUpdate(undefined, payload)
  })

  registerHardwareListener('spool', (payload) => {
    sendSpoolState(undefined, payload)
  })

  registerHardwareListener('sequence', (payload) => {
    sendSequenceUpdate(undefined, payload)
  })

  registerHardwareListener('position:update', (payload) => {
    sendPositionUpdate(undefined, payload)
  })

  // Listen for actual Arduino JSON data reception (for connection status tracking)
  registerHardwareListener('arduino:data:received', (payload) => {
    sendToRenderer('arduino:data:received', { timestamp: payload.timestamp })
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

  registerIpcListener('fumeExtractor:state:request', (event) => {
    sendFumeExtractorUpdate(event.sender)
  })

  registerIpcListener('fumeExtractor:enable', (event, payload = {}) => {
    hardware.setFumeExtractorEnabled(payload.enabled)
    sendFumeExtractorUpdate(event.sender)
  })

  registerIpcListener('fumeExtractor:speed:set', (event, payload = {}) => {
    const result = hardware.setFumeExtractorSpeed(payload.speed)
    if (result.error) {
      event.sender.send('fumeExtractor:error', result)
    } else {
      sendFumeExtractorUpdate(event.sender)
    }
  })

  registerIpcListener('fumeExtractor:autoMode:set', (event, payload = {}) => {
    hardware.setFumeExtractorAutoMode(payload.autoMode)
    sendFumeExtractorUpdate(event.sender)
  })

  registerIpcListener('fluxMist:state:request', (event) => {
    sendFluxMistUpdate(event.sender)
  })

  registerIpcListener('fluxMist:dispense', (event, payload = {}) => {
    hardware.dispenseFluxMist(payload.duration, payload.flowRate).then((result) => {
      if (result.error) {
        event.sender.send('fluxMist:error', result)
      } else {
        sendFluxMistUpdate(event.sender)
        sendFluxUpdate(event.sender) // Also update flux state
      }
    })
  })

  registerIpcListener('fluxMist:duration:set', (event, payload = {}) => {
    const result = hardware.setFluxMistDuration(payload.duration)
    if (result.error) {
      event.sender.send('fluxMist:error', result)
    } else {
      sendFluxMistUpdate(event.sender)
    }
  })

  registerIpcListener('fluxMist:flowRate:set', (event, payload = {}) => {
    const result = hardware.setFluxMistFlowRate(payload.flowRate)
    if (result.error) {
      event.sender.send('fluxMist:error', result)
    } else {
      sendFluxMistUpdate(event.sender)
    }
  })

  registerIpcListener('fluxMist:autoMode:set', (event, payload = {}) => {
    hardware.setFluxMistAutoMode(payload.autoMode)
    sendFluxMistUpdate(event.sender)
  })

  registerIpcListener('airBreeze:state:request', (event) => {
    sendAirBreezeUpdate(event.sender)
  })

  registerIpcListener('airBreeze:activate', (event, payload = {}) => {
    hardware.activateAirBreeze(payload.duration, payload.intensity).then((result) => {
      if (result.error) {
        event.sender.send('airBreeze:error', result)
      } else {
        sendAirBreezeUpdate(event.sender)
      }
    })
  })

  registerIpcListener('airBreeze:enable', (event, payload = {}) => {
    hardware.setAirBreezeEnabled(payload.enabled)
    sendAirBreezeUpdate(event.sender)
  })

  registerIpcListener('airBreeze:duration:set', (event, payload = {}) => {
    const result = hardware.setAirBreezeDuration(payload.duration)
    if (result.error) {
      event.sender.send('airBreeze:error', result)
    } else {
      sendAirBreezeUpdate(event.sender)
    }
  })

  registerIpcListener('airBreeze:intensity:set', (event, payload = {}) => {
    const result = hardware.setAirBreezeIntensity(payload.intensity)
    if (result.error) {
      event.sender.send('airBreeze:error', result)
    } else {
      sendAirBreezeUpdate(event.sender)
    }
  })

  registerIpcListener('airBreeze:autoMode:set', (event, payload = {}) => {
    hardware.setAirBreezeAutoMode(payload.autoMode)
    sendAirBreezeUpdate(event.sender)
  })

  registerIpcListener('airJetPressure:activate', (event, payload = {}) => {
    hardware.activateAirJetPressure(payload.duration, payload.pressure).then((result) => {
      if (result.error) {
        event.sender.send('airJetPressure:error', result)
      } else {
        sendAirJetPressureUpdate(event.sender)
      }
    })
  })

  registerIpcListener('airJetPressure:enable', (event, payload = {}) => {
    hardware.setAirJetPressureEnabled(payload.enabled)
    sendAirJetPressureUpdate(event.sender)
  })

  registerIpcListener('airJetPressure:duration:set', (event, payload = {}) => {
    const result = hardware.setAirJetPressureDuration(payload.duration)
    if (result.error) {
      event.sender.send('airJetPressure:error', result)
    } else {
      sendAirJetPressureUpdate(event.sender)
    }
  })

  registerIpcListener('airJetPressure:pressure:set', (event, payload = {}) => {
    const result = hardware.setAirJetPressurePressure(payload.pressure)
    if (result.error) {
      event.sender.send('airJetPressure:error', result)
    } else {
      sendAirJetPressureUpdate(event.sender)
    }
  })

  registerIpcListener('airJetPressure:autoMode:set', (event, payload = {}) => {
    hardware.setAirJetPressureAutoMode(payload.autoMode)
    sendAirJetPressureUpdate(event.sender)
  })

  registerIpcListener('airJetPressure:state:request', (event) => {
    sendAirJetPressureUpdate(event.sender)
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

  registerIpcListener('wire:break:clear', (event) => {
    hardware.clearWireBreak()
    sendWireFeedStatus(event.sender)
  })

  registerIpcListener('spool:status:request', (event) => {
    sendSpoolState(event.sender)
  })

  registerIpcListener('spool:config:set', (event, payload = {}) => {
    const result = hardware.setSpoolConfig(payload)
    if (result.error) {
      event.sender.send('spool:config:response', result)
    } else {
      sendSpoolState(event.sender)
      event.sender.send('spool:config:response', result)
    }
  })

  registerIpcListener('spool:reset', (event) => {
    const result = hardware.resetSpool()
    sendSpoolState(event.sender)
    event.sender.send('spool:reset:response', result)
  })

  registerIpcListener('spool:tare', (event) => {
    const result = hardware.tareSpool()
    sendSpoolState(event.sender)
    event.sender.send('spool:tare:response', result)
  })

  registerIpcListener('sequence:status:request', (event) => {
    sendSequenceUpdate(event.sender)
  })

  registerIpcListener('sequence:start', async (event, payload = {}) => {
    const { padPositions = [], options = {} } = payload
    const result = await hardware.startSequence(padPositions, options)
    event.sender.send('sequence:start:response', result)
    sendSequenceUpdate(event.sender)
  })

  registerIpcListener('sequence:stop', (event) => {
    const result = hardware.stopSequence()
    event.sender.send('sequence:stop:response', result)
    sendSequenceUpdate(event.sender)
  })

  registerIpcListener('sequence:pause', (event) => {
    const result = hardware.pauseSequence()
    event.sender.send('sequence:pause:response', result)
    sendSequenceUpdate(event.sender)
  })

  registerIpcListener('sequence:resume', (event) => {
    const result = hardware.resumeSequence()
    event.sender.send('sequence:resume:response', result)
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

  // Serial port management IPC handlers
  registerIpcListener('serial:list-ports', async (event) => {
    try {
      const ports = await SolderingHardware.listSerialPorts()
      event.sender.send('serial:list-ports:response', { ports })
    } catch (error) {
      event.sender.send('serial:list-ports:response', { error: error.message })
    }
  })

  registerIpcListener('serial:connect', async (event, payload = {}) => {
    const { portPath, config = {} } = payload
    try {
      const result = await hardware.connect(portPath, config)
      event.sender.send('serial:connect:response', result)
      if (!result.error) {
        broadcastInitialState(event.sender)
      }
    } catch (error) {
      event.sender.send('serial:connect:response', { error: error.message })
    }
  })

  registerIpcListener('serial:disconnect', async (event) => {
    try {
      const result = await hardware.disconnect()
      event.sender.send('serial:disconnect:response', result)
    } catch (error) {
      event.sender.send('serial:disconnect:response', { error: error.message })
    }
  })

  registerIpcListener('serial:status', (event) => {
    const status = hardware.getSerialStatus()
    event.sender.send('serial:status:response', status)
  })

  // Listen for hardware errors
  registerHardwareListener('error', ({ type, error }) => {
    sendToRenderer('serial:error', { type, error })
  })

  // G-CODE COMMAND MONITORING COMMENTED OUT
  // G-code command monitoring
  // registerHardwareListener('gcode:command', (data) => {
  //   sendToRenderer('gcode:command', data)
  // })

  // registerHardwareListener('gcode:response', (data) => {
  //   sendToRenderer('gcode:response', data)
  // })

  // registerHardwareListener('gcode:error', (data) => {
  //   sendToRenderer('gcode:error', data)
  // })

  // G-CODE COMMAND MANAGEMENT COMMENTED OUT
  // G-code command management
  // let gcodeHistory = []
  // const maxHistorySize = 100

  // registerIpcListener('gcode:clear', (event) => {
  //   gcodeHistory = []
  //   event.sender.send('gcode:history', { commands: [] })
  // })

  // registerIpcListener('gcode:history:request', (event) => {
  //   event.sender.send('gcode:history', { commands: gcodeHistory })
  // })

  // Helper to add command to history
  // const addGcodeToHistory = (data) => {
  //   // Update existing entry if it's a response/error for a sent command
  //   if (data.status === 'received' || data.status === 'error') {
  //     // Try to find matching command by command text
  //     if (data.command) {
  //       // Find the most recent sent command matching this command text
  //       for (let i = gcodeHistory.length - 1; i >= 0; i--) {
  //         const entry = gcodeHistory[i]
  //         if (entry.status === 'sent' && entry.command === data.command) {
  //           entry.status = data.status
  //           entry.response = data.response || null
  //           entry.error = data.error || null
  //           sendToRenderer('gcode:history', { commands: gcodeHistory })
  //           return
  //         }
  //       }
  //     }
  //     
  //     // Fallback: update last sent command if no match found
  //     const lastCommand = gcodeHistory[gcodeHistory.length - 1]
  //     if (lastCommand && lastCommand.status === 'sent') {
  //       lastCommand.status = data.status
  //       lastCommand.response = data.response || null
  //       lastCommand.error = data.error || null
  //       sendToRenderer('gcode:history', { commands: gcodeHistory })
  //       return
  //     }
  //   }

  //   // Add new command entry
  //   const commandEntry = {
  //     id: Date.now() + Math.random(),
  //     command: data.command || data.response || data.error || 'Unknown',
  //     status: data.status || 'sent',
  //     timestamp: data.timestamp || Date.now(),
  //     response: data.response || null,
  //     error: data.error || null,
  //   }

  //   gcodeHistory.push(commandEntry)

  //   // Limit history size
  //   if (gcodeHistory.length > maxHistorySize) {
  //     gcodeHistory.shift()
  //   }

  //   sendToRenderer('gcode:history', { commands: gcodeHistory })
  // }

  // Listen for G-code events and add to history
  // registerHardwareListener('gcode:command', (data) => {
  //   addGcodeToHistory(data)
  // })

  // registerHardwareListener('gcode:response', (data) => {
  //   addGcodeToHistory(data)
  // })

  // registerHardwareListener('gcode:error', (data) => {
  //   addGcodeToHistory(data)
  // })

  // Start in simulation mode (no serial connection yet)
  // User will connect via UI, which will establish serial connection
  hardware.connect() // This will start simulation loops since no port is provided

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

