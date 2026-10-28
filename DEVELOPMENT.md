# DEVELOPMENT — Datalogger de Pressão Hidráulica

Documento técnico para quem mantém ou modifica o firmware/PWA. Para o usuário final do equipamento, ver `MANUAL.md`.

---

## 1. Visão arquitetural

```
                ┌──────────────────────────────────┐
                │         ESP32-C3 (XIAO)          │
                │                                  │
   I²C ──────►  │  Driver Keller LD (inline .ino)  │
   (Keller)     │             │                    │
                │             ▼                    │
                │  ┌────────────────────────────┐  │
                │  │  Máquina de estados        │  │
                │  │  IDLE → COLLECT → READY    │  │
                │  │       → SERVING → IDLE     │  │
                │  └─────┬────────┬─────────┬───┘  │
   ADC ───────► │ readBattery() (5s)        │      │
   (BAT/2)      │       │        │          │      │
                │       ▼        ▼          ▼      │
                │   LittleFS   NimBLE     WiFi+    │
                │   /log.csv   GATT       HTTP     │
                └─────────────┬────────────┬───────┘
                              │            │
                            BLE          Wi-Fi AP
                          (sempre)    (sob demanda)
                              │
                              ▼
                ┌──────────────────────────────────┐
                │   PWA (Web Bluetooth)            │
                │   GitHub Pages                   │
                │  - UI de comandos                │
                │  - Streaming do CSV via BLE      │
                │  - Gráfico SVG com zoom          │
                │  - Auto-reconexão                │
                └──────────────────────────────────┘
```

**Decisões de projeto:**

| Decisão | Justificativa |
|---|---|
| BLE peripheral always-on (vs. deep-sleep cycling) | Permite trigger de sessão pelo celular sem botão físico. ~0,5 mA de overhead. |
| BLE **legacy advertising** (não Extended) | Web Bluetooth no Chrome Android só faz scan legacy. Extended Adv ficaria invisível pra PWA. |
| `setCpuFrequencyMhz(80)` (não `esp_pm_configure`) | O core arduino-esp32 precompilado não tem `CONFIG_PM_ENABLE` + tickless idle. `esp_pm_configure` retorna `ESP_ERR_NOT_SUPPORTED`. CPU @ 80 MHz baixa consumo idle de ~17 mA pra ~8-10 mA. |
| Wi-Fi sob demanda apenas | Wi-Fi consome ~80–100 mA; mantê-lo ligado mata a bateria em horas. |
| LittleFS (vs. SPIFFS) | Endurance melhor pra escrita frequente de log; arduino-esp32 v3 tem suporte nativo. |
| Driver Keller inline (vs. biblioteca) | Protocolo é simples (~30 linhas); evita dependência externa e facilita debug. |
| `P_MODE = 0.0f` (gauge, não absolute) | Operador quer 0 = sem pressão aplicada, positivo = pressão acima da atmosfera. Mais intuitivo pra hidráulica de trado. |
| Timestamp relativo (vs. RTC) | RTC externo (DS3231) consome ~3 mA; relativo é "grátis". A PWA mostra a hora absoluta de início via `Date.now()` do celular. |
| Sem senha no AP Wi-Fi | Decisão do usuário. Trocar pra `WiFi.softAP(SSID, PASSWORD)` se quiser proteger. |
| BLE file transfer como caminho primário | Operador não precisa trocar Wi-Fi do celular. Wi-Fi mantido como fallback pra arquivos grandes. |

### 1.1 Máquina de estados — visão geral

Fluxo principal (simplificado). Para todos os estados, sub-estados e transições de exceção, ver **Apêndice A**.

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> COLLECT: START
    COLLECT --> READY: STOP / 2 h
    READY --> SERVING: DOWNLOAD
    SERVING --> READY: 60 s ocioso
    READY --> IDLE: ERASE

    note right of COLLECT
        Internamente alterna:
        1 Hz ↔ 5 Hz quando
        ΔP > 0,2 bar
    end note
```

**Como visualizar este diagrama:**
- **GitHub:** renderiza automaticamente quando o `.md` é exibido no site.
- **VS Code:** instale a extensão `Markdown Preview Mermaid Support` (bierner.markdown-mermaid).
- **Online:** copie o bloco e cole em https://mermaid.live.

---

## 2. Hardware

### 2.1 Bill of Materials

| Item | Especificação | Notas |
|---|---|---|
| MCU | Seeed XIAO ESP32-C3 | LED de power **deve ser desabilitado** (ver 2.4) |
| Sensor | Keller PA9LD-50bar | I²C addr `0x40`, lido como gauge (P_MODE=0) |
| Bateria | LiPo 3,7 V 250 mAh | Conectada nos pads **BAT** da XIAO |
| Resistores divisor bateria | 2× 100 kΩ | Mod de leitura de bateria (ver 2.5) |
| Cabo I²C | 4 fios | VCC (3,3 V), GND, SDA, SCL |

### 2.2 Pinagem (XIAO ESP32-C3)

| Função | Pino XIAO | GPIO | Conectar a |
|---|---|---|---|
| SDA (I²C) | D4 | GPIO6 | SDA do sensor Keller |
| SCL (I²C) | D5 | GPIO7 | SCL do sensor Keller |
| BAT_SENSE (ADC) | D0 | GPIO2 | Ponto médio do divisor 100k:100k |
| 3V3 | 3V3 | — | VCC do sensor |
| GND | GND | — | GND do sensor + GND do divisor |

`Wire.begin()` usa SDA/SCL automaticamente quando a board variant **`XIAO_ESP32C3`** está selecionada na Arduino IDE. Não precisa especificar pinos manualmente.

### 2.3 Board variant — atenção

A board selecionada **tem que ser `XIAO_ESP32C3`** (Tools → Board → esp32 → "XIAO_ESP32C3"). **Não usar** `ESP32C3 Dev Module`.

A Dev Module genérica usa SDA=GPIO8 / SCL=GPIO9 como default, fora dos pinos onde o sensor está fisicamente conectado. O firmware compila e sobe sem erro, mas o sensor "não responde" no boot. Sintoma clássico de board errada.

### 2.4 LED-mod obrigatório (XIAO C3)

A XIAO ESP32-C3 tem um LED de power que fica **sempre aceso**. Drena ~2,5 mA contínuos = **60 mAh/dia** = bateria morta em ~4 dias antes de qualquer outra coisa rodar.

**Como remover:**
- Localize o LED de power (próximo ao chip, **não** confundir com o LED de carga laranja perto do USB).
- Use ferro de solda fino com pavio dessoldador, **ou** corte com bisturi a trilha que leva 3,3 V ao LED.
- Confirme com multímetro: corrente em standby (sem firmware rodando) deve cair de ~3 mA para <100 µA.

> ⚠️ Modificação destrutiva. Após o mod, o LED de power nunca mais acende. O LED de carga (laranja, perto do USB) continua funcionando normalmente.

### 2.5 Mod de leitura de bateria (necessário para o indicador)

Como o XIAO ESP32-C3 não tem leitura interna de bateria, é preciso um divisor de tensão simples:

```
BAT+ ─── R1 (100kΩ) ─┬─── R2 (100kΩ) ─── GND
                     │
                     └──── D0 (GPIO2)
