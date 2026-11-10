export const apiCorsOptions = {
  origin: [
    'http://127.0.0.1:5201',
    'http://localhost:5201',
    'http://127.0.0.1:5203',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
};
