# Configuração do Ollama para WSL

## Problema
O Ollama está rodando no Windows mas escuta apenas em `127.0.0.1:11434`, impossibilitando o acesso do WSL.

## Solução

### Opção 1: Configurar Ollama para aceitar conexões externas (Recomendado)

1. **No Windows PowerShell (como Administrador):**
   ```powershell
   # Parar o Ollama
   Stop-Process -Name ollama -Force
   
   # Configurar variável de ambiente para aceitar conexões de qualquer interface
   [System.Environment]::SetEnvironmentVariable('OLLAMA_HOST', '0.0.0.0:11434', 'User')
   
   # Ou apenas para a sessão atual:
   $env:OLLAMA_HOST = '0.0.0.0:11434'
   
   # Iniciar Ollama novamente
   ollama serve
   ```

2. **Configurar o Firewall do Windows:**
   - Abra "Windows Defender Firewall com Segurança Avançada"
   - Crie uma nova regra de entrada
   - Tipo: Porta
   - Protocolo: TCP
   - Porta: 11434
   - Ação: Permitir conexão
   - Nome: "Ollama WSL Access"

3. **No WSL, obtenha o IP do host Windows:**
   ```bash
   cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
   # Exemplo de saída: 10.255.255.254
   ```

4. **Atualize o arquivo `.env` no WSL:**
   ```bash
   # Edite apps/tools-api/.env
   OLLAMA_BASE_URL=http://10.255.255.254:11434
   ```

### Opção 2: Instalar Ollama diretamente no WSL

1. **No WSL:**
   ```bash
   curl https://ollama.ai/install.sh | sh
   ```

2. **Baixar o modelo:**
   ```bash
   ollama pull qwen3-embedding:8b
   ```

3. **Iniciar o servidor:**
   ```bash
   ollama serve
   ```

4. **Manter `.env` com configuração padrão:**
   ```bash
   OLLAMA_BASE_URL=http://localhost:11434
   ```

## Verificação

Teste a conexão:
```bash
curl http://<OLLAMA_URL>/api/tags
```

Se funcionar, você verá a lista de modelos instalados.

## Troubleshooting

### Erro: "Connection refused"
- Verifique se o Ollama está rodando: `ollama list` (Windows) ou `ps aux | grep ollama` (WSL)
- Confirme que `OLLAMA_HOST=0.0.0.0:11434` está configurado
- Verifique o firewall do Windows

### Erro: "Unsupported model version v1"
- Este erro foi corrigido! O código agora usa OpenAI SDK com baseURL do Ollama
- Se ainda aparecer, limpe o node_modules: `rm -rf node_modules && bun install`

### Modelo não encontrado
```bash
ollama pull qwen3-embedding:8b
```