```

- R1 e R2 = 100 kΩ cada (qualquer valor entre 47k e 220k serve, desde que iguais)
- Divide a tensão por 2: 4,2 V → 2,1 V no D0; 3,0 V → 1,5 V no D0
- Drain estático: ~21 µA contínuos (negligível)

Calibração observada com 100k×2: erro de 0,17% (4137 mV no multímetro vs. 4130 mV reportado pela ADC). Se o erro for maior, ajustar `BATTERY_DIVIDER` no firmware (atualmente `2.0f`).

---

## 3. Toolchain

### 3.1 Versões mínimas

| Componente | Versão | Onde instalar |
|---|---|---|
| Arduino IDE | 2.x | https://www.arduino.cc/en/software |
| Core arduino-esp32 | **3.x ou maior** | Boards Manager → busca "esp32" by Espressif |
| Biblioteca **NimBLE-Arduino** | **2.x ou maior** | Library Manager → busca "NimBLE-Arduino" by h2zero |

> ⚠️ Versões anteriores **não compilam**: arduino-esp32 v2.x usa Bluedroid no C3 (incompatível com NimBLE), e NimBLE-Arduino v1.x tem APIs diferentes.

> ⚠️ **Core 3.3.x** (testado com 3.3.10 + NimBLE-Arduino 2.5.0): o firmware precisa de `Serial.setTxTimeoutMs(0)` logo após `Serial.begin()`. Sem isso, com a placa no USB de um PC que não está lendo a serial, cada `Serial.print` espera até ~2 s — inclusive nos callbacks BLE — e a conexão e os comandos ficam lentos (ver seção 11).

### 3.2 Configurações da IDE

Em `Tools`:

| Setting | Valor |
|---|---|
| Board | **XIAO_ESP32C3** (não Dev Module) |
| USB CDC On Boot | **Enabled** (necessário pro Serial via USB nativo) |
| Partition Scheme | **Default 4MB with spiffs** |
| Flash Size | 4MB (32Mb) |
| CPU Frequency | 160 MHz (default — o firmware reduz pra 80 MHz em runtime) |

### 3.3 Sem `build_opt.h`

Versões antigas do firmware exigiam um `build_opt.h` na pasta do sketch com `-DCONFIG_BT_NIMBLE_EXT_ADV=1` para habilitar Extended Advertising. **Esse arquivo não é mais necessário** desde a migração para Legacy Advertising (BLE 4.x), feita para compatibilidade com Web Bluetooth no Chrome Android.

Se encontrar um `build_opt.h` no projeto, pode remover.

---

## 4. Estrutura do código

Tudo do firmware está em `MedidorSinalBLE.ino`, organizado em blocos:

| Bloco | Função |
|---|---|
| Includes + defines | Configurações, UUIDs, constantes de tempo, `BATTERY_*` |
| Globais de estado | Variáveis da máquina de estados, contadores, cache de bateria |
| `struct KellerLD` | Driver inline do sensor (begin, readReg16, readPressure) |
| `checkSensor/setSensorAlive/sensorWatch` | Presença do sensor: checagem a cada 2 s fora da coleta, `s=0` no status (6.2) |
| `startTare/tareTick` | Calibração do offset (TARE) assíncrona no loop |
| `readBattery()` | Lê ADC 16x e calcula tensão em mV |
| `publishStatus()` | Notifica o status via BLE (com `r=`, `p=`/`t=`, `s=0` e `b=`) |
| `openLogForWrite/append/close` | I/O em LittleFS |
| `startCollection/stopCollection/doSample/sampleFailed` | Lógica de coleta + transição 1Hz↔5Hz + sensor sem resposta na coleta |
| `startStreaming/streamTick/abortStreaming` | Streaming do log via BLE notify |
| `httpRoot/httpLog/startWifi/stopWifi` | Webserver + AP (fallback de download) |
| `handleCommand` + `CmdCallbacks` | Parsing e execução de comandos BLE |
| `ServerCallbacks` | Auto-restart de advertising no disconnect; tracking de connHandle e MTU |
| `setupBLE()` | Server, service, characteristics, advertising |
| `setup()` + `loop()` | Boot + scheduler principal |

Tudo da PWA está em `docs/`:

| Arquivo | Função |
|---|---|
| `index.html` | App completo: HTML + CSS + JS, ~700 linhas |
| `manifest.json` | Metadados PWA (nome, ícone, cor de tema) |
| `sw.js` | Service worker (cache offline com bypass de HTTP cache) |
| `icon.svg` | Ícone do app (manômetro vetorial) |
| `MANUAL.pdf` | Cópia do `MANUAL.pdf` da raiz, aberta pelo botão MANUAL (gerada por `tools/manual/gerar.ps1`; não editar à mão) |

---

## 5. Especificação BLE GATT

### 5.1 Identificadores

| Item | UUID |
|---|---|
| Service | `9b78c001-c0de-4d65-a1aa-001122334455` |
| Char `cmd` (Write) | `9b78c002-c0de-4d65-a1aa-001122334455` |
| Char `status` (Read + Notify) | `9b78c003-c0de-4d65-a1aa-001122334455` |
| Char `data` (Notify) | `9b78c004-c0de-4d65-a1aa-001122334455` |
| Device name | `SCPT01`, `SCPT02`... por placa: `BOARD_NAMES` no firmware mapeia o MAC do Bluetooth (`esp_read_mac(..., ESP_MAC_BT)`) no nome; placa fora da tabela vira `SCPT-XXXX` (fim do MAC). Um firmware só para todas. Wi-Fi: `<nome>_AP` |
| MTU | Negociado até 247 bytes (Android negocia automaticamente) |
| Advertising | **Legacy** (BLE 4.x), 1M PHY, interval 2000 ms |

### 5.2 Comandos aceitos (escrever ASCII em `cmd`)

| Comando | Estados em que é válido | Efeito |
|---|---|---|
| `START` | IDLE, READY (com sensor respondendo) | Apaga `/log.csv`, inicia sessão, reseta contadores. Sem sensor: recusa e reenvia o status com `s=0` |
| `STOP` | COLLECT | Fecha arquivo, transiciona pra READY |
| `TARE` | IDLE, READY (com sensor respondendo) | Coleta 16 amostras em ~1.3 s, usa a média das leituras válidas como offset. Nenhuma válida: mantém o offset anterior e marca o sensor sem resposta |
| `READ` | READY (com log existente) | Inicia streaming do `/log.csv` via char `data` |
| `NOTE n` | COLLECT | Pendura nota fixa (n=1..5) na próxima amostra do CSV |
| `DOWNLOAD` | IDLE, READY | Sobe AP Wi-Fi |
| `STOPWIFI` | SERVING | Derruba AP manualmente |
| `ERASE` | qualquer | Apaga `/log.csv`, transiciona pra IDLE |

Comandos inválidos no estado atual são silenciosamente ignorados (apenas logados via Serial).

**Tabela de `NOTE n` → texto que entra na 4ª coluna do CSV:**

| `n` | Texto |
|---|---|
| `1` | `inicio perfuracao` |
| `2` | `fim perfuracao` |
| `3` | `inicio concretagem` |
| `4` | `fim concretagem` |
| `5` | `outra` |

Lista fechada — operador escolhe na PWA (botões coloridos), evita digitação em campo. Sem acentos, pra evitar bytes UTF-8 multibyte indo pro arquivo. A tabela está duplicada em dois lugares: `noteTextFromTag()` no firmware e `NOTE_LABELS` em `docs/index.html`. **Mantenha sincronizadas.**

A nota fica em `pendingNote` (RAM) e é gravada **na próxima amostra** (piggyback), depois zera. Atraso: ≤1 s em 1 Hz, ≤200 ms em 5 Hz. Se o `NOTE` não for confirmado (BLE caiu), a PWA trata a nota como marcada sem conexão (13.13).

### 5.3 Formato do `status` (notify)

String ASCII de até ~60 bytes (buffer de 72). Estrutura: `<estado-base> [<sub-info>...]`. Campos opcionais:

- `r=NNN` — segundos restantes até auto-stop (apenas em COLL)
- `p=B.B t=T.T` — última leitura de pressão (com TARE) e temperatura (apenas em COLL)
- `e=MS` — ms desde o início da coleta, mesma base da coluna `ms` do CSV (em COLL; em READY só se a coleta foi nesta partida — `sessionThisBoot`, porque o `millis()` recomeça no reset). A PWA usa para saber a hora do início no relógio do celular (13.13)
- `s=0` — sensor sem resposta (em qualquer estado; ausente quando o sensor responde). Ver 6.2
- `b=NNNN` — tensão da bateria em mV (em qualquer estado, se a leitura for válida)

**Exemplos:**

```
IDLE b=4050
IDLE s=0 b=4050
COLL 1Hz n=1234 r=6800 b=4015
COLL 1Hz n=1234 r=6797 p=2.8 t=24.6 e=403112 s=0 b=4015
COLL 5Hz n=2500 r=6500 p=3.1 t=24.7 e=700020 b=4010
READY n=14400 e=7215532 b=3920
READY n=0 b=3920                    (log de antes de um reset: sem e=)
WIFI 192.168.4.1 b=3895
```

**Quando dispara:**
- Em qualquer mudança de estado.
- A cada amostra durante COLLECT (status com `n` incrementado e `r` decrementado).
- A cada 5 s quando bateria varia ≥ 20 mV.
- Quando o sensor some ou volta (fora da coleta), e a cada tentativa de amostra enquanto o sensor está sem resposta na coleta.

### 5.4 Protocolo de streaming via `data`

Transferência do `/log.csv` em chunks via notify. Iniciada pelo comando `READ` quando o estado é READY.

**Formato:**

1. **Primeiro notify**: 4 bytes little-endian = tamanho total do arquivo em bytes.
2. **Notifies subsequentes**: chunks crus do CSV, até 200 bytes cada (limitado pelo MTU - 3).
3. **Fim**: cliente sabe que terminou quando `bytes_recebidos == tamanho_total`.

**Performance observada:**
- ~10-30 KB/s efetivo, dependendo da qualidade do link e do MTU negociado.
- Exemplo: 1000 amostras (~15 KB) → ~3 segundos.
- Sessão completa de 2h em 1 Hz (~108 KB) → ~10-20 segundos.

**Aborts automáticos:**
- Se central desconectar durante streaming (ex.: trado descendo), `abortStreaming()` no `onDisconnect` fecha o arquivo e reseta o flag.

### 5.5 Auto-reinício de advertising

NimBLE **não** retoma advertising automaticamente após disconnect. Sem isso, o device fica invisível após a primeira queda de link. `ServerCallbacks::onDisconnect` chama `NimBLEDevice::getAdvertising()->start()` para reiniciar.

Crítico no caso de uso real (trado descendo 50 m fora de alcance, voltando à superfície depois).

---

## 6. Lógica de amostragem adaptativa

```c
// Variáveis-chave
fastMode             // bool: 1Hz ou 5Hz
fastModeEnteredMs    // momento em que entrou em 5Hz
fastModeAccumMs      // tempo cumulativo em 5Hz na sessão (cap 30 min)
lastSpikeMs          // último ΔP > 0,2 bar
DELTA_THRESHOLD_BAR  // 0.2
FAST_DECAY_MS        // 30000 (30 s sem spike → volta a 1Hz)
FAST_MAX_MS          // 1800000 (30 min cap)
```

**Transições:**
- `1Hz → 5Hz`: `ΔP > 0.2 bar` E `fastModeAccumMs < FAST_MAX_MS`
- `5Hz → 1Hz`: `(now - lastSpikeMs) > 30 s` (decay) **OU** cap atingido

### 6.1 Filtro de temperatura

O Keller mede temperatura em passos de 0,05 °C e o log grava 1 casa decimal; perto de x,x5 o arredondamento pulava ±0,1 °C a cada amostra. `filterTemp()` aplica:

- **Média móvel exponencial por tempo**, `TEMP_TAU_MS = 3000` (equivale à média dos últimos ~6 s, igual em 1 Hz e 5 Hz: `alpha = 1 - exp(-dt/τ)`).
- **Histerese** `TEMP_HYST_C = 0.095`: o valor gravado só muda quando a média se afasta 0,095 °C dele; aí é arredondado para 0,1.

O mesmo valor vai para o CSV e para o `t=` do status. Reinicia a cada `START`. Simulado com ruído de ±1 passo: 0 pulos com a temperatura parada em x,x5, subida em escada sem voltar, erro máx. 0,095 °C, ~8 s para acompanhar um degrau de 2 °C. A pressão não passa por filtro.

### 6.2 Presença do sensor

`sensorAlive` diz se o Keller está respondendo; quando é `false` o status leva ` s=0` e a PWA avisa o operador (13.11).

- **Boot:** `sensor.begin()` só inicia o `Wire`; `checkSensor()` lê a faixa (`probe()`: Pmin/Pmax, NaN sem sensor no barramento) e uma amostra.
- **Fora da coleta** (IDLE/READY, sem TARE nem streaming): `sensorWatch()` no `loop()` chama `checkSensor()` a cada `SENSOR_CHECK_MS` (2 s). Enquanto o sensor está sem resposta, cada checagem relê a faixa: o sensor pode ser ligado com a placa ligada (testado: detecta ligar/desligar em ≤ 2 s). Mudança → `setSensorAlive()` loga `[SENSOR] respondendo`/`sem resposta` e publica o status.
- **TARE/START** só olham `sensorAlive` (nada de I²C no callback BLE). TARE sem nenhuma leitura válida mantém o offset anterior e marca o sensor sem resposta.
- **Na coleta:** `doSample()` com leitura falha chama `sampleFailed()`. Depois de `SENSOR_LOST_MS` (3 s) sem leitura válida, `sensorAlive = false` e o status (com a última leitura boa em `p=`/`t=` e `s=0`) sai a cada tentativa. Nada é gravado nesse período. A primeira leitura boa volta `sensorAlive = true`. O auto-stop de 2 h é checado também em `sampleFailed()` (antes, com o sensor morto, a coleta nunca parava sozinha).

---

## 7. Resiliência a queda de energia

- `logFile.flush()` é chamado a cada **16 amostras** (~16 s em 1Hz, ~3 s em 5Hz). Pior caso de perda: as últimas 16 amostras antes da queda.
- No boot, se `/log.csv` existe, o estado vai direto para **READY** — assim o operador consegue baixar o que foi coletado antes da queda.
- LittleFS é robusto a corte de energia: o pior que acontece é o último bloco escrito ficar truncado, não corrompe o filesystem.
- `publishStatus()` é chamado no fim do `setup()` para que clientes que se conectem antes de qualquer mudança de estado recebam o estado real (não "IDLE" hardcoded).

---

## 8. Otimização de energia — status

**Implementado:**
- BLE TX power = 0 dBm (não +9 dBm).
- BLE legacy advertising com interval de 2000 ms (vs. 30 ms default) — economia significativa em idle.
- Wi-Fi só sob demanda (auto-off em 60 s ocioso).
- `setCpuFrequencyMhz(80)` no boot — corta consumo idle de ~17 mA para ~8-10 mA.
- Status BLE só republicado quando bateria varia ≥ 20 mV (evita tráfego desnecessário).

**Não implementado (`esp_pm_configure` com light-sleep):**
- O core arduino-esp32 precompilado retorna `ESP_ERR_NOT_SUPPORTED` (262) porque `CONFIG_PM_ENABLE` + `CONFIG_FREERTOS_USE_TICKLESS_IDLE` não estão habilitados.
- Para light-sleep real (~1-3 mA medio em idle), precisa migrar para PlatformIO com `sdkconfig` custom, OU recompilar arduino-esp32 com PM enabled.
- Atualmente o consumo idle (~8-10 mA) é dominado pela CPU acordada o tempo todo.

**Não implementado (deep-sleep entre sessões):**
- Em IDLE/READY, o consumo é o mesmo de COLLECT sem amostrar (~5-10 mA).
- Adicionar deep-sleep com wake-up por timer ou external reduziria isso significativamente, mas atrapalha o caso "BLE always-on" que é central pro UX.

---

## 9. Build e flash

### 9.1 Compilação limpa

Após qualquer mudança em libs ou versão da NimBLE-Arduino:

1. Feche o IDE.
2. Apague `%LOCALAPPDATA%\Temp\arduino\` (Windows) ou `~/.cache/arduino/` (Linux/macOS).
3. Reabra o IDE e compile.

### 9.2 Upload do firmware

Conecte a XIAO via USB-C. Se a IDE não reconhecer a porta, force o modo bootloader:
1. Pressione e segure o botão **BOOT** da XIAO.
2. Pressione e solte **RESET**.
3. Solte BOOT após ~1 s.

A porta deve aparecer como COMx (Windows) ou /dev/cu.usbmodem* (Mac).

### 9.3 Deploy da PWA

A PWA é servida pelo **GitHub Pages** a partir de `/docs` no repo. Atualizar a PWA é:

1. Editar `docs/index.html`, `docs/sw.js`, etc.
2. **Bumpar** `CACHE` em `sw.js` (ex.: `loggerp-pwa-v11` → `loggerp-pwa-v12`).
3. **Bumpar** a versão no subtítulo do `index.html` (`<span class="app-version">vN</span>`, mesmo número do `CACHE`). Não há mais rodapé.
   Se o manual mudou: rodar `tools/manual/gerar.ps1`, que regera `MANUAL.pdf` e copia para `docs/MANUAL.pdf` (o Pages só publica `docs/`).
4. `git commit && git push origin main`.
5. GitHub Pages publica em ~30-60 s.

O repositório precisa ser **público**: no plano gratuito do GitHub, tornar o repo privado desativa o Pages e o link da PWA passa a dar 404 (aconteceu entre 2026-05 e 2026-10).

O service worker tem `cache: 'reload'` no install para bypassar o HTTP cache do GitHub Pages (que envia `Cache-Control: max-age=600`). Isso garante que atualizações chegam em ~1 minuto, não esperando o cache HTTP expirar.

---

## 10. Troubleshooting de build

| Erro | Causa | Fix |
|---|---|---|
| `'esp_gap_ble_api.h' No such file` | Código tentando usar API Bluedroid | Não usar BLE API antiga; só NimBLE-Arduino |
| `'NimBLEAdvertising' was not declared` | Versão antiga da NimBLE-Arduino | Atualizar pra v2.x |
| `text section exceeds available space` | App partition cheio | Trocar pra "Huge APP (3MB No OTA/1MB SPIFFS)" |
| `LittleFS.h: No such file` | Core esp32 desatualizado | Atualizar arduino-esp32 para v3.x |
| `analogReadMilliVolts` undefined | Core esp32 v2.x | Atualizar para v3.x |

---

## 11. Troubleshooting runtime

| Sintoma | Diagnóstico | Ação |
|---|---|---|
| Boot mostra `[AVISO] Sensor Keller nao respondeu` (e a PWA mostra "⚠ Sensor nao detectado") | Sensor desligado, ou I²C falhou — provável **board variant errada** | Se o sensor estava desligado, basta ligá-lo: a placa procura a cada 2 s (`[SENSOR] respondendo`). Senão, confirmar board `XIAO_ESP32C3`, não `ESP32C3 Dev Module`, e o wiring SDA=D4, SCL=D5 |
| Boot mostra `[BAT] 0 mV` ou tensão muito baixa | Divisor de bateria não conectado, ou GPIO errado | Conferir solda no D0 (GPIO2) e R1/R2 |
| Boot mostra `[ERRO] LittleFS nao iniciou` | Partição corrompida ou inexistente | `LittleFS.begin(true)` confirma format-on-fail; se persistir, refazer partição |
| BLE conecta mas escrita em `cmd` é ignorada | UUID errado, formato errado | Garantir escrita em formato **TEXT (UTF-8)**, não HEX |
| PWA não acha o `SCPT0N` mas nRF Connect acha | Firmware está em Extended Advertising em vez de Legacy | Confirmar `setupBLE()` usa `NimBLEAdvertising`, não `NimBLEExtAdvertising` |
| AP Wi-Fi sobe mas celular não conecta | Em alguns Androids, redes 100% abertas exigem confirmação manual | Adicionar rede manualmente |
| Pressão lida está sempre próxima de zero (mas com pequenas variações) | Comportamento esperado em modo gauge (`P_MODE=0`) | Em atmosfera, ~0 ± 0,1 bar é normal |
| Após disconnect, dispositivo "some" e exige reset | `ServerCallbacks::onDisconnect` não está reiniciando adv | Confirmar que `pServer->setCallbacks(new ServerCallbacks())` está em `setupBLE()` |
| Com a placa no USB do PC, a conexão leva ~5 s e TARE/START/READ respondem aos trancos (some ao abrir o monitor serial) | Core 3.3.x: `Serial` USB (HWCDC) espera até ~2 s por print quando o PC não lê | Manter `Serial.setTxTimeoutMs(0)` logo após `Serial.begin()` |
| Download dá "Header de stream invalido" depois de uma reconexão | Tentativas de reconexão sobrepostas rodavam o bind várias vezes e duplicavam o handler de `data` | Manter a trava `reconnectInFlight` em `tryReconnect()` e os handlers por atribuição (`oncharacteristicvaluechanged =`) em `bindCharacteristics()` |
| PWA mostra valores antigos depois de update | Service worker servindo cache obsoleto | Esperar ~1 min após push (SW updates automaticamente) e abrir o app 2x. Se persistir, no Chrome: Configurações → Configurações do site → `marcelobatistabhz.github.io` → Limpar e redefinir. ⚠️ Isso (e "Limpar dados" do app no Android) **apaga o histórico** do IndexedDB (13.7) |

---

## 12. Estendendo o firmware/PWA

### Adicionar comando novo

1. Em `handleCommand()`, adicionar um `else if (cmd == "MEU_CMD")`.
2. Adicionar botão na PWA (`docs/index.html`) com `onclick = () => sendCmd('MEU_CMD')`.
3. Documentar em `MANUAL.md` (seção 12) e neste arquivo (5.2).

### Mudar formato de log

Editar `appendLog()` em `MedidorSinalBLE.ino`. Se mudar separador ou colunas:
- Atualizar a seção 8 do `MANUAL.md`.
- Atualizar o parser `parseCsvBytes()` na PWA.
- Bumpar versão da PWA.

**Formato atual:** `ms;bar;degC;note` — 4ª coluna fica vazia em quase todas as amostras; só preenchida quando o comando `NOTE n` foi recebido pouco antes (ver 5.2). Parser da PWA é tolerante a CSV antigo de 3 colunas (ignora coluna ausente).

### Adicionar segundo sensor (ex.: temperatura)

O Keller PA9LD já lê temperatura junto com pressão (`readPressure()` ignora os bytes T_hi/T_lo). Para gravar:

- `KellerLD::readPressure()` — retornar também temperatura.
- `appendLog()` — gravar 3ª coluna.
- Header CSV: `ms;bar;degC`.
- PWA: parser e segunda linha no gráfico.

### Habilitar light-sleep automático

Requer migração do toolchain:

**Opção A:** PlatformIO com `sdkconfig` custom habilitando `CONFIG_PM_ENABLE=y` e `CONFIG_FREERTOS_USE_TICKLESS_IDLE=y`.

**Opção B:** Recompilar arduino-esp32 a partir do source com essas flags.

Após habilitar:

```cpp
#include <esp_pm.h>

