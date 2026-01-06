import { EventEmitter } from 'events'

export default class MovementController extends EventEmitter {
  constructor(serialManager, commandProtocol) {
    super()
    this.serialManager = serialManager
    this.commandProtocol = commandProtocol
    this.BED_HEIGHT_MM = 280.0
    this._lastMovementCommand = null
    this._isCompensating = false
    
    this.state = {
      position: { z: 0.0, isMoving: false },
      zAxisSpeed: 100,
      componentHeightMm: null,
      jigHeightMm: null
    }
  }

  async jog(axis, direction, stepSize) {
    if (this.state.position.isMoving) {
      return { error: 'Machine is already moving' }
    }

    if (axis.toLowerCase() !== 'z') {
      return { error: 'Invalid axis. This is a single-axis machine - only Z-axis movement is supported.' }
    }

    const step = direction > 0 ? stepSize : -stepSize
    let newPosition = this.state.position.z + step
    const limitReached = newPosition > 0 && direction > 0
    
    if (newPosition > 0) newPosition = 0.0
    
    this.state.position.isMoving = true
    this.emit('position:update', this.getPosition())

    if (this.serialManager?.isConnected) {
      try {
        const previousPosition = this.state.position.z
        await this._sendCommand({ command: 'jog', axis: 'z', distance: step, speed: this.state.zAxisSpeed })
        
        this._lastMovementCommand = { previousPosition, commandedDistance: step, timestamp: Date.now() }
        
        setTimeout(() => {
          this.state.position.isMoving = false
          this.emit('position:update', this.getPosition())
        }, 500)

        return { 
          status: limitReached ? 'Upper limit switch reached' : 'Movement completed', 
          position: this.getPosition(),
          limitReached: false
        }
      } catch (error) {
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.position.z = newPosition
          this.state.position.isMoving = false
          this.emit('position:update', this.getPosition())
          resolve({ 
            status: limitReached ? 'Upper limit switch reached' : 'Movement completed', 
            position: this.getPosition(),
            limitReached
          })
        }, 300)
      })
    }
  }

  async home() {
    if (this.state.position.isMoving) {
      return { error: 'Machine is already moving' }
    }

    this.state.position.isMoving = true
    this.emit('position:update', this.getPosition())

    if (this.serialManager?.isConnected) {
      try {
        this._lastMovementCommand = null
        await this._sendCommand({ command: 'home', speed: this.state.zAxisSpeed })
        this.emit('position:update', this.getPosition())
        return { status: 'Homed to 0.00mm (top limit switch)', position: this.getPosition() }
      } catch (error) {
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.position.z = 0.0
          this.state.position.isMoving = false
          this.emit('position:update', this.getPosition())
          resolve({ status: 'Homed to 0.00mm (top limit switch)', position: this.getPosition() })
        }, 500)
      })
    }
  }

  async moveToPosition(x, y, z) {
    if (this.serialManager?.isConnected) {
      if (z !== null && z !== undefined) {
        await this._sendCommand({ command: 'move', z })
        this.state.position.z = z
        this.state.position.isMoving = true
        this.emit('position:update', this.getPosition())
        setTimeout(() => {
          this.state.position.isMoving = false
          this.emit('position:update', this.getPosition())
        }, 1000)
      }
    } else {
      this.state.position.isMoving = true
      this.emit('position:update', this.getPosition())
      await new Promise(resolve => setTimeout(resolve, 500))
      if (z !== null && z !== undefined) this.state.position.z = z
      this.state.position.isMoving = false
      this.emit('position:update', this.getPosition())
    }
  }

  setZAxisSpeed(speed) {
    this.state.zAxisSpeed = Math.max(1, Math.min(200, Number(speed) || 50))
    const speedLabel = this.state.zAxisSpeed > 100 ? `Turbo Mode (${this.state.zAxisSpeed}%)` : `${this.state.zAxisSpeed}%`
    return { status: `Z-axis speed set to ${speedLabel}` }
  }

  setComponentHeight(height) {
    const numeric = Number.parseFloat(height)
    if (!Number.isFinite(numeric) || numeric < 0) {
      return { error: 'Height must be a positive number.' }
    }
    this.state.componentHeightMm = numeric
    return { status: `Max component height set to ${numeric.toFixed(2)} mm` }
  }

  setJigHeight(height) {
    const numeric = Number.parseFloat(height)
    if (!Number.isFinite(numeric) || numeric < 0) {
      return { error: 'Jig height must be a positive number.' }
    }
    if (numeric > this.BED_HEIGHT_MM) {
      return { error: `Jig height (${numeric.toFixed(2)}mm) cannot exceed bed height (${this.BED_HEIGHT_MM}mm).` }
    }
    this.state.jigHeightMm = numeric
    return { status: `Jig height set to ${numeric.toFixed(2)} mm` }
  }

  getPosition() {
    return { z: this.state.position.z, isMoving: this.state.position.isMoving }
  }

  getSafeTravelSpace() {
    return this.state.jigHeightMm !== null ? this.BED_HEIGHT_MM - this.state.jigHeightMm : null
  }

  async _sendCommand(commandObj) {
    if (this.serialManager?.sendJsonCommand) {
      await this.serialManager.sendJsonCommand(commandObj)
    }
  }

  handleArduinoData(updates) {
    if (updates.position) {
      const previousZ = this.state.position.z
      const wasMoving = this.state.position.isMoving
      const newZ = updates.position.z ?? this.state.position.z
      const isNowMoving = updates.position.isMoving ?? this.state.position.isMoving
      
      this.state.position.z = newZ
      this.state.position.isMoving = isNowMoving
      
      if (this._lastMovementCommand && wasMoving && !isNowMoving) {
        const actualDistance = newZ - this._lastMovementCommand.previousPosition
        const commandedDistance = this._lastMovementCommand.commandedDistance
        const timeSinceCommand = Date.now() - this._lastMovementCommand.timestamp
        
        if (timeSinceCommand < 3000) {
          const difference = actualDistance - commandedDistance
          const movementStoppedEarly = Math.abs(actualDistance) < Math.abs(commandedDistance) * 0.5
          
          if (!movementStoppedEarly) {
            const needsCompensation = !this._isCompensating && 
                                     Math.abs(difference) > 0.01 &&
                                     ((commandedDistance < 0 && actualDistance > commandedDistance) ||
                                      (commandedDistance > 0 && actualDistance < commandedDistance))
            
            if (needsCompensation) {
              const compensationDistance = commandedDistance - actualDistance
              this._isCompensating = true
              this._lastMovementCommand = {
                previousPosition: newZ,
                commandedDistance: compensationDistance,
                timestamp: Date.now(),
                isCompensation: true
              }
              
              this._sendCommand({
                command: 'jog',
                axis: 'z',
                distance: compensationDistance,
                speed: this.state.zAxisSpeed
              }).catch(() => {
                this._isCompensating = false
                this._lastMovementCommand = null
              })
            }
          } else {
            if (this._lastMovementCommand?.isCompensation) {
              this._isCompensating = false
            }
            this._lastMovementCommand = null
          }
        }
      }
      
      this.emit('position:update', this.getPosition())
    }
  }
}