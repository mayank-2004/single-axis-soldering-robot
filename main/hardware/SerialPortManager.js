import { SerialPort } from 'serialport'
import { ReadlineParser } from 'serialport'
import { EventEmitter } from 'events'
import ArduinoDataHandler from './ArduinoDataHandler.js'

export default class SerialPortManager extends EventEmitter {
  constructor(options = {}) {
    super()

    this.port = null
    this.parser = null
    this.isConnected = false
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5
    this.reconnectDelay = options.reconnectDelay || 2000

    // Serial port configuration
    this.config = {
      baudRate: options.baudRate || 115200,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
      autoOpen: false,
    }

    // Command queue for sending commands sequentially
    this.commandQueue = []
    this.isProcessingQueue = false
    this.commandTimeout = options.commandTimeout || 5000

    // Response handlers (for command/response pattern)
    this.pendingCommands = new Map()
    this.commandIdCounter = 0

    // Arduino data handler
    this.arduinoHandler = new ArduinoDataHandler()
    this.pollingInterval = null
    this.pollingIntervalMs = options.pollingInterval || 100 // Poll every 100ms
  }

  /**
   * List available serial ports
   */
  static async listPorts() {
    try {
      const ports = await SerialPort.list()
      return ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        vendorId: port.vendorId,
        productId: port.productId,
        friendlyName: port.friendlyName || port.path,
      }))
    } catch (error) {
      console.error('[SerialPortManager] Error listing ports:', error)
      return []
    }
  }

  /**
   * Connect to a serial port
   */
  async connect(portPath, options = {}) {
    if (this.isConnecting || this.isConnected) {
      return { error: 'Already connected or connecting' }
    }

    this.isConnecting = true

    try {
      // Merge custom options with default config
      const config = {
        ...this.config,
        path: portPath,
        ...options,
      }

      this.port = new SerialPort(config)

      // Setup parser (readline parser for line-based protocols like G-code)
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }))

      // Setup event handlers
      this._setupEventHandlers()

      // Open the port
      await new Promise((resolve, reject) => {
        this.port.open((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })

      this.isConnected = true
      this.isConnecting = false
      this.reconnectAttempts = 0

      // Send initialization commands (e.g., reset, get status)
      await this._initializeConnection()

      this.emit('connected', { path: portPath })
      console.log(`[SerialPortManager] Connected to ${portPath}`)

      return { status: 'Connected', path: portPath }
    } catch (error) {
      this.isConnecting = false
      this.isConnected = false
      console.error('[SerialPortManager] Connection error:', error)
      this.emit('error', { type: 'connection', error: error.message })
      return { error: error.message }
    }
  }

  /**
   * Disconnect from serial port
   */
  async disconnect() {
    if (!this.port || !this.isConnected) {
      return { status: 'Already disconnected' }
    }

    try {
      // Clear command queue
      this.commandQueue = []
      this.pendingCommands.clear()

      // Close port
      await new Promise((resolve, reject) => {
        if (this.port.isOpen) {
          this.port.close((error) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          })
        } else {
          resolve()
        }
      })

      this.isConnected = false
      this.port = null
      this.parser = null

      this.emit('disconnected')
      console.log('[SerialPortManager] Disconnected')

      return { status: 'Disconnected' }
    } catch (error) {
      console.error('[SerialPortManager] Disconnect error:', error)
      return { error: error.message }
    }
  }

  async sendJsonCommand(commandObj, options = {}) {
    const {
      waitForResponse = false,
      timeout = this.commandTimeout,
      priority = false,
    } = options

    if (!this.isConnected || !this.port || !this.port.isOpen) {
      return Promise.reject(new Error('Serial port not connected'))
    }

    try {
      const jsonCommand = JSON.stringify(commandObj)
      console.log('[SerialPortManager] Sending JSON command to Arduino:', jsonCommand)

      return new Promise((resolve, reject) => {
        this.port.write(`${jsonCommand}\n`, (error) => {
          if (error) {
            console.error('[SerialPortManager] Error sending JSON command:', error)
            reject(error)
          } else {
            this.emit('command:sent', {
              command: jsonCommand,
              timestamp: Date.now(),
            })
            resolve({ status: 'sent', command: jsonCommand })
          }
        })
      })
    } catch (error) {
      console.error('[SerialPortManager] Error serializing JSON command:', error)
      return Promise.reject(error)
    }
  }

  /**
   * Send a command to the hardware
   * @param {string} command - Command string (e.g., "G0 X10 Y20" for G-code)
   * @param {object} options - Options for command execution
   * @returns {Promise} Promise that resolves when command is sent (or acknowledged if waitForResponse is true)
   */
  async sendCommand(command, options = {}) {
    const {
      waitForResponse = false,
      timeout = this.commandTimeout,
      priority = false,
    } = options

    return new Promise((resolve, reject) => {
      const commandData = {
        command: command.trim(),
        waitForResponse,
        timeout,
        resolve,
        reject,
        timestamp: Date.now(),
      }

      if (priority) {
        this.commandQueue.unshift(commandData)
      } else {
        this.commandQueue.push(commandData)
      }

      this._processCommandQueue()
    })
  }

  /**
   * Send a command and wait for a specific response
   * @param {string} command - Command to send
   * @param {RegExp|string} expectedResponse - Expected response pattern
   * @param {number} timeout - Timeout in milliseconds
   */
  async sendCommandAndWait(command, expectedResponse, timeout = this.commandTimeout) {
    const commandId = ++this.commandIdCounter
    const responsePattern =
      expectedResponse instanceof RegExp
        ? expectedResponse
        : new RegExp(expectedResponse)

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(commandId)
        reject(new Error(`Command timeout: ${command}`))
      }, timeout)

      this.pendingCommands.set(commandId, {
        command: command,
        pattern: responsePattern,
        resolve: (response) => {
          clearTimeout(timeoutId)
          resolve(response)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        },
      })

      // Send command with ID prefix for tracking
      this.sendCommand(`${command}`, { waitForResponse: true })
        .then(() => {
          // Command sent, now waiting for response
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          this.pendingCommands.delete(commandId)
          reject(error)
        })
    })
  }

  /**
   * Process command queue
   */
  async _processCommandQueue() {
    if (this.isProcessingQueue || this.commandQueue.length === 0) {
      return
    }

    if (!this.isConnected || !this.port || !this.port.isOpen) {
      // Reject all queued commands
      while (this.commandQueue.length > 0) {
        const cmd = this.commandQueue.shift()
        cmd.reject(new Error('Serial port not connected'))
      }
      return
    }

    this.isProcessingQueue = true

    while (this.commandQueue.length > 0) {
      const commandData = this.commandQueue.shift()

      try {
        // Emit command being sent
        this.emit('command:sent', {
          command: commandData.command,
          timestamp: Date.now(),
        })

        // Write command to serial port
        // G-CODE COMMAND COMMENTED OUT - Not writing to serial port
        // await new Promise((resolve, reject) => {
        //   this.port.write(`${commandData.command}\n`, (error) => {
        //     if (error) {
        //       reject(error)
        //     } else {
        //       resolve()
        //     }
        //   })
        // })
        console.log('[SerialPortManager] G-code command (commented out):', commandData.command)
        // Simulate successful write
        await new Promise((resolve) => setTimeout(resolve, 10))

        // If waiting for response, set up timeout
        if (commandData.waitForResponse) {
          const timeoutId = setTimeout(() => {
            this.emit('command:timeout', {
              command: commandData.command,
              timestamp: Date.now(),
            })
            commandData.reject(
              new Error(`Command timeout: ${commandData.command}`)
            )
          }, commandData.timeout)

          // Store timeout ID for cleanup
          commandData.timeoutId = timeoutId
        } else {
          // Command sent, resolve immediately
          commandData.resolve({ status: 'sent', command: commandData.command })
        }
      } catch (error) {
        this.emit('command:error', {
          command: commandData.command,
          error: error.message,
          timestamp: Date.now(),
        })
        commandData.reject(error)
      }
    }

    this.isProcessingQueue = false
  }

  /**
   * Setup event handlers for serial port
   */
  _setupEventHandlers() {
    // Handle incoming data
    this.parser.on('data', (data) => {
      const line = data.toString().trim()
      if (line) {
        this._handleIncomingData(line)
      }
    })

    // Handle port errors
    this.port.on('error', (error) => {
      console.error('[SerialPortManager] Port error:', error)
      this.emit('error', { type: 'port', error: error.message })
      this._handleDisconnection()
    })

    // Handle port close
    this.port.on('close', () => {
      console.log('[SerialPortManager] Port closed')
      this._handleDisconnection()
    })
  }

  /**
   * Handle incoming data from serial port
   */
  _handleIncomingData(line) {
    // Emit raw data for logging/debugging
    this.emit('data', line)

    // Check pending commands for response matching
    for (const [id, pending] of this.pendingCommands.entries()) {
      if (pending.pattern.test(line)) {
        pending.resolve(line)
        this.pendingCommands.delete(id)
        return
      }
    }

    // Try to parse as Arduino JSON data first (most common format)
    try {
      const trimmedLine = line.trim()
      // Only try to parse if it looks like JSON and has minimum length (filter out noise)
      if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}') && trimmedLine.length > 10) {
        // Looks like JSON - try Arduino data handler
        const arduinoData = this.arduinoHandler.parseArduinoData(trimmedLine)
        if (arduinoData && Object.keys(arduinoData).length > 0) {
          // Only emit if we got valid parsed data (not just noise)
          // Emit Arduino data event with parsed updates
          this.emit('arduino:data', arduinoData)
          
          // Also emit individual updates for compatibility
          if (arduinoData.position) {
            this.emit('position', arduinoData.position)
          }
          if (arduinoData.temperature) {
            this.emit('temperature', arduinoData.temperature)
          }
          // Don't return - continue to check other formats if needed
        }
      }
    } catch (e) {
      // Not JSON or parsing failed, continue to other formats
      // Silently ignore parsing errors (might be noise from Bluetooth)
    }

    // Handle Marlin responses
    if (line.trim() === 'ok' || line.startsWith('ok')) {
      // Marlin "ok" response (standard acknowledgment)
      this.emit('response', { type: 'ok', data: line })
      
      // Try to match with pending command
      const lastPending = Array.from(this.pendingCommands.values())[this.pendingCommands.size - 1]
      this.emit('command:received', {
        response: line,
        timestamp: Date.now(),
        command: lastPending?.command || null,
      })
    } else if (line.startsWith('error:') || line.startsWith('Error:')) {
      // Error response
      this.emit('response', { type: 'error', data: line })
      
      // Try to match with pending command
      const lastPending = Array.from(this.pendingCommands.values())[this.pendingCommands.size - 1]
      this.emit('command:error', {
        error: line,
        timestamp: Date.now(),
        command: lastPending?.command || null,
      })
    } else if (line.startsWith('X:') || line.match(/^X:\d+\.\d+/)) {
      // Marlin M114 position response: "X:120.00 Y:45.30 Z:3.20 E:0.00"
      this.emit('position', this._parseMarlinPosition(line))
    } else if (line.startsWith('ok T:') || line.match(/^ok T:\d+\.\d+/)) {
      // Marlin M105 temperature response: "ok T:345.0 /345.0 B:0.0 /0.0"
      this.emit('temperature', this._parseMarlinTemperature(line))
    } else if (line.startsWith('<')) {
      // GRBL status report format (if using GRBL)
      this.emit('status', this._parseStatusReport(line))
    } else if (line.startsWith('FIRMWARE_NAME:') || line.startsWith('Cap:')) {
      // Marlin M115 firmware info response
      this.emit('firmware', { data: line })
    } else {
      // Generic response
      this.emit('response', { type: 'generic', data: line })
    }
  }

  /**
   * Parse Marlin position response (M114): "X:120.00 Y:45.30 Z:3.20 E:0.00"
   */
  _parseMarlinPosition(positionLine) {
    const position = { x: 0, y: 0, z: 0, e: 0 }

    try {
      // Extract X coordinate
      const xMatch = positionLine.match(/X:(-?\d+\.?\d*)/)
      if (xMatch) {
        position.x = parseFloat(xMatch[1]) || 0
      }

      // Extract Y coordinate
      const yMatch = positionLine.match(/Y:(-?\d+\.?\d*)/)
      if (yMatch) {
        position.y = parseFloat(yMatch[1]) || 0
      }

      // Extract Z coordinate
      const zMatch = positionLine.match(/Z:(-?\d+\.?\d*)/)
      if (zMatch) {
        position.z = parseFloat(zMatch[1]) || 0
      }

      // Extract E (extruder) coordinate
      const eMatch = positionLine.match(/E:(-?\d+\.?\d*)/)
      if (eMatch) {
        position.e = parseFloat(eMatch[1]) || 0
      }
    } catch (error) {
      console.error('[SerialPortManager] Error parsing Marlin position:', error)
    }

    return position
  }

  /**
   * Parse Marlin temperature response (M105): "ok T:345.0 /345.0 B:0.0 /0.0 @:127 @0:0"
   */
  _parseMarlinTemperature(tempLine) {
    const temperature = {
      hotend: { current: 0, target: 0 },
      bed: { current: 0, target: 0 },
    }

    try {
      // Extract hotend temperature: T:345.0 /345.0
      const tMatch = tempLine.match(/T:(-?\d+\.?\d*)\s*\/\s*(-?\d+\.?\d*)/)
      if (tMatch) {
        temperature.hotend.current = parseFloat(tMatch[1]) || 0
        temperature.hotend.target = parseFloat(tMatch[2]) || 0
      }

      // Extract bed temperature: B:0.0 /0.0
      const bMatch = tempLine.match(/B:(-?\d+\.?\d*)\s*\/\s*(-?\d+\.?\d*)/)
      if (bMatch) {
        temperature.bed.current = parseFloat(bMatch[1]) || 0
        temperature.bed.target = parseFloat(bMatch[2]) || 0
      }
    } catch (error) {
      console.error('[SerialPortManager] Error parsing Marlin temperature:', error)
    }

    return temperature
  }

  /**
   * Parse status report (e.g., GRBL status format: <Idle|MPos:0.000,0.000,0.000|FS:0,0>)
   */
  _parseStatusReport(statusLine) {
    const status = {
      state: 'unknown',
      position: { x: 0, y: 0, z: 0 },
      feedrate: 0,
      spindle: 0,
    }

    try {
      // Extract state (e.g., "Idle", "Run", "Hold")
      const stateMatch = statusLine.match(/<([^|>]+)/)
      if (stateMatch) {
        status.state = stateMatch[1].trim()
      }

      // Extract position (MPos:x,y,z)
      const posMatch = statusLine.match(/MPos:([^|>]+)/)
      if (posMatch) {
        const coords = posMatch[1].split(',')
        status.position = {
          x: parseFloat(coords[0]) || 0,
          y: parseFloat(coords[1]) || 0,
          z: parseFloat(coords[2]) || 0,
        }
      }

      // Extract feedrate (FS:f,s)
      const fsMatch = statusLine.match(/FS:([^|>]+)/)
      if (fsMatch) {
        const rates = fsMatch[1].split(',')
        status.feedrate = parseFloat(rates[0]) || 0
        status.spindle = parseFloat(rates[1]) || 0
      }
    } catch (error) {
      console.error('[SerialPortManager] Error parsing status:', error)
    }

    return status
  }

  /**
   * Handle disconnection
   */
  _handleDisconnection() {
    if (this.isConnected) {
      this.isConnected = false
      this.emit('disconnected')

      // Reject all pending commands
      while (this.commandQueue.length > 0) {
        const cmd = this.commandQueue.shift()
        if (cmd.reject) {
          cmd.reject(new Error('Connection lost'))
        }
      }

      // Attempt reconnection if enabled
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => {
          this.emit('reconnect', { attempt: this.reconnectAttempts })
        }, this.reconnectDelay)
      }
    }
  }

  /**
   * Initialize connection (send setup commands)
   */
  async _initializeConnection() {
    try {
      // Wait a bit for hardware to be ready
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Arduino sends data automatically, no initialization commands needed
      // The app will receive JSON data from Arduino continuously
      console.log('[SerialPortManager] Initialization complete - waiting for Arduino JSON data')
    } catch (error) {
      console.warn('[SerialPortManager] Initialization warning:', error.message)
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      portPath: this.port?.path || null,
      queueLength: this.commandQueue.length,
      pendingCommands: this.pendingCommands.size,
    }
  }
}