esp_pm_config_t pm = {
    .max_freq_mhz = 160,
    .min_freq_mhz = 10,
    .light_sleep_enable = true
};
esp_pm_configure(&pm);
```

> ⚠️ Pode causar artefatos no I²C ou BLE se o timing ficar fora de margem. Validar em hardware.

---

## 13. PWA — arquitetura

### 13.1 Fluxo de conexão

1. **`requestDevice`** com filtro `namePrefix: 'SCPT'` (mais `name: 'LoggerP_C3'`, placa com firmware anterior aos nomes) e `optionalServices` listando o UUID do serviço. `setConnectedUi()` mostra a rede Wi-Fi do equipamento conectado (`<nome>_AP`) na dica do download via Wi-Fi.
2. **`gatt.connect()`** abre conexão GATT.
3. **`bindCharacteristics()`** localiza CMD, STATUS, DATA. Subscribe nas duas notify com `oncharacteristicvaluechanged = ...` (atribuição: rodar o bind 2x troca o handler em vez de duplicar). Por último arma o download automático (ver 13.3).
4. **Wake Lock API** mantém a tela acesa para evitar que Chrome descarte o `BluetoothDevice`.

### 13.2 Auto-reconexão

`device.addEventListener('gattserverdisconnected', onDisconnected)` dispara `startReconnectLoop()`:

- `setInterval` a cada 4 s tentando `device.gatt.connect()`, **uma tentativa por vez** (`reconnectInFlight`): com o logger fora do ar, `connect()` fica pendente mais que 4 s.
- Reusa o mesmo `BluetoothDevice` (não exige nova interação do usuário).
- Card vira laranja pulsante "Reconectando".
- Botão Conectar vira "Cancelar reconexao" (cinza) — só fora da coleta; em `coll-mode` ele fica escondido para ninguém cancelar sem querer com o trado descendo (v29).

### 13.3 Streaming do CSV

**Quando baixa:** sozinho, ao ver `COLL → READY` (Parar coleta ou auto-stop com o app conectado) e ao conectar com o logger em `READY` numa coleta que o celular ainda não tem — `autoDownloadArmed` + `maybeAutoDownload()`, comparando o `n=` do `READY` com o do log guardado (`localLog.n`). Manualmente, pelo botão **Baixar de novo**, que só aparece depois de uma falha (`downloadFailed`). O motivo vai em `autoDownloadArmed` / `downloadReason` (`'stop'`, `'connect'`, `'manual'`): só o `'connect'` é silencioso — não abre o gráfico e não mostra "Log baixado"; se `saveToHistory()` disser que a coleta é nova, mostra "Coleta do equipamento guardada no Historico" (v26). `Iniciar coleta` e a entrada em `COLL` chamam `clearSessionLog()` (some gráfico e log).

`startBleDownload()`:

1. Reset estado, `downloadInFlight = true`, mostra barra de progresso.
2. Envia `READ`.
3. Watchdog de 5 s pra primeiro chunk (header de 4 bytes).
4. `onDataChunk` parser:
   - Primeiro chunk → `streamTotal = mv` (4 bytes LE).
   - Demais → `streamChunks.push(chunk)`, atualiza progresso.
   - Quando `streamReceived >= streamTotal` → `finishStream()`.
5. `finishStream()` guarda o log em `localLog`, renderiza o gráfico e grava no histórico (13.7). **Não** compartilha: o compartilhamento é pelo ícone do histórico → `shareFile()` → `navigator.share({files})` direto no toque (o Chrome exige gesto do usuário recente; depois de um download de vários segundos o share falhava). O botão **Compartilhar** da tela inicial (`#btnShare` → `shareLocalLog()`) é só reserva: aparece se `!historyEnabled` ou se a gravação no histórico falhou (`historySaveFailed`); `#shareRow` some quando não há botão visível nele.
6. Watchdog de 15 s entre chunks. Falha (sem resposta, timeout, header inválido, queda de conexão) → `failDownload()` → `downloadFailed = true` → aparece **Baixar de novo**.

