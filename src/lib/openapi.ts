export const openAPISpec = {
  openapi: '3.0.0',
  info: {
    title: 'ROM Brasil API',
    version: '1.0.0',
    description: 'Gestão de Salões e KPIs com integração Avec',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local' }],
  paths: {
    '/api/auth/login': {
      post: {
        summary: 'Login de usuário',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  user: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: 'senha123' },
                },
                required: ['user', 'password'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login bem-sucedido', headers: { 'Set-Cookie': { schema: { type: 'string' } } } },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/api/health': {
      get: {
        summary: 'Status da aplicação',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Health status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    database: { type: 'object' },
                    avec: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/estoque/sync': {
      get: {
        summary: 'Sincronizar estoque (Cron)',
        tags: ['Estoque', 'Sync'],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'mode', in: 'query', schema: { type: 'string', enum: ['fast', 'full'] } }],
        responses: {
          '200': { description: 'Sync iniciado' },
          '429': { description: 'Sync já em execução' },
          '503': { description: 'Avec não configurado' },
        },
      },
      post: {
        summary: 'Trigger sync manual',
        tags: ['Estoque', 'Sync'],
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          '200': { description: 'Sync iniciado' },
          '429': { description: 'Sync já em execução' },
        },
      },
    },
    '/api/estoque/produtos': {
      get: {
        summary: 'Listar produtos do estoque',
        tags: ['Estoque'],
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'brand', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Lista de produtos' },
          '401': { description: 'Não autorizado' },
        },
      },
    },
    '/api/estoque/alertas': {
      get: {
        summary: 'Alertas de estoque baixo',
        tags: ['Estoque'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Alertas ativos' },
        },
      },
      patch: {
        summary: 'Reconhecer alerta',
        tags: ['Estoque'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { alert_id: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Alerta reconhecido' } },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'auth_token',
        description: 'Session cookie (httpOnly)',
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'CRON_SECRET or AVEC_API_TOKEN',
      },
    },
  },
}
