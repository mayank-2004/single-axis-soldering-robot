#include <ArduinoJson.h>
#include <math.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 100; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
// Single-axis machine: Only Z-axis position is tracked
float zPosition = 0.0;  // Z-axis position in mm - starts at home (0.00mm at top limit switch)
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

float componentHeight = 5;

// -------------------------------
// Z-Axis stepper configuration
// -------------------------------
const int STEPPER_Z_STEP_PIN = 48;
const int STEPPER_Z_DIR_PIN = 46;
// Enable pin is not used in this configuration

const int LIMIT_SWITCH_Z_MIN_PIN = 2;
const int LIMIT_SWITCH_Z_MAX_PIN = 3;

// Position system: Home is at 0.00mm (Z_MAX limit switch at top)
// Moving down = negative values (e.g., -3.20mm)
// Moving up = increases towards 0 (cannot exceed 0.00mm)
const float Z_MAX_POSITION = 40.0f;  // mm - Maximum travel distance from home (downward)
const float Z_HOME_POSITION = 0.0f;  // mm - Home position (at Z_MAX limit switch)
const int Z_STEPS_PER_MM = 200;      // Adjust to your mechanics (lead screw pitch / micro-stepping)
const unsigned int Z_STEP_DELAY_US = 600; // Pulse width for stepper (microseconds)

// -------------------------------
// Wire Feed stepper configuration
// -------------------------------
const int WIRE_FEED_STEP_PIN = 9;
const int WIRE_FEED_DIR_PIN = 8;
// Enable pin is not used in this configuration

const int WIRE_FEED_STEPS_PER_MM = 200;      // Adjust to your wire feed mechanics
const unsigned int WIRE_FEED_STEP_DELAY_US = 500; // Pulse width for wire feed stepper (microseconds)

// -------------------------------
// Button and Paddle configuration
// -------------------------------
const int BUTTON_UP_PIN = 39;
const int BUTTON_DOWN_PIN = 37;
const int BUTTON_SAVE_PIN = 35;
const int PADDLE_PIN = 34;

// -------------------------------
// Sensor pin configuration
// -------------------------------
// TODO: Update these pin numbers to match your actual hardware wiring
const int Z_ENCODER_PIN = A0;           // Z-axis encoder/position sensor (analog or digital)
const int THERMOCOUPLE_CS_PIN = 10;     // MAX6675 thermocouple CS pin (or similar)
const int THERMOCOUPLE_SCK_PIN = 13;    // MAX6675 thermocouple SCK pin
const int THERMOCOUPLE_SO_PIN = 12;     // MAX6675 thermocouple SO pin
const int LOAD_CELL_DT_PIN = A1;        // HX711 load cell DT pin (or similar)
const int LOAD_CELL_SCK_PIN = A2;       // HX711 load cell SCK pin
const int WIRE_BREAK_SENSOR_PIN = 4;    // Wire break detection sensor (digital)
const int HEATER_PIN = 5;               // Heater control pin (PWM)

// Sensor reading flags
bool useRealSensors = true;  // Set to false to use simulation mode

// Button debouncing and continuous movement
const unsigned long BUTTON_DEBOUNCE_MS = 50;
const unsigned long BUTTON_REPEAT_DELAY_MS = 100; // Delay between movements when button held
unsigned long lastButtonUpPress = 0;
unsigned long lastButtonDownPress = 0;
unsigned long lastButtonSavePress = 0;
unsigned long lastPaddlePress = 0;
unsigned long lastButtonUpRepeat = 0;
unsigned long lastButtonDownRepeat = 0;
bool lastButtonUpState = HIGH;
bool lastButtonDownState = HIGH;
bool lastButtonSaveState = HIGH;
bool lastPaddleState = HIGH;

// Movement recording and playback
float savedMovementDistance = 0.0f;  // Saved movement distance from home position
bool hasSavedMovement = false;
float homePosition = 0.0f;  // Home position is 0.00mm (at Z_MAX limit switch)
bool isExecutingSavedMovement = false;