### 13.4 Gráfico SVG

Renderização inline em SVG (sem biblioteca externa). Componentes:

- **`parseCsvBytes(bytes)`**: parser do CSV → `{points, ma, pMax, pMaxIdx, pMin, tMin, tMax, hasTemp, tInit, tFinal, tAxisMin, tAxisMax, notes}`. Tolerante a CSV de 3 colunas (sem temp) e de 3 ou 4 colunas (sem nota).
- **`computeMA(points, window)`**: média móvel com janela crescente nas primeiras 49 amostras.
- **`drawChart()`**: SVG com grid, axes, linha azul (pressão), linha laranja (MA), linha cinza (temperatura), bolinha vermelha do pico, labels, e marcadores verticais de anotação (linha tracejada + label rotacionado 90°, cor por categoria: azul=perfuração, verde=concretagem, cinza=outra). Marcadores respeitam pan/zoom.
- Resumo no `chartInfo` abaixo do header: amostras, pico@tempo, duração, anotações; min/max da pressão; temperatura inicial→final com ΔT; e a legenda numa linha só (`.chart-legend`, `white-space: nowrap`, "temp" abreviado — cabe até em 320 px). Média, mediana e σ foram retirados na v25.

### 13.5 Pinch zoom

**Pointer Events com `setPointerCapture`** (não Touch Events).

