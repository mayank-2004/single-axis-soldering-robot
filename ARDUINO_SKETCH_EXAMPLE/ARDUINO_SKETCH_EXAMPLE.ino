 /*
 * Arduino Mega 2560 Sketch for Single Axis Soldering Machine
 * Sends machine state data as JSON to Electron/Nextron app
 * 
 * Machine Specifications:
 * - Single-Axis Machine: Only Z-axis (up/down) movement
 * - Z Axis: Up-Down head movement for applying solder paste on PCB pads
 * - PCB is moved manually by operator (no X/Y axis control)
 * 
 * Install ArduinoJson library: Tools -> Manage Libraries -> Search "ArduinoJson" -> Install
 */

#include <ArduinoJson.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 100; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
// Single-axis machine: Only Z-axis position is tracked
float zPosition = 3.2;  // Z-axis position in mm (up/down)
bool isMoving = false;

float targetTemperature = 345.0;
float currentTemperature = 25.0;
bool heaterEnabled = false;

String wireFeedStatus = "idle";
float wireFeedRate = 8.0;
bool wireBreakDetected = false;

float spoolWeight = 500.0;
float wireLength = 10000.0;
float wireDiameter = 0.5;
float remainingPercentage = 100.0;
bool isWireFeeding = false;

float fluxPercentage = 82.0;
float fluxMl = 68.0;

bool fanMachine = false;
bool fanTip = false;

bool fumeExtractorEnabled = false;
float fumeExtractorSpeed = 80.0;

bool fluxMistEnabled = false;
bool fluxMistDispensing = false;
float fluxMistFlowRate = 50.0;

bool airBreezeEnabled = false;
bool airBreezeActive = false;
float airBreezeIntensity = 60.0;

bool airJetEnabled = false;
bool airJetActive = false;
float airJetPressure = 80.0;

String sequenceStage = "idle";
bool sequenceActive = false;
int currentPad = 0;
int totalPads = 0;
float sequenceProgress = 0.0;
String sequenceError = "";  // Empty string means no error (will send null in JSON)

float componentHeight = 4.75;

void setup() {
  Serial.begin(BAUD_RATE);
  
  // Note: Arduino Mega 2560 doesn't need "while (!Serial)" wait
  // It will work even if no USB connection is present
  // Only use this wait if you need USB connection for debugging
  
  // Initialize your sensors, motors, actuators here
  // Example:
  // pinMode(STEPPER_Z_STEP, OUTPUT);  // Only Z-axis stepper
  // pinMode(STEPPER_Z_DIR, OUTPUT);
  // pinMode(HEATER_PIN, OUTPUT);
  // pinMode(WIRE_FEED_STEPPER_STEP, OUTPUT);
  // pinMode(WIRE_FEED_STEPPER_DIR, OUTPUT);
  // attachInterrupt(digitalPinToInterrupt(WIRE_BREAK_SENSOR), handleWireBreak, CHANGE);
  
  delay(1000); // Give time for serial connection to stabilize
  
  Serial.println("Arduino Mega 2560 - Single Axis Soldering Machine Ready");
  Serial.println("Machine Type: Single-Axis (Z-axis only)");
  Serial.println("PCB is moved manually by operator");
  Serial.print("Starting Z Position: ");
  Serial.print(zPosition);
  Serial.println("mm");
}

void loop() {
  // Read sensors and update values
  readSensors();
  
  // Send JSON data to Electron app
  sendMachineState();
  
  // Process incoming commands from app
  processCommands();
  
  delay(UPDATE_INTERVAL);
}