// Forward declarations for motion helpers
void moveZAxisByDistance(float distanceMm);
void moveZAxisTo(float targetMm);
void homeZAxis();
void feedWireByLength(float lengthMm);
void handleButtonControls();
void saveMovementSequence();
void executeSavedMovement();

// Forward declarations for sensor reading
float readEncoderPosition(int encoderPin);
float readThermocouple(int csPin, int sckPin, int soPin);
float readLoadCell(int dtPin, int sckPin);
void handleWireBreak();


void setup() {
  Serial.begin(BAUD_RATE);
  
  // Initialize sensors, motors, actuators here
  // Z-axis stepper motor pins
  pinMode(STEPPER_Z_STEP_PIN, OUTPUT);
  pinMode(STEPPER_Z_DIR_PIN, OUTPUT);
  pinMode(LIMIT_SWITCH_Z_MIN_PIN, INPUT_PULLUP);
  pinMode(LIMIT_SWITCH_Z_MAX_PIN, INPUT_PULLUP);

  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  digitalWrite(STEPPER_Z_DIR_PIN, LOW);

  // Wire feed stepper motor pins
  pinMode(WIRE_FEED_STEP_PIN, OUTPUT);
  pinMode(WIRE_FEED_DIR_PIN, OUTPUT);

  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  digitalWrite(WIRE_FEED_DIR_PIN, LOW);

  // Button and paddle pins (INPUT_PULLUP - buttons connect to ground when pressed)
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);
  pinMode(BUTTON_SAVE_PIN, INPUT_PULLUP);
  pinMode(PADDLE_PIN, INPUT_PULLUP);

  // Initialize button states
  lastButtonUpState = digitalRead(BUTTON_UP_PIN);
  lastButtonDownState = digitalRead(BUTTON_DOWN_PIN);
  lastButtonSaveState = digitalRead(BUTTON_SAVE_PIN);
  lastPaddleState = digitalRead(PADDLE_PIN);

  // Sensor pins initialization
  if (useRealSensors) {
    // Z-axis encoder (if using analog encoder)
    pinMode(Z_ENCODER_PIN, INPUT);
    
    // Thermocouple pins (MAX6675)
    pinMode(THERMOCOUPLE_CS_PIN, OUTPUT);
    pinMode(THERMOCOUPLE_SCK_PIN, OUTPUT);
    pinMode(THERMOCOUPLE_SO_PIN, INPUT);
    digitalWrite(THERMOCOUPLE_CS_PIN, HIGH);
    
    // Load cell pins (HX711)
    pinMode(LOAD_CELL_DT_PIN, INPUT);
    pinMode(LOAD_CELL_SCK_PIN, OUTPUT);
    
    // Wire break sensor
    pinMode(WIRE_BREAK_SENSOR_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(WIRE_BREAK_SENSOR_PIN), handleWireBreak, CHANGE);
    
    // Heater control
    pinMode(HEATER_PIN, OUTPUT);
    digitalWrite(HEATER_PIN, LOW);
  }
  
  delay(1000); // Give time for serial connection to stabilize
  
  Serial.println("Arduino Mega 2560 - Single Axis Soldering Machine Ready");
  Serial.println("Machine Type: Single-Axis (Z-axis only)");
  Serial.println("PCB is moved manually by operator");
  Serial.println("Home position: 0.00mm (at Z_MAX limit switch - top)");
  Serial.print("Starting Z Position: ");
  Serial.print(zPosition);
  Serial.println("mm");
}

void loop() {
  // Handle button controls (up, down, save, paddle)
  handleButtonControls();
  
  // Read sensors and update values
  readSensors();
  
  // Send JSON data to Electron app
  sendMachineState();
  
  // Process incoming commands from app
  processCommands();
  
  delay(UPDATE_INTERVAL);
}

