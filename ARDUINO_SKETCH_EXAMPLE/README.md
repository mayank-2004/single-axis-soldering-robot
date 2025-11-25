# Arduino Mega 2560 Sketch for Single Axis Soldering Machine

This Arduino sketch sends real-time machine state data to the Electron/Nextron app via Serial (USB) communication.

## Features

- ✅ Sends JSON-formatted machine state data every 100ms
- ✅ Single-axis machine: Only Z-axis (up/down) movement
- ✅ Supports all machine parameters (position, temperature, wire feed, spool, flux, fans, etc.)
- ✅ Receives and processes commands from the Electron app
- ✅ PCB is moved manually by operator (no X/Y axis control)

## Machine Specifications

- **Machine Type**: Single-Axis Soldering Machine
- **Z Axis**: Up-Down head movement for applying solder paste on PCB pads
- **PCB Movement**: Manual (moved by operator on a jig)
- **No Bed Size Restrictions**: PCB positioning is manual

## Installation

1. **Install ArduinoJson Library**
   - Open Arduino IDE
   - Go to: **Tools → Manage Libraries**
   - Search for: **"ArduinoJson"**
   - Install **ArduinoJson** by Benoit Blanchon (version 6.x or 7.x)

2. **Select Board and Port**
   - **Tools → Board → Arduino AVR Boards → Arduino Mega or Mega 2560**
   - **Tools → Port → COMX** (select your Arduino port)

3. **Upload Sketch**
   - Click **Upload** button (→) or press **Ctrl+U**

## Data Format

The sketch sends JSON data in this format:

```json
{
  "pos": {"z": 3.2, "moving": false},
  "temp": {"target": 345, "current": 25, "heater": false},
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

## Parameters Explained

### Position (`pos`)
- `z` - Z-axis position in mm (up/down movement only)
- `moving` - Boolean: true if machine is currently moving
- **Note**: X and Y positions are not included (PCB is moved manually by operator)

### Temperature (`temp`)
- `target` - Target soldering tip temperature in °C
- `current` - Current soldering tip temperature in °C
- `heater` - Boolean: true if heater is enabled

### Wire Feed (`wire`)
- `status` - Status string: "idle", "feeding", "error"
- `feedRate` - Current feed rate in mm/s
- `break` - Boolean: true if wire break detected

### Spool (`spool`)
- `weight` - Current spool weight in grams
- `wireLength` - Remaining wire length in mm
- `diameter` - Wire diameter in mm
- `remaining` - Percentage of wire remaining (0-100%)
- `feeding` - Boolean: true if wire is currently being fed

### Flux (`flux`)
- `percentage` - Flux remaining percentage (0-100%)
- `ml` - Flux remaining in milliliters

### Fans (`fans`)
- `machine` - Boolean: machine fan state
- `tip` - Boolean: tip cooling fan state

### Fume Extractor (`fume`)
- `enabled` - Boolean: fume extractor on/off
- `speed` - Speed setting (0-100%)

### Flux Mist (`fluxMist`)
- `enabled` - Boolean: flux mist enabled/disabled
- `dispensing` - Boolean: currently dispensing flux
- `flowRate` - Flow rate setting (0-100%)

### Air Breeze (`airBreeze`)
- `enabled` - Boolean: air breeze enabled/disabled
- `active` - Boolean: currently active
- `intensity` - Intensity setting (0-100%)

### Air Jet Pressure (`airJet`)
- `enabled` - Boolean: air jet enabled/disabled
- `active` - Boolean: currently active
- `pressure` - Pressure setting (0-100%)

### Sequence (`seq`)
- `stage` - Current stage: "idle", "lowerZ", "dispense", "cleanTip", "retract", etc.
- `active` - Boolean: sequence is running
- `pad` - Current pad number in sequence
- `total` - Total number of pads
- `progress` - Progress percentage (0-100%)
- `error` - Error message (null if no error)

### Component Height (`height`)
- Maximum component height from PCB in mm

## Command Processing

The sketch can receive JSON commands from the Electron app:

### Move Command
```json
{"command":"move","z":5}
```
Moves machine Z-axis to specified position (X and Y are ignored - PCB moved manually).

### Temperature Command
```json
{"command":"temp","target":345}
```
Sets target temperature.

### Heater Command
```json
{"command":"heater","enable":true}
```
Enables/disables heater.

### Wire Feed Command
```json
{"command":"feed","length":10.5}
```
Feeds wire for specified length (mm).

### Jog Command
```json
{"command":"jog","axis":"z","distance":5.0}
```
Moves Z-axis by distance (only Z-axis is supported - single-axis machine).

### Fan Command
```json
{"command":"fan","machine":true,"tip":false}
```
Controls machine and tip fans.

### Component Control Commands
```json
{"command":"fume","enabled":true,"speed":80}
{"command":"fluxmist","enabled":true,"flowRate":50}
{"command":"airbreeze","enabled":true,"intensity":60}
{"command":"airjet","enabled":true,"pressure":80}
```

## Configuration

### Serial Communication
- **Baud Rate**: 115200 (must match app settings)
- **Update Interval**: 100ms (sends data 10 times per second)

### Z-Axis Range
- **Z Axis**: Typically 0.0mm to 20.0mm (for clearance and soldering)
- **X/Y Axes**: Not applicable (PCB moved manually)

## Customization

### Replace Mock Data with Real Sensors

1. **Position Sensors** (Encoders, Limit Switches)
   ```cpp
   zPosition = readEncoderPosition(Z_ENCODER_PIN);  // Only Z-axis (single-axis machine)
   ```

2. **Temperature Sensor** (Thermocouple)
   ```cpp
   currentTemperature = readThermocouple(THERMOCOUPLE_PIN);
   ```

3. **Weight Sensor** (Load Cell for Spool)
   ```cpp
   spoolWeight = readLoadCell(LOAD_CELL_PIN);
   ```

4. **Wire Break Detection**
   ```cpp
   wireBreakDetected = digitalRead(WIRE_BREAK_SENSOR_PIN) == LOW;
   attachInterrupt(digitalPinToInterrupt(WIRE_BREAK_SENSOR_PIN), handleWireBreak, CHANGE);
   ```

### Implement Motor Control

Replace TODO comments in `processCommands()` with actual stepper motor control:

```cpp
// Example for stepper motor movement
if (cmd == "move") {
  moveStepperX(xPosition);
  moveStepperY(yPosition);
  moveStepperZ(zPosition);
}
```

## Testing

1. **Upload sketch to Arduino**
2. **Open Serial Monitor** (Arduino IDE) to see JSON output
3. **Connect to Electron app** - select Arduino port in app
4. **Verify data reception** - app should show live data updates

## Troubleshooting

### No Data Received
- Check baud rate matches (115200)
- Verify port is correct
- Check Serial Monitor - should see JSON output
- Ensure Arduino is sending newline after JSON (`Serial.println()`)

### Z Position Range
- Code clamps Z position to reasonable range (0-20mm)
- Adjust Z-axis range constants if needed

### JSON Parse Errors
- Ensure ArduinoJson library is installed
- Verify JSON format is correct
- Check Serial Monitor for actual output format

### Connection Issues
- See `ARDUINO_UPLOAD_GUIDE.md` for upload issues
- Ensure no other programs are using the serial port
- Try different USB cable/port

## Hardware Connections (TODO)

When implementing real hardware, connect:

- **Stepper Motors**: X, Y, Z axis motors
- **Heater**: Soldering tip heater with temperature sensor
- **Wire Feed Motor**: Stepper or servo for wire feeding
- **Load Cell**: For spool weight measurement
- **Encoders**: For position feedback
- **Sensors**: Wire break, limit switches, etc.
- **Actuators**: Fans, fume extractor, flux mist pump, air valves

## Next Steps

1. ✅ Upload sketch to Arduino
2. ✅ Connect Arduino to Electron app
3. ✅ Verify data is being received
4. 🔄 Replace mock data with real sensor readings
5. 🔄 Implement motor control commands
6. 🔄 Add safety features (emergency stop, limit switches)
7. 🔄 Test with actual machine hardware

## Notes

- **Simulation Mode**: Current code uses mock/simulated data
- **Bed Boundaries**: Always enforced for X and Y axes
- **Command Processing**: Basic structure provided, implement motor control as needed
- **JSON Size**: Adjust `StaticJsonDocument<1024>` size if adding more fields

## Example JSON Output

When the sketch runs, you'll see JSON output like this in Serial Monitor:

```json
{"pos":{"z":3.2,"moving":false},"temp":{"target":345.0,"current":25.0,"heater":false},"wire":{"status":"idle","feedRate":8.0,"break":false},"spool":{"weight":500.0,"wireLength":10000.0,"diameter":0.5,"remaining":100.0,"feeding":false},"flux":{"percentage":82.0,"ml":68.0},"fans":{"machine":false,"tip":false},"fume":{"enabled":false,"speed":80.0},"fluxMist":{"enabled":false,"dispensing":false,"flowRate":50.0},"airBreeze":{"enabled":false,"active":false,"intensity":60.0},"airJet":{"enabled":false,"active":false,"pressure":80.0},"seq":{"stage":"idle","active":false,"pad":0,"total":0,"progress":0.0,"error":null},"height":4.75}
```

Each line is a complete JSON object followed by a newline.

## Serial Monitor Testing

To test the sketch:

1. **Open Serial Monitor** in Arduino IDE
2. **Set baud rate to 115200**
3. **You should see:**
   ```
   Arduino Mega 2560 - Single Axis Soldering Machine Ready
   Machine Type: Single-Axis (Z-axis only)
   PCB is moved manually by operator
   Starting Z Position: 3.20mm
   ```
4. **Then continuous JSON data** every 100ms

## Implementation Checklist

- [x] JSON data format matches app expectations
- [x] Single-axis machine: Only Z-axis position sent
- [x] Z position clamping in sensor simulation
- [x] Command processing structure (ready for hardware)
- [ ] Replace mock data with real sensor readings
- [ ] Implement stepper motor control
- [ ] Implement heater control
- [ ] Implement wire feed control
- [ ] Implement fan control
- [ ] Implement component controls (flux mist, air breeze, etc.)
- [ ] Add safety features (emergency stop, limit switches)

## Support

For issues with:
- **Upload problems**: See `../ARDUINO_UPLOAD_GUIDE.md`
- **Integration issues**: See `../ARDUINO_INTEGRATION.md`
- **JSON format**: Check `ArduinoDataHandler.js` in app code

## Code Structure

- **`setup()`**: Initializes serial communication and prints startup message
- **`loop()`**: Main loop - reads sensors, sends data, processes commands
- **`readSensors()`**: Reads sensor values (currently simulated)
- **`sendMachineState()`**: Creates JSON and sends via Serial
- **`processCommands()`**: Parses and executes commands from app

## Key Features

✅ **Single-Axis Design**: Only Z-axis movement (up/down) for solder paste application
✅ **Manual PCB Positioning**: PCB is moved manually by operator (no X/Y control needed)
✅ **JSON Validation**: Only sends valid Arduino data format
✅ **Command Ready**: Structure in place for receiving app commands
✅ **Temperature Simulation**: Realistic heating/cooling simulation
✅ **Movement Simulation**: Simulates movement completion

