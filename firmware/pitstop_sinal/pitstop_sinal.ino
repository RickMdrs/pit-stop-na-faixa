// Pit Stop na Faixa — controlador do sinal de BANCADA (ESP32 ou Arduino Uno/Nano).
//
// Protocolo serial (115200 baud, linhas terminadas em \n):
//   PC → placa:  L1 = atenção (pisca alternado lento)
//                L2 = alerta máximo, pessoa NA FAIXA (pisca alternado rápido)
//                L0 = apagar   P = ping
//   placa → PC:  OK L1 | OK L2 | OK L0 | OK P | BTN (botão físico pressionado) | HELLO pitstop v2
//
// Montagem: cada LED com resistor em série (ex.: 220–330 Ω para LED comum de 5 mm).
// NÃO ligar fitas de LED, lâmpadas ou cargas maiores direto nos pinos:
// use transistor/MOSFET e fonte adequada, montado por quem conhece o circuito.
// Botão entre BUTTON_PIN e GND (usa o pull-up interno).

#if defined(ESP32)
const int LAMP_A_PIN = 25;
const int LAMP_B_PIN = 26;
const int BUTTON_PIN = 27;
#else
const int LAMP_A_PIN = 9;
const int LAMP_B_PIN = 10;
const int BUTTON_PIN = 2;
#endif

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

const unsigned long FLASH_HALF_MS = 450;     // meio período do pisca alternado (nível 1)
const unsigned long FLASH_FAST_MS = 200;     // meio período no alerta máximo (nível 2)
const unsigned long DEBOUNCE_MS = 40;
const unsigned long LINK_TIMEOUT_MS = 5000;  // sem mensagem do PC → LED de status apaga

bool signalOn = false;
int level = 0;
unsigned long lastFlip = 0;
bool phase = false;
String line;
unsigned long lastMsg = 0;
int lastButton = HIGH;
int stableButton = HIGH;
unsigned long lastButtonChange = 0;

void applyLamps() {
  if (!signalOn) {
    digitalWrite(LAMP_A_PIN, LOW);
    digitalWrite(LAMP_B_PIN, LOW);
    return;
  }
  digitalWrite(LAMP_A_PIN, phase ? HIGH : LOW);
  digitalWrite(LAMP_B_PIN, phase ? LOW : HIGH);
}

void handleLine(const String &cmd) {
  lastMsg = millis();
  if (cmd == "L1" || cmd == "L2") {
    if (!signalOn) { signalOn = true; phase = true; lastFlip = millis(); }
    level = cmd == "L2" ? 2 : 1;
    applyLamps();
    Serial.print("OK ");
    Serial.println(cmd);
  } else if (cmd == "L0") {
    signalOn = false;
    level = 0;
    applyLamps();
    Serial.println("OK L0");
  } else if (cmd == "P") {
    Serial.println("OK P");
  } else {
    Serial.print("ERR ");
    Serial.println(cmd);
  }
}

void setup() {
  pinMode(LAMP_A_PIN, OUTPUT);
  pinMode(LAMP_B_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  applyLamps();
  Serial.begin(115200);
  Serial.println("HELLO pitstop v2");
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      line.trim();
      if (line.length()) handleLine(line);
      line = "";
    } else if (line.length() < 32) {
      line += c;
    }
  }

  unsigned long now = millis();
  if (signalOn && now - lastFlip >= (level == 2 ? FLASH_FAST_MS : FLASH_HALF_MS)) {
    phase = !phase;
    lastFlip = now;
    applyLamps();
  }

  // Botão físico: avisa o PC na borda de descida (pressionado), com debounce.
  int b = digitalRead(BUTTON_PIN);
  if (b != lastButton) { lastButtonChange = now; lastButton = b; }
  if (now - lastButtonChange > DEBOUNCE_MS && b != stableButton) {
    stableButton = b;
    if (stableButton == LOW) Serial.println("BTN");
  }

  // LED de status: aceso = comunicação com o PC em dia.
  // Comportamento das lâmpadas em perda de comunicação NÃO é decidido aqui:
  // o estado é mantido e a falha aparece no painel (definir por projeto antes de uso real).
  digitalWrite(LED_BUILTIN, (now - lastMsg) < LINK_TIMEOUT_MS ? HIGH : LOW);
}