void readSensors() {  
  if (useRealSensors) {
    // Read actual sensor values from hardware
    
    // Z-axis position: Already updated by movement functions (moveZAxisByDistance, homeZAxis)
    // If you have an encoder, uncomment the line below and comment out position tracking in movement functions
    // zPosition = readEncoderPosition(Z_ENCODER_PIN);
    
    // Ensure Z position doesn't exceed home (0.00mm)
    if (zPosition > 0.0) {
      zPosition = 0.0;  // Clamp to home position
    }
    
    // Read temperature from thermocouple
    currentTemperature = readThermocouple(THERMOCOUPLE_CS_PIN, THERMOCOUPLE_SCK_PIN, THERMOCOUPLE_SO_PIN);
    
    // Read spool weight from load cell
    spoolWeight = readLoadCell(LOAD_CELL_DT_PIN, LOAD_CELL_SCK_PIN);
    
    // Read wire break sensor (interrupt-driven, but also check here as backup)
    wireBreakDetected = digitalRead(WIRE_BREAK_SENSOR_PIN) == LOW;
    
    // Control heater based on target temperature
    if (heaterEnabled && currentTemperature < targetTemperature) {
      // Heat up - use PWM to control heating rate
      analogWrite(HEATER_PIN, 255);  // Full power (adjust as needed)
    } else if (!heaterEnabled || currentTemperature >= targetTemperature) {
      // Turn off heater
      analogWrite(HEATER_PIN, 0);
    }
    
    // Update wire length and remaining percentage based on spool weight
    // Assuming wire density and spool empty weight (adjust these values)
    const float WIRE_DENSITY_G_PER_MM = 0.001;  // grams per mm (adjust based on wire type)
    const float EMPTY_SPOOL_WEIGHT = 100.0;  // grams (adjust based on your spool)
    float wireWeight = spoolWeight - EMPTY_SPOOL_WEIGHT;
    if (wireWeight > 0) {
      wireLength = wireWeight / WIRE_DENSITY_G_PER_MM;
      remainingPercentage = (wireLength / 10000.0) * 100.0;  // Assuming 10000mm is full spool
      if (remainingPercentage > 100.0) remainingPercentage = 100.0;
      if (remainingPercentage < 0.0) remainingPercentage = 0.0;
    } else {
      wireLength = 0.0;
      remainingPercentage = 0.0;
    }
    
    // Movement status is managed by movement functions (isMoving flag)
    // Wire feeding status is managed by feedWireByLength function
    
  } else {
    // Simulation mode (fallback if sensors are not connected)
  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate > 1000) {
      // Clamp Z position: cannot go above 0.00mm (home), can go negative (downward)
      if (zPosition > 0.0) {
        zPosition = 0.0;  // Clamp to home position
      }
    
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
}

void sendMachineState() {
  // Create JSON document (adjust size based on your data)
  StaticJsonDocument<1024> doc;
  
  // Position data (single-axis machine: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
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
    
    // Expected command formats:
    // 1. JSON format: {"command":"move","x":120,"y":45,"z":5}
    // 2. Temperature: "TEMP:345" or {"command":"temp","target":345}
    
    // Parse JSON commands
    if (command.startsWith("{")) {
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, command);
      
      if (error) {
        Serial.print("[CMD] JSON Parse Error: ");
        Serial.println(error.c_str());
        return;
      }
      
      // JSON parsed successfully
      String cmd = cmdDoc["command"] | "";
      Serial.print("[CMD] Parsed command: ");
      Serial.println(cmd);
        
        if (cmd == "move") {
          // Move to absolute position (single-axis: only Z movement)
          float z = cmdDoc["z"] | zPosition;
          Serial.print("[CMD] Executing move command: z=");
          Serial.println(z);
          moveZAxisTo(z);
        }
        else if (cmd == "temp" || cmd == "temperature") {
          targetTemperature = cmdDoc["target"] | targetTemperature;
          Serial.print("[CMD] Set target temperature: ");
          Serial.println(targetTemperature);
          // TODO: Update heater target temperature
        }
        else if (cmd == "heater") {
          heaterEnabled = cmdDoc["enable"] | heaterEnabled;
          Serial.print("[CMD] Heater ");
          Serial.println(heaterEnabled ? "ENABLED" : "DISABLED");
          // TODO: Enable/disable heater
        }
        else if (cmd == "feed" || cmd == "wirefeed") {
          float length = cmdDoc["length"] | 0;
          if (length > 0) {
            wireFeedStatus = "feeding";
            isWireFeeding = true;
            feedWireByLength(length);
            // After feeding, update status
            wireFeedStatus = "idle";
            isWireFeeding = false;
          }
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
          
          Serial.print("[CMD] Jog command: axis=");
          Serial.print(axis);
          Serial.print(", distance=");
          Serial.println(distance);
          
          // Single-axis machine: only Z-axis movement is supported
          if (axis == "z" || axis == "Z") {
            moveZAxisByDistance(distance);
          } else {
            // X and Y axes are not supported (PCB moved manually)
            Serial.println("[CMD] WARNING: X/Y axis not supported (single-axis machine)");
            // Ignore the command
          }
        }
        else if (cmd == "home") {
          Serial.println("[CMD] Executing home command");
          homeZAxis();
        }
        else if (cmd == "save") {
          // Save movement sequence from home position to current position
          Serial.println("[CMD] Executing save command");
          saveMovementSequence();
        }
        else {
          Serial.print("[CMD] WARNING: Unknown command: ");
          Serial.println(cmd);
        }
    }
    // For simple text commands (future implementation)
    // else if (command.startsWith("MOVE")) { ... }
    // else if (command.startsWith("TEMP:")) { ... }
    
    // Debug: echo received command (ENABLED FOR TESTING)
    Serial.print("[CMD] Received: ");
    Serial.println(command);
  }
}

