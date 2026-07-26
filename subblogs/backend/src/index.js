const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const prisma = require('./lib/prisma');

async function main() {
  await prisma.$connect();
  logger.info('Connected to database');

  const server = app.listen(config.port, () => {
    logger.info(`Nibgate Blog API running on port ${config.port}`);
  });

  const exitHandler = async () => {
    await prisma.$disconnect();
    if (server) server.close();
    process.exit(1);
  };

  const unexpectedErrorHandler = (error) => {
    logger.error(error);
    exitHandler();
  };

  process.on('uncaughtException', unexpectedErrorHandler);
  process.on('unhandledRejection', unexpectedErrorHandler);
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await prisma.$disconnect();
    server.close();
  });
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
