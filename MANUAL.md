# Manual de Operação — Datalogger de Pressão Hidráulica

**Modelo:** LoggerP_C3
**Hardware:** ESP32-C3 (Seeed XIAO) + sensor Keller PA9LD-50bar
**Bateria:** LiPo 3,7 V 250 mAh recarregável

---

## 1. Visão geral

Este equipamento registra a **pressão hidráulica** medida pelo sensor Keller, gravando os valores em um arquivo CSV na memória interna. A coleta é feita a **1 Hz** (uma leitura por segundo); sempre que a pressão variar mais de **0,2 bar** entre duas leituras consecutivas, a taxa sobe automaticamente para **5 Hz** (uma leitura a cada 200 ms) e volta a 1 Hz após 30 segundos sem variação brusca.

A operação é feita pelo celular Android através de uma **PWA (Progressive Web App)** — um aplicativo web que pode ser instalado no celular como um app comum. Toda a interação (iniciar/parar coleta, baixar dados, ver gráfico) é feita pela PWA via Bluetooth.

**O equipamento não tem botões nem LED de funcionamento.** Toda a interação é pelo celular.

---

## 2. O que você precisa

| Item | Detalhe |
|---|---|
| Celular Android | Bluetooth + Chrome/Edge. **iOS não tem suporte a Web Bluetooth no Safari.** |
| Cabo USB-C | Para carregar a bateria |
| Carregador USB | 5 V, qualquer fonte de celular padrão |

**PWA disponível em:**
https://marcelobatistabhz.github.io/SCPT-Sensor-de-Concreto-na-Ponta-do-Trado/

---

## 3. Instalando a PWA no celular (uma vez só)

1. No celular Android, abra o **Chrome**.
2. Acesse o link da PWA acima.
3. Toque no menu (⋮) → **"Instalar app"** ou **"Adicionar à tela inicial"**.
4. Confirme. O ícone do manômetro aparece no launcher.

A partir daqui, abrir a PWA é igual a abrir qualquer app nativo. Funciona offline (exceto para receber atualizações de versão).

---

## 4. Carregamento da bateria

1. Conecte o cabo USB-C ao equipamento e a um carregador 5 V.
2. O **LED laranja** próximo ao conector USB acende durante a carga.
3. Quando o LED apaga, a bateria está cheia.
4. Tempo total de carga: **~1 h** com carregador de 500 mA ou maior.
5. Você pode usar o equipamento normalmente enquanto ele estiver conectado ao carregador.

> ⚠️ **Sempre verifique o nível de bateria na PWA antes de uma sessão longa.** O indicador no canto superior direito do card "Estado" mostra o percentual e a tensão.

---

## 5. Ligando o equipamento

O equipamento liga **assim que a bateria é conectada** ou assim que o cabo USB é plugado. Não há botão de power.

Para confirmar que está ligado: abra a PWA, toque em **"Conectar via Bluetooth"** e verifique se `LoggerP_C3` aparece na lista de dispositivos próximos.

---

## 6. Interface da PWA

```
┌─────────────────────────────────────────┐
│ Logger Pressao SCPT                     │
├─────────────────────────────────────────┤
│ ESTADO                  [▮▮▮▮▮▯▯] 78% · 4.02V │  ← Indicador bateria
│ COLL 1Hz n=42                           │  ← Estado atual
│ Iniciada as 14:32:01                    │  ← Hora do celular
│ Auto-stop em 1:59:18                    │  ← Countdown 2h
├─────────────────────────────────────────┤
│ [ Conectado: LoggerP_C3 ]               │
├─────────────────────────────────────────┤
│ [ Iniciar coleta ]  [ Parar coleta ]    │
├─────────────────────────────────────────┤
│ [ Baixar e compartilhar ]               │
├─────────────────────────────────────────┤
│ [Avancado] ▼                            │
└─────────────────────────────────────────┘
```

**Cores do card Estado:**
- 🔵 **Azul** = Pronto (READY) — log disponível para download
- 🟡 **Amarelo** = Coletando (COLL)
- 🟣 **Roxo** = Wi-Fi ligado para download (SERVING)
- 🟠 **Laranja pulsante** = Reconectando
- 🔴 **Vermelho** = Desconectado

