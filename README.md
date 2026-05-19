# @ismael1361/env-secure

Gerenciador file-based de variáveis de ambiente para Node.js com suporte a ambientes públicos e privados, autenticação local de usuário e execução de comandos com variáveis injetadas em tempo de execução.

O foco do @ismael1361/env-secure é organizar arquivos de ambiente em um fluxo simples de CLI, com uma camada adicional para separar o que pode ficar público do que precisa ficar protegido por senha dentro do projeto.

## O que este pacote entrega

- Ambientes públicos e privados no mesmo projeto.
- Ambiente root para variáveis compartilhadas entre todos os contextos.
- Autenticação de usuário para acesso a ambientes privados.
- Criação, edição, leitura e remoção de variáveis via CLI.
- Execução de comandos com variáveis carregadas na sessão atual.
- API programática para carregar variáveis via código.
- Geração de .env.example para documentar chaves conhecidas.

## Vantagens

- Centraliza variáveis do projeto em um único fluxo operacional.
- Evita deixar segredos privados em arquivos .env soltos por ambiente.
- Permite combinar um bloco root compartilhado com um ambiente específico.
- Funciona bem em desenvolvimento local e em projetos pequenos ou médios que querem algo simples.
- Pode ser usado via npx, instalação global ou dependência do projeto.
- Mantém uma interface direta para times que já trabalham com formato .env.

## Desvantagens e tradeoffs

- Não substitui um secret manager corporativo.
- Ambientes públicos não são criptografados; eles ficam apenas serializados dentro do arquivo .env.secure.
- O modelo de ambientes privados é local e orientado a arquivo, não à governança centralizada.
- Não há trilha de auditoria, rotação automática, aprovação, revogação remota ou RBAC avançado.
- Sessão local persistida existe por conveniência, o que aumenta a superfície de risco em máquinas comprometidas.
- Compartilhamento seguro de segredos entre vários usuários não é o objetivo principal da arquitetura.

## Avisos importantes de segurança

> Mesmo com suporte a senha e criptografia para ambientes privados, esta arquitetura não foi desenhada para resistir a invasões de máquina, malware, roubo de credenciais, leitura de memória, comprometimento do sistema operacional, insiders maliciosos ou ataques de engenharia social.

> Em outras palavras: o @ismael1361/env-secure ajuda a organizar e reduzir exposição acidental, mas não deve ser tratado como barreira de segurança de alto nível contra hackers.

> Para dados realmente críticos, ambientes de produção sensíveis, requisitos regulatórios ou modelo de ameaça mais sério, use um secret manager dedicado, como HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, 1Password Secrets Automation ou equivalente.

Recomendações obrigatórias para uso responsável:

- Use sempre uma senha forte, longa e única para criptografar seus dados no @ismael1361/env-secure.
- Nunca reutilize a mesma senha que você usa em email, GitHub, banco, painel cloud, mensageria ou qualquer outra plataforma.
- Trate a senha do @ismael1361/env-secure como exclusiva deste projeto ou deste cofre local.
- Se a máquina for compartilhada, comprometida ou administrada por terceiros, assuma que a proteção local pode ser insuficiente.
- Se você usar sessão persistida, configure ENV_SECURE_MASTER_KEY no ambiente local em vez de depender da chave padrão de desenvolvimento.
- Nunca versione senhas, chaves mestres ou artefatos auxiliares contendo credenciais em texto puro.

Regras mínimas de senha aceitas pela CLI:

- Pelo menos 8 caracteres.
- Ao menos uma letra maiúscula.
- Ao menos uma letra minúscula.
- Ao menos um número.
- Ao menos um caractere especial.

Esses requisitos são apenas o mínimo técnico. Na prática, prefira uma senha muito mais forte e única.

## Cenários apropriados

- Desenvolvimento local com separação simples entre configurações públicas e privadas.
- Projetos Node.js que querem uma UX mais estruturada do que vários arquivos .env espalhados.
- Ferramentas internas, demos, protótipos e automações de equipe pequena.
- Monorepos ou apps de CLI que precisam carregar um ambiente rapidamente antes de executar um comando.
- Times que querem manter um .env.example atualizado sem expor valores sensíveis privados.

## Cenários inadequados

- Segredos de produção com alto impacto financeiro, jurídico ou operacional.
- Ambientes regulados ou com exigência formal de auditoria e segregação de acesso.
- Servidores compartilhados, runners não confiáveis ou estações de trabalho sem endurecimento.
- Workflows que exigem rotação automática, controle de acesso centralizado, SSO ou machine identity.
- Contextos em que o principal risco é invasão, phishing, malware ou engenharia social.

## Como funciona

