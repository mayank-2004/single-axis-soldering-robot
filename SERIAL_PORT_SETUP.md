# Serial Port Communication Setup

This document explains how to use the serial port communication system for connecting to real hardware.

## Overview

The system supports two modes:
- **Simulation Mode** (default): Simulates hardware behavior without real connections
- **Hardware Mode**: Connects to real hardware via serial port

## Architecture

### Components

1. **SerialPortManager** (`main/hardware/SerialPortManager.js`)
   - Handles low-level serial port communication
   - Manages connection, disconnection, and data parsing
   - Supports command queuing and response handling

2. **CommandProtocol** (`main/hardware/CommandProtocol.js`)
   - Translates high-level operations to hardware commands
   - Supports G-code (GRBL/Marlin) and custom protocols
   - Provides methods for movement, temperature control, etc.

3. **SolderingHardware** (`main/hardware/SolderingHardware.js`)
   - Main hardware abstraction layer
   - Supports both simulation and hardware modes
   - Automatically routes commands to hardware or simulation

## Usage

### Basic Setup

The hardware is initialized in `robotController.js`. By default, it runs in simulation mode:

```javascript
const hardware = new SolderingHardware({
  mode: 'simulation', // or 'hardware'
  serialConfig: {
    baudRate: 115200,
    protocol: 'gcode',
    stepsPerMm: {
      x: 200,
      y: 200,
      z: 200,
    },
  },
})
```

### Connecting to Hardware

From the renderer process (frontend), you can:

1. **List available ports:**
```javascript
window.ipc.send('serial:list-ports')
window.ipc.on('serial:list-ports:response', (data) => {
  console.log('Available ports:', data.ports)
})
```

2. **Connect to a port:**
```javascript
window.ipc.send('serial:connect', {
  portPath: 'COM3', // or '/dev/ttyUSB0' on Linux
  config: {
    baudRate: 115200,
  },
})
window.ipc.on('serial:connect:response', (result) => {
  if (result.error) {
    console.error('Connection failed:', result.error)
  } else {
    console.log('Connected:', result.status)
  }
})
```

3. **Disconnect:**
```javascript
window.ipc.send('serial:disconnect')
window.ipc.on('serial:disconnect:response', (result) => {
  console.log('Disconnected:', result.status)
})
```

4. **Check connection status:**
```javascript
window.ipc.send('serial:status')
window.ipc.on('serial:status:response', (status) => {
  console.log('Status:', status)
})
```

## Command Protocol

The system uses G-code commands by default. Common commands:

- **Movement:**
  - `G0 X10 Y20 Z5` - Move to absolute position
  - `G91 G0 X1` - Move relative (jog)
  - `G90` - Set absolute positioning

- **Homing:**
  - `$H` - Home all axes (GRBL)
  - `G28` - Home all axes (Marlin)

- **Temperature:**
  - `M104 S345` - Set temperature to 345°C
  - `M105` - Get current temperature

- **Status:**
  - `?` - Request status report

## Customizing Commands

If your hardware uses a different protocol, modify `CommandProtocol.js`:

```javascript
async feedWire(length, rate) {
  // Custom command format
  const command = `M700 L${length.toFixed(2)} R${rate.toFixed(1)}`
  return this.serial.sendCommand(command, { waitForResponse: true })
}
```

## Hardware Requirements

- Serial port (USB-to-Serial adapter if needed)
- Compatible firmware (GRBL, Marlin, or custom)
- Proper baud rate configuration (typically 115200)

## Troubleshooting

1. **Port not found:**
   - Check device manager (Windows) or `ls /dev/tty*` (Linux/Mac)
   - Ensure drivers are installed for USB-to-Serial adapters

2. **Connection fails:**
   - Verify baud rate matches hardware
   - Check if port is already in use
   - Ensure hardware is powered on

3. **Commands not working:**
   - Verify protocol matches your firmware (GRBL vs Marlin)
   - Check serial monitor for error messages
   - Review command format in `CommandProtocol.js`

## Testing

To test without hardware, the system runs in simulation mode by default. All commands will be simulated with appropriate delays.

## Next Steps

1. Create a UI component for port selection and connection
2. Add error handling and user feedback
3. Implement emergency stop functionality
4. Add command logging/debugging interface