// ----------------------------------
// Sensor reading helper functions
// ----------------------------------

/**
 * Read Z-axis encoder position
 * Adjust this function based on your encoder type (incremental, absolute, analog, etc.)
 */
float readEncoderPosition(int encoderPin) {
  // Example for analog encoder (potentiometer or analog encoder)
  // Returns position in mm
  int rawValue = analogRead(encoderPin);
  
  // Convert analog reading (0-1023) to position in mm
  // Adjust these values based on your encoder's range and mechanics
  const float ENCODER_MIN_RAW = 0.0;
  const float ENCODER_MAX_RAW = 1023.0;
  const float ENCODER_MIN_POSITION = -40.0;  // mm (maximum downward travel)
  const float ENCODER_MAX_POSITION = 0.0;    // mm (home position)
  
  // Linear interpolation
  float normalized = (rawValue - ENCODER_MIN_RAW) / (ENCODER_MAX_RAW - ENCODER_MIN_RAW);
  float position = ENCODER_MIN_POSITION + normalized * (ENCODER_MAX_POSITION - ENCODER_MIN_POSITION);
  
  // Clamp to valid range
  if (position > ENCODER_MAX_POSITION) position = ENCODER_MAX_POSITION;
  if (position < ENCODER_MIN_POSITION) position = ENCODER_MIN_POSITION;
  
  return position;
  
  // Alternative: For digital/incremental encoder, use interrupt-based counting
  // static volatile long encoderCount = 0;
  // Return encoderCount / (float)Z_STEPS_PER_MM;
}

/**
 * Read temperature from MAX6675 thermocouple amplifier
 * Returns temperature in Celsius
 */
float readThermocouple(int csPin, int sckPin, int soPin) {
  // MAX6675 communication protocol
  uint16_t value = 0;
  
  // Pull CS low to start communication
  digitalWrite(csPin, LOW);
  delayMicroseconds(10);
  
  // Read 16 bits from MAX6675
  for (int i = 15; i >= 0; i--) {
    digitalWrite(sckPin, LOW);
    delayMicroseconds(1);
    if (digitalRead(soPin)) {
      value |= (1 << i);
    }
    digitalWrite(sckPin, HIGH);
    delayMicroseconds(1);
  }
  
  // Pull CS high to end communication
  digitalWrite(csPin, HIGH);
  
  // Check for thermocouple connection error (bit D2)
  if (value & 0x04) {
    // Thermocouple disconnected or error
    return -1.0;  // Error value
  }
  
  // Extract temperature (bits D14-D3)
  value = value >> 3;
  float temperature = value * 0.25;  // MAX6675 resolution is 0.25°C
  
  return temperature;
}