Touch Events são instáveis no Chrome do Android: durante uma pinça, apenas o primeiro `touchmove` dispara, depois Chrome cancela os eventos pra entregar o gesto pra "pinch-to-zoom da página" — mesmo com `touch-action: none` no elemento. Pointer Events com `setPointerCapture` ficam "presos" ao elemento e o browser não consegue redirecionar.

Tracking dos dedos via `Map<pointerId, {x, y}>` reproduz a ergonomia de `e.touches`.

### 13.6 Service worker

`docs/sw.js`:

- Cache versionado (`loggerp-pwa-vN`).
- `install`: `cache.addAll(ASSETS)` com `cache: 'reload'` para bypassar HTTP cache.
- `activate`: limpa caches antigos (que não batem com `CACHE` nem com `MANUAL_CACHE`).
- `fetch`: cache-first para mesmo origin, network direto para outros origins (incluindo `http://192.168.4.1`).
- `MANUAL.pdf` (~4 MB) fica fora do cache versionado, em `scpt-manual` (`MANUAL_CACHE`), para não ser baixado de novo a cada bump: **rede primeiro** (sempre o manual mais novo), e sem sinal serve a última cópia baixada. Só respostas 200 vão para o cache (o leitor de PDF pode pedir trechos, 206).

**Bumpar versão a cada update** é obrigatório para forçar reinstalação do SW.

