/**
 * CommandProtocol - Translates high-level operations to hardware commands
 * Supports G-code (Marlin firmware) and custom protocols
 */
export default class CommandProtocol {
  constructor(serialManager, options = {}) {
    this.serial = serialManager
    this.protocol = options.protocol || 'gcode' // 'gcode' or 'custom'
    this.firmware = options.firmware || 'marlin' // 'marlin' or 'grbl'
    this.units = options.units || 'mm' // 'mm' or 'inches'
    this.stepsPerMm = {
      x: options.stepsPerMm?.x || 200,
      y: options.stepsPerMm?.y || 200,
      z: options.stepsPerMm?.z || 200,
    }
  }

  /**
   * Move to absolute position (Marlin: G0 or G1)
   * G0 is rapid move, G1 is linear move with feedrate
   */
  async moveTo(x, y, z, feedrate = null) {
    // Single-axis machine: only Z-axis movement is supported
    // X and Y positions are ignored (PCB is moved manually)
    const commands = []
    // X and Y commands are not included (machine doesn't move X/Y)
    if (z !== null && z !== undefined) commands.push(`Z${z.toFixed(3)}`)
    
    // In Marlin, G0 and G1 are equivalent, but G1 with feedrate is more explicit
    const moveCmd = feedrate ? 'G1' : 'G0'
    const feedrateCmd = feedrate ? `F${feedrate}` : ''
    
    const gcode = `${moveCmd} ${commands.join(' ')} ${feedrateCmd}`.trim()
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Move relative (jog) - Marlin syntax
   */
  async moveRelative(axis, distance, feedrate = null) {
    const axisMap = { x: 'X', y: 'Y', z: 'Z' }
    const axisLetter = axisMap[axis.toLowerCase()]
    if (!axisLetter) {
      throw new Error(`Invalid axis: ${axis}`)
    }

    // Set relative positioning
    // G-CODE COMMAND COMMENTED OUT
    // await this.serial.sendCommand('G91', { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out): G91')
    
    // Perform relative move
    const moveCmd = feedrate ? 'G1' : 'G0'
    const feedrateCmd = feedrate ? `F${feedrate}` : ''
    const gcode = `${moveCmd} ${axisLetter}${distance.toFixed(3)} ${feedrateCmd}`.trim()
    // G-CODE COMMAND COMMENTED OUT
    // await this.serial.sendCommand(gcode, { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    
    // Reset to absolute positioning
    // G-CODE COMMAND COMMENTED OUT
    // await this.serial.sendCommand('G90', { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out): G90')
    return { status: 'moved', axis, distance }
  }

  /**
   * Home all axes - Marlin: G28
   */
  async home() {
    // Marlin: G28 homes all axes, G28 X Y Z homes specific axes
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('G28', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): G28')
    return Promise.resolve({ status: 'simulated', command: 'G28' })
  }

  /**
   * Home specific axis - Marlin: G28 X, G28 Y, G28 Z
   */
  async homeAxis(axis) {
    const axisMap = { x: 'X', y: 'Y', z: 'Z' }
    const axisLetter = axisMap[axis.toLowerCase()]
    if (!axisLetter) {
      throw new Error(`Invalid axis: ${axis}`)
    }
    // Marlin syntax: G28 X, G28 Y, G28 Z
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(`G28 ${axisLetter}`, { waitForResponse: true })
    const gcode = `G28 ${axisLetter}`
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Get current position - Marlin: M114
   * Returns: "X:120.00 Y:45.30 Z:3.20 E:0.00 Count X: 24000 Y:9060 Z:640"
   */
  async getPosition() {
    // Marlin: M114 returns current position
    // Response format: "X:120.00 Y:45.30 Z:3.20 E:0.00"
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M114', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): M114')
    return Promise.resolve({ status: 'simulated', command: 'M114' })
  }

  /**
   * Set feedrate - Marlin: G1 F<feedrate> or G0 F<feedrate>
   */
  async setFeedrate(feedrate) {
    // Marlin: Set feedrate for subsequent moves
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(`G1 F${feedrate}`, { waitForResponse: false })
    const gcode = `G1 F${feedrate}`
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Set temperature (for soldering tip) - Marlin: M104 S<temp>
   * M104 sets hotend temperature and continues immediately
   * M109 sets temperature and waits for it to be reached
   */
  async setTemperature(targetTemp) {
    // Marlin: M104 S<temp> - Set hotend temperature (for soldering tip)
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(`M104 S${targetTemp}`, { waitForResponse: true })
    const gcode = `M104 S${targetTemp}`
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Set temperature and wait - Marlin: M109 S<temp>
   * Waits until temperature is reached
   */
  async setTemperatureAndWait(targetTemp) {
    // Marlin: M109 S<temp> - Set temperature and wait
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(`M109 S${targetTemp}`, { waitForResponse: true })
    const gcode = `M109 S${targetTemp}`
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Get temperature - Marlin: M105
   * Returns: "ok T:345.0 /345.0 B:0.0 /0.0 @:127 @0:0"
   */
  async getTemperature() {
    // Marlin: M105 returns current temperature readings
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M105', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): M105')
    return Promise.resolve({ status: 'simulated', command: 'M105' })
  }

  /**
   * Enable/disable heater - Marlin: M104 S0 to disable, M104 S<temp> to enable
   */
  async setHeaterEnabled(enabled) {
    if (enabled) {
      // To enable, we need a target temperature - use current target or default
      // This should be called after setTemperature
      return { status: 'Heater enabled (set temperature first)' }
    } else {
      // Marlin: M104 S0 disables the heater
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('M104 S0', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): M104 S0')
      return Promise.resolve({ status: 'simulated', command: 'M104 S0' })
    }
  }

  /**
   * Feed wire (custom command - adjust based on your hardware)
   */
  async feedWire(length, rate) {
    // Custom command format - adjust based on your hardware protocol
    // Example: M700 L10.5 R12.0 (length in mm, rate in mm/s)
    const command = `M700 L${length.toFixed(2)} R${rate.toFixed(1)}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(command, { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out):', command)
    return Promise.resolve({ status: 'simulated', command })
  }

  /**
   * Rotate spool motor (custom command - adjust based on your hardware)
   * Steps: number of stepper motor steps to rotate
   * Rate: rotation speed (steps per second or mm/s equivalent)
   */
  async rotateSpool(steps, rate) {
    // Custom command format - adjust based on your hardware protocol
    // Example: M701 S500 R12.0 (steps, rate)
    // Or use E-axis (extruder) if available: G1 E<steps> F<feedrate>
    const command = `M701 S${Math.round(steps)} R${rate.toFixed(1)}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(command, { waitForResponse: true })
    console.log('[CommandProtocol] Spool rotation (commented out):', command)
    return Promise.resolve({ status: 'simulated', command })
  }

  /**
   * Control fan - Marlin: M106 P<fan> S<speed>
   * M106 P0 S255 - Set fan 0 to speed 255 (0-255)
   * M107 - Turn off all fans
   */
  async setFan(fanNumber, speed) {
    // Marlin: M106 P<fan_number> S<speed> where speed is 0-255
    const speedValue = Math.max(0, Math.min(255, Math.round(speed * 2.55))) // 0-100 to 0-255
    const gcode = `M106 P${fanNumber} S${speedValue}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Turn off all fans - Marlin: M107
   */
  async turnOffFans() {
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M107', { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out): M107')
    return Promise.resolve({ status: 'simulated', command: 'M107' })
  }

  /**
   * Control fume extractor - Marlin: M106 P<fan> S<speed>
   * Typically uses a dedicated fan port (e.g., P2 for fume extractor)
   * M106 P2 S255 - Set fume extractor to speed 255 (0-255)
   * M107 P2 - Turn off fume extractor
   */
  async setFumeExtractor(speed) {
    // Marlin: M106 P<fan_number> S<speed> where speed is 0-255
    // Using P2 as the fume extractor fan port (can be configured)
    const fanPort = 2 // Fume extractor fan port (adjust if needed)
    const speedValue = Math.max(0, Math.min(255, Math.round(speed * 2.55))) // 0-100 to 0-255
    const gcode = `M106 P${fanPort} S${speedValue}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Turn off fume extractor - Marlin: M107 P<fan>
   */
  async turnOffFumeExtractor() {
    // Using P2 as the fume extractor fan port (can be configured)
    const fanPort = 2 // Fume extractor fan port (adjust if needed)
    const gcode = `M107 P${fanPort}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Dispense flux mist
   * Custom command: M702 D<duration_ms> F<flow_rate>
   * Duration in milliseconds, flow rate 0-100%
   * Example: M702 D500 F50 - Dispense for 500ms at 50% flow rate
   */
  async dispenseFluxMist(duration, flowRate) {
    // Custom G-code command for flux mist dispenser
    // M702 D<duration> F<flow_rate>
    const durationMs = Math.round(duration)
    const flowRateValue = Math.max(0, Math.min(100, Math.round(flowRate)))
    const gcode = `M702 D${durationMs} F${flowRateValue}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Activate air breeze for cooling
   * Custom command: M703 D<duration_ms> I<intensity>
   * Duration in milliseconds, intensity 0-100%
   * Example: M703 D2000 I60 - Activate for 2000ms at 60% intensity
   * Uses fan port P3 for air breeze (can be configured)
   */
  async activateAirBreeze(duration, intensity) {
    // Custom G-code command for air breeze
    // M703 D<duration> I<intensity>
    // Or using fan control: M106 P3 S<intensity_0-255>
    const fanPort = 3 // Air breeze fan port (adjust if needed)
    const durationMs = Math.round(duration)
    const intensityValue = Math.max(0, Math.min(100, Math.round(intensity)))
    const speedValue = Math.max(0, Math.min(255, Math.round(intensityValue * 2.55))) // 0-100 to 0-255
    
    // Option 1: Custom command with duration
    const gcode = `M703 D${durationMs} I${intensityValue}`
    // Option 2: Using fan control (if hardware supports it)
    // const gcode = `M106 P${fanPort} S${speedValue}`
    
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Deactivate air breeze
   * Custom command: M704 or M107 P3
   */
  async deactivateAirBreeze() {
    // Using fan control: M107 P<fan_port>
    const fanPort = 3 // Air breeze fan port (adjust if needed)
    const gcode = `M107 P${fanPort}`
    // Or custom command: M704
    // const gcode = 'M704'
    
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Activate air jet pressure for tip cleaning
   * Custom command: M705 D<duration_ms> P<pressure>
   * Duration in milliseconds, pressure 0-100%
   * Example: M705 D200 P80 - Activate for 200ms at 80% pressure
   * Uses solenoid valve or pneumatic control port P4 (can be configured)
   */
  async activateAirJetPressure(duration, pressure) {
    // Custom G-code command for air jet pressure
    // M705 D<duration> P<pressure>
    const durationMs = Math.round(duration)
    const pressureValue = Math.max(0, Math.min(100, Math.round(pressure)))
    
    // Option 1: Custom command with duration and pressure
    const gcode = `M705 D${durationMs} P${pressureValue}`
    // Option 2: Using solenoid control (if hardware supports it)
    // const gcode = `M42 P4 S255` // Activate solenoid on port 4 at max speed
    
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Deactivate air jet pressure
   * Custom command: M706 or M42 P4 S0
   */
  async deactivateAirJetPressure() {
    // Using solenoid control: M42 P<port> S0
    const solenoidPort = 4 // Air jet pressure solenoid port (adjust if needed)
    const gcode = `M42 P${solenoidPort} S0`
    
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Emergency stop - Marlin: M112
   * Immediately stops all motion and disables heaters
   */
  async emergencyStop() {
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M112', { waitForResponse: false, priority: true })
    console.log('[CommandProtocol] G-code (commented out): M112 (Emergency Stop)')
    return Promise.resolve({ status: 'simulated', command: 'M112' })
  }

  /**
   * Reset/Resume (after emergency stop) - Marlin: M999 or M108
   * M999 - Reset and continue (clears error state)
   * M108 - Break out of waiting for heaters (if stuck)
   */
  async reset() {
    // Marlin: M999 resets after emergency stop
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M999', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): M999')
    return Promise.resolve({ status: 'simulated', command: 'M999' })
  }

  /**
   * Get firmware info - Marlin: M115
   * Returns firmware version and capabilities
   */
  async getFirmwareInfo() {
    // Marlin: M115 returns firmware info
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M115', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): M115')
    return Promise.resolve({ status: 'simulated', command: 'M115' })
  }

  /**
   * Get current position - Marlin: M114
   * Returns position in format: "X:120.00 Y:45.30 Z:3.20 E:0.00"
   */
  async getStatus() {
    // Marlin doesn't have a single status command like GRBL's '?'
    // Use M114 for position, M105 for temperature
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand('M114', { waitForResponse: true })
    console.log('[CommandProtocol] G-code (commented out): M114')
    return Promise.resolve({ status: 'simulated', command: 'M114' })
  }

  /**
   * Set units (mm or inches) - Marlin: G21 (mm), G20 (inches)
   */
  async setUnits(units) {
    if (units === 'mm') {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('G21', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): G21')
      return Promise.resolve({ status: 'simulated', command: 'G21' })
    } else if (units === 'inches') {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('G20', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): G20')
      return Promise.resolve({ status: 'simulated', command: 'G20' })
    }
  }

  /**
   * Set absolute/relative positioning - Marlin: G90 (absolute), G91 (relative)
   */
  async setAbsolutePositioning(absolute = true) {
    if (absolute) {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('G90', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): G90')
      return Promise.resolve({ status: 'simulated', command: 'G90' })
    } else {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('G91', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): G91')
      return Promise.resolve({ status: 'simulated', command: 'G91' })
    }
  }

  /**
   * Set current position (without moving) - Marlin: G92
   * Useful for setting zero position or offset
   */
  async setCurrentPosition(x = null, y = null, z = null) {
    const commands = []
    if (x !== null && x !== undefined) commands.push(`X${x.toFixed(3)}`)
    if (y !== null && y !== undefined) commands.push(`Y${y.toFixed(3)}`)
    if (z !== null && z !== undefined) commands.push(`Z${z.toFixed(3)}`)
    
    if (commands.length === 0) {
      // G92 with no parameters sets all to zero
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('G92 X0 Y0 Z0', { waitForResponse: false })
      console.log('[CommandProtocol] G-code (commented out): G92 X0 Y0 Z0')
      return Promise.resolve({ status: 'simulated', command: 'G92 X0 Y0 Z0' })
    }
    
    const gcode = `G92 ${commands.join(' ')}`
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(gcode, { waitForResponse: false })
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }

  /**
   * Enable/disable steppers - Marlin: M17 (enable), M18 (disable)
   */
  async enableSteppers(enabled = true) {
    if (enabled) {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('M17', { waitForResponse: false }) // Enable all steppers
      console.log('[CommandProtocol] G-code (commented out): M17')
      return Promise.resolve({ status: 'simulated', command: 'M17' })
    } else {
      // G-CODE COMMAND COMMENTED OUT
      // return this.serial.sendCommand('M18', { waitForResponse: false }) // Disable all steppers
      console.log('[CommandProtocol] G-code (commented out): M18')
      return Promise.resolve({ status: 'simulated', command: 'M18' })
    }
  }

  /**
   * Disable specific stepper - Marlin: M18 X Y Z
   */
  async disableStepper(axis) {
    const axisMap = { x: 'X', y: 'Y', z: 'Z' }
    const axisLetter = axisMap[axis.toLowerCase()]
    if (!axisLetter) {
      throw new Error(`Invalid axis: ${axis}`)
    }
    // G-CODE COMMAND COMMENTED OUT
    // return this.serial.sendCommand(`M18 ${axisLetter}`, { waitForResponse: false })
    const gcode = `M18 ${axisLetter}`
    console.log('[CommandProtocol] G-code (commented out):', gcode)
    return Promise.resolve({ status: 'simulated', command: gcode })
  }
}

