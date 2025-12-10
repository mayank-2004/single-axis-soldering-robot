# Complete App Workflow Flowchart

## System Architecture Flow

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '20px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
graph TB
    subgraph UI["User Interface"]
        UI1[React Components]
        UI2[ManualMovementControl]
        UI3[LCD Display]
    end
    
    subgraph FE["Frontend - Renderer"]
        FE1[home.jsx]
        FE2[IPC Client]
    end
    
    subgraph IPC["IPC Layer"]
        IPC1[Electron IPC]
    end
    
    subgraph BE["Backend - Main Process"]
        BE1[robotController.js]
        BE2[SolderingHardware.js]
        BE3[SerialPortManager.js]
        BE4[ArduinoDataHandler.js]
    end
    
    subgraph COM["Communication"]
        COM1[USB Serial - 115200]
    end
    
    subgraph ARD["Arduino Mega 2560"]
        ARD1[Serial Port]
        ARD2[processCommands]
        ARD3[moveZAxisByDistance]
        ARD4[Limit Switches]
        ARD5[sendMachineState]
    end
    
    subgraph HW["Hardware"]
        HW1[Stepper Motor]
        HW2[Upper Limit - Pin 3]
        HW3[Lower Limit - Pin 2]
    end
    
    UI1 --> UI2
    UI2 --> FE1
    FE1 --> FE2
    FE2 --> IPC1
    IPC1 --> BE1
    BE1 --> BE2
    BE2 --> BE3
    BE3 --> COM1
    COM1 --> ARD1
    ARD1 --> ARD2
    ARD2 --> ARD3
    ARD3 --> ARD4
    ARD4 --> HW2
    ARD4 --> HW3
    ARD3 --> HW1
    
    ARD5 --> COM1
    COM1 --> BE3
    BE3 --> BE4
    BE4 --> BE2
    BE2 --> BE1
    BE1 --> IPC1
    IPC1 --> FE2
    FE2 --> FE1
    FE1 --> UI2
    FE1 --> UI3
```

## Command Flow: User Jog Action

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '100px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
sequenceDiagram
    participant U as User
    participant UI as UI Component
    participant FE as Frontend
    participant IPC as IPC
    participant BE as Backend
    participant S as Serial
    participant A as Arduino
    participant M as Motor
    
    U->>UI: Click ↓ (5mm)
    UI->>FE: onJog('z', -1, 5.0)
    FE->>IPC: axis:jog
    IPC->>BE: jog('z', -1, 5.0)
    BE->>BE: Calculate -5.0mm
    BE->>S: JSON: {command:'jog', distance:-5.0}
    S->>A: Serial JSON
    
    A->>A: processCommands()
    A->>A: Parse distance = -5.0
    A->>A: moveZAxisByDistance(-5.0)
    A->>A: Check limits
    A->>A: Calculate: 5.0 × 204.1 = 1020 steps
    A->>M: Pulse 1020 times
    M-->>A: Complete
    A->>A: Update zPosition = -5.0mm
    
    A->>S: JSON Status
    S->>BE: arduino:data
    BE->>BE: Parse limits
    BE->>IPC: limitSwitch event
    BE->>IPC: position:update event
    IPC->>FE: position:update
    IPC->>FE: limitSwitch:update
    FE->>UI: Update position
    UI->>U: Display: -005.00 mm
```