### 13.7 Histórico de coletas (IndexedDB)

Banco `scpt-historico`, store `logs` (`keyPath: 'id'`, índice `savedAt`). Cada registro: `{ id, savedAt, fname, bytes, samples, durationMs, pMax, notes }`, com o CSV inteiro em `bytes` (`Uint8Array`).

- **Entrada:** `finishStream()` chama `saveToHistory(localLog)` depois de todo download bem-sucedido (automático ou "Baixar de novo").
- **Sem duplicata:** `id` = SHA-256 do conteúdo (`crypto.subtle`); baixar a mesma coleta de novo não grava outra vez.
- **Limite:** `HISTORY_MAX = 20`; depois de gravar, apaga as chaves mais antigas pelo índice `savedAt`. 20 coletas máximas ≈ 5 MB.
- **Persistência:** `navigator.storage.persist()` a cada gravação, para o Chrome não despejar o banco com o celular sem espaço (com o app instalado costuma ser concedido; não é garantido).
- **UI:** `loadHistory()` na abertura do app e após cada gravação; `renderHistoryList()` monta o `<details id="historyBox">` com **uma linha por coleta** (`dd/mm hh:mm · duração · pico bar`, `white-space: nowrap` + reticências) e dois botões de ícone SVG inline (`historyIconButton()`, `ICON_CHART`/`ICON_SHARE`, 40×36 px): gráfico → `renderChart(bytes, 'Grafico de dd/mm hh:mm')`, compartilhar → `shareFile(bytes, fname)`. A palavra "pico" ficou de fora para caber em celular de 360 px (sobram ~200 px para o texto). Não depende de conexão BLE.
- Sem `indexedDB` ou `crypto.subtle` (`historyEnabled = false`), o bloco fica escondido.
- **Apagar tudo (v27):** lixeira no `<summary>` do histórico (`#btnClearHistory`, só aparece com itens; `preventDefault`/`stopPropagation` para não abrir/fechar a lista) → `confirm()` → `clearHistory()` limpa o store, fecha o gráfico e recarrega a lista. Os `id` apagados vão para `localStorage['scpt-historico-apagadas']` (até 200) e `saveToHistory()` os recusa: sem isso, o último log da obra anterior, que segue no equipamento, voltaria ao histórico no download automático ao conectar. Não há apagar item a item (decisão do usuário).

