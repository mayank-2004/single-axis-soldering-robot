# Arduino Mega 2560 Integration Guide

This guide explains how to connect your Electron/Nextron app with Arduino Mega 2560 to fetch real-time machine data.

## Overview

The app connects directly to Arduino Mega 2560 via Serial (USB) and receives real-time machine state data. The Arduino sends JSON-formatted data which is automatically parsed and displayed in the frontend.

## Arduino Data Format

Your Arduino should send JSON data via Serial in the following format:

```json
{
  "pos": {"z": 3.2, "moving": false},  // Single-axis: only Z position (PCB moved manually)
  "temp": {"target": 345, "current": 310, "heater": true},
  "wire": {"status": "idle", "feedRate": 8.0, "break": false},
  "spool": {"weight": 500.0, "wireLength": 10000.0, "diameter": 0.5, "remaining": 100, "feeding": false},
  "flux": {"percentage": 82, "ml": 68},
  "fans": {"machine": false, "tip": false},
  "fume": {"enabled": false, "speed": 80},
  "fluxMist": {"enabled": false, "dispensing": false, "flowRate": 50},
  "airBreeze": {"enabled": false, "active": false, "intensity": 60},
  "airJet": {"enabled": false, "active": false, "pressure": 80},
  "seq": {"stage": "idle", "active": false, "pad": 0, "total": 0, "progress": 0, "error": null},
  "height": 4.75
}
```

## Parameters Fetched from Arduino

### 1. Position Data (`pos`)
- `z` - Z-axis position (mm) - up-down head movement (single-axis machine)
- **Note**: X and Y positions are not included (PCB is moved manually by operator)
- `moving` - Boolean indicating if machine is currently moving

### 2. Temperature Data (`temp`)
- `target` - Target soldering tip temperature (°C)
- `current` - Current soldering tip temperature (°C)
- `heater` - Boolean indicating if heater is on

### 3. Wire Feed Data (`wire`)
- `status` - Status: "idle", "feeding", "error"
- `feedRate` - Current feed rate (mm/s)
- `break` - Boolean indicating wire break detection

### 4. Spool Data (`spool`)
- `weight` - Current spool weight (grams)
- `wireLength` - Remaining wire length (mm)
- `diameter` - Wire diameter (mm)
- `remaining` - Percentage of wire remaining (0-100%)
- `feeding` - Boolean indicating if wire is currently being fed

### 5. Flux Data (`flux`)
- `percentage` - Flux remaining percentage (0-100%)
- `ml` - Flux remaining in milliliters (ml)

### 6. Fan States (`fans`)
- `machine` - Boolean for machine fan state
- `tip` - Boolean for tip cooling fan state

### 7. Fume Extractor (`fume`)
- `enabled` - Boolean indicating if fume extractor is on
- `speed` - Speed setting (0-100%)

### 8. Flux Mist Dispenser (`fluxMist`)
- `enabled` - Boolean indicating if flux mist is enabled
- `dispensing` - Boolean indicating if currently dispensing
- `flowRate` - Flow rate setting (0-100%)

### 9. Air Breeze (`airBreeze`)
- `enabled` - Boolean indicating if air breeze is enabled
- `active` - Boolean indicating if currently active
- `intensity` - Intensity setting (0-100%)

### 10. Air Jet Pressure (`airJet`)
- `enabled` - Boolean indicating if air jet is enabled
- `active` - Boolean indicating if currently active
- `pressure` - Pressure setting (0-100%)

### 11. Sequence/Operation Data (`seq`)
- `stage` - Current sequence stage: "idle", "lowerZ", "dispense", "cleanTip", "retract", etc.
- `active` - Boolean indicating if sequence is running
- `pad` - Current pad number in sequence
- `total` - Total number of pads in sequence
- `progress` - Progress percentage (0-100%)
- `error` - Error message if any (null if no error)

### 12. Component Height (`height`)
- Maximum component height from PCB (mm)

## How to Connect

1. **Connect Arduino via USB**
   - Plug Arduino Mega 2560 into your computer via USB cable

2. **Start the Electron App**
   - Run your Nextron app

3. **Connect via Serial Port**
   - The app will show available serial ports
   - Select the Arduino port (usually COM3/COM4 on Windows, /dev/ttyUSB0 on Linux)
   - Click "Connect"

4. **Arduino Starts Sending Data**
   - Once connected, your Arduino should start sending JSON data every 100-500ms
   - The app will automatically parse and display the values in the frontend

## Arduino Code Template

```cpp
// Arduino Mega 2560 Example
#include <ArduinoJson.h>

void setup() {
  Serial.begin(115200);
  // Initialize your sensors, motors, etc.
}

void loop() {
  // Read sensors and update values (single-axis: only Z-axis)
  float zPos = readZPosition();  // Only Z-axis (PCB moved manually)
  float currentTemp = readTemperature();
  
  // Create JSON object
  StaticJsonDocument<1024> doc;
  
  // Position (single-axis: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
  pos["z"] = zPos;  // Only Z-axis (X and Y not controlled - PCB moved manually)
  pos["moving"] = isMoving();
  
  // Temperature
  JsonObject temp = doc.createNestedObject("temp");
  temp["target"] = targetTemperature;
  temp["current"] = currentTemp;
  temp["heater"] = heaterEnabled;
  
  // Wire Feed
  JsonObject wire = doc.createNestedObject("wire");
  wire["status"] = wireFeedStatus;
  wire["feedRate"] = currentFeedRate;
  wire["break"] = wireBreakDetected;
  
  // Spool
  JsonObject spool = doc.createNestedObject("spool");
  spool["weight"] = spoolWeight;
  spool["wireLength"] = remainingWireLength;
  spool["diameter"] = wireDiameter;
  spool["remaining"] = remainingPercentage;
  spool["feeding"] = isWireFeeding;
  
  // Add more data as needed...
  
  // Send JSON via Serial
  serializeJson(doc, Serial);
  Serial.println();
  
  delay(100); // Send every 100ms
}
```

## Data Flow

```
Arduino Mega 2560
    ↓ (Serial/USB - JSON data)
SerialPortManager (main/hardware/SerialPortManager.js)
    ↓ (Parses JSON)
ArduinoDataHandler (main/hardware/ArduinoDataHandler.js)
    ↓ (Processes updates)
SolderingHardware (main/hardware/SolderingHardware.js)
    ↓ (Updates state)
robotController (main/robotController.js)
    ↓ (IPC to frontend)
Frontend Components (renderer/components/*.jsx)
    ↓ (Displays in UI)
User sees real-time data
```

## Testing Without Arduino

You can test the integration using a virtual serial port or by sending test JSON data:

```bash
# Using a serial port emulator
# Windows: COM0COM or Virtual Serial Port Driver
# Linux: socat or similar tools
```

## Troubleshooting

1. **Arduino not detected**
   - Check USB cable connection
   - Verify Arduino drivers are installed
   - Try different USB port

2. **Data not updating**
   - Check baud rate matches (115200)
   - Verify Arduino is sending JSON format
   - Check Serial Monitor to see what Arduino is sending

3. **JSON parse errors**
   - Ensure JSON is properly formatted
   - Check for trailing commas or syntax errors
   - Verify data ends with newline (`\n`)

## Next Steps

1. **Upload Arduino sketch** that reads your sensors and sends JSON data
2. **Connect via Serial Port** in the app
3. **Monitor real-time updates** in the frontend
4. **Send commands** to Arduino using the existing command system