## Data Flow: Arduino Status Updates

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '90px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
sequenceDiagram
    participant A as Arduino
    participant S as Serial Port
    participant SM as SerialManager
    participant DH as DataHandler
    participant HW as Hardware
    participant RC as robotController
    participant IPC as IPC
    participant FE as Frontend
    participant UI as UI
    
    loop Every 100ms
        A->>A: Read sensors & limits
        A->>A: sendMachineState()
        A->>S: JSON Status
    end
    
    S->>SM: Read line
    SM->>DH: parseArduinoData()
    DH->>DH: Parse JSON
    DH->>DH: Extract position, limits
    DH->>SM: Return updates
    SM->>HW: arduino:data event
    
    HW->>HW: _handleArduinoData()
    HW->>HW: Update position.z
    HW->>HW: Check limitSwitches
    HW->>RC: position:update
    HW->>RC: limitSwitch (if triggered)
    
    RC->>IPC: position:update
    RC->>IPC: limitSwitch:update
    IPC->>FE: position:update
    IPC->>FE: limitSwitch:update
    
    FE->>FE: Update state
    FE->>FE: Show alert (if needed)
    FE->>UI: Update props
    UI->>UI: Re-render
```

## Limit Switch Detection Flow

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '18px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
flowchart TD
    Start["Arduino Loop - Every 100ms"]
    ReadPins["Read Limit Switch Pins"]
    Pin3["Pin 3: LIMIT_SWITCH_Z_MAX_PIN"]
    Pin2["Pin 2: LIMIT_SWITCH_Z_MIN_PIN"]
    
    CheckUpper{"Upper Limit Triggered?"}
    CheckLower{"Lower Limit Triggered?"}
    
    SendJSON["Send JSON Status"]
    ParseData["ArduinoDataHandler - Parses limits object"]
    EmitEvent["Hardware Emits - limitSwitch Event"]
    ForwardIPC["robotController - Forwards to IPC"]
    FrontendListen["Frontend Listens - limitSwitch:update"]
    
    ShowUpper["Show Alert: Upper limit reached"]
    ShowLower["Show Alert: Lower limit reached"]
    ClearAlert["Clear Alert - Both switches released"]
    
    Start --> ReadPins
    ReadPins --> Pin3
    ReadPins --> Pin2
    Pin3 --> CheckUpper
    Pin2 --> CheckLower
    
    CheckUpper -->|true| SendJSON
    CheckLower -->|true| SendJSON
    CheckUpper -->|false| SendJSON
    CheckLower -->|false| SendJSON
    
    SendJSON -->|JSON limits object| ParseData
    ParseData --> EmitEvent
    EmitEvent --> ForwardIPC
    ForwardIPC --> FrontendListen
    
    FrontendListen -->|upper: true| ShowUpper
    FrontendListen -->|lower: true| ShowLower
    FrontendListen -->|both: false| ClearAlert
    
    ShowUpper --> AutoHide1["Auto-hide after 3s"]
    ShowLower --> AutoHide2["Auto-hide after 3s"]
```

## Homing Function Flow

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '18px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
flowchart TD
    Start["User Clicks Home Button"]
    Frontend["home.jsx: handleHome"]
    IPC_Send["IPC: 'axis:home'"]
    Backend["SolderingHardware.home"]
    SerialCmd["Serial: {'command':'home'}"]
    Arduino["Arduino: processCommands"]
    
    CalcDistance["Calculate distanceToHome = 0.0 - zPosition"]
    Example["Example: zPosition = -45.0mm, distanceToHome = 45.0mm"]
    
    MoveUp["moveZAxisByDistance - distanceToHome"]
    CalcSteps["Calculate Steps - 45.0 × 204.1 = 9185 steps"]
    ExecuteSteps["Execute Stepper Pulses"]
    UpdatePos["Update zPosition = 0.0mm"]
    
    SendStatus["Send JSON Status - pos.z = 0.0"]
    UpdateUI["Update Frontend - Display 0.00mm"]
    
    Start --> Frontend
    Frontend --> IPC_Send
    IPC_Send --> Backend
    Backend --> SerialCmd
    SerialCmd --> Arduino
    Arduino --> CalcDistance
    CalcDistance --> Example
    Example --> MoveUp
    MoveUp --> CalcSteps
    CalcSteps --> ExecuteSteps
    ExecuteSteps --> UpdatePos
    UpdatePos --> SendStatus
    SendStatus --> UpdateUI