### 13.8 Tela de coleta enxuta

`applyState()` mantém `collectMode` e liga a classe `coll-mode` no `<body>`: `COLL` liga; `IDLE`/`READY`/`WIFI`/`Desconectado` desliga; **`Reconectando` mantém** o valor anterior (no meio de uma coleta o trado desce e a conexão cai, e a tela não deve se encher de botões). O CSS esconde, com `coll-mode`, `#btnStart`, `#shareRow` (Compartilhar/Baixar de novo), `#historyBox` e `#advancedBox`; sem ela, esconde `#btnStop`. As linhas de botões usam `.btn-row-auto` (colunas só para os botões visíveis), então o botão que sobra ocupa a largura toda.

No card Estado, `READY n=...` aparece só como `READY` e o "Iniciada as" só aparece com `collectMode`. O `n=` continua em `lastSeenState`: é ele que identifica a coleta no download automático (13.3).


### 13.9 Layout de tablet (v28)

Um app só, responsivo: `@media (min-width: 700px) and (min-height: 700px)` (o Lenovo Tab TB311FU em pé tem ~800×1280 CSS px; a altura mínima evita que um celular deitado num navegador pegue este layout). Dentro dela: `html { font-size: 130% }` — quase todos os tamanhos são em `rem` e crescem ~30% —, `body` sem o limite de 480 px (`max-width: 900px`), `.status-live` 1.45rem e sparkline de 130 px (leitura em campo), `.btn` um pouco mais alto, e os tamanhos que são em px reajustados à mão (`.big-toggle`, bateria, `.history-icon`, lixeira, legenda, modais, toasts). O gráfico SVG (`viewBox` 360×220, `width: 100%`) acompanha a largura sozinho. O app continua travado em retrato (`"orientation": "portrait"` no manifest). Ao mexer em tamanho em px, conferir também o bloco de tablet. Prints de teste: Edge headless com `--window-size=800,1280` e `?state=` num script de simulação.

**Pressão grande no tablet (v29):** `#statusBigP` fica à direita dos textos do card (`.status-mid` em flex), só no tablet e só em `coll-mode`; tamanho da fonte `min(92cqh, 46cqw)` com `container-type: size` (cabe até 4 caracteres, ex. `48.8`), `tabular-nums`. `body.coll-mode .status-mid { min-height: 8.6rem }` deixa o card ~10% mais alto. Some no modo números grandes.

### 13.10 Indicador de conexão (v29)