/**
 * Read weight from HX711 load cell amplifier
 * Returns weight in grams
 * Note: This is a simplified implementation. For production, use a proper HX711 library
 */
float readLoadCell(int dtPin, int sckPin) {
  // HX711 communication protocol
  // Wait for data ready (DT goes LOW when data is ready)
  unsigned long timeout = millis() + 100;
  while (digitalRead(dtPin) == HIGH) {
    if (millis() > timeout) {
      return 0.0;  // Timeout - sensor not responding
    }
  }
  
  // Read 24-bit value from HX711
  long value = 0;
  for (int i = 0; i < 24; i++) {
    digitalWrite(sckPin, HIGH);
    delayMicroseconds(1);
    value = value << 1;
    if (digitalRead(dtPin)) {
      value++;
    }
    digitalWrite(sckPin, LOW);
    delayMicroseconds(1);
  }
  
  // Set gain for next reading (channel A, gain 128)
  digitalWrite(sckPin, HIGH);
  delayMicroseconds(1);
  digitalWrite(sckPin, LOW);
  delayMicroseconds(1);
  
  // Convert to signed value (24-bit two's complement)
  if (value & 0x800000) {
    value |= 0xFF000000;  // Sign extend
  }
  
  // Calibrate: Adjust these values based on your load cell calibration
  // offset = tare weight reading
  // scale = known weight / (reading - offset)
  const long OFFSET = 0;  // Tare offset (adjust after calibration)
  const float SCALE = 1.0;  // Scale factor (adjust after calibration with known weight)
  
  float weight = (value - OFFSET) / SCALE;
  
  // Ensure non-negative weight
  if (weight < 0) weight = 0;
  
  return weight;
  
  // Note: For production, implement proper calibration routine
  // and use a dedicated HX711 library for better accuracy
}

/**
 * Interrupt handler for wire break detection
 * Called when wire break sensor state changes
 */
void handleWireBreak() {
  // Check sensor state
  if (digitalRead(WIRE_BREAK_SENSOR_PIN) == LOW) {
  wireBreakDetected = true;
    // Optional: Stop wire feeding immediately
    if (isWireFeeding) {
      isWireFeeding = false;
      wireFeedStatus = "error";
}
  } else {
    wireBreakDetected = false;
  }
}

// ----------------------------------
// Z-axis motion helper functions
// ----------------------------------

bool isLimitSwitchTriggered(int pin) {
  // Limit switches use INPUT_PULLUP, so LOW = triggered
  return digitalRead(pin) == LOW;
}

void pulseZStep() {
  digitalWrite(STEPPER_Z_STEP_PIN, HIGH);
  delayMicroseconds(Z_STEP_DELAY_US);
  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  delayMicroseconds(Z_STEP_DELAY_US);
}

void applyZMovement(long steps, bool moveUp) {
  if (steps <= 0) {
    return;
  }

  // moveUp = true means moving towards home (0.00mm) - direction HIGH
  // moveUp = false means moving away from home (downward, negative) - direction LOW
  digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);

  long stepsCompleted = 0;
  while (stepsCompleted < steps) {
    // Safety: stop if limit switch is hit mid-travel
    // Z_MIN limit switch is at bottom (not used in current system, but keep for safety)
    if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
      // Hit bottom limit - stop movement
      break;
    }
    // Z_MAX limit switch is at top (home position)
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
      zPosition = Z_HOME_POSITION;  // 0.00mm - reached home
      break;
    }

    pulseZStep();
    stepsCompleted++;
  }

  // Calculate position change
  // moveUp = true: increases Z (towards 0), moveUp = false: decreases Z (negative)
  float deltaMm = (stepsCompleted / static_cast<float>(Z_STEPS_PER_MM)) * (moveUp ? 1.0f : -1.0f);
  zPosition = zPosition + deltaMm;
  
  // Clamp: cannot go above home (0.00mm), can go negative (downward)
  if (zPosition > Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;
  }
}

