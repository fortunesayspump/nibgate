const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  logger.info('Connected to database');

  const server = app.listen(config.port, () => {
    logger.info(`Nibgate Blog API running on port ${config.port}`);
  });

  const exitHandler = () => {
    if (server) {
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Server closed');
        process.exit(1);
      });
    }
  };

  const unexpectedErrorHandler = (error) => {
    logger.error(error);
    exitHandler();
  };

  process.on('uncaughtException', unexpectedErrorHandler);
  process.on('unhandledRejection', unexpectedErrorHandler);
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    if (server) server.close();
  });
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