O botão `#btnConnect` não mostra mais "Conectado: LoggerP_C3": `setConnectedUi()` esconde o botão e mostra `#statusConn` ("● conectado", verde) ao lado do rótulo ESTADO; `setIdleUi()` volta "Conectar via Bluetooth" (azul); `setReconnectingUi()` mostra "Cancelar reconexao" (`btn-secondary`), escondido em `coll-mode`. Desconectado/Reconectando aparecem no próprio `statusValue`.

### 13.11 Aviso de sensor sem resposta (v30)

`applyState()` lê o `s=0` do status (6.2), tira do texto visível e mantém `sensorMissing`. Com ele: classe `sensor-bad` no card (borda vermelha; `.status-live` e `#statusBigP` com opacidade 0.35, porque são a última leitura boa) e `#statusSensor` visível — "⚠ Sensor sem resposta" em COLL, "⚠ Sensor nao detectado" fora. Na coleta, toast quando cai e quando volta; o sparkline não recebe as amostras repetidas.

`performTareAndStart()`: com `sensorMissing`, só toast (sem TARE). Se o `s=0` chegar durante os 3 s do modal (TARE sem leitura válida), fecha sem o ✓ e não manda START. Depois do START, se o estado não virar COLL em 4 s (e ainda conectado), toast "A coleta nao iniciou" — o firmware recusa START sem responder.
### 13.12 Botão MANUAL (v31)

`<a class="btn btn-manual" id="btnManual" href="MANUAL.pdf" target="_blank">` depois do `#advancedBox`: 25% da largura, vermelho (`#ff6b6b`) com texto preto. O `body` já é coluna flex com `min-height: 100vh/100dvh`, então `margin-top: auto` + `align-self: flex-start` deixam o botão no canto inferior esquerdo quando a página é curta, e no fim da página (sem cobrir nada) com histórico/gráfico abertos. Some em `coll-mode`. No Android o PDF abre no leitor do Chrome (ou no app de PDF padrão, conforme o aparelho); offline vem do `scpt-manual` (13.6).

### 13.13 Eventos marcados sem conexão (v32)

O equipamento passa ~95% da coleta sem conexão (desce no furo; a conexão cai a 1–2 m de profundidade). O "Marcar Evento" fica disponível com `collectMode || sessEv.active` — inclusive em "Reconectando" e com o app reaberto sem conexão.

- **`sessEv`** (localStorage `scpt-eventos`): `{ startMs, active, events: [{ t, tag, sent }] }`. Todo evento entra aqui com `Date.now()`; com conexão vai também como `NOTE n` e, se a escrita for confirmada, fica `sent: true`. `active` vira `true` com COLL e `false` com IDLE/READY/WIFI (Reconectando/Desconectado não mexem).
- **Relógio comum:** cada status com `e=` dá uma estimativa do início, `Date.now() - e`. `syncSessionStart()` guarda a **menor** (o atraso do BLE só atrasa a estimativa; ~50 ms no simulador com 20–150 ms de atraso). Estimativa a mais de `SAME_SESSION_MS` (5 s) da guardada = outra coleta: troca o início e descarta os eventos de antes dele. Por isso os eventos só somem no próximo START.
- **No download** (`finishStream()` → `mergePhoneEvents()`): cada evento não enviado vira `rel = t - startMs` e o texto de `NOTE_LABELS` vai para a coluna `note` da 1ª amostra com `ms >= rel` (a última, se o toque foi depois dela), pulando amostras que já têm nota. Eventos fora de `[-5 s, último ms + 60 s]` são ignorados (log de outra coleta). Como a taxa (1/5 Hz) já está no `ms` de cada linha, não precisa de mais nada. Mesmo log + mesmos eventos = mesmos bytes → mesmo SHA-256 → "Baixar de novo" não duplica no histórico.
- O botão mostra `Marcar Evento (N no celular)` com N = eventos não enviados (contador some com a coleta).
- Limitações: o log precisa ser baixado pelo celular que marcou; o download via Wi-Fi não passa pelo merge; limpar os dados do app perde os eventos ainda não baixados.

---

## 14. Referências

- **Protocolo Keller 4LD/9LD:** http://www.keller-druck2.ch/swupdate/InstallerD-LineAddressManager/manual/Communication_Protocol_4LD-9LD_en.pdf
- **Biblioteca de referência (não usada):** https://github.com/bluerobotics/BlueRobotics_KellerLD_Library
- **NimBLE-Arduino:** https://github.com/h2zero/NimBLE-Arduino
- **XIAO ESP32-C3 datasheet:** https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/
- **Web Bluetooth API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
- **Pointer Events spec:** https://www.w3.org/TR/pointerevents/

---

## Apêndice A — Diagrama de estados completo

Versão de referência com **todas as transições** que existem no código.

```mermaid
stateDiagram-v2
    [*] --> IDLE: boot, sem log
    [*] --> READY: boot, log existe

    IDLE --> COLLECT: cmd START
    READY --> COLLECT: cmd START

    state COLLECT {
        [*] --> Hz1
        Hz1 --> Hz5: ΔP > 0.2 bar
        Hz5 --> Hz1: 30 s estável / cap 30 min
        Hz1: 1 Hz
        Hz5: 5 Hz
    }

    COLLECT --> READY: cmd STOP / 2 h

    READY --> READY: cmd READ\n(streaming inline)

    IDLE --> SERVING: cmd DOWNLOAD
    READY --> SERVING: cmd DOWNLOAD

    SERVING --> READY: 60 s idle / STOPWIFI

    READY --> IDLE: cmd ERASE
    COLLECT --> IDLE: cmd ERASE
```

**Diferenças vs. o diagrama simplificado da seção 1.1:**

| Detalhe extra aqui | Por que importa |
|---|---|
| Boot pode entrar direto em READY | Quando há log de sessão anterior preservado |
| `IDLE → SERVING` direto | Permite baixar logs antigos sem nova coleta |
| `COLLECT → IDLE` por ERASE | Cancelar e apagar uma sessão em andamento |
| `READY → READY` por READ | Streaming via BLE não muda estado |
| Sub-estados Hz1/Hz5 | Mostra que o switch é interno a COLLECT |

---

*Última revisão: 2026-05-11*