void moveZAxisByDistance(float distanceMm) {
  if (fabsf(distanceMm) < 0.001f) {
    return;
  }

  // distanceMm > 0 means move up (towards home/0.00mm)
  // distanceMm < 0 means move down (away from home, negative values)
  bool moveUp = distanceMm > 0;

  // Check limit switches before moving
  // Cannot move down if at bottom limit (safety check)
  if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    return;  // Already at bottom, cannot move further down
  }
  // Cannot move up if already at home (0.00mm)
  if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Ensure at home
    return;
  }
  // Also check if already at home and trying to move up
  if (moveUp && zPosition >= Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;  // Clamp to home
    return;
  }

  // Calculate target position
  float target = zPosition + distanceMm;
  
  // Clamp target: cannot exceed home (0.00mm), can go negative
  if (target > Z_HOME_POSITION) {
    target = Z_HOME_POSITION;
  }
  
  float actualDistance = target - zPosition;
  long stepsToMove = labs(static_cast<long>(actualDistance * Z_STEPS_PER_MM));

  if (stepsToMove == 0) {
    zPosition = target;
    return;
  }

  isMoving = true;
  applyZMovement(stepsToMove, actualDistance > 0);
  isMoving = false;
}

void moveZAxisTo(float targetMm) {
  // Clamp target: cannot exceed home (0.00mm), can be negative
  float clampedTarget = targetMm;
  if (clampedTarget > Z_HOME_POSITION) {
    clampedTarget = Z_HOME_POSITION;
  }
  float distance = clampedTarget - zPosition;
  moveZAxisByDistance(distance);
}

void homeZAxis() {
  // Calculate maximum steps needed (from maximum downward position to home)
  const long maxSteps = static_cast<long>(Z_MAX_POSITION * Z_STEPS_PER_MM) + 200;

  isMoving = true;
  digitalWrite(STEPPER_Z_DIR_PIN, HIGH); // Move towards home (upward, towards Z_MAX limit switch)

  long stepsTaken = 0;
  while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN) && stepsTaken < maxSteps) {
    pulseZStep();
    stepsTaken++;
  }

  // Home position is 0.00mm (at Z_MAX limit switch)
  zPosition = Z_HOME_POSITION;  // 0.00mm
  isMoving = false;
}

// ----------------------------------
// Wire feed helper functions
// ----------------------------------

void pulseWireFeedStep() {
  digitalWrite(WIRE_FEED_STEP_PIN, HIGH);
  delayMicroseconds(WIRE_FEED_STEP_DELAY_US);
  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  delayMicroseconds(WIRE_FEED_STEP_DELAY_US);
}

void feedWireByLength(float lengthMm) {
  if (lengthMm <= 0) {
    return;
  }

  // Set direction: HIGH = feed wire out, LOW = retract (if needed)
  // Assuming HIGH = feed out (forward direction)
  digitalWrite(WIRE_FEED_DIR_PIN, HIGH);

  // Calculate number of steps needed
  long stepsToMove = static_cast<long>(lengthMm * WIRE_FEED_STEPS_PER_MM);

  if (stepsToMove <= 0) {
    return;
  }

  // Feed wire by pulsing the stepper motor
  for (long i = 0; i < stepsToMove; i++) {
    pulseWireFeedStep();
    
    // Optional: Add small delay between steps for smoother operation
    // This can be adjusted based on your feed rate requirements
    // delayMicroseconds(100); // Uncomment if needed
  }
}

// ----------------------------------
// Button control functions
// ----------------------------------