**Indicador de bateria:**
- Verde (>50%): tudo bem
- Amarelo (20-50%): comece a se preocupar
- Vermelho (<20%): carregue logo

---

## 7. Operação — passo a passo

### 7.1 Conectar

1. Abra a PWA no celular.
2. Confirme **Bluetooth ligado** e **Localização ligada** (Android exige localização ativa para scan BLE — exigência do sistema).
3. Toque em **"Conectar via Bluetooth"**.
4. Escolha `LoggerP_C3` na lista que aparece.
5. Em ~2 s o card "Estado" muda de "Desconectado" para `IDLE` (ou `READY` se houver log de sessão anterior).

### 7.2 Iniciar coleta

Toque em **"Iniciar coleta"** (botão verde). O estado muda para `COLL 1Hz n=0` e o contador começa a subir em tempo real.

Aparecem também:
- **"Iniciada às HH:MM:SS"** — horário do celular em que você iniciou.
- **"Auto-stop em H:MM:SS"** — quanto tempo falta para o auto-stop de 2 horas.

### 7.3 Durante a coleta

A taxa alterna automaticamente entre 1 Hz (regime estável) e 5 Hz (variações rápidas). Os dados são gravados em tempo real na flash interna.

**Comportamento de campo (trado descendo):** se o celular sair de alcance (equipamento desce abaixo da superfície), a conexão BLE cai e a PWA mostra "Reconectando...". O equipamento **continua coletando normalmente**. Quando voltar para perto, a PWA reconecta sozinha em até 4 s.

### 7.4 Marcar momento (anotações na timeline)

Durante a coleta, aparece o botão **"Marcar momento"** (laranja). Toque para abrir um modal com 5 opções fixas:

| Opção | Cor | Quando usar |
|---|---|---|
| Inicio perfuracao | Azul | Trado começou a descer |
| Fim perfuracao | Azul | Trado chegou à cota final |
| Inicio concretagem | Verde | Bomba começou a injetar concreto |
| Fim concretagem | Verde | Concretagem encerrada |
| Outra situacao | Cinza | Evento não previsto (anote depois no relatório) |

Toque na opção desejada → toast confirma "Marcado: ..." → o modal fecha.

**O que acontece:** a próxima amostra registrada no CSV vai ter o texto da anotação na **4ª coluna**. No gráfico final, aparece uma linha vertical tracejada na cor da categoria com o texto rotacionado ao lado.

**Atraso entre o toque e a gravação:** ≤ 1 segundo em 1 Hz, ≤ 200 ms em 5 Hz. Para registrar eventos com precisão fina, toque um pouco antes do momento exato.

**Quantas anotações pode fazer?** Quantas quiser. Cada uma é uma linha no CSV.

### 7.5 Parar coleta

Toque em **"Parar coleta"** (botão amarelo). Estado muda para `READY n=...` com a contagem total.

Alternativamente, a coleta para automaticamente:
- Após **2 horas** (limite máximo de sessão).
- Quando a bateria descarrega.

### 7.6 Baixar e compartilhar (1 toque)

Toque em **"Baixar e compartilhar"** (botão azul).

1. Barra de progresso aparece e enche em ~3-10 segundos via Bluetooth.
2. O **menu de compartilhamento do Android** abre automaticamente.
3. Escolha **WhatsApp**, e-mail ou qualquer app para enviar o `log.csv`.

O nome do arquivo já vem com data/hora: `log_2026-05-10T14-32-01.csv`.

### 7.7 Ver gráfico

Após o download, o gráfico aparece automaticamente abaixo da barra de progresso. Mostra:

- **Linha azul:** pressão (bar) ao longo do tempo
- **Linha laranja:** média móvel das últimas 50 leituras (suaviza ruído, mostra tendência)
- **Linha cinza:** temperatura (°C), eixo Y secundário à direita
- **Bolinha vermelha:** pico de pressão da sessão, com o valor numérico
- **Linhas verticais tracejadas coloridas:** anotações de "Marcar momento" (ver 7.4) — azul para perfuração, verde para concretagem, cinza para outras
- **Info:** total de amostras, pico (com tempo), duração, contagem de anotações, média/mediana/desvio padrão da pressão, temperatura inicial→final com ΔT

