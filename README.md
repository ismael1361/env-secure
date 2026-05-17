# 🔐 env-secure

Gerenciador seguro de variáveis de ambiente com suporte a ambientes públicos/privados e autenticação de usuários.

## ✨ Funcionalidades

- 🗂️ Múltiplos ambientes (dev, staging, prod, etc.)
- 🔒 Ambientes públicos e privados com criptografia
- 👥 Sistema de usuários com autenticação
- 📦 Arquivo compactado e criptografado `.env-secure`
- 🚀 Uso via `npx` ou importação em projetos Node.js
- 💾 Persistência de sessão com proteção local

## 🚀 Instalação e Uso

### Via npx (sem instalação)

```bash
# Inicializar projeto
npx env-secure init

# Criar usuário
npx env-secure create-user meuuser --password minhasegura

# Login
npx env-secure login meuuser --password minhasegura

# Criar ambientes
npx env-secure create-env dev                    # público
npx env-secure create-env prod --private         # privado

# Gerenciar variáveis
npx env-secure add dev API_URL='https://api.dev'
npx env-secure list dev
npx env-secure remove dev API_URL

# Logout
npx env-secure logout