void readSensors() {
  // TODO: Replace with actual sensor readings
  
  // Example sensor reading functions:
  // zPosition = readEncoderPosition(Z_ENCODER);  // Only Z-axis (single-axis machine)
  // currentTemperature = readThermocouple(THERMOCOUPLE_PIN);
  // spoolWeight = readLoadCell(LOAD_CELL_PIN);
  // wireBreakDetected = digitalRead(WIRE_BREAK_SENSOR) == LOW;
  
  // Simulate sensor reading (remove in production)
  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate > 1000) {
    // Simulate small Z-axis changes for testing
    zPosition += random(-5, 5) / 100.0;
    // Clamp Z position to reasonable range (0-20mm)
    zPosition = constrain(zPosition, 0.0, 20.0);
    
    // Simulate temperature rising/cooling
    if (heaterEnabled && currentTemperature < targetTemperature) {
      currentTemperature += 1.0;  // Heat up at 1°C per second
      if (currentTemperature > targetTemperature) {
        currentTemperature = targetTemperature;  // Don't overshoot
      }
    } else if (!heaterEnabled && currentTemperature > 25.0) {
      currentTemperature -= 0.5;  // Cool down at 0.5°C per second
      if (currentTemperature < 25.0) {
        currentTemperature = 25.0;  // Room temperature minimum
      }
    }
    
    // Simulate movement completing
    if (isMoving) {
      static unsigned long movementStartTime = 0;
      if (movementStartTime == 0) {
        movementStartTime = millis();
      }
      // Simulate movement takes 500ms
      if (millis() - movementStartTime > 500) {
        isMoving = false;
        movementStartTime = 0;
      }
    }
    
    // Simulate wire feeding completing
    if (isWireFeeding) {
      static unsigned long feedStartTime = 0;
      if (feedStartTime == 0) {
        feedStartTime = millis();
      }
      // Simulate wire feed takes 2 seconds
      if (millis() - feedStartTime > 2000) {
        isWireFeeding = false;
        wireFeedStatus = "idle";
        feedStartTime = 0;
      }
    }
    
    lastSensorUpdate = millis();
  }
}

void sendMachineState() {
  // Create JSON document (adjust size based on your data)
  StaticJsonDocument<1024> doc;
  
  // Position data (single-axis machine: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
  // Single-axis machine: only Z position is sent
  // X and Y are not controlled (PCB moved manually)
  pos["z"] = zPosition;
  pos["moving"] = isMoving;
  
  // Temperature data
  JsonObject temp = doc.createNestedObject("temp");
  temp["target"] = targetTemperature;
  temp["current"] = currentTemperature;
  temp["heater"] = heaterEnabled;
  
  // Wire feed data
  JsonObject wire = doc.createNestedObject("wire");
  wire["status"] = wireFeedStatus;
  wire["feedRate"] = wireFeedRate;
  wire["break"] = wireBreakDetected;
  
  // Spool data
  JsonObject spool = doc.createNestedObject("spool");
  spool["weight"] = spoolWeight;
  spool["wireLength"] = wireLength;
  spool["diameter"] = wireDiameter;
  spool["remaining"] = remainingPercentage;
  spool["feeding"] = isWireFeeding;
  
  // Flux data
  JsonObject flux = doc.createNestedObject("flux");
  flux["percentage"] = fluxPercentage;
  flux["ml"] = fluxMl;
  
  // Fan states
  JsonObject fans = doc.createNestedObject("fans");
  fans["machine"] = fanMachine;
  fans["tip"] = fanTip;
  
  // Fume extractor
  JsonObject fume = doc.createNestedObject("fume");
  fume["enabled"] = fumeExtractorEnabled;
  fume["speed"] = fumeExtractorSpeed;
  
  // Flux mist
  JsonObject fluxMist = doc.createNestedObject("fluxMist");
  fluxMist["enabled"] = fluxMistEnabled;
  fluxMist["dispensing"] = fluxMistDispensing;
  fluxMist["flowRate"] = fluxMistFlowRate;
  
  // Air breeze
  JsonObject airBreeze = doc.createNestedObject("airBreeze");
  airBreeze["enabled"] = airBreezeEnabled;
  airBreeze["active"] = airBreezeActive;
  airBreeze["intensity"] = airBreezeIntensity;
  
  // Air jet pressure
  JsonObject airJet = doc.createNestedObject("airJet");
  airJet["enabled"] = airJetEnabled;
  airJet["active"] = airJetActive;
  airJet["pressure"] = airJetPressure;
  
  // Sequence data
  JsonObject seq = doc.createNestedObject("seq");
  seq["stage"] = sequenceStage;
  seq["active"] = sequenceActive;
  seq["pad"] = currentPad;
  seq["total"] = totalPads;
  seq["progress"] = sequenceProgress;
  // Send null if no error, otherwise send error message
  if (sequenceError.length() > 0) {
    seq["error"] = sequenceError;
  } else {
    seq["error"] = nullptr;  // Send null for no error (JSON null)
  }
  
  // Component height
  doc["height"] = componentHeight;
  
  // Serialize JSON and send via Serial
  serializeJson(doc, Serial);
  Serial.println(); // Important: Send newline after JSON
}