**Gestos no gráfico:**
- **Pinça** com 2 dedos: zoom no eixo de tempo
- **Arrasta** com 1 dedo (depois de zoomar): mover dentro do range zoomado
- **Toque duplo:** voltar à visão completa

### 7.8 Apagar e iniciar nova sessão

Não é necessário apagar manualmente — toque em **"Iniciar coleta"** novamente e o equipamento substitui o log anterior.

Se quiser apagar sem iniciar nova sessão, expanda **"Avançado"** e toque em **"Apagar log atual"**.

### 7.9 Download via Wi-Fi (fallback)

Caso o BLE file transfer falhe (link instável, arquivo muito grande, etc.), há fallback via Wi-Fi:

1. Expanda **"Avançado"** na PWA.
2. Toque em **"Preparar download (Wi-Fi)"**. Estado muda para `WIFI 192.168.4.1`.
3. Saia da PWA (não feche), vá em **Wi-Fi** do celular.
4. Conecte na rede `LoggerP_AP` (sem senha). Aceite "manter conectado mesmo sem internet".
5. Volte na PWA e toque em **"Abrir log.csv"**.
6. O navegador baixa o arquivo. Compartilhe via menu do sistema do celular.

---

## 8. Formato do arquivo `log.csv`

```
ms;bar;degC;note
0;0.0;25.4;
1000;0.0;25.4;
2000;0.0;25.5;inicio perfuracao
2200;0.5;25.5;
2400;0.7;25.5;
...
```

| Coluna | Conteúdo |
|---|---|
| `ms`   | Tempo em milissegundos desde o início da sessão (`Iniciar coleta`). |
| `bar`  | Pressão **manométrica** em bar (0 = atmosférica). 1 casa decimal. |
| `degC` | Temperatura do sensor em °C. 1 casa decimal. |
| `note` | Texto da anotação (ver 7.4). Vazio em quase todas as linhas. |

Separador: **ponto e vírgula** (`;`). Casa decimal: **ponto** (`.`).
Compatível com Excel BR (Importar de Texto, separador `;`).

**Valores possíveis na coluna `note`:**

- (vazio) — amostra normal
- `inicio perfuracao`
- `fim perfuracao`
- `inicio concretagem`
- `fim concretagem`
- `outra`

**Observações importantes:**

- O timestamp é **relativo ao início da sessão**. A PWA mostra o horário do celular em que a sessão começou; some `ms / 1000` segundos a esse horário para datar leituras específicas.
- Em modo 1 Hz, o intervalo entre linhas é ~1000 ms. Em modo 5 Hz, ~200 ms. A transição é visível no espaçamento dos timestamps.
- O sensor está configurado em **modo gauge** — em pressão atmosférica a leitura fica próxima de 0 (com pequeno ruído residual de ~±0,1 bar, dentro da precisão do sensor).
- A anotação fica atrelada à **próxima amostra após o toque** no botão "Marcar momento", então pode haver até 1 segundo de defasagem em modo 1 Hz.

---

## 9. Cuidados e limites

| Item | Especificação |
|---|---|
| Faixa de pressão | 0 a 50 bar |
| Resolução de tempo | 1 ms (gravação), exatidão ~±10 ms |
| Tempo máximo de sessão | 2 horas |
| Tempo máximo cumulativo em modo 5 Hz | 30 min por sessão |
| Capacidade do arquivo | ~250 KB (suficiente para a sessão máxima) |
| Temperatura de operação | Conforme datasheet do sensor Keller |
| Resistência à água | **Não submergir o ESP32-C3.** Apenas a ponta do sensor é estanque. |

---

## 10. Solução de problemas

