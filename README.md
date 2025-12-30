# Single-Axis Soldering Robot - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Complete App Workflow](#complete-app-workflow)
4. [Component Details](#component-details)
5. [Hardware Configuration](#hardware-configuration)
6. [Communication Protocol](#communication-protocol)
7. [Z-Axis Movement System](#z-axis-movement-system)
8. [Speed Control Feature](#speed-control-feature)
9. [Jig Calibration System](#jig-calibration-system)
10. [Soldering Sequence Workflow](#soldering-sequence-workflow)
11. [User Interface Components](#user-interface-components)
12. [Installation & Setup](#installation--setup)
13. [Usage Guide](#usage-guide)
14. [Troubleshooting](#troubleshooting)

---

## Overview

This is a **single-axis soldering robot** application built with Electron and Next.js. The machine automates the Z-axis (vertical) movement for soldering operations while the operator manually positions the PCB on a jig for X/Y movement.

### Key Features

- **Automated Z-Axis Control**: Precise vertical movement using stepper motor with DM542 driver
- **Manual Movement**: Jog controls for precise positioning
- **Soldering Sequences**: Automated multi-stage soldering process
- **Jig Calibration**: Reference height system for safe positioning
- **Temperature Control**: Soldering tip temperature management
- **Wire Feed Control**: Automated solder wire dispensing
- **Limit Switch Safety**: Hardware safety stops at travel limits
- **Real-time Monitoring**: Live position, temperature, and status updates

### Machine Type

- **Single-Axis**: Only Z-axis (vertical) is automated
- **Manual X/Y**: PCB is manually positioned on jig by operator
- **Z-Axis Range**: 0mm (home) to ~280mm (bed surface)
- **Home Position**: Upper limit switch at 0.00mm

---

## System Architecture

### Technology Stack

- **Frontend**: React/Next.js (Renderer Process)
- **Backend**: Node.js/Electron (Main Process)
- **Hardware**: Arduino Mega 2560
- **Communication**: USB Serial (115200 baud)
- **Protocol**: JSON over Serial

### Architecture Layers

```
┌─────────────────────────────────────────┐
│   User Interface (React Components)     │
│   - ManualMovementControl               │
│   - JigCalibration                      │
│   - SequenceMonitor                     │
│   - LcdDisplay                          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Frontend (Renderer Process)           │
│   - home.jsx (State Management)         │
│   - IPC Client (window.ipc)             │
└─────────────────┬───────────────────────┘
                  │ IPC Events
┌─────────────────▼───────────────────────┐
│   IPC Layer (Electron IPC)              │
│   - Bidirectional communication         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Backend (Main Process)                │
│   - robotController.js (Event Router)  │
│   - SolderingHardware.js (Hardware API) │
│   - SerialPortManager.js (Serial I/O)   │
│   - ArduinoDataHandler.js (JSON Parser) │
└─────────────────┬───────────────────────┘
                  │ USB Serial
┌─────────────────▼───────────────────────┐
│   Arduino Mega 2560                     │
│   - processCommands()                   │
│   - moveZAxisByDistance()               │
│   - sendMachineState()                  │
│   - Limit Switch Reading                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Hardware                                │
│   - Stepper Motor (Z-Axis)              │
│   - DM542 Driver                         │
│   - Limit Switches (Pin 2 & 3)          │
│   - Temperature Sensor                   │
└─────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **ManualMovementControl** | User input handling, step size selection, jog buttons |
| **home.jsx** | State management, IPC communication, UI coordination |
| **robotController.js** | IPC event routing, hardware event forwarding |
| **SolderingHardware.js** | Hardware abstraction, command processing, state management |
| **SerialPortManager.js** | Serial port communication, JSON sending/receiving |
| **ArduinoDataHandler.js** | JSON parsing, data structure conversion |
| **Arduino Sketch** | Hardware control, sensor reading, movement execution |

---

## Complete App Workflow

### 1. Application Startup

1. **Electron Main Process** starts
2. **Serial Port Manager** initializes (no connection yet)
3. **Hardware Layer** (`SolderingHardware.js`) initializes
4. **IPC Handlers** registered in `robotController.js`
5. **Renderer Process** loads React app
6. **Frontend** requests initial state from backend
7. **Serial Port List** displayed to user

### 2. Serial Connection Flow

```
User Action: Select COM Port → Click Connect
    ↓
Frontend: window.ipc.send('serial:connect', { port: 'COM3' })
    ↓
robotController: Forwards to SerialPortManager
    ↓
SerialPortManager: Opens serial port at 115200 baud
    ↓
Arduino: Receives connection (optional handshake)
    ↓
Arduino: Starts sending status updates every 500ms
    ↓
SerialPortManager: Receives JSON data
    ↓
ArduinoDataHandler: Parses JSON
    ↓
SolderingHardware: Updates internal state
    ↓
robotController: Emits IPC events
    ↓
Frontend: Updates UI with connection status
```

### 3. Manual Movement (Jog) Flow

```
User clicks "Jog Down" button (5mm step)
    ↓
ManualMovementControl: Calls onJog('z', -1, 5.0)
    ↓
home.jsx: handleJog() calculates distance = -5.0mm
    ↓
home.jsx: window.ipc.send('axis:jog', { axis: 'z', direction: -1, stepSize: 5.0 })
    ↓
robotController: Receives IPC event
    ↓
robotController: Calls hardware.jog('z', -1, 5.0)
    ↓
SolderingHardware: Validates command, calculates final distance
    ↓
SolderingHardware: Prepares JSON command with speed parameter
    ↓
SerialPortManager: Sends JSON: {"command":"jog","axis":"z","distance":-5.0,"speed":90}
    ↓
Arduino: Serial.readStringUntil('\n') receives JSON
    ↓
Arduino: processCommands() parses JSON
    ↓
Arduino: Extracts distance = -5.0, speed = 90
    ↓
Arduino: Converts speed to step delay (microseconds)
    ↓
Arduino: Calculates steps = 5.0 × 3200 = 16000 steps
    ↓
Arduino: moveZAxisByDistance(-5.0) executes
    ↓
Arduino: Checks limit switches every step
    ↓
Arduino: Pulses stepper motor 16000 times
    ↓
Arduino: Updates zPosition = -5.0mm
    ↓
Arduino: sendMachineState() sends JSON status
    ↓
SerialPortManager: Receives JSON status
    ↓
ArduinoDataHandler: Parses position and limit switches
    ↓
SolderingHardware: Updates state.position.z = -5.0
    ↓
SolderingHardware: Emits 'position:update' event
    ↓
robotController: Forwards to IPC
    ↓
Frontend: Receives 'position:update' event
    ↓
home.jsx: Updates currentPosition state
    ↓
UI: Displays "-005.00 mm"
```

### 4. Limit Switch Detection Flow

```
Arduino Loop (Every 500ms)
    ↓
Arduino: Reads limit switch pins (Pin 2 & 3)
    ↓
Arduino: Checks if switches are triggered (LOW = triggered)
    ↓
Arduino: Includes in JSON: {"limits":{"upper":false,"lower":true}}
    ↓
SerialPortManager: Receives JSON
    ↓
ArduinoDataHandler: Parses limits object
    ↓
SolderingHardware: Detects lower limit triggered
    ↓
SolderingHardware: Emits 'limitSwitch:update' event
    ↓
robotController: Forwards to IPC
    ↓
Frontend: Receives 'limitSwitch:update' event
    ↓
home.jsx: handleLimitSwitchUpdate() called
    ↓
home.jsx: Sets limitSwitchAlert = true
    ↓
home.jsx: Sets statusMessage = "Lower limit switch reached"
    ↓
UI: Displays warning alert
    ↓
UI: Auto-hides alert after 5 seconds
```

### 5. Homing Flow

```
User clicks "Home" button
    ↓
Frontend: window.ipc.send('axis:home')
    ↓
robotController: Calls hardware.home()
    ↓
SolderingHardware: Sends JSON: {"command":"home","speed":90}
    ↓
Arduino: Receives home command
    ↓
Arduino: Calculates distanceToHome = 0.0 - zPosition
    ↓
Example: zPosition = -45.0mm, distanceToHome = 45.0mm
    ↓
Arduino: Calculates steps = 45.0 × 3200 = 144000 steps
    ↓
Arduino: Moves upward (towards home)
    ↓
Arduino: Checks upper limit switch every step
    ↓
Arduino: When limit switch triggered, stops movement
    ↓
Arduino: Sets zPosition = 0.0mm
    ↓
Arduino: Sends JSON status with pos.z = 0.0
    ↓
Frontend: Updates UI to show "000.00 mm"
```

---

## Component Details

### Frontend Components

#### 1. ManualMovementControl.jsx

**Purpose**: Provides manual Z-axis movement controls

**Features**:
- Step size selection (preset: 0.1, 0.5, 1, 5, 10mm or custom)
- Jog Up/Down buttons
- Home button
- Current position display
- Limit switch warnings
- Connection status indicator

**State Management**:
- Receives `currentPosition` from parent
- Receives `stepSize` and `onStepSizeChange` callbacks
- Calls `onJog(axis, direction, stepSize)` for movement
- Calls `onHome()` for homing

#### 2. JigCalibration.jsx

**Purpose**: Sets jig reference height for safe positioning

**Features**:
- Manual jig height input (thickness from bed to jig surface)
- Height information display (bed surface, jig height, jig surface position, safe travel space)
- Current jig height display
- Status messages
- Safety warnings

**Calculation**:
- Jig Surface Position = Bed Height (280mm) - Jig Height
- Safe Travel Space = Bed Height - Jig Height (space from home to jig surface)

#### 3. SequenceMonitor.jsx

**Purpose**: Monitors and controls soldering sequences

**Features**:
- Sequence status display
- Current stage indicator
- Progress bar
- Pad counter
- Start/Stop controls
- Error display

#### 4. LcdDisplay.jsx

**Purpose**: Virtual LCD display showing machine status

**Features**:
- Z-axis position
- Wire remaining percentage
- Flux remaining percentage
- Tip temperature (target and current)
- Feed rate (wire dispensing speed)
- Speed (Z-axis movement speed in mm/s)
- Settings panel (slides from right)
- Dynamic width adjustment

#### 5. TipHeatingControl.jsx

**Purpose**: Controls soldering tip temperature

**Features**:
- Target temperature input
- Current temperature display
- Heater ON/OFF toggle
- Preset temperature buttons (small/medium/large pads)
- Real-time temperature updates

#### 6. WireFeedControl.jsx

**Purpose**: Controls solder wire feeding

**Features**:
- Wire length input
- Feed rate control (mm/s)
- Feed button
- Wire feed status display
- Wire break detection

#### 7. SerialPortConnection.jsx

**Purpose**: Manages serial port connection

**Features**:
- COM port list with refresh
- Connect/Disconnect buttons
- Connection status indicator
- Update counter
- Last update timestamp
- Error message display

### Backend Components

#### 1. robotController.js

**Purpose**: IPC event router between renderer and hardware

**Key Functions**:
- `setupRobotController()`: Initializes IPC listeners
- Routes IPC events to `SolderingHardware` methods
- Forwards hardware events to renderer via IPC
- Handles error cases and validation

**IPC Channels**:
- `axis:jog` → `hardware.jog()`
- `axis:home` → `hardware.home()`
- `jig:height:set` → `hardware.setJigHeight()`
- `tip:target:set` → `hardware.setTipTarget()`
- `wire:feed:start` → `hardware.startWireFeed()`
- `sequence:start` → `hardware.startSequence()`
- And many more...

#### 2. SolderingHardware.js

**Purpose**: Hardware abstraction layer and state management

**Key Responsibilities**:
- Maintains machine state (position, temperature, calibration, etc.)
- Processes hardware commands
- Manages soldering sequences
- Calculates safe heights
- Emits events for state changes

**State Structure**:
```javascript
{
  position: { z: 0.0, isMoving: false },
  jigHeightMm: null,
  componentHeightMm: null,
  zAxisSpeed: 95, // 1-100%
  calibration: [...],
  tip: { target: 345, current: 25, heaterEnabled: false },
  wireFeed: { status: 'idle', feedRate: 8.0 },
  sequence: { stage: 'idle', active: false, ... },
  // ... more state
}
```

**Key Methods**:
- `jog(axis, direction, stepSize)`: Manual movement
- `home()`: Home Z-axis
- `setJigHeight(height)`: Set jig calibration
- `startSequence(pads)`: Start soldering sequence
- `startWireFeed(length, rate)`: Feed solder wire
- `setTipTarget(temp)`: Set temperature target

#### 3. SerialPortManager.js

**Purpose**: Serial port communication management

**Key Functions**:
- `connect(port, baudRate)`: Opens serial connection
- `disconnect()`: Closes connection
- `sendJsonCommand(commandObj)`: Sends JSON command
- `on('data', callback)`: Receives serial data
- Automatic line parsing (reads until '\n')

**Configuration**:
- Baud Rate: 115200
- Data Format: JSON string + newline
- Auto-reconnect: Not implemented (manual reconnect)

#### 4. ArduinoDataHandler.js

**Purpose**: Parses Arduino JSON responses

**Key Functions**:
- `processArduinoData(data)`: Parses JSON string
- Extracts position, limits, temperature, wire feed, etc.
- Returns structured updates object
- Handles missing fields gracefully

**Parsed Data Structure**:
```javascript
{
  position: { z: -5.0 },
  limitSwitches: { upper: false, lower: false },
  temperature: { target: 345, current: 25, heaterEnabled: false },
  wireFeed: { status: 'idle', feedRate: 8.0 },
  // ... more fields
}
```

---

## Hardware Configuration

### Arduino Mega 2560 Pin Configuration

| Pin | Function | Description |
|-----|----------|-------------|
| 48 | STEPPER_Z_STEP_PIN | Stepper motor step pulse |
| 46 | STEPPER_Z_DIR_PIN | Stepper motor direction control |
| 3 | LIMIT_SWITCH_Z_MAX_PIN | Upper limit switch (home position) |
| 2 | LIMIT_SWITCH_Z_MIN_PIN | Lower limit switch (bed level) |

**Note**: Enable pin is not used in current configuration.

### Stepper Motor Configuration

- **Motor Type**: Standard 1.8° stepper motor
- **Steps per Revolution**: 200 steps (360° / 1.8°)
- **Driver**: DM542 stepper driver
- **Microstepping**: Configurable via DIP switches (default: 16)

### Lead Screw Configuration

- **Pitch**: 1.0 mm per revolution (measured)
- **Steps per mm**: Calculated automatically based on microstepping

### Limit Switches

- **Type**: Mechanical switches with INPUT_PULLUP configuration
- **Trigger State**: LOW when triggered (switch closed)
- **Upper Limit (Pin 3)**: Home position at 0.00mm
- **Lower Limit (Pin 2)**: Safety stop at bed level (~280mm)

---

## Communication Protocol

### Command Format (App → Arduino)

**Protocol**: JSON string + newline character

**Example Commands**:

```json
{"command":"jog","axis":"z","distance":-5.0,"speed":90}
{"command":"home","speed":90}
{"command":"heater","enable":true}
{"command":"temp","target":345}
{"command":"feed","length":10.5,"rate":8.0}
{"command":"fan","machine":true,"tip":false}
```

### Status Format (Arduino → App)

**Frequency**: Every 500ms (2 updates per second)

**Example Status**:
```json
{
  "pos": {"z":-5.0,"moving":false},
  "limits": {"upper":false,"lower":false},
  "temp": {"target":345,"current":25,"heater":false},
  "wire": {"status":"idle","feedRate":8.0,"break":false},
  "spool": {"weight":500,"wireLength":10000,"remaining":100},
  "flux": {"percentage":82,"ml":68},
  "fans": {"machine":false,"tip":false},
  "fume": {"enabled":false,"speed":80},
  "fluxMist": {"enabled":false,"dispensing":false,"flowRate":50},
  "airBreeze": {"enabled":false,"active":false,"intensity":60},
  "airJet": {"enabled":false,"active":false,"pressure":80},
  "seq": {"stage":"idle","active":false,"pad":0,"total":0,"progress":0,"error":null},
  "height": 5.0,
  "config": {
    "leadScrewPitch": 1.0,
    "motorStepsPerRev": 200,
    "microstepping": 16,
    "stepsPerMm": 3200
  }
}
```

### Baud Rate

- **115200** (must match in both app and Arduino)

---

## Z-Axis Movement System

### Steps Per Millimeter Calculation

**Formula**:
```
Steps per mm = (Motor steps per revolution × Microstepping) / Lead screw pitch
```

**Your Configuration**:
- Lead Screw Pitch: **1.0 mm** per revolution
- Motor Steps per Revolution: **200** steps (1.8° stepper)
- Microstepping: **16** (DM542 DIP switch setting)

**Calculation**:
```
Steps per mm = (200 × 16) / 1.0
             = 3200 / 1.0
             = 3200 steps/mm
```

**Implementation**:
- Calculated automatically in Arduino `setup()`
- Printed to Serial for verification
- Included in JSON status response

### DM542 Microstepping Settings

| Microstepping | Steps/Revolution | DIP Switch (SW5-SW8) | Steps/mm (1mm pitch) |
|---------------|------------------|----------------------|----------------------|
| 1 (Full step) | 200 | ON, ON, ON, ON | 200 |
| 2 | 400 | OFF, ON, ON, ON | 400 |
| 4 | 800 | ON, OFF, ON, ON | 800 |
| 8 | 1600 | OFF, OFF, ON, ON | 1600 |
| **16** | **3200** | **ON, ON, OFF, ON** | **3200** |
| 32 | 6400 | OFF, ON, OFF, ON | 6400 |
| 64 | 12800 | ON, OFF, OFF, ON | 12800 |
| 128 | 25600 | OFF, OFF, OFF, ON | 25600 |

**Note**: Update `MICROSTEPPING` constant in Arduino code to match your DIP switch settings.

### Speed Control System

#### Speed Percentage to Step Delay Conversion

**Formula**:
```cpp
delay = MAX - ((speed - 1) / 99) * (MAX - MIN)
```

**Constants**:
- `Z_STEP_DELAY_MIN = 50` microseconds (fastest - 100%)
- `Z_STEP_DELAY_MAX = 800` microseconds (slowest - 1%)

**Speed Examples**:

| Speed % | Step Delay (μs) | Actual Speed (mm/s) |
|---------|-----------------|---------------------|
| 100% | 50 | ~64.0 mm/s |
| 95% | 87 | ~36.8 mm/s |
| 90% | 124 | ~25.8 mm/s |
| 50% | 425 | ~7.5 mm/s |
| 1% | 800 | ~4.0 mm/s |

**Speed Calculation Formula**:
```
Actual Speed (mm/s) = (1,000,000 / stepDelay) / stepsPerMm
```

**Example**: At 90% speed (124μs delay):
```
Speed = (1,000,000 / 124) / 3200
      = 8064.5 / 3200
      = 2.52 mm/s
```

**Note**: The LCD display shows dynamically calculated speed based on current step delay.

#### Speed Control UI

**Location**: `ManualMovementControl.jsx` component (in "Manual Movement" section)

**UI Elements**:
- **Slider**: Range input (1-200%) for quick speed adjustment
  - **1-100%**: Normal speed range (800μs to 30μs delay)
  - **101-200%**: Turbo mode (30μs to 20μs delay) - for ultra-fast movement
- **Number Input**: Direct percentage entry (1-200%)
- **Percentage Display**: Shows current speed percentage

**Features**:
- Real-time speed adjustment
- Disabled when machine is moving or not connected
- Immediate visual feedback
- Speed is applied to all subsequent movement commands

**Usage Flow**:
```
User adjusts speed slider or enters value
    ↓
ManualMovementControl: Calls onSpeedChange(speed)
    ↓
home.jsx: handleSpeedChange() updates local state
    ↓
home.jsx: window.ipc.send('axis:speed:set', { speed: 90 })
    ↓
robotController: Receives IPC event
    ↓
robotController: Calls hardware.setZAxisSpeed(90)
    ↓
SolderingHardware: Updates state.zAxisSpeed = 90
    ↓
SolderingHardware: Sends JSON to Arduino: {"command":"setspeed","speed":90}
    ↓
Arduino: Updates currentZStepDelay based on speed percentage
    ↓
Arduino: All subsequent movements use new speed
    ↓
SolderingHardware: Updates LCD display with calculated mm/s
    ↓
Frontend: Receives acknowledgment, speed is confirmed
```

**Speed Persistence**:
- Speed is stored in `SolderingHardware.state.zAxisSpeed`
- Persists during app session
- Default: 95% (fast movement)
- Applied to all jog and home commands automatically

**Speed Ranges**:
- **1-100%**: Normal range
  - 1% = 800μs delay (~4.0 mm/s)
  - 50% = ~425μs delay (~7.5 mm/s)
  - 100% = 30μs delay (~10.4 mm/s)
- **101-200%**: Turbo mode (ultra-fast)
  - 101% = 30μs delay (~10.4 mm/s)
  - 150% = 25μs delay (~12.5 mm/s)
  - 200% = 20μs delay (~15.6 mm/s)

**Example**:
- User sets speed to 50% using slider
- Next jog command includes `speed: 50` parameter
- Arduino converts 50% to ~425μs step delay
- Movement executes at ~7.5 mm/s

**Turbo Mode Example**:
- User sets speed to 150% (turbo mode)
- Next jog command includes `speed: 150` parameter
- Arduino converts 150% to 25μs step delay
- Movement executes at ~12.5 mm/s (faster than normal max)

### Movement Precision

**Downward Movement**: Uses `ceilf()` to ensure at least the commanded distance
**Upward Movement**: Uses `roundf()` for normal rounding

**Example**:
- Command: Move down 5.0mm
- Steps: 5.0 × 3200 = 16000.0 steps
- Actual: `ceil(16000.0) = 16000` steps = exactly 5.0mm

---

## Jig Calibration System

### Purpose

Jig calibration sets a reference height for the PCB jig, ensuring safe and consistent positioning during soldering sequences. This prevents head crashes and maintains repeatable operations.

### Terminology

- **Bed Surface**: Physical surface where the jig is placed (280mm from home)
- **Jig**: Tool/plate that sits on the bed surface
- **Jig Height**: Thickness from bed surface to jig surface (where PCB sits)
- **Jig Surface**: Top surface of the jig where the PCB is placed

### Height Relationships

```
Home Position (Upper Limit Switch): 0.00mm
    ↓
Jig Surface: (280mm - jigHeight) mm from home
    ↓
Jig Height (Thickness): [User-defined] mm (e.g., 10mm)
    ↓
Bed Surface: 280.00mm from home ← Where jig is placed
    ↓
Lower Limit Switch: Safety stop (at or near bed level)
```

**Example**:
- Bed surface: 280mm from home
- Jig height (thickness): 10mm (user sets)
- Jig surface: 280mm - 10mm = 270mm from home
- Safe travel space: 280mm - 10mm = 270mm (from home to jig surface)

### Safe Height Calculation

The safe retraction height is calculated as:
```
Safe Height = (Bed Height - Jig Height) + Component Height + 2mm Clearance
           = Jig Surface Position + Component Height + 2mm Clearance
```

**Example**:
- Bed Height: 280mm
- Jig Height: 10mm
- Component Height: 4.75mm
- Safe Height: (280 - 10) + 4.75 + 2.0 = **276.75mm**

### Fallback Behavior

If jig height is not set:
- Falls back to: `Component Height + 2mm`
- If component height is also not set: Defaults to **5mm**

### Usage Workflow

#### Initial Setup

1. **Home the machine** - Ensure head is at home position (0.00mm)
2. **Measure jig height** - Measure thickness from bed surface to jig surface
3. **Enter value** - Type the measured height in the input field
4. **Set height** - Click "Set Height" button
5. **Verify** - Check that jig height is displayed correctly

#### During Operation

- Jig height is used automatically in all sequences
- Safe retraction height is calculated using the formula above
- No manual intervention needed after initial calibration

### Integration with Sequences

When a soldering sequence runs:

1. **Lower Z** - Moves to pad position (Z coordinate)
2. **Dispense** - Feeds solder wire
3. **Clean Tip** - Activates air jet
4. **Retract** - Moves to safe height using jig calibration

---

## Soldering Sequence Workflow

### Sequence Stages

1. **Lowering Z axis** (`lowerZ`)
   - Moves head to pad Z position
   - Applies flux mist if auto mode enabled

2. **Dispensing solder** (`dispense`)
   - Activates fume extractor if auto mode enabled
   - Feeds solder wire (default: 5mm, configurable)
   - Tracks wire length used per pad

3. **Cleaning tip** (`cleanTip`)
   - Activates air jet pressure to clean tip
   - Duration: 2 seconds (configurable)

4. **Retracting head** (`retract`)
   - Moves to safe height: Jig Surface + Component Height + 2mm
   - Ensures clearance above components

### Sequence Execution Flow

```
User: Starts sequence with pad list
    ↓
SolderingHardware: startSequence(pads)
    ↓
For each pad:
    ↓
    Stage 1: Lower Z to pad position
    ↓
    Stage 2: Dispense solder wire
    ↓
    Stage 3: Clean tip with air jet
    ↓
    Stage 4: Retract to safe height
    ↓
    Wait for user to move PCB to next pad
    ↓
    Repeat for next pad
    ↓
Sequence Complete: Emit 'sequence' event
```

### Pad Position Format

```javascript
{
  x: null,  // Not used (manual X positioning)
  y: null,  // Not used (manual Y positioning)
  z: -5.0   // Z position in mm (negative = below home)
}
```

**Note**: X and Y are ignored - operator manually positions PCB on jig.

---

## Speed Control Feature

### Overview

The Speed Control feature allows users to adjust the Z-axis head movement speed in real-time through a user-friendly UI. Speed is controlled via a percentage-based system (1-100%) that gets converted to step delays in the Arduino firmware.

### UI Location

**Component**: `ManualMovementControl.jsx`  
**Section**: "Manual Movement" controls  
**Position**: Above "Step Size" selection

### UI Elements

1. **Speed Slider**:
   - Range: 1-100%
   - Visual feedback with smooth dragging
   - Updates speed in real-time as user drags

2. **Speed Input Field**:
   - Direct numeric entry (1-100)
   - Validates input range
   - Auto-corrects out-of-range values

3. **Percentage Display**:
   - Shows "%" unit
   - Updates immediately with slider/input changes

### Complete Execution Flow

#### Frontend to Backend Flow

```
User Action: Adjusts speed slider to 50%
    ↓
ManualMovementControl.jsx:
  - onChange event fires
  - Calls onSpeedChange(50)
    ↓
home.jsx: handleSpeedChange(50)
  - Validates: Math.max(1, Math.min(100, 50)) = 50
  - Updates local state: setZAxisSpeed(50)
  - Sends IPC: window.ipc.send('axis:speed:set', { speed: 50 })
    ↓
robotController.js: registerIpcListener('axis:speed:set')
  - Receives IPC event with payload.speed = 50
  - Calls: hardware.setZAxisSpeed(50)
    ↓
SolderingHardware.js: setZAxisSpeed(50)
  - Validates: speedValue = Math.max(1, Math.min(100, 50)) = 50
  - Updates state: this.state.zAxisSpeed = 50
  - Updates LCD display: _updateZAxisSpeedDisplay()
  - Sends to Arduino: {"command":"setspeed","speed":50}
    ↓
SerialPortManager.js: sendJsonCommand()
  - Stringifies JSON: '{"command":"setspeed","speed":50}'
  - Adds newline: '{"command":"setspeed","speed":50}\n'
  - Writes to serial port
    ↓
Arduino: processCommands()
  - Receives JSON string
  - Parses: cmdDoc["command"] = "setspeed"
  - Extracts: speedValue = 50
  - Converts to delay:
    delay = 800 - ((50 - 1) / 99) * (800 - 50)
         = 800 - (49 / 99) * 750
         = 800 - 371.21
         = 428.79 ≈ 429 microseconds
  - Updates: currentZStepDelay = 429
  - Prints confirmation to Serial
    ↓
All subsequent movement commands use speed = 50%
  - Jog commands include speed parameter
  - Home commands include speed parameter
  - Movement executes at ~7.5 mm/s
```

#### Speed Application to Movement Commands

When any movement command is sent (jog, home, etc.), the current speed is automatically included:

```javascript
// Location: SolderingHardware.js → jog() method
await this._sendArduinoJsonCommand({
  command: 'jog',
  axis: 'z',
  distance: -5.0,
  speed: this.state.zAxisSpeed  // ← Current speed (e.g., 50)
})
```

Arduino processes the speed parameter and applies it to the movement.

### Speed Request Flow (On App Start)

```
App Startup
    ↓
home.jsx: window.ipc.send('axis:speed:request')
    ↓
robotController.js: registerIpcListener('axis:speed:request')
  - Calls: hardware.getZAxisSpeed()
    ↓
SolderingHardware.js: getZAxisSpeed()
  - Returns: this.state.zAxisSpeed (e.g., 95)
    ↓
robotController.js: Sends IPC: 'axis:speed:status'
  - Payload: { speed: 95, status: 'ok' }
    ↓
home.jsx: handleSpeedStatus(payload)
  - Updates: setZAxisSpeed(95)
    ↓
UI: Displays current speed (95%)
```

### Benefits

1. **Real-time Control**: Adjust speed without restarting app
2. **Visual Feedback**: Slider and input provide immediate response
3. **Automatic Application**: Speed is included in all movement commands
4. **Persistent**: Speed setting persists during app session
5. **Safe**: Disabled during movement to prevent conflicts

### Technical Details

**Speed Storage**:
- Backend: `SolderingHardware.state.zAxisSpeed` (default: 95%)
- Frontend: `home.jsx` useState hook (synced with backend)

**Speed Conversion** (Arduino):
```cpp
// Percentage to delay conversion
delay = Z_STEP_DELAY_MAX - ((speed - 1) / 99) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN)
// Example: 50% → 429 microseconds
```

**Speed Calculation** (Display):
```javascript
// Delay to mm/s conversion
speedMmPerSecond = (1,000,000 / stepDelay) / stepsPerMm
// Example: 429μs → ~7.5 mm/s
```

---

## User Interface Components

### Navigation Menu

- **Serial Port Connection**: Connect/disconnect to Arduino
- **Manual Movement**: Jog controls for Z-axis
- **Jig Calibration**: Set jig reference height
- **Tip Heating**: Temperature control
- **Wire Feed**: Solder wire dispensing
- **Sequence Monitor**: Soldering sequence control
- **LCD Display**: Virtual machine status display
- **Component Height**: Set maximum component height
- **Pad Soldering Metrics**: Temperature recommendations
- **Spool Wire Control**: Wire spool management
- **Fume Extractor**: Fume extraction control
- **Flux Mist**: Flux dispensing control
- **Air Breeze**: Gentle air flow control
- **Air Jet Pressure**: High-pressure air control
- **Camera View**: Live camera feed with zoom

### Theme System

- **Dark/Light Theme**: Toggle via theme button
- **Persistent**: Saved to local storage
- **Global**: Applied to all components

---

## Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Arduino IDE (for uploading firmware)
- Arduino Mega 2560
- USB cable for Arduino connection

### Installation Steps

1. **Clone/Download** the project
2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Upload Arduino Firmware**:
   - Open `ARDUINO_SKETCH_EXAMPLE/ARDUINO_SKETCH_EXAMPLE.ino` in Arduino IDE
   - Select board: Arduino Mega 2560
   - Select port: Your COM port
   - Upload sketch

4. **Configure Arduino**:
   - Set DM542 microstepping DIP switches (default: 16)
   - Verify lead screw pitch (default: 1.0mm)
   - Connect limit switches to pins 2 and 3
   - Connect stepper motor to pins 46 (DIR) and 48 (STEP)

5. **Run Application**:
   ```bash
   npm run dev
   ```

6. **Build Application** (optional):
   ```bash
   npm run build
   ```

### Configuration

#### Arduino Configuration

**File**: `ARDUINO_SKETCH_EXAMPLE.ino`

**Key Constants**:
```cpp
const float LEAD_SCREW_PITCH_MM = 1.0f;  // Adjust if different
const int MOTOR_STEPS_PER_REVOLUTION = 200;  // Standard 1.8° motor
const int MICROSTEPPING = 16;  // Match your DM542 DIP switch setting
const unsigned int Z_STEP_DELAY_MIN = 50;  // Fastest speed (microseconds)
const unsigned int Z_STEP_DELAY_MAX = 800;  // Slowest speed (microseconds)
```

#### Application Configuration

**File**: `main/hardware/SolderingHardware.js`

**Key Constants**:
```javascript
this.BED_HEIGHT_MM = 280.0  // Distance from home to bed surface
this.state.zAxisSpeed = 95  // Default speed (1-100%)
```

---

## Usage Guide

### First Time Setup

1. **Connect Hardware**:
   - Connect Arduino via USB
   - Ensure limit switches are connected
   - Verify stepper motor connections

2. **Connect Serial Port**:
   - Open "Serial Port Connection" in app
   - Select your COM port
   - Click "Connect"
   - Verify connection status shows "Connected"

3. **Home the Machine**:
   - Go to "Manual Movement"
   - Click "Home" button
   - Wait for head to reach home position (0.00mm)

4. **Calibrate Jig**:
   - Go to "Jig Calibration"
   - Measure jig thickness (from bed to jig surface)
   - Enter value and click "Set Height"
   - Verify jig surface position is displayed correctly

5. **Set Component Height**:
   - Go to "Component Height"
   - Enter maximum component height on PCB
   - This ensures safe retraction clearance

### Daily Operation

1. **Start Application**
2. **Connect Serial Port**
3. **Home Machine** (if not already at home)
4. **Load PCB on Jig**
5. **Start Soldering Sequence** (if using sequences)
6. **Or Use Manual Movement** for individual pads

### Manual Soldering Workflow

1. **Position PCB** on jig manually (X/Y positioning)
2. **Jog head down** to pad position using manual controls
3. **Feed solder wire** using wire feed control
4. **Clean tip** using air jet control
5. **Jog head up** to safe height
6. **Move PCB** to next pad position
7. **Repeat** for all pads

### Automated Sequence Workflow

1. **Prepare pad list** with Z positions
2. **Start sequence** from Sequence Monitor
3. **For each pad**:
   - Machine automatically lowers to pad position
   - Machine feeds solder wire
   - Machine cleans tip
   - Machine retracts to safe height
   - **You manually move PCB** to next pad position
   - Click "Next" or wait for auto-advance
4. **Sequence completes** automatically

---

## Troubleshooting

### Serial Connection Issues

**Problem**: Cannot connect to Arduino
- **Solution**: Check COM port selection, verify USB cable, restart Arduino

**Problem**: Connection drops frequently
- **Solution**: Check USB cable quality, avoid USB hubs, check power supply

### Movement Issues

**Problem**: Head doesn't move
- **Solution**: Check serial connection, verify stepper motor connections, check limit switches

**Problem**: Movement is inaccurate
- **Solution**: Verify steps per mm calculation, check microstepping setting, recalibrate if needed

**Problem**: Head stops prematurely
- **Solution**: Check limit switches, verify homing completed successfully

### Limit Switch Issues

**Problem**: Limit switch warnings not showing
- **Solution**: Verify limit switches are connected correctly, check Arduino pin configuration, verify JSON status includes limits

**Problem**: False limit switch triggers
- **Solution**: Check switch wiring, verify INPUT_PULLUP configuration, check for electrical noise

### Calibration Issues

**Problem**: Jig height not saving
- **Solution**: Check IPC communication, verify backend response, check console for errors

**Problem**: Safe height calculation incorrect
- **Solution**: Verify jig height and component height are set correctly, check calculation formula

### Performance Issues

**Problem**: Movement too slow
- **Solution**: Increase speed percentage, reduce Z_STEP_DELAY_MAX in Arduino, check stepper driver settings

**Problem**: Movement too fast (skipping steps)
- **Solution**: Reduce speed percentage, increase Z_STEP_DELAY_MIN in Arduino, check motor current settings

---

## Technical Details

### Position System

- **Home Position**: 0.00mm (upper limit switch)
- **Downward Movement**: Negative values (e.g., -5.0mm)
- **Upward Movement**: Positive values (e.g., +5.0mm)
- **Position Tracking**: Arduino maintains `zPosition` variable
- **Position Updates**: Sent every 500ms via JSON status

### Event System

**Hardware Events** (Emitted by `SolderingHardware.js`):
- `position:update` - Position changed
- `limitSwitch:update` - Limit switch state changed
- `calibration` - Calibration updated
- `tip` - Temperature changed
- `wireFeed` - Wire feed status changed
- `sequence` - Sequence status changed
- And more...

**IPC Events** (Between renderer and main):
- `axis:jog` - Manual movement command
- `axis:home` - Home command
- `jig:height:set` - Set jig height
- `tip:target:set` - Set temperature target
- `sequence:start` - Start soldering sequence
- And more...

### State Management

**Backend State** (`SolderingHardware.js`):
- Centralized state management
- Event-driven updates
- State persisted during session

**Frontend State** (`home.jsx`):
- React useState hooks
- IPC event listeners
- Local UI state

### Error Handling

- **Serial Errors**: Logged, connection status updated
- **JSON Parse Errors**: Logged, data skipped
- **Limit Switch Errors**: Warnings displayed, movement stopped
- **Command Errors**: Error responses sent back to frontend

---

## File Structure

```
single-axis-solder/
├── main/                          # Electron main process
│   ├── background.js             # Main entry point
│   ├── robotController.js        # IPC event router
│   ├── hardware/
│   │   ├── SolderingHardware.js  # Hardware abstraction
│   │   ├── SerialPortManager.js  # Serial communication
│   │   ├── ArduinoDataHandler.js # JSON parser
│   │   └── CommandProtocol.js    # Command formatting
│   └── preload.js                # IPC bridge
├── renderer/                      # React frontend
│   ├── pages/
│   │   └── home.jsx              # Main page
│   └── components/               # React components
│       ├── ManualMovementControl.jsx
│       ├── JigCalibration.jsx
│       ├── SequenceMonitor.jsx
│       └── ... (more components)
├── ARDUINO_SKETCH_EXAMPLE/       # Arduino firmware
│   └── ARDUINO_SKETCH_EXAMPLE.ino
└── package.json                  # Dependencies
```

---

## License

[Add your license information here]

---

## Support

For issues, questions, or contributions, please [add your contact/support information here].

---

**Last Updated**: [Current Date]
**Version**: 1.0.0