void processCommands() {
  // Process incoming commands from Electron app
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    // Skip if empty
    if (command.length() == 0) {
      return;
    }
    
    // TODO: Parse and execute commands from app
    // Expected command formats:
    // 1. JSON format: {"command":"move","x":120,"y":45,"z":5}
    // 2. Simple format: "MOVE X:120 Y:45 Z:5"
    // 3. Temperature: "TEMP:345" or {"command":"temp","target":345}
    // 4. Heater: "HEATER:1" or {"command":"heater","enable":true}
    // 5. Wire feed: {"command":"feed","length":10.5}
    // 6. Enable/Disable components: {"command":"fan","machine":true}
    
    // Parse JSON commands
    if (command.startsWith("{")) {
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, command);
      
      if (!error) {
        String cmd = cmdDoc["command"] | "";
        
        if (cmd == "move") {
          // Move to position (single-axis: only Z movement)
          float z = cmdDoc["z"] | zPosition;
          
          // Only update Z position (X and Y are ignored - PCB moved manually)
          zPosition = z;
          isMoving = true;
          
          // TODO: Send Z-axis move command to stepper motor
        }
        else if (cmd == "temp" || cmd == "temperature") {
          targetTemperature = cmdDoc["target"] | targetTemperature;
          // TODO: Update heater target temperature
        }
        else if (cmd == "heater") {
          heaterEnabled = cmdDoc["enable"] | heaterEnabled;
          // TODO: Enable/disable heater
        }
        else if (cmd == "feed" || cmd == "wirefeed") {
          float length = cmdDoc["length"] | 0;
          wireFeedStatus = "feeding";
          isWireFeeding = true;
          // TODO: Start wire feed for specified length
        }
        else if (cmd == "fan") {
          fanMachine = cmdDoc["machine"] | fanMachine;
          fanTip = cmdDoc["tip"] | fanTip;
          // TODO: Control fans
        }
        else if (cmd == "fume") {
          fumeExtractorEnabled = cmdDoc["enabled"] | fumeExtractorEnabled;
          fumeExtractorSpeed = cmdDoc["speed"] | fumeExtractorSpeed;
          // TODO: Control fume extractor
        }
        else if (cmd == "fluxmist") {
          fluxMistEnabled = cmdDoc["enabled"] | fluxMistEnabled;
          fluxMistFlowRate = cmdDoc["flowRate"] | fluxMistFlowRate;
          if (cmdDoc["dispense"]) {
            fluxMistDispensing = true;
            // TODO: Start flux mist dispensing
          }
        }
        else if (cmd == "airbreeze") {
          airBreezeEnabled = cmdDoc["enabled"] | airBreezeEnabled;
          airBreezeIntensity = cmdDoc["intensity"] | airBreezeIntensity;
          if (cmdDoc["activate"]) {
            airBreezeActive = true;
            // TODO: Activate air breeze
          }
        }
        else if (cmd == "airjet") {
          airJetEnabled = cmdDoc["enabled"] | airJetEnabled;
          airJetPressure = cmdDoc["pressure"] | airJetPressure;
          if (cmdDoc["activate"]) {
            airJetActive = true;
            // TODO: Activate air jet
          }
        }
        else if (cmd == "jog") {
          // Manual movement commands (single-axis: only Z-axis)
          String axis = cmdDoc["axis"] | "";
          float distance = cmdDoc["distance"] | 0;
          
          // Single-axis machine: only Z-axis movement is supported
          if (axis == "z" || axis == "Z") {
            zPosition += distance;
            // Clamp Z position to reasonable range (0-20mm)
            zPosition = constrain(zPosition, 0.0, 20.0);
            isMoving = true;
            // TODO: Send Z-axis jog command to stepper motor
          } else {
            // X and Y axes are not supported (PCB moved manually)
            // Ignore the command
          }
        }
      }
    }
    // For simple text commands (future implementation)
    // else if (command.startsWith("MOVE")) { ... }
    // else if (command.startsWith("TEMP:")) { ... }
    
    // Debug: echo received command (comment out in production)
    // Serial.print("Received: ");
    // Serial.println(command);
  }
}

// Helper functions for sensor reading (implement based on your hardware)
/*
float readEncoderPosition(int encoderPin) {
  // Read encoder position
  return 0.0;
}

float readThermocouple(int pin) {
  // Read thermocouple temperature
  // Example with MAX6675 or similar
  return 25.0;
}

float readLoadCell(int pin) {
  // Read load cell weight (HX711 or similar)
  return 0.0;
}

void handleWireBreak() {
  // Interrupt handler for wire break detection
  wireBreakDetected = true;
}
*/