1. O comando init cria o arquivo .env.secure e um .env.example inicial.
2. O ambiente root existe por padrão e funciona como base compartilhada.
3. Ambientes públicos armazenam variáveis em formato .env dentro do arquivo do projeto.
4. Ambientes privados exigem login e armazenam o conteúdo cifrado.
5. O comando load combina root + ambiente solicitado e injeta tudo no processo filho.
6. A sessão do usuário pode ser persistida localmente por conveniência por até 7 dias.

## Instalação

Requisitos:

- Node.js 16 ou superior.

Uso sem instalar:

```bash
npx @ismael1361/env-secure --help
```

Instalação no projeto:

```bash
npm install @ismael1361/env-secure
```

Instalação global:

```bash
npm install -g @ismael1361/env-secure
```

## Quick start

### Inicialize o cofre local:

```bash
npx @ismael1361/env-secure init
```

Esse comando cria um arquivo .env.secure no diretório atual, que é onde os ambientes serão armazenados. Ele também gera um .env.example para documentar as chaves usadas.

### Crie um usuário com uma senha forte e única:

```bash
npx @ismael1361/env-secure create-user username --password "SenhaUnicaMuitoForte#1234"
```

Ou, se preferir inserir a senha interativamente:

```bash
npx @ismael1361/env-secure create-user username
```

Esse usuário será usado para autenticar e acessar ambientes privados. Lembre-se de usar uma senha que você não reutilize em nenhum outro lugar.

### Autentique-se:

```bash
npx @ismael1361/env-secure login username --password "SenhaUnicaMuitoForte#1234"
```

Ou, se preferir inserir a senha interativamente:

```bash
npx @ismael1361/env-secure login username
```

Esse comando cria uma sessão local que permite acessar ambientes privados. Você pode usar a opção `--persist` para manter a sessão ativa por até 7 dias, mas isso aumenta o risco se a máquina for comprometida. Em ambiente de produção, utilize `--persist` para evitar expiração frequente, mas certifique-se de que a máquina esteja segura e que a senha seja forte.

### Altere a senha de um usuário:

```bash
npx @ismael1361/env-secure change-password username --password "SenhaUnicaMuitoForte#1234" --new-password "NovaSenhaAindaMaisForte#5678"
```

Ou, se preferir inserir as senhas interativamente:

```bash
npx @ismael1361/env-secure change-password username
```

Esse comando altera a senha do usuário especificado. Ele exige a senha atual para autenticação e a nova senha para atualização. Se o usuário estiver atualmente logado, a sessão será atualizada automaticamente para refletir a nova senha.

### Defina variáveis compartilhadas no ambiente root:

```bash
npx @ismael1361/env-secure set root --key APP_NAME --value "meu-app"
npx @ismael1361/env-secure set root --key NODE_ENV --value "development"
```

Essas variáveis estarão disponíveis em todos os ambientes, públicos ou privados, como base compartilhada.

### Crie um ambiente público para desenvolvimento:

```bash
npx @ismael1361/env-secure create-env dev
npx @ismael1361/env-secure set dev --key API_URL --value "https://dev.api.local"
```

Esse ambiente ficará visível em texto claro dentro do arquivo .env.secure, mas ele é considerado "público" porque não exige autenticação para acesso.

### Crie um ambiente privado para produção:

```bash
npx @ismael1361/env-secure create-env prod --private
npx @ismael1361/env-secure set prod --key DATABASE_URL --value "postgres://usuario:senha@host/db"
```

Esse ambiente ficará cifrado dentro do arquivo .env.secure e exigirá autenticação para acesso. Ele é considerado "privado" porque contém segredos que não devem ser expostos.

### Conceder acesso ao ambiente privado a um usuário:

```bash
npx @ismael1361/env-secure grant prod --user username2 --password "SenhaDoUsuario2#5678"
```

Ou, se preferir inserir a senha interativamente:

```bash
npx @ismael1361/env-secure grant prod --user username2
```

Esse comando adiciona um usuário autorizado a acessar o ambiente privado prod. Ele exige que o usuário exista e que a senha seja fornecida para autenticação. O ambiente prod deve existir e ser privado para que esse comando funcione. Após conceder acesso, o usuário username2 poderá alterar a senha e usar `npx @ismael1361/env-secure login username2` para acessar o ambiente prod.

### Excluir um ambiente:

```bash
npx @ismael1361/env-secure delete-env dev
```

Esse comando remove o ambiente dev completamente do arquivo .env.secure. Para ambientes privados, ele exigirá autenticação.

### Visualize ou edite o ambiente:

```bash
npx @ismael1361/env-secure view dev
npx @ismael1361/env-secure edit prod
```

