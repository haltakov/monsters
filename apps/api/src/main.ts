import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getWebOrigins } from './config/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: getWebOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Required so the world runner can write its final checkpoint and release
  // the advisory lock when Coolify stops the container.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  console.log(`Monsters API ready at http://localhost:${port}/api`);
}
void bootstrap();