void handleButtonControls() {
  // Read current button states (LOW = pressed, HIGH = not pressed with INPUT_PULLUP)
  bool currentButtonUp = digitalRead(BUTTON_UP_PIN);
  bool currentButtonDown = digitalRead(BUTTON_DOWN_PIN);
  bool currentButtonSave = digitalRead(BUTTON_SAVE_PIN);
  bool currentPaddle = digitalRead(PADDLE_PIN);
  
  unsigned long currentTime = millis();
  
  // Handle UP button (moves head upward towards home/0.00mm)
  if (currentButtonUp == LOW) {
    // Button is pressed
    if (currentTime - lastButtonUpPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonUpRepeat == 0 || (currentTime - lastButtonUpRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Check if already at home (cannot move above 0.00mm)
          if (zPosition >= Z_HOME_POSITION || isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
            zPosition = Z_HOME_POSITION;  // Ensure at home
            // Don't move if already at home
          } else {
            // Move head up by a small increment (positive distance = move up)
          moveZAxisByDistance(0.1f);
          }
          lastButtonUpRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonUpState == LOW) {
      lastButtonUpRepeat = 0;
      lastButtonUpPress = 0; // Reset debounce timer
    }
  }
  lastButtonUpState = currentButtonUp;
  
  // Handle DOWN button (moves head downward, negative values)
  if (currentButtonDown == LOW) {
    // Button is pressed
    if (currentTime - lastButtonDownPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonDownRepeat == 0 || (currentTime - lastButtonDownRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Move head down by a small increment (negative distance = move down)
          moveZAxisByDistance(-0.1f);
          lastButtonDownRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonDownState == LOW) {
      lastButtonDownRepeat = 0;
      lastButtonDownPress = 0; // Reset debounce timer
    }
  }
  lastButtonDownState = currentButtonDown;
  
  // Handle SAVE button (saves movement sequence from home position)
  if (currentButtonSave == LOW && lastButtonSaveState == HIGH) {
    // Button just pressed (falling edge)
    if (currentTime - lastButtonSavePress > BUTTON_DEBOUNCE_MS) {
      saveMovementSequence();
      lastButtonSavePress = currentTime;
    }
  }
  lastButtonSaveState = currentButtonSave;
  
  // Handle PADDLE (executes saved movement sequence)
  if (currentPaddle == LOW && lastPaddleState == HIGH) {
    // Paddle just pressed (falling edge)
    if (currentTime - lastPaddlePress > BUTTON_DEBOUNCE_MS) {
      if (hasSavedMovement && !isMoving && !isExecutingSavedMovement) {
        executeSavedMovement();
      }
      lastPaddlePress = currentTime;
    }
  }
  lastPaddleState = currentPaddle;
}

void saveMovementSequence() {
  // Save the movement from home position to current position
  // Home position is 0.00mm (at Z_MAX limit switch)
  homePosition = Z_HOME_POSITION;  // 0.00mm
  savedMovementDistance = zPosition - homePosition;  // Will be negative if below home
  hasSavedMovement = true;
  
  // Send confirmation via Serial
  Serial.print("Movement saved: ");
  Serial.print(savedMovementDistance);
  Serial.print(" mm from home position (current Z: ");
  Serial.print(zPosition);
  Serial.println(" mm)");
}

void executeSavedMovement() {
  if (!hasSavedMovement) {
    Serial.println("No saved movement to execute");
    return;
  }
  
  isExecutingSavedMovement = true;
  isMoving = true;
  
  Serial.print("Executing saved movement: ");
  Serial.print(savedMovementDistance);
  Serial.println(" mm from home");
  
  // First, return to home position
  moveZAxisTo(homePosition);
  
  // Small delay to ensure we're at home
  delay(100);
  
  // Then, execute the saved movement from home
  if (savedMovementDistance != 0.0f) {
    moveZAxisByDistance(savedMovementDistance);
  }
  
  Serial.println("Saved movement execution complete");
  isExecutingSavedMovement = false;
  isMoving = false;
}