Esses comandos permitem inspecionar o conteúdo de um ambiente ou editá-lo no editor de texto simples no terminal. O view é útil para uma olhada rápida, enquanto o edit é mais flexível para alterações completas, sem precisar de alterar uma variável individualmente.

### Execute um comando com as variáveis carregadas:

```bash
npx @ismael1361/env-secure load dev -- npm run dev
npx @ismael1361/env-secure load prod -- node dist/server.js
```

Esses comandos carregam as variáveis do ambiente root + o ambiente especificado (dev ou prod) e as injetam no processo filho que executa o comando. Isso é ideal para scripts npm, CLIs e start local.

### Encerre a sessão:

```bash
npx @ismael1361/env-secure logout
```

Esse comando remove a sessão local, exigindo que o usuário faça login novamente para acessar ambientes privados.

## Referência da CLI

| Comando                           | O que faz                                            | Observações                                                                                                       |
| --------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| init                              | Inicializa .env.secure e .env.example                | Use --force para sobrescrever                                                                                     |
| create-user <username>            | Cria um usuário                                      | Aceita --password                                                                                                 |
| login <username>                  | Autentica o usuário                                  | Aceita --password e --persist                                                                                     |
| logout                            | Remove a sessão local                                | Sem parâmetros                                                                                                    |
| change-password <username>        | Altera a senha do usuário                            | Aceita --password e --new-password                                                                                |
| remove-user <username>            | Remove um usuário                                    | Não é um fluxo de governança avançado                                                                             |
| create-env <envName>              | Cria um ambiente                                     | Use --private para ambiente privado                                                                               |
| delete-env <envName>              | Remove um ambiente                                   | Ambiente privado exige autenticação                                                                               |
| grant <envName> --user <username> | Concede acesso a um usuário para um ambiente privado | Requer autenticação do usuário e senha para concessão, aceita --read-only e --password do usuário a ser concedido |
| add <envName>                     | Adiciona uma variável                                | Requer --key e --value                                                                                            |
| set <envName>                     | Define ou sobrescreve uma variável                   | Requer --key e --value                                                                                            |
| remove <envName>                  | Remove uma variável                                  | Requer --key                                                                                                      |
| view <envName>                    | Visualiza o conteúdo do ambiente                     | Bom para inspeção rápida                                                                                          |
| edit <envName>                    | Edita o ambiente no editor padrão                    | Fluxo mais livre, exige revisão posterior do .env.example                                                         |
| load <envName> -- <comando>       | Carrega root + ambiente e executa um comando         | Ideal para npm scripts, CLIs e start local                                                                        |

## Uso programático

O pacote expõe uma API pequena para leitura programática:

```ts
import { load, isAuthenticated, getUser, logout } from "@ismael1361/env-secure";

async function bootstrap() {
	const env = await load("dev");

	console.log(env.API_URL);
	console.log(await isAuthenticated());
	console.log(await getUser());

	await logout();
}

bootstrap();
```

Comportamento importante:

- load("root") carrega apenas o ambiente root.
- load("dev") carrega primeiro root e depois dev.
- Variáveis carregadas são adicionadas ao process.env do processo atual.

## Arquivos gerados

- .env.secure: arquivo consolidado do projeto. Ambientes públicos ficam serializados ali; ambientes privados ficam cifrados.
- .env.example: contrato de chaves do projeto. Ele é atualizado automaticamente nos fluxos add, set e remove.
- ~/.env-secure-config: sessão local do usuário (sem prazo de expiração).

Observação importante: se você usar edit para alterar um ambiente manualmente, revise o .env.example depois para garantir que o contrato publicado do projeto continua correto.

## Boas práticas

- Reserve root para variáveis compartilhadas entre todos os ambientes.
- Coloque em ambientes públicos apenas valores que podem ser tratados como não sensíveis.
- Mantenha segredos reais somente em ambientes privados.
- Use nomes de ambiente simples e previsíveis, como dev, staging e prod.
- Se for persistir sessão local, defina ENV_SECURE_MASTER_KEY fora do repositório.
- Troque imediatamente a senha do @ismael1361/env-secure se houver suspeita de reutilização, vazamento ou phishing.
- Se o seu caso de uso evoluir para requisitos mais rigorosos, migre para um secret manager dedicado em vez de tentar forçar este modelo além do objetivo dele.

## Resumo honesto

O @ismael1361/env-secure é útil quando você quer uma camada prática de organização e alguma proteção para ambientes privados em fluxos locais de desenvolvimento. Ele não deve ser vendido nem usado como solução antifraude, anti-invasão ou anti-engenharia-social.

Se você publicar este pacote no NPM, o posicionamento mais correto é: uma ferramenta simples para organizar variáveis de ambiente com separação entre público e privado, não um cofre de segredos de nível corporativo.

## Licença

MIT