```

## Complete System Interaction Diagram

```mermaid
%%{init: {'themeVariables': {'fontSize': '200px', 'primaryColor': '#000000', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#ffffff', 'lineColor': '#ffffff', 'secondaryColor': '#000000', 'tertiaryColor': '#000000', 'nodeBkgColor': '#000000', 'mainBkgColor': '#000000', 'textColor': '#ffffff'}}}%%
flowchart TD
    Start([User Interface])
    
    UA["User Actions Section"]
    A1["User clicks Jog Down button"]
    A2["User clicks Jog Up button"]
    A3["User clicks Home button"]
    A4["User sets step size value"]
    
    FP["Frontend Processing Section"]
    B1["home.jsx receives click event"]
    B2["Calculate movement direction"]
    B3["Calculate step distance"]
    B4["Prepare command object"]
    B5["Call window.ipc.send"]
    B6["Send axis:jog event"]
    
    IPC["IPC Communication Layer"]
    IPC1["Electron IPC receives event"]
    IPC2["Route to robotController"]
    
    BP["Backend Processing Section"]
    C1["robotController receives IPC"]
    C2["Call SolderingHardware.jog"]
    C3["Validate command parameters"]
    C4["Calculate final distance"]
    C5["Prepare JSON command"]
    C6["Call SerialPortManager.sendJsonCommand"]
    
    SER["Serial Communication"]
    SER1["Format JSON string"]
    SER2["Add newline character"]
    SER3["Write to USB serial port"]
    SER4["115200 baud rate"]
    
    AP["Arduino Processing Section"]
    D1["Arduino Serial.readString"]
    D2["Read until newline"]
    D3["Parse JSON string"]
    D4["Extract command type"]
    D5["Extract axis parameter"]
    D6["Extract distance value"]
    D7["Call processCommands function"]
    D8["Validate command structure"]
    D9["Check current position"]
    D10["Read limit switch pins"]
    D11["Check upper limit Pin 3"]
    D12["Check lower limit Pin 2"]
    D13["Calculate steps to move"]
    D14["Apply precision rounding"]
    D15["Call moveZAxisByDistance"]
    D16["Execute stepper pulses"]
    D17["Update zPosition variable"]
    D18["Call sendMachineState"]
    
    HE["Hardware Execution Section"]
    E1["Generate stepper pulses"]
    E2["Pulse delay microseconds"]
    E3["Direction pin control"]
    E4["Step pin toggling"]
    E5["Physical motor movement"]
    E6["Mechanical axis movement"]
    
    FB["Feedback Loop Section"]
    F1["Arduino sends JSON status"]
    F2["Serial port receives data"]
    F3["SerialPortManager parses line"]
    F4["ArduinoDataHandler processes"]
    F5["Extract position data"]
    F6["Extract limit switch status"]
    F7["Extract temperature data"]
    F8["Create updates object"]
    F9["Emit arduino:data event"]
    F10["SolderingHardware handles"]
    F11["Update internal state"]
    F12["Emit position:update event"]
    F13["Emit limitSwitch event"]
    F14["robotController forwards"]
    F15["Send IPC to renderer"]
    F16["Frontend receives update"]
    F17["Update React state"]
    F18["Re-render UI components"]
    F19["Display new position"]
    F20["Show limit warnings"]
    
    Start --> UA
    UA --> A1
    UA --> A2
    UA --> A3
    UA --> A4
    
    A1 --> FP
    A2 --> FP
    A3 --> FP
    A4 --> FP
    
    FP --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> B6
    B6 --> IPC
    
    IPC --> IPC1
    IPC1 --> IPC2
    IPC2 --> BP
    
    BP --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> C5
    C5 --> C6
    C6 --> SER
    
    SER --> SER1
    SER1 --> SER2
    SER2 --> SER3
    SER3 --> SER4
    SER4 --> AP
    
    AP --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4
    D4 --> D5
    D5 --> D6
    D6 --> D7
    D7 --> D8
    D8 --> D9
    D9 --> D10
    D10 --> D11
    D10 --> D12
    D11 --> D13
    D12 --> D13
    D13 --> D14
    D14 --> D15
    D15 --> D16
    D16 --> HE
    D16 --> D17
    D17 --> D18
    
    HE --> E1
    E1 --> E2
    E2 --> E3
    E3 --> E4
    E4 --> E5
    E5 --> E6
    
    D18 --> FB
    FB --> F1
    F1 --> F2
    F2 --> F3
    F3 --> F4
    F4 --> F5
    F4 --> F6
    F4 --> F7
    F5 --> F8
    F6 --> F8
    F7 --> F8
    F8 --> F9
    F9 --> F10
    F10 --> F11
    F11 --> F12
    F11 --> F13
    F12 --> F14
    F13 --> F14
    F14 --> F15
    F15 --> F16
    F16 --> F17
    F17 --> F18
    F18 --> F19
    F18 --> F20
```

## Key Data Structures

### Command Flow (App → Arduino)
```
User Input: 5mm step size, ↓ button
    ↓
JSON Command: {"command":"jog","axis":"z","distance":-5.0}
    ↓
Serial: '{"command":"jog","axis":"z","distance":-5.0}\n'
    ↓
Arduino Receives: distance = -5.0 (float)
    ↓
Calculates: steps = 5.0 × 204.1 = 1020 steps
    ↓
Executes: 1020 stepper pulses
    ↓
Updates: zPosition = -5.0mm
```

### Status Flow (Arduino → App)
```
Arduino Status: zPosition = -5.0mm, limits = {upper:false, lower:false}
    ↓
JSON: {"pos":{"z":-5.0,"moving":false},"limits":{"upper":false,"lower":false},...}
    ↓
Serial: JSON string + '\n'
    ↓
Parsed: {position: {z: -5.0}, limitSwitches: {upper: false, lower: false}}
    ↓
Events: 'position:update', 'limitSwitch:update'
    ↓
UI Updates: Display -005.00 mm
```

## Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **ManualMovementControl** | User input, step size selection, jog buttons |
| **home.jsx** | State management, IPC communication, UI coordination |
| **robotController.js** | IPC event routing, hardware event forwarding |
| **SolderingHardware.js** | Hardware abstraction, command processing, state management |
| **SerialPortManager.js** | Serial port communication, JSON sending/receiving |
| **ArduinoDataHandler.js** | JSON parsing, data structure conversion |
| **Arduino Sketch** | Hardware control, sensor reading, movement execution |

## Communication Protocols

### Command Protocol (App → Arduino)
- Format: JSON string + newline
- Example: `{"command":"jog","axis":"z","distance":-5.0}\n`
- Baud Rate: 115200
- Method: Fire-and-forget (no acknowledgment required)

### Status Protocol (Arduino → App)
- Format: JSON string + newline
- Frequency: Every 100ms
- Example: `{"pos":{"z":-5.0,"moving":false},"limits":{"upper":false,"lower":false},...}\n`
- Parsing: Automatic via ArduinoDataHandler

## Error Handling Flow

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize': '18px', 'primaryColor': '#ff0000', 'primaryTextColor': '#fff', 'primaryBorderColor': '#7C0000', 'lineColor': '#F8B229', 'secondaryColor': '#006100', 'tertiaryColor': '#fff'}}}%%
flowchart TD
    Error[Error Occurs]
    SerialError{Serial Error?}
    ParseError{JSON Parse Error?}
    LimitError{Limit Switch Error?}
    
    SerialError -->|Yes| RetrySerial[Retry Connection]
    SerialError -->|No| ParseError
    
    ParseError -->|Yes| LogError[Log & Skip]
    ParseError -->|No| LimitError
    
    LimitError -->|Yes| ShowAlert[Show Limit Alert]
    LimitError -->|No| Continue[Continue Normal Flow]
    
    RetrySerial --> Continue
    LogError --> Continue
    ShowAlert --> Continue
```