| Sintoma | Possível causa | O que fazer |
|---|---|---|
| `LoggerP_C3` não aparece ao tocar "Conectar" | Equipamento desligado, fora de alcance, ou Bluetooth/Localização desligados | Confirme bateria, aproxime do celular, ative BT e Localização |
| Conecta mas estado fica em "Reconectando..." | Distância no limite, ou ruído | Aproxime mais. A PWA tenta reconectar automaticamente |
| Estado fica em `COLL 1Hz n=0` sem incrementar | Sensor não respondeu | Conecte ao USB, abra Serial monitor (Arduino IDE) pra ver `[AVISO]` no boot |
| "Baixar e compartilhar" trava na barra de progresso | Link BLE instável | Aguarde 15 s — se travar, use a opção Wi-Fi (Avançado) |
| Wi-Fi `LoggerP_AP` não aparece após DOWNLOAD | Alguns Androids escondem redes abertas | Adicionar rede manualmente no celular: `LoggerP_AP`, sem senha |
| Indicador de bateria sumiu | Pode ser desconexão recente | Aguarde uns segundos; aparece novamente quando o status atualiza |
| Após queda de energia, aparece `READY` no boot | Sessão anterior interrompida | Os dados gravados estão preservados. "Baixar e compartilhar" antes de novo "Iniciar coleta" |
| Equipamento parou de gravar antes de 2 h | Bateria acabou | Recarregue. Os dados gravados estão preservados |

### Forçar reset do equipamento

Não há botão de reset acessível externamente. Para forçar reinicialização:

1. Desconecte a bateria por ~5 segundos (se tiver acesso) **ou**
2. Conecte ao cabo USB e pressione o botão `RESET` da placa XIAO.

---

## 11. Especificações resumidas

| | |
|---|---|
| **Microcontrolador** | Espressif ESP32-C3 (Seeed XIAO) |
| **Sensor de pressão** | Keller PA9LD-50bar (I²C, 0–50 bar, modo gauge) |
| **Bateria** | LiPo 3,7 V 250 mAh, recarga via USB-C |
| **Monitoramento de bateria** | ADC interno via divisor 1:2 (mod) |
| **Conectividade** | Bluetooth Low Energy 4.x (legacy advertising) + Wi-Fi 2,4 GHz |
| **Memória de log** | ~1,5 MB (LittleFS na flash interna) |
| **Taxa de amostragem** | 1 Hz padrão, 5 Hz adaptativo (ΔP > 0,2 bar) |
| **Duração máxima de sessão** | 2 horas |
| **Formato de saída** | CSV (`ms;bar;degC;note`) |
| **Identificador BLE** | `LoggerP_C3` |
| **SSID Wi-Fi para download** | `LoggerP_AP` (rede aberta) |
| **PWA** | https://marcelobatistabhz.github.io/SCPT-Sensor-de-Concreto-na-Ponta-do-Trado/ |

---

## 12. Operação alternativa via nRF Connect (debug)

Se a PWA estiver indisponível ou para depuração, o equipamento pode ser operado pelo app **nRF Connect for Mobile** (Nordic Semiconductor, gratuito).

**UUIDs:**
- **Serviço:** `9b78c001-c0de-4d65-a1aa-001122334455`
- **Comando** (write): `9b78c002-c0de-4d65-a1aa-001122334455`
- **Status** (read+notify): `9b78c003-c0de-4d65-a1aa-001122334455`
- **Data** (notify, transferência do CSV): `9b78c004-c0de-4d65-a1aa-001122334455`

**Comandos** (texto UTF-8 escrito na char Comando):

| Comando | Função |
|---|---|
| `START` | Inicia coleta (apaga log anterior) |
| `STOP` | Para coleta |
| `TARE` | Calibra offset do sensor (em IDLE ou READY) |
| `READ` | Inicia transferência do CSV pela char Data |
| `NOTE n` | Anotação na timeline (n=1..5, só em COLLECT). Texto vai pra coluna `note` da próxima amostra. |
| `DOWNLOAD` | Liga AP Wi-Fi |
| `STOPWIFI` | Desliga AP Wi-Fi |
| `ERASE` | Apaga log atual |

**Tabela de `NOTE n`:**

| `n` | Texto gravado |
|---|---|
| `1` | `inicio perfuracao` |
| `2` | `fim perfuracao` |
| `3` | `inicio concretagem` |
| `4` | `fim concretagem` |
| `5` | `outra` |

**Formato do status** (lido/notificado pela char Status):

```
IDLE b=4050
COLL 1Hz n=42 r=7158 b=4015
READY n=14400 b=3920
WIFI 192.168.4.1 b=3895
```

- `b=NNNN` = tensão da bateria em mV (sempre presente)
- `r=NNN` = segundos restantes até auto-stop (apenas em COLL)

---

*Última revisão: 2026-05-11*
