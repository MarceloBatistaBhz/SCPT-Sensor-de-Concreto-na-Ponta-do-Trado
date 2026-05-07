# Manual de Operação — Datalogger de Pressão Hidráulica

**Modelo:** LoggerP_C3
**Hardware:** ESP32-C3 (Seeed XIAO) + sensor Keller PA9LD-50bar
**Bateria:** LiPo 3,7 V 250 mAh recarregável

---

## 1. Visão geral

Este equipamento registra a **pressão hidráulica** medida pelo sensor Keller, gravando os valores em um arquivo CSV na memória interna. A coleta é feita a **1 Hz** (uma leitura por segundo); sempre que a pressão variar mais de **0,2 bar** entre duas leituras consecutivas, a taxa sobe automaticamente para **5 Hz** (uma leitura a cada 200 ms) e volta a 1 Hz após 30 segundos sem variação brusca.

O comando do equipamento é feito **pelo celular**, via Bluetooth (BLE). O download dos dados também é feito pelo celular, via Wi-Fi, sob demanda.

**O equipamento não tem botões nem LED de funcionamento.** Toda a interação é pelo celular.

---

## 2. O que você precisa

| Item | Detalhe |
|---|---|
| Celular Android ou iOS | Com Bluetooth + Wi-Fi |
| App **nRF Connect for Mobile** | Gratuito, da Nordic Semiconductor (Play Store / App Store) |
| Cabo USB-C | Para carregar a bateria |
| Carregador USB | 5 V, qualquer fonte de celular padrão |

---

## 3. Carregamento da bateria

1. Conecte o cabo USB-C ao equipamento e a um carregador 5 V.
2. O **LED laranja** próximo ao conector USB acende durante a carga.
3. Quando o LED apaga, a bateria está cheia.
4. Tempo total de carga: **~1 h** com carregador de 500 mA ou maior.
5. Você pode usar o equipamento normalmente enquanto ele estiver conectado ao carregador.

> ⚠️ Bateria vazia desliga o equipamento automaticamente. **Sempre verifique a carga antes de uma sessão longa.** Uma carga cheia dá autonomia estimada de **vários dias** de uso normal (5–8 sessões/dia de até 2 h cada).

---

## 4. Ligando o equipamento

O equipamento liga **assim que a bateria é conectada** ou assim que o cabo USB é plugado. Não há botão de power.

Para confirmar que está ligado: abra o nRF Connect no celular e verifique se aparece o nome **`LoggerP_C3`** na lista de dispositivos. Se aparecer, está funcionando.

---

## 5. Comunicação BLE — comandos

A operação é feita escrevendo comandos numa "característica" Bluetooth do aparelho. Os comandos disponíveis:

| Comando | Função |
|---|---|
| `START` | Inicia uma nova sessão de coleta. Apaga o log anterior. |
| `STOP` | Para a coleta antes do limite de 2 h. |
| `DOWNLOAD` | Liga o Wi-Fi do aparelho para você baixar o arquivo. |
| `STOPWIFI` | Desliga o Wi-Fi manualmente (ele já desliga sozinho após 60 s sem uso). |
| `ERASE` | Apaga o log atual. Use com cuidado. |

**UUIDs (para configurar no nRF Connect):**

- **Serviço:** `9b78c001-c0de-4d65-a1aa-001122334455`
- **Característica de comando** (write): `9b78c002-c0de-4d65-a1aa-001122334455`
- **Característica de status** (read + notify): `9b78c003-c0de-4d65-a1aa-001122334455`

---

## 6. Operação — passo a passo

### 6.1 Iniciar uma coleta

1. Abra o **nRF Connect** no celular.
2. Toque em **SCANNER** e procure `LoggerP_C3`. Toque em **CONNECT**.
3. Encontre o serviço com UUID começando em `9b78c001-...`.
4. Localize a **característica de comando** (`9b78c002-...`).
5. Toque na seta de upload (↑) e envie a string `START` em formato **TEXT (UTF-8)**.
6. Para confirmar que iniciou, ative as notificações na característica de status (`9b78c003-...`) — ela vai mostrar `COLL 1Hz n=...` (contagem de amostras crescendo).

> 📌 **Anote o horário real** (no relógio) em que você enviou `START`. Os timestamps no arquivo são **relativos ao início da sessão** (em milissegundos), não em hora absoluta.

### 6.2 Durante a coleta

A característica de status atualiza a cada ~30 amostras. Os textos possíveis:

| Status | O que significa |
|---|---|
| `IDLE` | Pronto, sem coleta em andamento |
| `COLL 1Hz n=1234` | Coletando a 1 Hz, 1234 amostras gravadas |
| `COLL 5Hz n=2500` | Coletando a 5 Hz (modo rápido), 2500 amostras gravadas |
| `READY n=14400` | Coleta encerrada, arquivo pronto pra baixar |
| `WIFI 192.168.4.1` | Wi-Fi ligado, esperando você baixar |

A coleta para automaticamente após **2 horas** ou quando você enviar `STOP`.

### 6.3 Baixar o arquivo

1. Com o equipamento em estado `READY` (ou mesmo `IDLE` com arquivo de sessão anterior), envie o comando `DOWNLOAD`.
2. Aguarde o status mudar para `WIFI 192.168.4.1`.
3. **No celular**, vá em **Configurações → Wi-Fi** e conecte na rede `LoggerP_AP` (sem senha).
4. Abra o navegador e acesse: **http://192.168.4.1**
5. Toque no link **"Baixar log.csv"**. O arquivo será salvo na pasta de Downloads do celular.
6. Após o download, **desconecte do Wi-Fi** ou aguarde 60 s — o equipamento desliga o Wi-Fi automaticamente para economizar bateria.

### 6.4 Enviar para o WhatsApp

1. Abra o **WhatsApp**, vá na conversa desejada.
2. Toque no ícone de **anexar** (📎 ou clipe).
3. Escolha **"Documento"** (não Imagem).
4. Navegue até a pasta **Downloads** e selecione `log.csv`.
5. Envie.

> 📌 O Android e o iPhone tratam `.csv` como documento, não como mídia, então o WhatsApp envia o arquivo sem alterar o conteúdo.

### 6.5 Apagar e iniciar nova sessão

Não é necessário apagar manualmente — o comando `START` já apaga o log anterior antes de começar a nova coleta. Se quiser apagar sem iniciar uma nova sessão, use `ERASE`.

---

## 7. Formato do arquivo `log.csv`

```
ms;bar
0;1.0
1000;1.0
2000;1.0
2200;1.5
2400;1.5
...
```

| Coluna | Conteúdo |
|---|---|
| `ms` | Tempo em milissegundos desde o início da sessão (`START`). |
| `bar` | Pressão em bar absoluta, com 1 casa decimal (resolução 0,1 bar). |

Separador: **ponto e vírgula** (`;`). Casa decimal: **ponto** (`.`).
Compatível com Excel BR (Importar de Texto, separador `;`).

**Observações importantes:**

- O timestamp é **relativo ao início da sessão**. Para datar uma leitura específica, some `ms / 1000` segundos ao horário em que você enviou `START`.
- Em modo 1 Hz, o intervalo entre linhas é ~1000 ms. Em modo 5 Hz, ~200 ms. A transição entre os modos é visível no espaçamento dos timestamps.
- O sensor opera em modo PA (sealed gauge), então a pressão lida já inclui o offset atmosférico padrão (1,0 bar).

---

## 8. Cuidados e limites

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

## 9. Solução de problemas

| Sintoma | Possível causa | O que fazer |
|---|---|---|
| `LoggerP_C3` não aparece no scanner BLE | Bateria descarregada; equipamento desligado | Conecte ao USB e tente de novo após alguns segundos |
| Aparece mas não conecta | Outro app já conectado; interferência | Feche outros apps de BLE; reaproxime do equipamento |
| Status fica em `IDLE` mesmo após `START` | Sensor não respondeu | Ver mensagem `[AVISO]` no boot via Serial; verificar conexão I²C do sensor |
| Wi-Fi `LoggerP_AP` não aparece após `DOWNLOAD` | Alguns Androids escondem redes abertas | Vá em "Adicionar rede manualmente" e digite `LoggerP_AP` sem senha |
| Download muito lento | Distância grande / interferência 2,4 GHz | Aproxime o celular do equipamento (~1 m) |
| Arquivo vem vazio ou só com cabeçalho | Sessão acabou sem amostras (sensor offline) | Verifique sensor e reinicie a sessão |
| Equipamento parou de gravar antes de 2 h | Bateria acabou | Recarregue. As amostras já gravadas estão preservadas — envie `DOWNLOAD` antes de iniciar nova sessão |
| Após queda de energia, aparece `READY` no boot | Sessão anterior interrompida | Os dados que deram tempo de ser gravados estão lá. Faça `DOWNLOAD` para recuperá-los antes de novo `START` |

### Resetar o equipamento

Não há botão de reset acessível externamente. Para forçar reinicialização:

1. Desconecte a bateria por ~5 segundos (se tiver acesso) **ou**
2. Conecte ao cabo USB e pressione o botão `RESET` da placa XIAO (visível pelo orifício do gabinete, se houver).

---

## 10. Especificações resumidas

| | |
|---|---|
| **Microcontrolador** | Espressif ESP32-C3 (Seeed XIAO) |
| **Sensor de pressão** | Keller PA9LD-50bar (I²C, 0–50 bar, modo PA) |
| **Bateria** | LiPo 3,7 V 250 mAh, recarga via USB-C |
| **Conectividade** | Bluetooth Low Energy 5.0 + Wi-Fi 2,4 GHz |
| **Memória de log** | ~1,5 MB (LittleFS na flash interna) |
| **Taxa de amostragem** | 1 Hz padrão, 5 Hz adaptativo (ΔP > 0,2 bar) |
| **Duração máxima de sessão** | 2 horas |
| **Formato de saída** | CSV (ms;bar) |
| **Identificador BLE** | `LoggerP_C3` |
| **SSID Wi-Fi para download** | `LoggerP_AP` (rede aberta) |
| **URL para download** | http://192.168.4.1/log.csv |

---

*Última revisão: 2026-05-06*
